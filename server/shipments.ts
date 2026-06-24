// DHL shipment-tracking service — the single source of truth for waybill↔PO
// linking, DHL status ingestion, content verification, and exception detection.
//
// Design (see migrations/dhl-shipment-tracking.sql):
//   - The reliable ANCHOR is the waybill Puffin gives us at dispatch, linked to
//     the PO(s) it carries via linkOrdersToShipment(). Consolidation is
//     many-to-many (one waybill → many POs; one PO → many parcels).
//   - DHL status arrives over WhatsApp only (no API). Those messages are parsed
//     best-effort elsewhere and fed in via ingestShipmentEvent(), matched by
//     waybill. An event for an unknown waybill is parked as an orphan, never
//     guessed onto a PO.
//   - orders.trackingNumber/Url stay as a denormalised mirror for back-compat.
//   - Verification is confidence-graded, not pass/fail, because WhatsApp content
//     data is noisy and frequently absent.
//
// The admin router, the DHL webhook, and the exception cron all call into here.

import { createHash } from "crypto";
import { and, eq, inArray, isNull, lt, desc, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { tracked } from "./integration-events";
import {
  shipments,
  shipmentOrders,
  shipmentParcels,
  shipmentEvents,
  orders,
  orderActivity,
  users,
  type Shipment,
  type ShipmentOrder,
} from "@shared/schema";
import {
  normalizeWaybill,
  normalizeDhlStatus,
  dhlTrackingUrl,
  type ShipmentStatus,
  type ShipmentSourceChannel,
} from "@shared/shipment-status";
import { OPEN_STAGES } from "@shared/pipeline";

const STALE_DAYS_DEFAULT = 7;
const DISPATCHED_NO_WAYBILL_DAYS_DEFAULT = 3;

type ExpectedItem = { orderItemId: string; productName: string; size: string | null; qty: number };
type DeclaredItem = { productName?: string; size?: string | null; qty?: number };
type ParcelInput = { orderId?: string; pieceId?: string; description?: string; declaredItems?: DeclaredItem[]; weightGrams?: number };

// Snapshot a PO's order_items so verification has a stable baseline even if the
// PO is edited after the waybill is linked.
async function buildExpectedItems(orderId: string): Promise<ExpectedItem[]> {
  const items = await storage.getOrderItems(orderId);
  return items.map((it) => ({
    orderItemId: it.id,
    productName: it.productName,
    size: it.size ?? null,
    qty: it.quantity,
  }));
}

function itemKey(productName: string, size: string | null | undefined): string {
  return `${(productName || "").trim().toLowerCase()}|${(size || "").trim().toLowerCase()}`;
}

// Resolve PO references (e.g. "PO-2026-0042") to order rows. Case-insensitive,
// tolerates a missing "PO-" prefix. Returns the matches plus the refs that
// didn't resolve, so callers can tell the user which ones to fix.
export async function findOrdersByPoReferences(
  refs: string[],
  opts?: { assignedSupplierId?: string },
): Promise<{ orders: { id: string; poReference: string | null }[]; unresolved: string[] }> {
  const cleaned = refs.map((r) => r.trim()).filter(Boolean);
  if (!cleaned.length) return { orders: [], unresolved: [] };
  const found: { id: string; poReference: string | null }[] = [];
  const unresolved: string[] = [];
  for (const ref of cleaned) {
    const [row] = await db
      .select({ id: orders.id, poReference: orders.poReference, assignedSupplierId: orders.assignedSupplierId })
      .from(orders)
      .where(sql`upper(${orders.poReference}) = upper(${ref})`);
    if (!row) {
      unresolved.push(ref);
      continue;
    }
    if (opts?.assignedSupplierId && row.assignedSupplierId !== opts.assignedSupplierId) {
      // Don't leak existence of POs that aren't this supplier's.
      unresolved.push(ref);
      continue;
    }
    found.push({ id: row.id, poReference: row.poReference });
  }
  return { orders: found, unresolved };
}

// ── Linking (the anchor) ────────────────────────────────────────────────────

export interface LinkOrdersInput {
  waybill: string;
  orderIds: string[];
  source?: ShipmentSourceChannel; // who supplied the waybill (default "supplier")
  linkSource?: "supplier" | "admin" | "whatsapp-late-link";
  carrier?: string;
  estimatedDeliveryDate?: Date | null;
  parcels?: ParcelInput[];
  userId?: string | null;
}

export interface LinkOrdersResult {
  shipment: Shipment;
  linkedOrderIds: string[];
  skipped: { orderId: string; reason: string }[];
  claimedOrphan: boolean;
}

// Upsert a shipment by waybill and link it to one-or-more POs. Idempotent:
// re-linking the same (waybill, order) pair is a no-op. If the waybill already
// exists as an orphan (DHL event arrived before we linked), it is claimed.
export async function linkOrdersToShipment(input: LinkOrdersInput): Promise<LinkOrdersResult> {
  const waybill = normalizeWaybill(input.waybill);
  if (!waybill) throw new Error("Empty waybill");

  const source = input.source ?? "supplier";
  const linkSource = input.linkSource ?? (source === "admin" ? "admin" : "supplier");

  // Upsert the shipment row.
  let [shipment] = await db.select().from(shipments).where(eq(shipments.waybill, waybill));
  let claimedOrphan = false;
  if (!shipment) {
    [shipment] = await db
      .insert(shipments)
      .values({
        waybill,
        carrier: input.carrier ?? "dhl",
        status: "created",
        sourceChannel: source,
        trackingUrl: dhlTrackingUrl(waybill),
        estimatedDeliveryDate: input.estimatedDeliveryDate ?? null,
        createdBy: input.userId ?? null,
      })
      .returning();
  } else {
    const patch: Record<string, any> = { updatedAt: new Date() };
    if (shipment.isOrphan) {
      patch.isOrphan = false;
      claimedOrphan = true;
    }
    if (input.estimatedDeliveryDate && !shipment.estimatedDeliveryDate) {
      patch.estimatedDeliveryDate = input.estimatedDeliveryDate;
    }
    [shipment] = await db.update(shipments).set(patch).where(eq(shipments.id, shipment.id)).returning();
  }

  const linkedOrderIds: string[] = [];
  const skipped: { orderId: string; reason: string }[] = [];

  for (const orderId of input.orderIds) {
    const order = await storage.getOrder(orderId);
    if (!order) {
      skipped.push({ orderId, reason: "order not found" });
      continue;
    }

    const expectedItems = await buildExpectedItems(orderId);

    // Idempotent insert of the link.
    await db
      .insert(shipmentOrders)
      .values({
        shipmentId: shipment.id,
        orderId,
        expectedItems: expectedItems as any,
        linkedBy: input.userId ?? null,
        linkSource,
      })
      .onConflictDoNothing({ target: [shipmentOrders.shipmentId, shipmentOrders.orderId] });

    const [link] = await db
      .select()
      .from(shipmentOrders)
      .where(and(eq(shipmentOrders.shipmentId, shipment.id), eq(shipmentOrders.orderId, orderId)));

    // Parcels declared for this order.
    const orderParcels = (input.parcels ?? []).filter((p) => !p.orderId || p.orderId === orderId);
    for (const p of orderParcels) {
      await db.insert(shipmentParcels).values({
        shipmentId: shipment.id,
        shipmentOrderId: link?.id ?? null,
        pieceId: p.pieceId ?? null,
        description: p.description ?? null,
        declaredItems: (p.declaredItems as any) ?? null,
        weightGrams: p.weightGrams ?? null,
      });
    }

    // Mirror to legacy single-shipment fields (most-recent waybill wins).
    await storage.updateOrder(orderId, {
      trackingNumber: waybill,
      trackingUrl: shipment.trackingUrl,
      ...(input.estimatedDeliveryDate ? { estimatedDeliveryDate: input.estimatedDeliveryDate } : {}),
    } as any);

    await db.insert(orderActivity).values({
      orderId,
      userId: input.userId ?? null,
      action: "shipment_linked",
      details: { waybill, shipmentId: shipment.id, source, linkSource },
    });

    void tracked(
      { system: "dhl", action: "linkShipment", orderId, userId: input.userId, context: { waybill } },
      async () => true,
    );

    if (link) await computeShipmentVerification(link.id);
    linkedOrderIds.push(orderId);
  }

  return { shipment, linkedOrderIds, skipped, claimedOrphan };
}

// Unlink a mis-linked PO from a shipment.
export async function unlinkOrderFromShipment(shipmentId: string, orderId: string): Promise<boolean> {
  const result = await db
    .delete(shipmentOrders)
    .where(and(eq(shipmentOrders.shipmentId, shipmentId), eq(shipmentOrders.orderId, orderId)))
    .returning();
  if (result.length) {
    await db.insert(orderActivity).values({
      orderId,
      action: "shipment_unlinked",
      details: { shipmentId },
    });
  }
  return result.length > 0;
}

// ── Ingestion (best-effort DHL status from WhatsApp) ─────────────────────────

export interface IngestEventInput {
  waybill: string;
  eventType?: string | null; // normalised or raw status text
  eventCode?: string | null;
  eventDescription?: string | null;
  occurredAt?: Date | null;
  location?: string | null;
  estimatedDeliveryDate?: Date | null;
  rawText?: string | null;
  source?: ShipmentSourceChannel; // "whatsapp" | "telegram_manual" | "admin"
  confidence?: number | null; // 0-100
  dedupKey?: string | null;
}

export interface IngestEventResult {
  duplicate: boolean;
  matched: boolean;
  orphan: boolean;
  shipmentId: string | null;
  status: ShipmentStatus | null;
  linkedOrderIds: string[];
  delivered: boolean; // true → caller should surface a "confirm delivered" prompt (no auto-advance)
}

function computeDedupKey(input: IngestEventInput, waybill: string, status: ShipmentStatus | null): string {
  if (input.dedupKey) return input.dedupKey;
  const minute = input.occurredAt ? input.occurredAt.toISOString().slice(0, 16) : "";
  const statusKey = status || (input.eventDescription || input.rawText || "").slice(0, 48);
  return createHash("sha256").update(`${waybill}|${statusKey}|${minute}`).digest("hex");
}

// Match a parsed DHL event to a shipment by waybill and fan its status to all
// linked POs. Never throws (returns a result the caller can act on). Unknown
// waybills are parked as orphans for later linking.
export async function ingestShipmentEvent(input: IngestEventInput): Promise<IngestEventResult> {
  const waybill = normalizeWaybill(input.waybill);
  const status = normalizeDhlStatus(input.eventType) ?? normalizeDhlStatus(input.eventDescription);
  const dedupKey = computeDedupKey(input, waybill, status);
  const occurredAt = input.occurredAt ?? new Date();
  const source = input.source ?? "whatsapp";

  // Idempotency guard — repeated WhatsApp scrapes show the same messages.
  const [existing] = await db.select().from(shipmentEvents).where(eq(shipmentEvents.dedupKey, dedupKey));
  if (existing) {
    return { duplicate: true, matched: !!existing.shipmentId, orphan: false, shipmentId: existing.shipmentId, status, linkedOrderIds: [], delivered: false };
  }

  let [shipment] = await db.select().from(shipments).where(eq(shipments.waybill, waybill));
  const matched = !!shipment;

  if (!shipment) {
    // Park as an orphan — never guess a PO.
    [shipment] = await db
      .insert(shipments)
      .values({
        waybill,
        status: status ?? "created",
        sourceChannel: "whatsapp",
        isOrphan: true,
        trackingUrl: dhlTrackingUrl(waybill),
        lastEventCode: input.eventCode ?? null,
        lastEventDescription: input.eventDescription ?? input.eventType ?? null,
        lastEventAt: occurredAt,
        estimatedDeliveryDate: input.estimatedDeliveryDate ?? null,
        rawMeta: input.rawText ? ({ lastRawText: input.rawText } as any) : null,
      })
      .returning();
    void tracked({ system: "whatsapp", action: "orphanWaybill", context: { waybill, status } }, async () => true);
  }

  await db.insert(shipmentEvents).values({
    shipmentId: shipment.id,
    rawWaybill: waybill,
    status: status ?? null,
    eventCode: input.eventCode ?? null,
    eventDescription: input.eventDescription ?? input.eventType ?? null,
    occurredAt,
    location: input.location ?? null,
    source,
    confidence: input.confidence ?? null,
    dedupKey,
    rawText: input.rawText ?? null,
  });

  // Update the shipment's denormalised "latest" state. An unrecognised status
  // never overwrites a known one — we only record the raw description.
  const patch: Record<string, any> = {
    lastEventCode: input.eventCode ?? shipment.lastEventCode,
    lastEventDescription: input.eventDescription ?? input.eventType ?? shipment.lastEventDescription,
    lastEventAt: occurredAt,
    updatedAt: new Date(),
  };
  if (status) patch.status = status;
  if (input.estimatedDeliveryDate) patch.estimatedDeliveryDate = input.estimatedDeliveryDate;
  if (status === "delivered") patch.deliveredAt = occurredAt;
  [shipment] = await db.update(shipments).set(patch).where(eq(shipments.id, shipment.id)).returning();

  // Fan out to linked POs.
  const links = await db.select().from(shipmentOrders).where(eq(shipmentOrders.shipmentId, shipment.id));
  for (const link of links) {
    await db.insert(orderActivity).values({
      orderId: link.orderId,
      action: "shipment_event",
      details: { waybill, status, description: input.eventDescription ?? input.eventType, location: input.location, source },
    });
    void tracked(
      { system: "dhl", action: "statusEvent", orderId: link.orderId, context: { waybill, status } },
      async () => true,
    );
    if (status === "delivered") await computeShipmentVerification(link.id);
  }

  return {
    duplicate: false,
    matched,
    orphan: !matched,
    shipmentId: shipment.id,
    status,
    linkedOrderIds: links.map((l) => l.orderId),
    delivered: status === "delivered",
  };
}

// ── Verification (confidence-graded) ─────────────────────────────────────────

export interface VerificationReport {
  grade: "green" | "amber" | "grey" | "red";
  reason: string;
  lines: { productName: string; size: string | null; expectedQty: number; shippedQty: number; delta: number }[];
  missing: { productName: string; size: string | null; qty: number }[];
  extra: { productName: string; size: string | null; qty: number }[];
  parcelCountExpected: number | null;
  parcelCountActual: number | null;
}

// Compare a PO's expected items against the parcels' declared contents. Returns
// a confidence grade. "grey" (no observed contents — the common case) is NOT an
// exception; only "red" escalates.
export async function computeShipmentVerification(shipmentOrderId: string): Promise<VerificationReport | null> {
  const [link] = await db.select().from(shipmentOrders).where(eq(shipmentOrders.id, shipmentOrderId));
  if (!link) return null;

  const expectedItems: ExpectedItem[] =
    (link.expectedItems as ExpectedItem[] | null) ?? (await buildExpectedItems(link.orderId));
  const parcels = await db.select().from(shipmentParcels).where(eq(shipmentParcels.shipmentOrderId, shipmentOrderId));

  const declared: DeclaredItem[] = parcels.flatMap((p) => (p.declaredItems as DeclaredItem[] | null) ?? []);

  const expectedMap = new Map<string, { productName: string; size: string | null; qty: number }>();
  for (const e of expectedItems) {
    const k = itemKey(e.productName, e.size);
    const cur = expectedMap.get(k);
    if (cur) cur.qty += e.qty;
    else expectedMap.set(k, { productName: e.productName, size: e.size ?? null, qty: e.qty });
  }

  let report: VerificationReport;
  if (declared.length === 0) {
    report = {
      grade: "grey",
      reason: "No declared contents from carrier — relying on the dispatch anchor",
      lines: [],
      missing: [],
      extra: [],
      parcelCountExpected: link.expectedParcelCount ?? null,
      parcelCountActual: parcels.length || null,
    };
    await db
      .update(shipmentOrders)
      .set({ verificationStatus: "unverified", verificationReport: report as any, verifiedAt: new Date() })
      .where(eq(shipmentOrders.id, shipmentOrderId));
    return report;
  }

  const declaredMap = new Map<string, { productName: string; size: string | null; qty: number }>();
  for (const d of declared) {
    const k = itemKey(d.productName ?? "", d.size);
    const cur = declaredMap.get(k);
    const qty = d.qty ?? 0;
    if (cur) cur.qty += qty;
    else declaredMap.set(k, { productName: d.productName ?? "", size: d.size ?? null, qty });
  }

  const lines: VerificationReport["lines"] = [];
  const missing: VerificationReport["missing"] = [];
  const extra: VerificationReport["extra"] = [];
  for (const [k, exp] of Array.from(expectedMap.entries())) {
    const shipped = declaredMap.get(k)?.qty ?? 0;
    lines.push({ productName: exp.productName, size: exp.size, expectedQty: exp.qty, shippedQty: shipped, delta: shipped - exp.qty });
    if (shipped < exp.qty) missing.push({ productName: exp.productName, size: exp.size, qty: exp.qty - shipped });
  }
  for (const [k, dec] of Array.from(declaredMap.entries())) {
    if (!expectedMap.has(k)) extra.push({ productName: dec.productName, size: dec.size, qty: dec.qty });
  }

  const hasShortfall = missing.length > 0;
  const hasExtra = extra.length > 0;
  const grade: VerificationReport["grade"] = hasShortfall ? "red" : hasExtra ? "amber" : "green";
  report = {
    grade,
    reason:
      grade === "green"
        ? "Declared contents match the PO"
        : grade === "amber"
          ? "Extra/unrecognised items declared (possible consolidation)"
          : "Declared contents fall short of the PO",
    lines,
    missing,
    extra,
    parcelCountExpected: link.expectedParcelCount ?? null,
    parcelCountActual: parcels.length || null,
  };

  await db
    .update(shipmentOrders)
    .set({
      verificationStatus: grade === "red" ? "mismatch" : "verified",
      verificationReport: report as any,
      verifiedAt: new Date(),
    })
    .where(eq(shipmentOrders.id, shipmentOrderId));

  if (grade === "red") {
    void tracked({ system: "dhl", action: "verifyMismatch", orderId: link.orderId, context: { shipmentOrderId } }, async () => true);
  }
  return report;
}

// ── Exception detection (powers the dashboard + the alert cron) ──────────────

export async function findOrphanShipments() {
  return db.select().from(shipments).where(eq(shipments.isOrphan, true)).orderBy(desc(shipments.lastEventAt));
}

// POs dispatched more than `days` ago with no waybill captured — the most
// important gap, since the dispatch anchor is the source of truth.
export async function findPosDispatchedWithoutWaybill(days = DISPATCHED_NO_WAYBILL_DAYS_DEFAULT) {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const linkedOrderIds = db.select({ id: shipmentOrders.orderId }).from(shipmentOrders);
  return db
    .select()
    .from(orders)
    .where(
      and(
        sql`${orders.poReference} IS NOT NULL`,
        sql`${orders.poDispatchedAt} IS NOT NULL`,
        lt(orders.poDispatchedAt, cutoff),
        sql`${orders.id} NOT IN (${linkedOrderIds})`,
      ),
    );
}

// Shipments marked delivered whose linked PO has not been advanced to a
// delivered/terminal stage — candidates for the admin "confirm delivered" card.
export async function findDeliveredNotAdvanced() {
  const rows = await db
    .select({ order: orders, shipment: shipments })
    .from(shipmentOrders)
    .innerJoin(shipments, eq(shipmentOrders.shipmentId, shipments.id))
    .innerJoin(orders, eq(shipmentOrders.orderId, orders.id))
    .where(and(eq(shipments.status, "delivered"), sql`${orders.pipelineStage} IS DISTINCT FROM 'Delivered'`));
  // Exclude POs already past Delivered (Invoice Sent / Paid).
  return rows.filter((r) => !["Invoice Sent", "Paid"].includes(r.order.pipelineStage ?? ""));
}

export async function findVerificationMismatches() {
  return db
    .select({ order: orders, link: shipmentOrders, shipment: shipments })
    .from(shipmentOrders)
    .innerJoin(orders, eq(shipmentOrders.orderId, orders.id))
    .innerJoin(shipments, eq(shipmentOrders.shipmentId, shipments.id))
    .where(eq(shipmentOrders.verificationStatus, "mismatch"));
}

// ── Dashboard (single source of truth) ───────────────────────────────────────

export interface DashboardRow {
  orderId: string;
  poReference: string | null;
  orderNumber: string;
  accountName: string | null;
  pipelineStage: string | null;
  status: string;
  dueDate: string | null;
  assignedSupplierName: string | null;
  shipments: {
    id: string;
    waybill: string;
    carrier: string;
    status: string;
    lastEventAt: Date | null;
    estimatedDeliveryDate: Date | null;
    trackingUrl: string | null;
    verificationStatus: string;
  }[];
  flags: {
    noShipment: boolean;
    overdueNoShipment: boolean;
    dispatchedNoWaybill: boolean;
    deliveredNotAdvanced: boolean;
    qtyMismatch: boolean;
    staleShipment: boolean;
  };
}

export async function getShipmentDashboard(filters?: { supplierId?: string; status?: string; flag?: string }) {
  // All POs (orders that carry a PO reference).
  const poRows = await db
    .select()
    .from(orders)
    .where(sql`${orders.poReference} IS NOT NULL`)
    .orderBy(desc(orders.poDispatchedAt));

  const orderIds = poRows.map((o) => o.id);
  const supplierRows = await db.select({ id: users.id, teamName: users.teamName }).from(users);
  const supplierName = new Map(supplierRows.map((s) => [s.id, s.teamName ?? null]));

  // Linked shipments for those POs.
  const links = orderIds.length
    ? await db
        .select({ link: shipmentOrders, shipment: shipments })
        .from(shipmentOrders)
        .innerJoin(shipments, eq(shipmentOrders.shipmentId, shipments.id))
        .where(inArray(shipmentOrders.orderId, orderIds))
    : [];
  const shipmentsByOrder = new Map<string, typeof links>();
  for (const l of links) {
    const arr = shipmentsByOrder.get(l.link.orderId) ?? [];
    arr.push(l);
    shipmentsByOrder.set(l.link.orderId, arr);
  }

  const now = Date.now();
  const staleCutoff = now - STALE_DAYS_DEFAULT * 86_400_000;
  const dispatchCutoff = now - DISPATCHED_NO_WAYBILL_DAYS_DEFAULT * 86_400_000;

  let rows: DashboardRow[] = poRows.map((o) => {
    const ls = shipmentsByOrder.get(o.id) ?? [];
    const hasShipment = ls.length > 0;
    const dueMs = o.dueDate ? new Date(o.dueDate + "T00:00:00").getTime() : null;
    const isOpen = OPEN_STAGES.includes((o.pipelineStage ?? "") as any);
    const deliveredNotAdvanced =
      ls.some((l) => l.shipment.status === "delivered") &&
      !["Delivered", "Invoice Sent", "Paid"].includes(o.pipelineStage ?? "");
    const qtyMismatch = ls.some((l) => l.link.verificationStatus === "mismatch");
    const staleShipment = ls.some(
      (l) =>
        ["created", "label_created", "picked_up"].includes(l.shipment.status) &&
        (l.shipment.lastEventAt ? l.shipment.lastEventAt.getTime() : l.shipment.createdAt?.getTime() ?? now) < staleCutoff,
    );
    return {
      orderId: o.id,
      poReference: o.poReference,
      orderNumber: o.orderNumber,
      accountName: o.accountName,
      pipelineStage: o.pipelineStage,
      status: o.status,
      dueDate: o.dueDate,
      assignedSupplierName: o.assignedSupplierId ? supplierName.get(o.assignedSupplierId) ?? null : null,
      shipments: ls.map((l) => ({
        id: l.shipment.id,
        waybill: l.shipment.waybill,
        carrier: l.shipment.carrier,
        status: l.shipment.status,
        lastEventAt: l.shipment.lastEventAt,
        estimatedDeliveryDate: l.shipment.estimatedDeliveryDate,
        trackingUrl: l.shipment.trackingUrl,
        verificationStatus: l.link.verificationStatus,
      })),
      flags: {
        noShipment: !hasShipment,
        overdueNoShipment: !hasShipment && isOpen && dueMs !== null && dueMs < now,
        dispatchedNoWaybill: !hasShipment && !!o.poDispatchedAt && o.poDispatchedAt.getTime() < dispatchCutoff,
        deliveredNotAdvanced,
        qtyMismatch,
        staleShipment,
      },
    };
  });

  if (filters?.supplierId) {
    const name = supplierName.get(filters.supplierId) ?? null;
    rows = rows.filter((r) => r.assignedSupplierName === name);
  }
  if (filters?.status) rows = rows.filter((r) => r.shipments.some((s) => s.status === filters.status));
  if (filters?.flag) rows = rows.filter((r) => (r.flags as any)[filters.flag!]);

  const orphans = await findOrphanShipments();

  return {
    rows,
    orphans: orphans.map((o) => ({
      id: o.id,
      waybill: o.waybill,
      status: o.status,
      lastEventAt: o.lastEventAt,
      lastEventDescription: o.lastEventDescription,
    })),
    summary: {
      total: rows.length,
      withShipment: rows.filter((r) => !r.flags.noShipment).length,
      delivered: rows.filter((r) => r.shipments.some((s) => s.status === "delivered")).length,
      exceptions: rows.filter(
        (r) => r.flags.overdueNoShipment || r.flags.dispatchedNoWaybill || r.flags.deliveredNotAdvanced || r.flags.qtyMismatch,
      ).length,
      orphanCount: orphans.length,
    },
  };
}

// Shipments + parcels + linked POs for a single waybill (detail view).
export async function getShipmentDetail(shipmentId: string) {
  const [shipment] = await db.select().from(shipments).where(eq(shipments.id, shipmentId));
  if (!shipment) return null;
  const links = await db
    .select({ link: shipmentOrders, order: orders })
    .from(shipmentOrders)
    .innerJoin(orders, eq(shipmentOrders.orderId, orders.id))
    .where(eq(shipmentOrders.shipmentId, shipmentId));
  const parcels = await db.select().from(shipmentParcels).where(eq(shipmentParcels.shipmentId, shipmentId));
  const events = await db
    .select()
    .from(shipmentEvents)
    .where(eq(shipmentEvents.shipmentId, shipmentId))
    .orderBy(desc(shipmentEvents.occurredAt));
  return { shipment, links, parcels, events };
}

export async function getShipmentsForOrder(orderId: string) {
  return db
    .select({ link: shipmentOrders, shipment: shipments })
    .from(shipmentOrders)
    .innerJoin(shipments, eq(shipmentOrders.shipmentId, shipments.id))
    .where(eq(shipmentOrders.orderId, orderId));
}
