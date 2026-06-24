// DHL shipment-tracking admin API.
//
// All routes require admin (cookie OR X-Service-Token, so the mission-control
// Telegram bridge can link waybills / ingest events). The heavy lifting lives in
// server/shipments.ts; this file is the HTTP surface:
//
//   POST   /api/admin/shipments                  capture a waybill + link PO(s)
//   POST   /api/admin/shipments/:id/link         add more POs to a waybill
//   DELETE /api/admin/shipments/:id/link/:orderId unlink a mis-linked PO
//   POST   /api/admin/shipments/:id/verify        re-run content verification
//   POST   /api/admin/shipments/ingest            ingest a parsed DHL status event
//   GET    /api/admin/shipments/dashboard         single-source-of-truth view
//   GET    /api/admin/shipments/for-order/:orderId  shipments for one PO
//   GET    /api/admin/shipments/:id               waybill detail

import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../auth";
import type { JwtPayload } from "../auth";
import {
  linkOrdersToShipment,
  unlinkOrderFromShipment,
  ingestShipmentEvent,
  computeShipmentVerification,
  getShipmentDashboard,
  getShipmentDetail,
  getShipmentsForOrder,
  findOrdersByPoReferences,
} from "../shipments";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { shipments, shipmentOrders } from "@shared/schema";

const router = Router();
router.use(requireAdmin);

function userId(req: any): string | null {
  const u = (req as any).user as JwtPayload | undefined;
  return u?.userId ?? null;
}

const parcelSchema = z.object({
  orderId: z.string().optional(),
  pieceId: z.string().optional(),
  description: z.string().optional(),
  declaredItems: z
    .array(z.object({ productName: z.string().optional(), size: z.string().nullish(), qty: z.number().optional() }))
    .optional(),
  weightGrams: z.number().int().optional(),
});

const createSchema = z
  .object({
    waybill: z.string().min(3),
    orderIds: z.array(z.string()).optional(),
    poReferences: z.array(z.string()).optional(),
    carrier: z.string().optional(),
    estimatedDeliveryDate: z.string().datetime().optional(),
    parcels: z.array(parcelSchema).optional(),
    source: z.enum(["supplier", "admin", "whatsapp", "telegram_manual"]).optional(),
  })
  .refine((d) => (d.orderIds?.length ?? 0) + (d.poReferences?.length ?? 0) > 0, {
    message: "Provide at least one orderId or poReference",
  });

// POST / — capture a waybill and link it to PO(s). Accepts order IDs and/or PO
// references ("PO-2026-0042"). This is the consolidation + orphan-claim path.
router.post("/", async (req, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid payload" });
    const { orders: byRef, unresolved } = await findOrdersByPoReferences(parsed.data.poReferences ?? []);
    const orderIds = Array.from(new Set([...(parsed.data.orderIds ?? []), ...byRef.map((o) => o.id)]));
    if (!orderIds.length) {
      return res.status(404).json({ error: "No matching POs", unresolved });
    }
    const result = await linkOrdersToShipment({
      waybill: parsed.data.waybill,
      orderIds,
      source: parsed.data.source ?? "admin",
      linkSource: "admin",
      carrier: parsed.data.carrier,
      estimatedDeliveryDate: parsed.data.estimatedDeliveryDate ? new Date(parsed.data.estimatedDeliveryDate) : null,
      parcels: parsed.data.parcels,
      userId: userId(req),
    });
    res.json({ ok: true, ...result, unresolved });
  } catch (e: any) {
    console.error("Shipment create error:", e);
    res.status(500).json({ error: "Failed to link shipment" });
  }
});

const linkSchema = z.object({
  orderIds: z.array(z.string()).optional(),
  poReferences: z.array(z.string()).optional(),
  parcels: z.array(parcelSchema).optional(),
});

// POST /:id/link — add more POs to an existing waybill.
router.post("/:id/link", async (req, res) => {
  try {
    const [shipment] = await db.select().from(shipments).where(eq(shipments.id, req.params.id));
    if (!shipment) return res.status(404).json({ error: "Shipment not found" });
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid payload" });
    const { orders: byRef, unresolved } = await findOrdersByPoReferences(parsed.data.poReferences ?? []);
    const orderIds = Array.from(new Set([...(parsed.data.orderIds ?? []), ...byRef.map((o) => o.id)]));
    if (!orderIds.length) return res.status(404).json({ error: "No matching POs", unresolved });
    const result = await linkOrdersToShipment({
      waybill: shipment.waybill,
      orderIds,
      source: "admin",
      linkSource: shipment.isOrphan ? "whatsapp-late-link" : "admin",
      parcels: parsed.data.parcels,
      userId: userId(req),
    });
    res.json({ ok: true, ...result, unresolved });
  } catch (e: any) {
    console.error("Shipment link error:", e);
    res.status(500).json({ error: "Failed to link POs" });
  }
});

// DELETE /:id/link/:orderId — unlink a mis-linked PO.
router.delete("/:id/link/:orderId", async (req, res) => {
  try {
    const ok = await unlinkOrderFromShipment(req.params.id, req.params.orderId);
    if (!ok) return res.status(404).json({ error: "Link not found" });
    res.json({ ok: true });
  } catch (e: any) {
    console.error("Shipment unlink error:", e);
    res.status(500).json({ error: "Failed to unlink PO" });
  }
});

// POST /:id/verify — re-run content verification for every PO on this waybill.
router.post("/:id/verify", async (req, res) => {
  try {
    const links = await db.select().from(shipmentOrders).where(eq(shipmentOrders.shipmentId, req.params.id));
    if (!links.length) return res.status(404).json({ error: "No linked POs" });
    const reports = [];
    for (const link of links) reports.push({ orderId: link.orderId, report: await computeShipmentVerification(link.id) });
    res.json({ ok: true, reports });
  } catch (e: any) {
    console.error("Shipment verify error:", e);
    res.status(500).json({ error: "Failed to verify shipment" });
  }
});

const ingestSchema = z.object({
  waybill: z.string().min(3),
  eventType: z.string().optional(),
  eventCode: z.string().optional(),
  eventDescription: z.string().optional(),
  occurredAt: z.string().datetime().optional(),
  location: z.string().optional(),
  estimatedDeliveryDate: z.string().datetime().optional(),
  rawText: z.string().optional(),
  source: z.enum(["whatsapp", "telegram_manual", "admin"]).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  dedupKey: z.string().optional(),
});

// POST /ingest — accept a parsed DHL status event (from the WhatsApp poll job,
// the manual-forward path, or an admin paste). Matched by waybill; unknown
// waybills are parked as orphans. Always 200 so the relay never retry-storms.
router.post("/ingest", async (req, res) => {
  try {
    const parsed = ingestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid payload" });
    const result = await ingestShipmentEvent({
      waybill: parsed.data.waybill,
      eventType: parsed.data.eventType,
      eventCode: parsed.data.eventCode,
      eventDescription: parsed.data.eventDescription,
      occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : null,
      location: parsed.data.location,
      estimatedDeliveryDate: parsed.data.estimatedDeliveryDate ? new Date(parsed.data.estimatedDeliveryDate) : null,
      rawText: parsed.data.rawText,
      source: parsed.data.source ?? "whatsapp",
      confidence: parsed.data.confidence,
      dedupKey: parsed.data.dedupKey,
    });
    res.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("Shipment ingest error:", e);
    // Soft-fail: a parse/DB blip must not make the relay retry forever.
    res.json({ ok: false, error: "ingest_failed" });
  }
});

router.get("/dashboard", async (req, res) => {
  try {
    const data = await getShipmentDashboard({
      supplierId: (req.query.supplierId as string) || undefined,
      status: (req.query.status as string) || undefined,
      flag: (req.query.flag as string) || undefined,
    });
    res.json(data);
  } catch (e: any) {
    console.error("Shipment dashboard error:", e);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

router.get("/for-order/:orderId", async (req, res) => {
  try {
    res.json({ shipments: await getShipmentsForOrder(req.params.orderId) });
  } catch (e: any) {
    console.error("Shipments-for-order error:", e);
    res.status(500).json({ error: "Failed to load shipments" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const detail = await getShipmentDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: "Shipment not found" });
    res.json(detail);
  } catch (e: any) {
    console.error("Shipment detail error:", e);
    res.status(500).json({ error: "Failed to load shipment" });
  }
});

export default router;
