import { Router } from "express";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { hashPassword, signToken, setAuthCookie, setImpersonateCookie } from "../auth";
import { z } from "zod";
import { notifyDesignApproved, notifyDesignRejected, notifyOrderStatusChange } from "../notifications";
import { sendInviteEmail, sendSupplierPoRaisedEmail, sendSupplierPoDispatchGmail, sendCustomerDesignProofRequest } from "../email";
import { db } from "../db";
import { orders, orderActivity, designFiles, orderItems, orderSizeBreakdowns, clubAccounts, clubLogoAssets, users } from "@shared/schema";
import { clubLogoPlacement } from "../canva-logos";
import type { OrderItem } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  fetchSupporterOrdersByTag,
  fetchCollectionStatus,
  fetchProductsInCollection,
  fetchSupporterOrdersByCollection,
  isShopifyAdminConfigured,
  setSupporterCampaignStatus,
  getCollectionGidByHandle,
  type SupporterOrder,
  type ShopifyProductLite,
  type SupporterCampaignStatus,
} from "../shopify-admin";
import { matchSupporterProduct, extractSizeFromVariant } from "@shared/supporter-range-mapping";
import { SIDELINE_PRODUCTS } from "@shared/product-catalog";
import { suggestSizeChart } from "@shared/size-charts";
import { triageOrder } from "@shared/triage";
import { updateGhlOpportunityStage } from "./ghl";
import { createApprovalToken } from "./approvals";
import { withPoNumberRetry, buildPoReference } from "../po-number";
import {
  createClientFolder,
  listFilesInFolder,
  listFilesRecursive,
  isDriveConfigured,
  buildClientFolderName,
  mirrorBlobToPoFolder,
  shareFolderWithUser,
  createDocInFolder,
} from "../google-drive";
import { computeMilestones } from "@shared/po-milestones";
import { extractColorsFromImage } from "../mockup/color-extract";
import { generateDesignBrief } from "../mockup/design-brief";
import { uploadPoPdfToDrive, generatePoHtml } from "../po-pdf";
import { tracked } from "../integration-events";
import {
  searchGhlContacts,
  findGhlContactByEmail,
  getGhlContact,
  upsertGhlContact,
  createGhlOpportunity,
  findOpenOpportunityForContact,
  advanceGhlOpportunity,
  type GhlContact,
} from "../ghl-contacts";
import { SIDELINE_PIPELINE_ID, SIDELINE_STAGE_IDS } from "../ghl-config";
import { isSidelinePipelineStage, type SidelinePipelineStage } from "@shared/pipeline";
import {
  ALL_ORDER_STAGES,
  isOrderStage,
  isPushableToGhl,
  legacyStatusForStage,
  type OrderStage,
} from "@shared/order-stages";
import { sendTelegramCard, buildPoApprovalCard, isTelegramConfigured } from "../telegram";
import { runTask as runAiTask } from "../ai";
import { runChatTurn, getOrCreateConversation, listConversations, listMessages, EZRA_TOOLS_AVAILABLE } from "../ezra";

const router = Router();

// All admin routes require admin authentication
router.use(requireAdmin);

// GET /dashboard — stats
// GET /integration-events — recent external-API audit trail. Filter by
// system, status, orderId. Used to answer "did the GHL opportunity for
// order X actually get created?" and "what failed this week?".
router.get("/integration-events", async (req, res) => {
  try {
    const { system, status, orderId } = req.query as Record<string, string | undefined>;
    const limit = Math.min(parseInt((req.query.limit as string) || "100", 10) || 100, 500);

    const { integrationEvents } = await import("@shared/schema");
    const { eq: eqOp, and, desc } = await import("drizzle-orm");
    const conds: any[] = [];
    if (system) conds.push(eqOp(integrationEvents.system, system));
    if (status) conds.push(eqOp(integrationEvents.status, status));
    if (orderId) conds.push(eqOp(integrationEvents.orderId, orderId));

    const rows = await db.select().from(integrationEvents)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(integrationEvents.createdAt))
      .limit(limit);

    res.json({ events: rows, total: rows.length });
  } catch (err) {
    console.error("Admin integration-events error:", err);
    res.status(500).json({ error: "Failed to fetch integration events" });
  }
});

router.get("/dashboard", async (_req, res) => {
  try {
    const stats = await storage.getDashboardStats();
    res.json(stats);
  } catch (err) {
    console.error("Admin dashboard error:", err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

// GET /orders/triage — cross-order dashboard, one row per active order with
// its computed triage state against the 35-day build calendar. Excludes
// Completed / Cancelled. Sorted overdue → at_risk → on_track.
router.get("/orders/triage", async (_req, res) => {
  try {
    const { orders: all } = await storage.getAllOrders({ limit: 500, offset: 0 });
    const today = new Date();
    const rows = all
      .filter((o: any) => {
        const stage = o.pipelineStage || "";
        const status = (o.status || "").toLowerCase();
        return stage !== "Completed" && stage !== "Cancelled" && status !== "cancelled";
      })
      .map((o: any) => {
        const t = triageOrder(
          { pipelineStage: o.pipelineStage, status: o.status, dueDate: o.dueDate, productionStage: o.productionStage },
          today,
        );
        return {
          id: o.id,
          orderNumber: o.orderNumber,
          poReference: o.poReference,
          accountName: o.accountName,
          pipelineStage: o.pipelineStage,
          status: o.status,
          dueDate: o.dueDate,
          createdAt: o.createdAt,
          triage: t,
        };
      });

    const rank: Record<string, number> = { overdue: 0, at_risk: 1, awaiting_kickoff: 2, on_track: 3, no_due_date: 4 };
    rows.sort((a: any, b: any) => {
      const ra = rank[a.triage.state] ?? 9;
      const rb = rank[b.triage.state] ?? 9;
      if (ra !== rb) return ra - rb;
      const da = a.triage.daysUntilDue ?? 99_999;
      const db_ = b.triage.daysUntilDue ?? 99_999;
      return da - db_;
    });

    res.json({
      ok: true,
      generatedAt: today.toISOString(),
      counts: rows.reduce((acc: Record<string, number>, r: any) => { acc[r.triage.state] = (acc[r.triage.state] || 0) + 1; return acc; }, {}),
      rows,
    });
  } catch (err: any) {
    console.error("[triage] error:", err);
    res.status(500).json({ error: "Failed to load triage", message: String(err?.message || err) });
  }
});

// GET /orders/action-required — action-based triage (orthogonal to the
// time-based triage above). Returns 4 buckets ops needs to clear:
//   1. needs_supplier      — PO has no assigned_supplier_id, can't dispatch
//   2. pending_costs       — PO has lines with NULL supplier_unit_cost_cents
//   3. dispatched_unpaid   — PO was dispatched but supplier invoice not paid
//   4. on_hold             — PO was held; needs decision
router.get("/orders/action-required", async (_req, res) => {
  try {
    // The estimated cost subquery picks the dominant currency per order
    // (most line items' supplier_cost_currency wins). Lines with NULL
    // supplier_unit_cost_cents contribute zero to the estimate; the
    // pending_cost_lines count tells you how many are missing.
    const rows: any = await db.execute(sql`
      SELECT
        o.id, o.po_reference, o.account_name, o.pipeline_stage, o.status,
        o.due_date, o.assigned_supplier_id, o.po_dispatched_at, o.po_held_at,
        o.po_hold_reason, o.supplier_invoice_paid_at, o.supplier_invoice_file_url,
        o.supplier_invoice_total_cents, o.supplier_invoice_currency,
        (SELECT COUNT(*)::int FROM order_items WHERE order_id = o.id) AS line_count,
        (SELECT COUNT(*)::int FROM order_items WHERE order_id = o.id AND supplier_unit_cost_cents IS NULL) AS pending_cost_lines,
        (
          SELECT COALESCE(SUM(oi.supplier_unit_cost_cents * oi.quantity), 0)::bigint
            FROM order_items oi
           WHERE oi.order_id = o.id
        ) AS estimated_cost_cents,
        (
          SELECT oi.supplier_cost_currency
            FROM order_items oi
           WHERE oi.order_id = o.id AND oi.supplier_cost_currency IS NOT NULL
           GROUP BY oi.supplier_cost_currency
           ORDER BY COUNT(*) DESC
           LIMIT 1
        ) AS estimated_cost_currency
      FROM orders o
      WHERE o.po_reference IS NOT NULL
        AND COALESCE(o.pipeline_stage, '') NOT IN ('Cancelled', 'Completed')
        AND COALESCE(o.status, '') NOT IN ('cancelled')
    `);
    const all: any[] = Array.isArray(rows) ? rows : (rows.rows ?? []);

    const needsSupplier: any[] = [];
    const pendingCosts: any[] = [];
    const dispatchedUnpaid: any[] = [];
    const onHold: any[] = [];

    for (const r of all) {
      // Normalise the estimated cost so downstream consumers see a plain number, not a bigint string.
      r.estimated_cost_cents = Number(r.estimated_cost_cents ?? 0);
      const dispatched = !!r.po_dispatched_at;
      if (r.po_held_at) {
        onHold.push(r);
      }
      if (!dispatched && !r.po_held_at) {
        if (!r.assigned_supplier_id) needsSupplier.push(r);
        if ((r.pending_cost_lines ?? 0) > 0) pendingCosts.push(r);
      }
      if (dispatched && !r.supplier_invoice_paid_at) dispatchedUnpaid.push(r);
    }

    // Bucket totals by currency. Each row's estimated_cost_cents is the
    // SUM(unit × qty) of its line items; we roll those up per currency.
    const sumByCurrency = (rows: any[]) => {
      const out: Record<string, number> = {};
      for (const r of rows) {
        const ccy = r.estimated_cost_currency || "USD";
        out[ccy] = (out[ccy] ?? 0) + (r.estimated_cost_cents ?? 0);
      }
      return out;
    };

    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      buckets: {
        needs_supplier: needsSupplier,
        pending_costs: pendingCosts,
        dispatched_unpaid: dispatchedUnpaid,
        on_hold: onHold,
      },
      counts: {
        needs_supplier: needsSupplier.length,
        pending_costs: pendingCosts.length,
        dispatched_unpaid: dispatchedUnpaid.length,
        on_hold: onHold.length,
        total_active_pos: all.length,
      },
      totals_cents: {
        needs_supplier: sumByCurrency(needsSupplier),
        pending_costs: sumByCurrency(pendingCosts),
        dispatched_unpaid: sumByCurrency(dispatchedUnpaid),
        on_hold: sumByCurrency(onHold),
      },
    });
  } catch (err: any) {
    console.error("[action-required] error:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// GET /orders — all orders, filterable/paginated
router.get("/orders", async (req, res) => {
  try {
    const {
      status, stage, designStatus, search,
      createdFrom, createdTo, dueFrom, dueTo, overdue,
      sortBy, sortDir,
      limit, offset,
    } = req.query;
    const result = await storage.getAllOrders({
      status: status as string | undefined,
      stage: stage as string | undefined,
      designStatus: designStatus as string | undefined,
      search: search as string | undefined,
      createdFrom: createdFrom as string | undefined,
      createdTo: createdTo as string | undefined,
      dueFrom: dueFrom as string | undefined,
      dueTo: dueTo as string | undefined,
      overdue: overdue === "true" || overdue === "1",
      sortBy: sortBy === "dueDate" ? "dueDate" : sortBy === "createdAt" ? "createdAt" : undefined,
      sortDir: sortDir === "asc" ? "asc" : sortDir === "desc" ? "desc" : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json(result);
  } catch (err) {
    console.error("Admin orders error:", err);
    res.status(500).json({ error: "Failed to load orders" });
  }
});

// GET /orders/:id — order + items + designs + comments
router.get("/orders/:id", async (req, res) => {
  try {
    const result = await storage.getOrderWithDetails(req.params.id);
    if (!result) return res.status(404).json({ error: "Order not found" });
    // Brand colours — resolved READ-THROUGH from this PO's club brand identity
    // (set once on the Brand Identity page, flows to every PO, no copy/drift).
    const _R = (r: any) => (r && r.rows) ? r.rows : (Array.isArray(r) ? r : []);
    const ord = _R(await db.execute(sql`SELECT club_account_id, club_id FROM orders WHERE id=${req.params.id}`))[0];
    let brandColors: any = null;
    if (ord?.club_account_id) {
      brandColors = _R(await db.execute(sql`SELECT colors FROM club_brand_identity WHERE club_account_id=${ord.club_account_id}`))[0]?.colors || null;
    }
    // Parent (Club/School) — resolved READ-THROUGH: its delivery address is the
    // default ship-to for this PO, its contact the default comms recipient.
    // Defensive (columns may not be migrated yet).
    let parent: any = null;
    if (ord?.club_id) {
      try {
        const p = _R(await db.execute(sql`SELECT name, delivery_address, contact_name, contact_email, contact_phone, website FROM clubs WHERE id=${ord.club_id}`))[0];
        if (p) parent = { name: p.name, deliveryAddress: p.delivery_address, contactName: p.contact_name, contactEmail: p.contact_email, contactPhone: p.contact_phone, website: p.website };
      } catch { /* parent-detail columns not migrated yet */ }
    }
    res.json({ ...result, brandColors, parent });
  } catch (err) {
    console.error("Admin order detail error:", err);
    res.status(500).json({ error: "Failed to load order" });
  }
});

// PATCH /orders/:id — update status, admin notes, PO fields, tracking
const updateOrderSchema = z.object({
  status: z.string().optional(),
  designStatus: z.string().optional(),
  adminNotes: z.string().optional(),
  trackingNumber: z.string().optional(),
  trackingUrl: z.string().optional(),
  estimatedDeliveryDate: z.string().transform(v => v ? new Date(v) : undefined).optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().optional(),
  customerFirstName: z.string().optional(),
  customerLastName: z.string().optional(),
  customerPhone: z.string().optional(),
  companyEmail: z.string().optional(),
  companyPhone: z.string().optional(),
  poReference: z.string().optional(),
  accountName: z.string().optional(),
  isRepeatOrder: z.boolean().optional(),
  poComments: z.string().optional(),
  deliveryAttention: z.string().optional(),
  deliveryAddress: z.string().optional(),
  deliveryEmail: z.string().optional(),
  deliveryPhone: z.string().optional(),
  dueDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
  orderType: z.enum(["team-store", "bulk-order", "sample-run"]).optional(),
  artworkApproved: z.boolean().optional(),
  artworkApprovedBy: z.union([z.string(), z.null()]).optional(),
  artworkApprovedAt: z.union([z.string().transform(v => v ? new Date(v) : null), z.null()]).optional(),
  // Unified Stage picker — accepts any of the 9 GHL pipeline stages plus
  // Completed / Cancelled. PATCH derives legacy `status` from this and
  // pushes the GHL stage when applicable. See shared/order-stages.ts.
  pipelineStage: z.string().refine(isOrderStage, { message: "Invalid stage" }).optional(),
});

// DELETE /orders/:id — cascades through items, breakdowns, designs, stages,
// qc, messages, activity. Drive folder is intentionally left behind as an
// audit trail; clean that up manually if needed.
router.delete("/orders/:id", async (req, res) => {
  try {
    const ok = await storage.deleteOrder(req.params.id);
    if (!ok) return res.status(404).json({ error: "Order not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("Admin delete order error:", err);
    res.status(500).json({ error: "Failed to delete order" });
  }
});

// POST /orders/:id/duplicate — clone order + items (not size breakdowns, not
// designs, not activity — those are order-specific history). New order gets
// a fresh orderNumber, no poReference, status=pending, pipelineStage=null.
// Useful for repeat runs where the same club re-orders the same product mix.
router.post("/orders/:id/duplicate", async (req, res) => {
  try {
    const source = await storage.getOrderWithDetails(req.params.id);
    if (!source) return res.status(404).json({ error: "Order not found" });
    const { order: src, items: srcItems } = source;

    const { id: _id, orderNumber: _n, createdAt: _c, updatedAt: _u, paidAt: _p, poReference: _po,
            driveFolderId: _df, driveFolderUrl: _du, driveFolderName: _dn,
            ghlOpportunityId: _gh, pipelineStage: _ps, assignedSupplierId: _as,
            artworkApproved: _aa, artworkApprovedBy: _ab, artworkApprovedAt: _at,
            ...orderCopy } = src as any;

    const newOrderNumber = `SNZ-DUP-${Date.now().toString(36).toUpperCase()}`;
    const newOrder = await storage.createOrder({
      ...orderCopy,
      orderNumber: newOrderNumber,
      status: "pending",
      designStatus: null,
      isRepeatOrder: true,
    } as any);

    for (const it of srcItems) {
      const { id: _iid, orderId: _oid, ...itemCopy } = it as any;
      await storage.createOrderItem({ ...itemCopy, orderId: newOrder.id } as any);
    }

    res.json({ ok: true, order: newOrder });
  } catch (err) {
    console.error("Admin duplicate order error:", err);
    res.status(500).json({ error: "Failed to duplicate order" });
  }
});

router.patch("/orders/:id", async (req, res) => {
  try {
    const data = updateOrderSchema.parse(req.body);
    const oldOrder = await storage.getOrder(req.params.id);

    // Stage picker → derive legacy status when caller didn't set one explicitly,
    // so badges, notification triggers, and any code reading `status` keep working.
    const updates: Record<string, any> = { ...data };
    if (data.pipelineStage && data.status === undefined) {
      updates.status = legacyStatusForStage(data.pipelineStage as OrderStage);
    }

    const order = await storage.updateOrder(req.params.id, updates);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Push to GHL when the stage is one of the real pipeline stages (skip for
    // Completed/Cancelled which don't exist in GHL). Best-effort — never fail
    // the request just because GHL is down.
    if (
      data.pipelineStage &&
      data.pipelineStage !== oldOrder?.pipelineStage &&
      order.ghlOpportunityId &&
      isPushableToGhl(data.pipelineStage as OrderStage)
    ) {
      updateGhlOpportunityStage(order.ghlOpportunityId, data.pipelineStage as SidelinePipelineStage)
        .catch((err) => console.error("[patch order] GHL stage push failed:", err));
    }

    // Activity log for stage changes — independent of the status notification.
    if (data.pipelineStage && data.pipelineStage !== oldOrder?.pipelineStage) {
      db.insert(orderActivity).values({
        orderId: order.id,
        userId: (req as any).user?.userId,
        action: "stage_changed",
        details: { from: oldOrder?.pipelineStage || null, to: data.pipelineStage },
      }).catch((err: any) => console.error("[patch order] activity log failed:", err));
    }

    // Notify customer on status change
    if (updates.status && updates.status !== oldOrder?.status && order.userId) {
      notifyOrderStatusChange({
        userId: order.userId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        newStatus: updates.status,
        customerEmail: order.customerEmail,
      }).catch(err => console.error("Notify order status error:", err));
    }

    res.json(order);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin update order error:", err);
    res.status(500).json({ error: "Failed to update order" });
  }
});

// POST /orders/:id/design-review — approve/reject design file + comment
const designReviewSchema = z.object({
  designFileId: z.string(),
  action: z.enum(["approved", "rejected"]),
  comment: z.string().optional(),
});

router.post("/orders/:id/design-review", async (req, res) => {
  try {
    const { designFileId, action, comment } = designReviewSchema.parse(req.body);
    const user = (req as any).user;

    // Update design file status
    const file = await storage.updateDesignFileStatus(designFileId, action);
    if (!file) return res.status(404).json({ error: "Design file not found" });

    // Create comment record
    if (comment || action) {
      await storage.createDesignComment({
        designFileId,
        userId: user.userId,
        comment: comment || `Design ${action}`,
        action,
      });
    }

    // Notify the customer (DB + email + GHL)
    if (file.userId) {
      const order = await storage.getOrder(file.orderId);
      const customer = await storage.getUser(file.userId);
      const notifyOpts = {
        userId: file.userId,
        orderId: file.orderId,
        designFileId: file.id,
        label: file.label,
        orderNumber: order?.orderNumber || "",
        customerEmail: customer?.email || order?.customerEmail,
      };

      if (action === "approved") {
        await notifyDesignApproved(notifyOpts);
      } else {
        await notifyDesignRejected({ ...notifyOpts, comment });
      }
    }

    // Check if all designs for this order are approved
    const allDesigns = await storage.getDesignFilesByOrder(file.orderId);
    const latestByLabel = new Map<string, typeof allDesigns[0]>();
    for (const d of allDesigns) {
      const existing = latestByLabel.get(d.label);
      if (!existing || (d.createdAt && existing.createdAt && d.createdAt > existing.createdAt)) {
        latestByLabel.set(d.label, d);
      }
    }
    const latestDesigns = Array.from(latestByLabel.values());
    const allApproved = latestDesigns.length > 0 &&
      latestDesigns.every(d => d.status === "approved");

    if (allApproved) {
      await storage.updateOrder(file.orderId, { designStatus: "approved" });
    } else if (action === "rejected") {
      await storage.updateOrder(file.orderId, { designStatus: "needs_revision" });
    }

    res.json({ file, allApproved });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin design review error:", err);
    res.status(500).json({ error: "Failed to review design" });
  }
});

// ============ FILE VAULT (Google Drive per-PO folders) ============

// GET /vault — list POs that have a Drive folder attached (+ optional creation preview)
router.get("/vault", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        poReference: orders.poReference,
        accountName: orders.accountName,
        customerEmail: orders.customerEmail,
        customerFirstName: orders.customerFirstName,
        customerLastName: orders.customerLastName,
        driveFolderId: orders.driveFolderId,
        driveFolderUrl: orders.driveFolderUrl,
        driveFolderName: orders.driveFolderName,
        pipelineStage: orders.pipelineStage,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .orderBy(orders.createdAt);

    res.json({
      configured: isDriveConfigured(),
      orders: rows.reverse(), // most recent first
    });
  } catch (err) {
    console.error("Admin vault list error:", err);
    res.status(500).json({ error: "Failed to load vault" });
  }
});

// GET /vault/:orderId/files?folderId=... — list Drive items in the order's root
// folder (default) or any sub-folder the admin has drilled into. The sub-folder
// must resolve via the Drive API — we don't recursively validate ownership
// because access is already gated by the admin parent folder.
router.get("/vault/:orderId/files", async (req, res) => {
  try {
    const [row] = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        poReference: orders.poReference,
        accountName: orders.accountName,
        driveFolderId: orders.driveFolderId,
        driveFolderUrl: orders.driveFolderUrl,
        driveFolderName: orders.driveFolderName,
      })
      .from(orders)
      .where(eq(orders.id, req.params.orderId))
      .limit(1);

    if (!row) return res.status(404).json({ error: "Order not found" });
    if (!row.driveFolderId) {
      return res.json({ order: row, files: [], missing: true });
    }

    // When the admin drills into a specific sub-folder, list its contents
    // directly. When no folderId is passed we return root folders + ALL
    // files recursively (1 level deep) so dropped uploads in sub-folders
    // like "02. Mockups" / "03. Logos" are visible without clicking in.
    const folderId = (req.query.folderId as string) || row.driveFolderId;
    const recursive = req.query.recursive !== "false" && !req.query.folderId;
    const files = recursive
      ? await listFilesRecursive(row.driveFolderId)
      : await listFilesInFolder(folderId);

    // For the root view, also include the sub-folders themselves so the UI
    // can render browse-tiles alongside the flattened files list.
    let subfolders: any[] = [];
    if (recursive) {
      const all = await listFilesInFolder(row.driveFolderId);
      subfolders = all.filter((f) => f.mimeType === "application/vnd.google-apps.folder");
    }

    res.json({
      order: row,
      files,
      subfolders,
      folderId,
      rootFolderId: row.driveFolderId,
      recursive,
      missing: false,
    });
  } catch (err) {
    console.error("Admin vault files error:", err);
    res.status(500).json({ error: "Failed to load vault files" });
  }
});

// POST /vault/:orderId/create-folder — retroactively create the Drive folder for an
// order that didn't get one (e.g. created before this feature, or Drive was down).
router.post("/vault/:orderId/create-folder", async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, req.params.orderId))
      .limit(1);

    if (!row) return res.status(404).json({ error: "Order not found" });
    if (row.driveFolderId) return res.json({ ok: true, folderId: row.driveFolderId, already: true });

    const dateStr = (row.createdAt ? new Date(row.createdAt) : new Date()).toISOString().slice(0, 10);
    const companyForFolder = row.accountName?.trim() || "Sideline";
    const contactForFolder =
      [row.customerFirstName, row.customerLastName].filter(Boolean).join(" ").trim() ||
      row.customerName?.trim() ||
      row.customerEmail ||
      "Unnamed Contact";

    const folder = await createClientFolder({
      date: dateStr,
      companyName: companyForFolder,
      contactName: contactForFolder,
    });
    if (!folder) return res.status(500).json({ error: "Drive folder creation failed — check GOOGLE_* env vars" });

    await storage.updateOrder(row.id, {
      driveFolderId: folder.id,
      driveFolderUrl: folder.webViewLink,
      driveFolderName: folder.name,
    });

    res.json({ ok: true, folder });
  } catch (err) {
    console.error("Admin vault create-folder error:", err);
    res.status(500).json({ error: "Failed to create Drive folder" });
  }
});

// ============ GHL CONTACT SYNC ============
// These endpoints let the admin UI check/pull customers from GHL before
// creating a new local record. GHL is the CRM source of truth — portal
// mirrors it by email + ghlContactId link.

// GET /ghl/search?q=... — search GHL contacts (typeahead)
router.get("/ghl/search", async (req, res) => {
  try {
    const q = ((req.query.q as string) || "").trim();
    if (q.length < 2) return res.json({ contacts: [], total: 0 });

    // Also surface whether we already have a local user linked to each GHL contact
    const result = await searchGhlContacts(q, 10);
    const emails = result.contacts
      .map((c) => c.email)
      .filter((e): e is string => !!e);

    const localLinks: Record<string, { userId: string; teamName: string | null }> = {};
    for (const email of emails) {
      const local = await storage.getUserByEmail(email);
      if (local) localLinks[email] = { userId: local.id, teamName: local.teamName };
    }

    res.json({
      contacts: result.contacts.map((c) => ({
        id: c.id,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        companyName: c.companyName,
        tags: c.tags,
        linkedUser: c.email ? localLinks[c.email] || null : null,
      })),
      total: result.total,
    });
  } catch (err) {
    console.error("Admin GHL search error:", err);
    res.status(500).json({ error: "GHL search failed" });
  }
});

// GET /ghl/lookup?email=... — exact email match (used by invite form live check)
router.get("/ghl/lookup", async (req, res) => {
  try {
    const email = ((req.query.email as string) || "").trim();
    if (!email) return res.status(400).json({ error: "email required" });

    const ghlContact = await findGhlContactByEmail(email);
    const local = await storage.getUserByEmail(email);

    res.json({
      ghl: ghlContact
        ? {
            id: ghlContact.id,
            email: ghlContact.email,
            firstName: ghlContact.firstName,
            lastName: ghlContact.lastName,
            phone: ghlContact.phone,
            companyName: ghlContact.companyName,
            tags: ghlContact.tags,
          }
        : null,
      local: local
        ? { id: local.id, email: local.email, teamName: local.teamName, ghlContactId: local.ghlContactId }
        : null,
    });
  } catch (err) {
    console.error("Admin GHL lookup error:", err);
    res.status(500).json({ error: "GHL lookup failed" });
  }
});

// POST /ghl/import — pull a GHL contact into local users as a customer (+ send invite)
const ghlImportSchema = z.object({
  ghlContactId: z.string().min(1),
  sendInvite: z.boolean().optional().default(true),
});

router.post("/ghl/import", async (req, res) => {
  try {
    const { ghlContactId, sendInvite } = ghlImportSchema.parse(req.body);

    const contact = await getGhlContact(ghlContactId);
    if (!contact || !contact.email) {
      return res.status(404).json({ error: "GHL contact not found or missing email" });
    }

    // Already linked locally?
    const existing = await storage.getUserByEmail(contact.email);
    if (existing) {
      // Backfill the link if we didn't have it yet
      if (!existing.ghlContactId) {
        await storage.updateCustomer(existing.id, { ghlContactId: contact.id });
      }
      return res.status(200).json({
        id: existing.id,
        email: existing.email,
        imported: false,
        reason: "already_linked",
      });
    }

    const teamName = contact.companyName || [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || undefined;
    const phone = contact.phone || undefined;

    const user = await storage.createInvite(contact.email, teamName, "customer", contact.id, phone);

    if (sendInvite && user.inviteToken) {
      sendInviteEmail(contact.email, user.inviteToken, teamName).catch((err) =>
        console.error("Failed to send invite email:", err),
      );
    }

    res.status(201).json({
      id: user.id,
      email: user.email,
      ghlContactId: contact.id,
      inviteToken: user.inviteToken,
      inviteExpiresAt: user.inviteExpiresAt,
      imported: true,
    });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin GHL import error:", err);
    res.status(500).json({ error: "Failed to import GHL contact" });
  }
});

// GET /customers — all customer accounts
router.get("/customers", async (req, res) => {
  try {
    const { search, limit, offset } = req.query;
    const result = await storage.getAllCustomers({
      search: search as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json(result);
  } catch (err) {
    console.error("Admin customers error:", err);
    res.status(500).json({ error: "Failed to load customers" });
  }
});

// GET /customers/:id — customer + their orders
router.get("/customers/:id", async (req, res) => {
  try {
    const result = await storage.getCustomerWithOrders(req.params.id);
    if (!result) return res.status(404).json({ error: "Customer not found" });
    res.json(result);
  } catch (err) {
    console.error("Admin customer detail error:", err);
    res.status(500).json({ error: "Failed to load customer" });
  }
});

// PATCH /customers/:id — edit team details
const updateCustomerSchema = z.object({
  teamName: z.string().optional(),
  contactPhone: z.string().optional(),
});

router.patch("/customers/:id", async (req, res) => {
  try {
    const data = updateCustomerSchema.parse(req.body);
    const customer = await storage.updateCustomer(req.params.id, data);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    // Mirror edit to GHL (fire-and-forget — local write is authoritative for
    // the response). Wrapped in tracked() so a failure lands in integration_events
    // instead of just Railway stderr.
    if (customer.email) {
      void tracked(
        { system: "ghl", action: "upsertContact", userId: customer.id, context: { email: customer.email } },
        async () => {
          const result = await upsertGhlContact({
            email: customer.email!,
            phone: data.contactPhone ?? customer.contactPhone ?? undefined,
            companyName: data.teamName ?? customer.teamName ?? undefined,
          });
          if (result.contactId && !customer.ghlContactId) {
            await storage.updateCustomer(customer.id, { ghlContactId: result.contactId });
          }
          return result;
        },
      );
    }

    res.json(customer);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin update customer error:", err);
    res.status(500).json({ error: "Failed to update customer" });
  }
});

// POST /customers/invite — create account + invite link + upsert GHL contact
const inviteSchema = z.object({
  email: z.string().email(),
  teamName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
});

router.post("/customers/invite", async (req, res) => {
  try {
    const { email, teamName, firstName, lastName, phone } = inviteSchema.parse(req.body);

    // Check if email already exists locally
    const existing = await storage.getUserByEmail(email);
    if (existing) return res.status(409).json({ error: "An account with this email already exists" });

    // Upsert GHL contact first so we can store the link on create
    const ghlResult = await upsertGhlContact({
      email,
      firstName,
      lastName,
      phone,
      companyName: teamName,
      tags: ["sideline-customer"],
    });

    const user = await storage.createInvite(email, teamName, "customer", ghlResult.contactId || undefined, phone);

    // Send invite email
    if (user.inviteToken) {
      sendInviteEmail(email, user.inviteToken, teamName).catch(err =>
        console.error("Failed to send invite email:", err)
      );
    }

    res.status(201).json({
      id: user.id,
      email: user.email,
      ghlContactId: ghlResult.contactId,
      ghlCreated: ghlResult.created,
      inviteToken: user.inviteToken,
      inviteExpiresAt: user.inviteExpiresAt,
    });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin invite error:", err);
    res.status(500).json({ error: "Failed to create invite" });
  }
});

// POST /suppliers/invite — create supplier account + invite link
// Same pattern as /customers/invite but creates a user with role="supplier".
// The supplier accepts the invite at /supplier/accept-invite/:token and lands on /supplier after setting a password.
const supplierInviteSchema = z.object({
  email: z.string().email(),
  supplierName: z.string().min(1, "Supplier name is required"), // stored on users.teamName
});

router.post("/suppliers/invite", async (req, res) => {
  try {
    const { email, supplierName } = supplierInviteSchema.parse(req.body);

    const existing = await storage.getUserByEmail(email);
    if (existing) return res.status(409).json({ error: "An account with this email already exists" });

    const user = await storage.createInvite(email, supplierName, "supplier");

    // Send the same invite email — sendInviteEmail already builds a /accept-invite?token=... link.
    // Once the supplier clicks it, the /supplier/accept-invite page will handle the redirect to /supplier.
    // (If you want supplier-specific copy, we can fork sendInviteEmail later.)
    if (user.inviteToken) {
      sendInviteEmail(email, user.inviteToken, supplierName).catch(err =>
        console.error("Failed to send supplier invite email:", err),
      );
    }

    res.status(201).json({
      id: user.id,
      email: user.email,
      role: user.role,
      inviteToken: user.inviteToken,
      inviteExpiresAt: user.inviteExpiresAt,
    });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin supplier invite error:", err);
    res.status(500).json({ error: "Failed to create supplier invite" });
  }
});

// GET /orders/:id/invoice — admin invoice view
router.get("/orders/:id/invoice", async (req, res) => {
  try {
    const result = await storage.getOrderWithDetails(req.params.id);
    if (!result) return res.status(404).json({ error: "Order not found" });

    let customer = null;
    if (result.order.userId) {
      const user = await storage.getUser(result.order.userId);
      if (user) {
        customer = { email: user.email, teamName: user.teamName, contactPhone: user.contactPhone };
      }
    }

    res.json({
      order: result.order,
      items: result.items,
      customer: customer || {
        email: result.order.customerEmail,
        teamName: null,
        contactPhone: null,
      },
      company: {
        name: "Sideline NZ Ltd",
        address: "New Zealand",
        email: "info@sidelinenz.com",
        website: "sidelinenz.com",
      },
    });
  } catch (err) {
    console.error("Admin invoice error:", err);
    res.status(500).json({ error: "Failed to load invoice" });
  }
});

// ============ ORDER ITEM PRODUCT-LINE DETAILS ============

// PATCH /orders/:id/items/:itemId — update product-line design details
const updateItemSchema = z.object({
  // Quantity / size / cost — editable from the PO grid. Identical shape to
  // Shopify variant fields so the two stay in sync. Cost flows back to
  // Shopify via scripts/sync-po-costs-to-shopify.js (Chrome bridge).
  unitAmount: z.number().int().min(0).optional(),     // cents, matches Shopify inventoryItem.unitCost
  quantity: z.number().int().min(1).optional(),
  size: z.union([z.string(), z.null()]).optional(),
  productImage: z.union([z.string(), z.null()]).optional(),
  productColors: z.array(z.object({ hex: z.string(), name: z.string().optional() })).optional(),
  brandingMethod: z.string().optional(),
  productType: z.string().optional(),
  material: z.string().optional(),
  productName: z.string().optional(),
  frontDesignUrl: z.union([z.string(), z.null()]).optional(),
  backDesignUrl: z.union([z.string(), z.null()]).optional(),
  elementUrls: z.array(z.object({
    name: z.string(),
    url: z.string(),
    position: z.string().optional(),
    application: z.string().optional(),
    sizeMm: z.string().optional(),
    threadColours: z.array(z.string()).optional(),
    artworkFile: z.string().optional(),
  })).optional(),
  designPrints: z.array(z.object({ label: z.string(), url: z.string() })).optional(),
  mockupImages: z.array(z.object({ label: z.string(), url: z.string() })).optional(),
  gradeGroup: z.string().optional(),
  designNotes: z.string().optional(),
  designBrief: z.string().optional(),
  sizeChartType: z.string().optional(),
  assignedSupplierId: z.string().nullable().optional(), // per-line supplier override; null clears it
  // Supplier cost override — when an invoice comes back at a different
  // number than the pricelist, ops corrects the per-line stamp here. The
  // PATCH handler stamps supplierCostAppliedAt = now and clears
  // supplierCostSourceId (manual override, not pricelist-sourced).
  supplierUnitCostCents: z.number().int().min(0).nullable().optional(),
  supplierCostCurrency: z.string().min(3).max(3).nullable().optional(),
});

// DELETE /orders/:id/items/:itemId — remove a single garment line +
// its size breakdowns. Other order state (approval, designs on siblings,
// activity) is untouched.
router.delete("/orders/:id/items/:itemId", async (req, res) => {
  try {
    const ok = await storage.deleteOrderItem(req.params.itemId);
    if (!ok) return res.status(404).json({ error: "Item not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("Admin delete order item error:", err);
    res.status(500).json({ error: "Failed to delete item" });
  }
});

router.patch("/orders/:id/items/:itemId", async (req, res) => {
  try {
    const data = updateItemSchema.parse(req.body);
    const user = (req as any).user;

    // Supplier cost override stamps applied_at = now and clears the source_id
    // because the manual edit overrides any pricelist linkage. Pass through
    // as part of the patch payload so updateOrderItem writes everything in
    // one update statement.
    const patch: any = { ...data };
    if (data.supplierUnitCostCents !== undefined) {
      patch.supplierCostAppliedAt = new Date();
      patch.supplierCostSourceId = null;
    }
    const updated = await storage.updateOrderItem(req.params.itemId, patch);
    if (!updated) return res.status(404).json({ error: "Item not found" });

    // Mirror any new design asset into the PO's Drive folder, routed by type:
    //   front/back designs → "02. Mockups"
    //   element uploads    → "03. Logos"
    // Fire-and-forget — the PATCH response never blocks on Drive.
    const mirrorJobs: Array<{ url: string; slot: "mockups" | "logos" }> = [];
    if (data.frontDesignUrl) mirrorJobs.push({ url: data.frontDesignUrl, slot: "mockups" });
    if (data.backDesignUrl)  mirrorJobs.push({ url: data.backDesignUrl,  slot: "mockups" });
    if (data.mockupImages?.length) {
      for (const m of data.mockupImages) mirrorJobs.push({ url: m.url, slot: "mockups" });
    }
    if (data.designPrints?.length) {
      for (const p of data.designPrints) mirrorJobs.push({ url: p.url, slot: "mockups" });
    }
    if (data.elementUrls?.length) {
      for (const el of data.elementUrls) mirrorJobs.push({ url: el.url, slot: "logos" });
    }
    if (mirrorJobs.length) {
      (async () => {
        const [ord] = await db
          .select({ id: orders.id, driveFolderId: orders.driveFolderId })
          .from(orders)
          .where(eq(orders.id, req.params.id))
          .limit(1);
        if (!ord?.driveFolderId) return;
        for (const job of mirrorJobs) {
          await mirrorBlobToPoFolder({
            poFolderId: ord.driveFolderId,
            slot: job.slot,
            blobUrl: job.url,
          });
        }
      })().catch((err) => console.error("[item-patch] Drive mirror failed:", err));
    }

    // If unitAmount or quantity changed, recompute order subtotal/total from
    // the latest order_items rows. Keeps the PO header total in sync with line edits.
    let recomputed = false;
    if (data.unitAmount !== undefined || data.quantity !== undefined) {
      const items = await db
        .select({ unitAmount: orderItems.unitAmount, quantity: orderItems.quantity })
        .from(orderItems)
        .where(eq(orderItems.orderId, req.params.id));
      const subtotal = items.reduce((sum, it) => sum + (it.unitAmount * it.quantity), 0);
      await storage.updateOrder(req.params.id, { subtotal, total: subtotal });
      recomputed = true;
    }

    await storage.logOrderActivity({
      orderId: req.params.id,
      userId: user.userId,
      action: "item_updated",
      details: { itemId: req.params.itemId, fields: Object.keys(data), mirroredCount: mirrorJobs.length, recomputedTotal: recomputed },
    });

    res.json(updated);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin update item error:", err);
    res.status(500).json({ error: "Failed to update item" });
  }
});

// POST /orders/:id/items/:itemId/extract-colors
// AI-extract dominant colours from the item's design image.
// Body: { imageUrl?: string, apply?: boolean, side?: "front" | "back" | "custom" }
//   - imageUrl: override source. Defaults to item.frontDesignUrl → backDesignUrl.
//   - apply (default true): write the result to item.productColors
//   - side: which field to read from when imageUrl is not supplied
const extractColorsSchema = z.object({
  imageUrl: z.string().url().optional(),
  apply: z.boolean().optional().default(true),
  side: z.enum(["front", "back"]).optional(),
});

router.post("/orders/:id/items/:itemId/extract-colors", async (req, res) => {
  try {
    const { imageUrl, apply, side } = extractColorsSchema.parse(req.body);
    const user = (req as any).user;

    const [item] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, req.params.itemId))
      .limit(1);

    if (!item) return res.status(404).json({ error: "Item not found" });

    // Fallback chain: explicit imageUrl > side-specified design URL > any
    // design URL > any mockup image. Mockup images often carry the truest
    // colourway (3D vendor renders show the production result), so they're
    // a strong default when no factory artwork is uploaded yet.
    //
    // mockupImages may be either an array of URL strings (legacy) or an
    // array of { url, label } objects (current). Prefer the side-matching
    // label when a side hint was supplied so a "back" scan reads the back
    // mockup.
    const mockupsRaw = (item as any).mockupImages;
    const mockupUrls: Array<{ url: string; label?: string }> = [];
    if (Array.isArray(mockupsRaw)) {
      for (const m of mockupsRaw) {
        if (typeof m === "string" && m.startsWith("http")) {
          mockupUrls.push({ url: m });
        } else if (m && typeof m.url === "string" && m.url.startsWith("http")) {
          mockupUrls.push({ url: m.url, label: m.label });
        }
      }
    }
    const sideMatchedMockup = side
      ? mockupUrls.find((m) => (m.label || "").toLowerCase().includes(side))?.url
      : undefined;
    const sourceUrl =
      imageUrl ||
      (side === "back" ? item.backDesignUrl : side === "front" ? item.frontDesignUrl : null) ||
      sideMatchedMockup ||
      item.frontDesignUrl ||
      item.backDesignUrl ||
      mockupUrls[0]?.url;

    if (!sourceUrl) return res.status(400).json({ error: "No design or mockup image on this item to analyse" });

    const colors = await extractColorsFromImage(sourceUrl);
    if (!colors) {
      return res.status(502).json({ error: "Colour extraction failed — check GEMINI_API_KEY or try a different image" });
    }

    if (apply) {
      await storage.updateOrderItem(req.params.itemId, { productColors: colors } as any);
      await storage.logOrderActivity({
        orderId: req.params.id,
        userId: user?.userId,
        action: "colors_extracted",
        details: { itemId: req.params.itemId, sourceUrl, colorCount: colors.length },
      });
    }

    res.json({ colors, sourceUrl, applied: apply });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin extract-colors error:", err);
    res.status(500).json({ error: "Failed to extract colours" });
  }
});

// POST /orders/:id/items/:itemId/generate-brief
// AI design brief — Gemini reads front + back mockup images and writes a
// structured description of the design layout. Stored on item.designBrief.
router.post("/orders/:id/items/:itemId/generate-brief", async (req, res) => {
  try {
    const user = (req as any).user;
    const [item] = await db.select().from(orderItems).where(eq(orderItems.id, req.params.itemId)).limit(1);
    if (!item) return res.status(404).json({ error: "Item not found" });

    const imageUrls: string[] = [];
    if (item.frontDesignUrl) imageUrls.push(item.frontDesignUrl);
    if (item.backDesignUrl) imageUrls.push(item.backDesignUrl);
    // Fall back to mockup images when no factory artwork is uploaded — same
    // pattern as extract-colors. mockupImages can be string[] (legacy) or
    // [{url,label}] (current).
    if (!imageUrls.length) {
      const mockupsRaw = (item as any).mockupImages;
      if (Array.isArray(mockupsRaw)) {
        for (const m of mockupsRaw) {
          const u = typeof m === "string" ? m : (m && typeof m.url === "string" ? m.url : null);
          if (u && u.startsWith("http")) imageUrls.push(u);
        }
      }
    }
    if (!imageUrls.length) return res.status(400).json({ error: "Upload a design or mockup image first" });

    const brief = await generateDesignBrief(imageUrls);
    if (!brief) return res.status(502).json({ error: "Design brief generation failed — check GEMINI_API_KEY" });

    await storage.updateOrderItem(req.params.itemId, { designBrief: brief } as any);
    await storage.logOrderActivity({
      orderId: req.params.id,
      userId: user?.userId,
      action: "design_brief_generated",
      details: { itemId: req.params.itemId, wordCount: brief.split(/\s+/).length },
    });

    res.json({ brief });
  } catch (err: any) {
    console.error("Admin generate-brief error:", err);
    res.status(500).json({ error: "Failed to generate design brief" });
  }
});

// GET /orders/next-po-reference — preview the next auto-assigned PO reference
// (client calls this to show the value once the PO form has enough detail).
router.get("/orders/next-po-reference", async (_req, res) => {
  try {
    const reference = await buildPoReference();
    res.json({ reference });
  } catch (err) {
    console.error("Admin next-po-reference error:", err);
    res.status(500).json({ error: "Failed to preview PO reference" });
  }
});

// POST /orders/create-po — create a new production sheet from scratch (admin-initiated)
const createPoSchema = z.object({
  storeSlug: z.string(),
  orderType: z.enum(["team-store", "bulk-order", "sample-run"]).optional().default("bulk-order"),
  customerEmail: z.string().email().optional(),
  customerName: z.string().optional(), // full name (kept for back-compat / display)
  customerFirstName: z.string().optional(),
  customerLastName: z.string().optional(),
  customerPhone: z.string().optional(),
  poReference: z.string().optional(),
  accountName: z.string().optional(), // company / team / club name
  companyEmail: z.string().email().optional(),
  companyPhone: z.string().optional(),
  isRepeatOrder: z.boolean().optional(),
  poComments: z.string().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // customer "Door to Customer" date
  deliveryAttention: z.string().optional(),
  deliveryAddress: z.string().optional(),
  deliveryEmail: z.string().optional(),
  deliveryPhone: z.string().optional(),
  items: z.array(z.object({
    productName: z.string(),
    productType: z.string().optional(),
    material: z.string().optional(),
    quantity: z.number().int().min(1),
    unitAmount: z.number().int().min(0),
    brandingMethod: z.string().optional(),
    gradeGroup: z.string().optional(), // deprecated but still accepted
  })).min(1),
});

router.post("/orders/create-po", async (req, res) => {
  try {
    const data = createPoSchema.parse(req.body);
    const user = (req as any).user;

    // Auto-assign a numeric PO reference (PO-YYYY-NNNN) if the admin didn't
    // supply one. The UI no longer exposes this field — the server owns it.
    const poReference = data.poReference?.trim() || (await buildPoReference());

    // Derive first/last name when only combined customerName was sent (UI
    // backfill), or combined customerName when only first/last were sent.
    const firstName = data.customerFirstName?.trim() || data.customerName?.trim().split(" ")[0];
    const lastName =
      data.customerLastName?.trim() ||
      data.customerName?.trim().split(" ").slice(1).join(" ") || undefined;
    const fullName = data.customerName?.trim() || [firstName, lastName].filter(Boolean).join(" ") || undefined;

    // Calculate totals
    const subtotal = data.items.reduce((sum, i) => sum + (i.unitAmount * i.quantity), 0);

    // PO number: SL-YYYY-[CLIENT]-[SEQ] (see server/po-number.ts).
    // Slug is derived from accountName if present (usually the team/club name),
    // falling back to customerName. withPoNumberRetry handles the rare race
    // where two admins create POs at the same time and collide on the sequence.
    const clientForSlug = data.accountName || data.customerName || null;
    const order = await withPoNumberRetry(clientForSlug, async (orderNumber) =>
      storage.createOrder({
        orderNumber,
        storeSlug: data.storeSlug,
        orderType: data.orderType,
        status: "processing",
        subtotal,
        total: subtotal,
        currency: "nzd",
        customerEmail: data.customerEmail ?? null,
        customerName: fullName ?? null,
        customerFirstName: firstName ?? null,
        customerLastName: lastName ?? null,
        companyEmail: data.companyEmail ?? null,
        companyPhone: data.companyPhone ?? null,
        poReference,
        accountName: data.accountName ?? null,
        isRepeatOrder: data.isRepeatOrder ?? false,
        poComments: data.poComments ?? null,
        dueDate: data.dueDate ?? null,
        deliveryAttention: data.deliveryAttention ?? null,
        deliveryAddress: data.deliveryAddress ?? null,
        deliveryEmail: data.deliveryEmail ?? null,
        deliveryPhone: data.deliveryPhone ?? null,
      } as any),
    );

    // Create order items
    for (const item of data.items) {
      await storage.createOrderItem({
        orderId: order.id,
        productId: "manual",
        priceId: "manual",
        productName: item.productName,
        productType: item.productType ?? null,
        material: item.material ?? null,
        quantity: item.quantity,
        unitAmount: item.unitAmount,
        currency: "nzd",
        gradeGroup: item.gradeGroup ?? null,
        brandingMethod: item.brandingMethod ?? null,
      } as any);
    }

    // Auto-create the per-client Google Drive folder (File Vault).
    // Name convention (Romero 2026-04-15): YYYY-MM-DD.Company.Contact
    // If Drive isn't configured this is a no-op — the order still saves.
    try {
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10);
      const companyForFolder = data.accountName?.trim() || "Sideline";
      const contactForFolder = [firstName, lastName].filter(Boolean).join(" ").trim() || data.customerEmail || "Unnamed Contact";
      const folder = await createClientFolder({
        date: dateStr,
        companyName: companyForFolder,
        contactName: contactForFolder,
      });
      if (folder) {
        await storage.updateOrder(order.id, {
          driveFolderId: folder.id,
          driveFolderUrl: folder.webViewLink,
          driveFolderName: folder.name,
        });
      }
    } catch (err) {
      console.error("[create-po] Drive folder creation failed (non-fatal):", err);
    }

    // Link to customer if email matches + sync GHL contact + create opportunity.
    // GHL is source of truth for the pipeline — the opportunity links the order
    // to its pipeline card so the stage webhook can mirror changes both ways.
    let ghlContactId: string | null = null;
    if (data.customerEmail) {
      const customer = await storage.getUserByEmail(data.customerEmail);
      if (customer) {
        ghlContactId = customer.ghlContactId || null;
        await storage.linkOrdersByEmail(data.customerEmail, customer.id);
      }

      // Upsert GHL contact (find-or-create) with the full contact shape so the
      // GHL record mirrors the PO fields one-to-one. Company email + company
      // phone are pushed as custom fields so the GHL-side workflows can use
      // them without needing a separate "company" record.
      const customFields: Array<{ key: string; field_value: string }> = [];
      if (data.companyEmail) customFields.push({ key: "company_email", field_value: data.companyEmail });
      if (data.companyPhone) customFields.push({ key: "company_phone", field_value: data.companyPhone });

      const upsert = await upsertGhlContact({
        email: data.customerEmail,
        firstName,
        lastName,
        phone: data.customerPhone,
        companyName: data.accountName,
        tags: ["sideline-customer", "portal-po"],
        customFields: customFields.length ? customFields : undefined,
      });
      if (upsert.contactId) {
        ghlContactId = upsert.contactId;
        // Backfill local link if we have a local user but no ghlContactId yet
        if (customer && !customer.ghlContactId) {
          await storage.updateCustomer(customer.id, { ghlContactId: upsert.contactId });
        }
      }
    }

    // GHL opportunity: prefer to advance the customer's existing open opp
    // (so the lead-from-website card is the SAME card as the PO card).
    // Only create a fresh opp when the customer has no open deal yet.
    if (ghlContactId) {
      const projectDescription = data.items?.length
        ? data.items.length === 1
          ? `${data.items[0].quantity}× ${data.items[0].productName}`
          : `${data.items.reduce((s, i) => s + (i.quantity || 1), 0)} units across ${data.items.length} lines`
        : undefined;
      const properName = `${data.accountName || data.customerName || "Sideline Order"}${projectDescription ? ` — ${projectDescription}` : ""}`;

      const existing = await findOpenOpportunityForContact(ghlContactId, SIDELINE_PIPELINE_ID);
      if (existing) {
        // Advance the existing opp — set PO ref, money, project. Only rename
        // if the current name still looks like a placeholder.
        const isPlaceholder = /Initial Enquiry$|^Website Lead|^Free Mockup|^Contact Enquiry|^PO-\d/.test(existing.name);
        await advanceGhlOpportunity(existing.id, {
          pipelineStageId: SIDELINE_STAGE_IDS["Lead Received"],
          name: isPlaceholder ? properName : undefined,
          monetaryValue: Math.round(subtotal / 100),
          poReference,
          customerName: data.customerName,
          projectDescription,
        });
        await storage.updateOrder(order.id, {
          ghlOpportunityId: existing.id,
          pipelineStage: "Lead Received",
        });
      } else {
        const opp = await createGhlOpportunity({
          contactId: ghlContactId,
          pipelineId: SIDELINE_PIPELINE_ID,
          stageId: SIDELINE_STAGE_IDS["Lead Received"],
          name: properName,
          monetaryValue: Math.round(subtotal / 100),
          status: "open",
        });
        if (opp.opportunityId) {
          await storage.updateOrder(order.id, {
            ghlOpportunityId: opp.opportunityId,
            pipelineStage: "Lead Received",
          });
          // Backfill custom fields on the new opp via advance helper
          await advanceGhlOpportunity(opp.opportunityId, {
            poReference,
            customerName: data.customerName,
            projectDescription,
            monetaryValue: Math.round(subtotal / 100),
          });
        }
      }
    }

    // Initialize production pipeline
    await storage.initializeProductionPipeline(order.id);

    await storage.logOrderActivity({
      orderId: order.id,
      userId: user.userId,
      action: "po_created",
      details: { poReference, itemCount: data.items.length },
    });

    res.status(201).json(order);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin create PO error:", err);
    res.status(500).json({ error: "Failed to create production sheet" });
  }
});

// POST /orders/:id/items — add a single garment line item to an existing order.
// Used from the admin single-sheet view when building up a PO incrementally
// (vs. create-po which creates the entire order + all items at once).
const addItemSchema = z.object({
  productName: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  unitAmount: z.number().int().min(0).default(0),
  gradeGroup: z.string().optional(),
  brandingMethod: z.string().optional(),
  designNotes: z.string().optional(),
});

router.post("/orders/:id/items", async (req, res) => {
  try {
    const data = addItemSchema.parse(req.body);
    const user = (req as any).user;
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const item = await storage.createOrderItem({
      orderId: order.id,
      productId: "manual",
      priceId: "manual",
      productName: data.productName,
      quantity: data.quantity,
      unitAmount: data.unitAmount,
      currency: "nzd",
      gradeGroup: data.gradeGroup ?? null,
      brandingMethod: data.brandingMethod ?? null,
      designNotes: data.designNotes ?? null,
    } as any);

    await storage.logOrderActivity({
      orderId: order.id,
      userId: user.userId,
      action: "item_added",
      details: { itemId: item.id, productName: data.productName },
    });

    res.status(201).json(item);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin add item error:", err);
    res.status(500).json({ error: "Failed to add item" });
  }
});

// ============ SIZE BREAKDOWNS ============

// POST /orders/:id/size-breakdowns — add size breakdown for an order item
const sizeBreakdownSchema = z.object({
  orderItemId: z.string(),
  size: z.string(),
  quantity: z.number().int().min(1),
  playerName: z.string().optional(),
  playerNumber: z.string().optional(),
  namePlacement: z.string().max(50).optional(),
  notes: z.string().optional(),
});

router.post("/orders/:id/size-breakdowns", async (req, res) => {
  try {
    const data = sizeBreakdownSchema.parse(req.body);
    const user = (req as any).user;
    const breakdown = await storage.createSizeBreakdown({
      ...data,
      orderId: req.params.id,
      playerName: data.playerName ?? null,
      playerNumber: data.playerNumber ?? null,
      namePlacement: data.namePlacement ?? null,
      notes: data.notes ?? null,
    });

    await storage.logOrderActivity({
      orderId: req.params.id,
      userId: user.userId,
      action: "size_breakdown_added",
      details: { size: data.size, quantity: data.quantity, playerName: data.playerName, playerNumber: data.playerNumber },
    });

    res.status(201).json(breakdown);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin size breakdown error:", err);
    res.status(500).json({ error: "Failed to create size breakdown" });
  }
});

// PATCH /orders/:id/size-breakdowns/:bid — update a breakdown
// Strict allowlist — never let a stale/malformed caller move a breakdown across
// orderItems (which would silently swap qtys between lines on the PO PDF).
const sizeBreakdownPatchSchema = z.object({
  size: z.string().min(1).optional(),
  quantity: z.number().int().min(1).optional(),
  playerName: z.string().nullable().optional(),
  playerNumber: z.string().nullable().optional(),
  namePlacement: z.string().max(50).nullable().optional(),
  notes: z.string().nullable().optional(),
}).strict();

router.patch("/orders/:id/size-breakdowns/:bid", async (req, res) => {
  try {
    const data = sizeBreakdownPatchSchema.parse(req.body);
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No updatable fields supplied" });
    }
    const updated = await storage.updateSizeBreakdown(req.params.bid, data);
    if (!updated) return res.status(404).json({ error: "Breakdown not found" });
    res.json(updated);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin update breakdown error:", err);
    res.status(500).json({ error: "Failed to update breakdown" });
  }
});

// DELETE /orders/:id/size-breakdowns/:bid — delete a breakdown
router.delete("/orders/:id/size-breakdowns/:bid", async (req, res) => {
  try {
    await storage.deleteSizeBreakdown(req.params.bid);
    res.json({ success: true });
  } catch (err) {
    console.error("Admin delete breakdown error:", err);
    res.status(500).json({ error: "Failed to delete breakdown" });
  }
});

// ============ PRODUCTION PIPELINE ============

// POST /orders/:id/production/initialize — create production pipeline for an order
router.post("/orders/:id/production/initialize", async (req, res) => {
  try {
    const user = (req as any).user;
    const existing = await storage.getProductionStages(req.params.id);
    if (existing.length > 0) return res.status(409).json({ error: "Pipeline already initialized" });

    const stages = await storage.initializeProductionPipeline(req.params.id);

    await storage.logOrderActivity({
      orderId: req.params.id,
      userId: user.userId,
      action: "production_initialized",
      details: { stageCount: stages.length },
    });

    res.status(201).json(stages);
  } catch (err) {
    console.error("Admin init pipeline error:", err);
    res.status(500).json({ error: "Failed to initialize pipeline" });
  }
});

// POST /orders/:id/production/advance — advance to next production stage
router.post("/orders/:id/production/advance", async (req, res) => {
  try {
    const user = (req as any).user;
    const { notes } = req.body || {};
    const stages = await storage.getProductionStages(req.params.id);
    if (stages.length === 0) return res.status(400).json({ error: "Pipeline not initialized" });

    const currentIdx = stages.findIndex(s => s.status === "in_progress");
    if (currentIdx === -1) return res.status(400).json({ error: "No active stage" });
    if (currentIdx >= stages.length - 1) return res.status(400).json({ error: "Already at final stage" });

    const now = new Date();

    // Complete current stage
    await storage.updateProductionStage(stages[currentIdx].id, {
      status: "completed",
      completedAt: now,
      completedBy: user.userId,
      notes: notes || null,
    });

    // Start next stage
    const nextStage = stages[currentIdx + 1];
    await storage.updateProductionStage(nextStage.id, {
      status: "in_progress",
      enteredAt: now,
    });

    // Update order's production stage
    await storage.updateOrder(req.params.id, { productionStage: nextStage.stage } as any);

    // Log activity
    await storage.logOrderActivity({
      orderId: req.params.id,
      userId: user.userId,
      action: "stage_advanced",
      details: { from: stages[currentIdx].stage, to: nextStage.stage, notes },
    });

    // Notify customer about production progress
    const order = await storage.getOrder(req.params.id);
    if (order?.userId) {
      const stageLabels: Record<string, string> = {
        design_confirmed: "Your designs have been confirmed",
        in_production: "Your order is now in production",
        printing: "Your order is being printed/embroidered",
        quality_check: "Your order is undergoing quality checks",
        packing: "Your order is being packed",
        shipped: "Your order has been shipped",
        delivered: "Your order has been delivered",
      };

      const label = stageLabels[nextStage.stage];
      if (label) {
        await storage.createNotification({
          userId: order.userId,
          type: "production_update",
          title: "Production Update",
          message: `${label} — Order ${order.orderNumber}`,
          orderId: order.id,
        });
      }
    }

    const updated = await storage.getProductionStages(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error("Admin advance stage error:", err);
    res.status(500).json({ error: "Failed to advance stage" });
  }
});

// PATCH /orders/:id/production/:stageId — update a specific production stage
router.patch("/orders/:id/production/:stageId", async (req, res) => {
  try {
    const updated = await storage.updateProductionStage(req.params.stageId, req.body);
    if (!updated) return res.status(404).json({ error: "Stage not found" });
    res.json(updated);
  } catch (err) {
    console.error("Admin update stage error:", err);
    res.status(500).json({ error: "Failed to update stage" });
  }
});

// ============ QUALITY CONTROL ============

// POST /orders/:id/qc — create a quality check
const qcSchema = z.object({
  productionStageId: z.string().optional(),
  checkType: z.enum(["pre_production", "mid_production", "final", "packaging"]),
  status: z.enum(["pending", "passed", "failed", "conditional"]).default("pending"),
  notes: z.string().optional(),
  photoUrls: z.array(z.string()).optional(),
  issues: z.string().optional(),
});

router.post("/orders/:id/qc", async (req, res) => {
  try {
    const data = qcSchema.parse(req.body);
    const user = (req as any).user;

    const check = await storage.createQualityCheck({
      orderId: req.params.id,
      productionStageId: data.productionStageId ?? null,
      checkType: data.checkType,
      status: data.status,
      checkedBy: user.userId,
      notes: data.notes ?? null,
      photoUrls: data.photoUrls ?? null,
      issues: data.issues ?? null,
    });

    await storage.logOrderActivity({
      orderId: req.params.id,
      userId: user.userId,
      action: "qc_created",
      details: { checkType: data.checkType, status: data.status },
    });

    // Notify customer if QC failed
    if (data.status === "failed") {
      const order = await storage.getOrder(req.params.id);
      if (order?.userId) {
        await storage.createNotification({
          userId: order.userId,
          type: "qc_issue",
          title: "Quality Check Issue",
          message: `A quality issue was found on your order ${order.orderNumber}. Our team is working on it.`,
          orderId: order.id,
        });
      }
    }

    res.status(201).json(check);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin QC create error:", err);
    res.status(500).json({ error: "Failed to create QC check" });
  }
});

// PATCH /orders/:id/qc/:checkId — update a quality check
router.patch("/orders/:id/qc/:checkId", async (req, res) => {
  try {
    const user = (req as any).user;
    const existing = await storage.getQualityCheck(req.params.checkId);
    if (!existing) return res.status(404).json({ error: "QC check not found" });

    const updated = await storage.updateQualityCheck(req.params.checkId, {
      ...req.body,
      checkedBy: user.userId,
      resolvedAt: req.body.status === "passed" ? new Date() : undefined,
    });

    await storage.logOrderActivity({
      orderId: req.params.id,
      userId: user.userId,
      action: "qc_updated",
      details: { checkId: req.params.checkId, status: req.body.status },
    });

    res.json(updated);
  } catch (err) {
    console.error("Admin QC update error:", err);
    res.status(500).json({ error: "Failed to update QC check" });
  }
});

// ============ ORDER MESSAGES ============

// GET /orders/:id/messages — get all messages for an order
router.get("/orders/:id/messages", async (req, res) => {
  try {
    const messages = await storage.getOrderMessages(req.params.id);
    res.json(messages);
  } catch (err) {
    console.error("Admin messages error:", err);
    res.status(500).json({ error: "Failed to load messages" });
  }
});

// POST /orders/:id/messages — send a message on an order
const messageSchema = z.object({
  message: z.string().min(1),
  attachmentUrl: z.string().url().optional(),
  attachmentName: z.string().optional(),
});

router.post("/orders/:id/messages", async (req, res) => {
  try {
    const data = messageSchema.parse(req.body);
    const user = (req as any).user;

    const msg = await storage.createOrderMessage({
      orderId: req.params.id,
      userId: user.userId,
      senderRole: "admin",
      message: data.message,
      attachmentUrl: data.attachmentUrl ?? null,
      attachmentName: data.attachmentName ?? null,
    });

    // Notify customer about new message
    const order = await storage.getOrder(req.params.id);
    if (order?.userId) {
      await storage.createNotification({
        userId: order.userId,
        type: "new_message",
        title: "New Message",
        message: `New message on order ${order.orderNumber}`,
        orderId: order.id,
      });
    }

    res.status(201).json(msg);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin message error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ============ ORDER ACTIVITY LOG ============

// GET /orders/:id/activity — get activity log for an order
router.get("/orders/:id/activity", async (req, res) => {
  try {
    const activity = await storage.getOrderActivityLog(req.params.id);
    res.json(activity);
  } catch (err) {
    console.error("Admin activity error:", err);
    res.status(500).json({ error: "Failed to load activity" });
  }
});

// GET /designs/pending — all pending design files (review queue)
router.get("/designs/pending", async (_req, res) => {
  try {
    const files = await storage.getPendingDesignFiles();
    res.json(files);
  } catch (err) {
    console.error("Admin pending designs error:", err);
    res.status(500).json({ error: "Failed to load pending designs" });
  }
});

// ====== Supplier management (Sideline portal step 4) ======

// GET /suppliers — list all users with role = supplier.
// Returns the data the admin UI needs to pick a supplier from a dropdown
// when raising a PO. Small list, no pagination needed (typically a handful).
router.get("/suppliers", async (_req, res) => {
  try {
    const list = await storage.listSuppliers();
    res.json({
      suppliers: list.map((u) => ({
        id: u.id,
        email: u.email,
        supplierName: u.teamName,
        categories: u.supplierCategories || [],
        // `password === ""` means the invite hasn't been accepted yet
        inviteAccepted: u.password !== "",
        createdAt: u.createdAt,
      })),
    });
  } catch (err) {
    console.error("Admin list suppliers error:", err);
    res.status(500).json({ error: "Failed to load suppliers" });
  }
});

// GET /suppliers/:id — full supplier detail (for the admin pricelist page).
router.get("/suppliers/:id", async (req, res) => {
  try {
    const supplier = await storage.getUser(req.params.id);
    if (!supplier || supplier.role !== "supplier") {
      return res.status(404).json({ error: "Supplier not found" });
    }
    res.json({
      id: supplier.id,
      email: supplier.email,
      supplierName: supplier.teamName,
      contactPhone: supplier.contactPhone,
      ccEmail: supplier.ccEmail,
      categories: supplier.supplierCategories || [],
      inviteAccepted: supplier.password !== "",
      createdAt: supplier.createdAt,
    });
  } catch (err) {
    console.error("Admin get supplier error:", err);
    res.status(500).json({ error: "Failed to load supplier" });
  }
});

// PATCH /suppliers/:id — update categories / contact fields.
const updateSupplierSchema = z.object({
  categories: z.array(z.string().min(1)).optional(),
  contactPhone: z.string().nullable().optional(),
  ccEmail: z.string().email().nullable().optional(),
  supplierName: z.string().min(1).optional(),
});

router.patch("/suppliers/:id", async (req, res) => {
  try {
    const body = updateSupplierSchema.parse(req.body);
    const supplier = await storage.getUser(req.params.id);
    if (!supplier || supplier.role !== "supplier") {
      return res.status(404).json({ error: "Supplier not found" });
    }
    const patch: any = { updatedAt: new Date() };
    if (body.categories !== undefined) patch.supplierCategories = body.categories;
    if (body.contactPhone !== undefined) patch.contactPhone = body.contactPhone;
    if (body.ccEmail !== undefined) patch.ccEmail = body.ccEmail;
    if (body.supplierName !== undefined) patch.teamName = body.supplierName;
    await db.update(users).set(patch).where(eq(users.id, supplier.id));
    res.json({ ok: true });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin update supplier error:", err);
    res.status(500).json({ error: "Failed to update supplier" });
  }
});

// ---- Supplier impersonation / password reset / onboarding email ----
//
// Three admin-only actions that all carry real privilege:
//   - impersonate: swaps the admin's snz_token for the supplier's, parks the
//     admin's JWT in snz_original_session so they can swap back. Audit log entry.
//   - reset-password: generates a strong random password, returns it ONCE.
//     Memory rule: password value is NOT emailed — admin copies + shares via
//     WhatsApp/Telegram.
//   - send-onboarding-email: portal URL + what they can do + contact. No password.

router.post("/suppliers/:id/impersonate", async (req, res) => {
  try {
    const supplier = await storage.getUser(req.params.id);
    if (!supplier || supplier.role !== "supplier") {
      return res.status(404).json({ error: "Supplier not found" });
    }
    const admin = (req as any).user as { userId: string; role: "admin" };
    // Sign a 7-day supplier JWT (matches a normal supplier login) but
    // ALSO park the admin's original short-lived JWT in the second cookie
    // so end-impersonation can restore them.
    const originalAdminToken = signToken({ userId: admin.userId, role: "admin" });
    const supplierToken = signToken({ userId: supplier.id, role: "supplier" });
    setImpersonateCookie(res, originalAdminToken);
    setAuthCookie(res, supplierToken);
    // Audit trail. Logged against the supplier user via order_activity is wrong
    // (no order context); use a console.warn for now — full audit table is a
    // bigger lift and the supplier portal's "Viewing as X" banner is the
    // primary safeguard.
    console.warn(`[impersonate] admin ${admin.userId} began viewing as supplier ${supplier.id} (${supplier.email})`);
    res.json({
      ok: true,
      impersonating: { id: supplier.id, email: supplier.email, name: supplier.teamName },
      redirectTo: "/supplier",
    });
  } catch (e: any) {
    console.error("Impersonate error:", e);
    res.status(500).json({ error: "Failed to start impersonation" });
  }
});

// POST /suppliers/:id/reset-password — generate + return a new password ONCE.
// Memory rule: passwords go via WhatsApp/Telegram, not email. The endpoint
// returns the plaintext in the response body (over HTTPS) and never logs it.
function generateStrongPassword(): string {
  // 16 chars, mixed-case + digits + 2 symbols. Avoid ambiguous chars (0/O, 1/l/I).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const symbols = "!@#$%&*";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  let out = "";
  for (let i = 0; i < 14; i++) out += pick(alphabet);
  out += pick(symbols);
  out += pick(symbols);
  return out;
}

router.post("/suppliers/:id/reset-password", async (req, res) => {
  try {
    const supplier = await storage.getUser(req.params.id);
    if (!supplier || supplier.role !== "supplier") {
      return res.status(404).json({ error: "Supplier not found" });
    }
    const newPassword = generateStrongPassword();
    const hash = await hashPassword(newPassword);
    await db.update(users).set({ password: hash, updatedAt: new Date() }).where(eq(users.id, supplier.id));
    res.json({
      ok: true,
      supplier: { id: supplier.id, email: supplier.email, name: supplier.teamName },
      password: newPassword, // Returned ONCE — never logged.
      loginUrl: `${(process.env.SITE_URL || "https://sidelinenz.com").replace(/\/$/, "")}/supplier/login`,
    });
  } catch (e: any) {
    console.error("Reset password error:", e);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// POST /suppliers/:id/send-onboarding-email — instructions only (NO password).
router.post("/suppliers/:id/send-onboarding-email", async (req, res) => {
  try {
    const supplier = await storage.getUser(req.params.id);
    if (!supplier || supplier.role !== "supplier") {
      return res.status(404).json({ error: "Supplier not found" });
    }
    if (!supplier.email) return res.status(400).json({ error: "Supplier has no email on file" });
    const { sendSupplierOnboardingEmail } = await import("../email.js");
    const loginUrl = `${(process.env.SITE_URL || "https://sidelinenz.com").replace(/\/$/, "")}/supplier/login`;
    const result = await sendSupplierOnboardingEmail({
      to: supplier.email,
      ccEmail: supplier.ccEmail || undefined,
      supplierName: supplier.teamName || supplier.email,
      loginUrl,
    });
    res.json({ ok: true, sent: result.success, messageId: result.messageId });
  } catch (e: any) {
    console.error("Send onboarding email error:", e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// ============ SUPPLIER PRICELIST ============
// Admin-only. Each row = one unit cost from a supplier invoice. Multiple rows per
// product allowed (per size / over time); the app picks the latest effective row
// when sourcing live cost for a line.

const supplierPriceSchema = z.object({
  productType: z.string().min(1),
  sizeOrVariant: z.string().nullable().optional(),
  unitCostCents: z.number().int().min(0),
  currency: z.string().min(3).max(3).default("USD"),
  sourceInvoiceRef: z.string().nullable().optional(),
  effectiveFrom: z.string().datetime().optional(),
  notes: z.string().nullable().optional(),
});

router.get("/suppliers/:id/prices", async (req, res) => {
  try {
    const supplier = await storage.getUser(req.params.id);
    if (!supplier || supplier.role !== "supplier") {
      return res.status(404).json({ error: "Supplier not found" });
    }
    const prices = await storage.listSupplierPrices(req.params.id);
    res.json({ prices });
  } catch (err) {
    console.error("Admin list supplier prices error:", err);
    res.status(500).json({ error: "Failed to load prices" });
  }
});

router.post("/suppliers/:id/prices", async (req, res) => {
  try {
    const supplier = await storage.getUser(req.params.id);
    if (!supplier || supplier.role !== "supplier") {
      return res.status(404).json({ error: "Supplier not found" });
    }
    const body = supplierPriceSchema.parse(req.body);
    const price = await storage.createSupplierPrice({
      supplierId: supplier.id,
      productType: body.productType,
      sizeOrVariant: body.sizeOrVariant ?? null,
      unitCostCents: body.unitCostCents,
      currency: body.currency,
      sourceInvoiceRef: body.sourceInvoiceRef ?? null,
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
      notes: body.notes ?? null,
    });
    res.status(201).json(price);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin create supplier price error:", err);
    res.status(500).json({ error: "Failed to create price" });
  }
});

router.patch("/suppliers/:id/prices/:priceId", async (req, res) => {
  try {
    const body = supplierPriceSchema.partial().parse(req.body);
    const updated = await storage.updateSupplierPrice(req.params.priceId, {
      ...body,
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : undefined,
    } as any);
    if (!updated) return res.status(404).json({ error: "Price not found" });
    res.json(updated);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin update supplier price error:", err);
    res.status(500).json({ error: "Failed to update price" });
  }
});

router.delete("/suppliers/:id/prices/:priceId", async (req, res) => {
  try {
    await storage.deleteSupplierPrice(req.params.priceId);
    res.json({ ok: true });
  } catch (err) {
    console.error("Admin delete supplier price error:", err);
    res.status(500).json({ error: "Failed to delete price" });
  }
});

// POST /orders/:id/assign-supplier — set orders.assignedSupplierId.
// Separate from raise-po so you can pre-assign before raising (or reassign after).
// Does NOT push to GHL — assignment alone isn't a pipeline event.
const assignSupplierSchema = z.object({
  supplierId: z.string().min(1, "supplierId is required"),
});

router.post("/orders/:id/assign-supplier", async (req, res) => {
  try {
    const { supplierId } = assignSupplierSchema.parse(req.body);

    // Validate the target user exists and is a supplier
    const supplier = await storage.getUser(supplierId);
    if (!supplier || supplier.role !== "supplier") {
      return res.status(400).json({ error: "Invalid supplier ID" });
    }

    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const previousSupplierId = order.assignedSupplierId;
    await db.update(orders)
      .set({ assignedSupplierId: supplierId, updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    await db.insert(orderActivity).values({
      orderId: order.id,
      userId: (req as any).user?.userId,
      action: "supplier_assigned",
      details: { from: previousSupplierId, to: supplierId, supplierName: supplier.teamName },
    });

    res.json({ ok: true, supplierId });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin assign supplier error:", err);
    res.status(500).json({ error: "Failed to assign supplier" });
  }
});

// POST /orders/:id/generate-pdf — generate PO PDF and upload to Drive (01. Brief)
// Can be called any time — not just on dispatch. Useful for re-generating after
// edits, or for orders that were created before PDF gen was wired.
router.post("/orders/:id/generate-pdf", async (req, res) => {
  try {
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!order.driveFolderId) return res.status(400).json({ error: "No Drive folder — create one first" });

    const result = await uploadPoPdfToDrive(order.id, order.driveFolderId);
    if (!result) return res.status(502).json({ error: "PDF generation or Drive upload failed" });

    await storage.logOrderActivity({
      orderId: order.id,
      userId: (req as any).user?.userId,
      action: "po_pdf_generated",
      details: { pdfId: result.pdfId },
    });

    res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("Admin generate-pdf error:", err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

// POST /orders/:id/resend-dispatch-artifacts — for POs that already dispatched
// (supplier email sent) but didn't get their Drive folder/PDF/folder-share due
// to missing driveFolderId at dispatch time. Creates the folder if needed,
// uploads the PDF, and re-shares the folder with every supplier that received
// the original dispatch email. Does NOT send another email — that'd duplicate
// the supplier's inbox. Suppliers are pulled from order_activity
// po_raised_to_supplier rows.
router.post("/orders/:id/resend-dispatch-artifacts", async (req, res) => {
  try {
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!order.poDispatchedAt) return res.status(400).json({ error: "Order has not been dispatched yet — use Dispatch instead" });

    // 1. Ensure Drive folder exists
    let folderCreated = false;
    if (!order.driveFolderId) {
      const dateStr = (order.createdAt ? new Date(order.createdAt) : new Date()).toISOString().slice(0, 10);
      const companyForFolder = order.accountName?.trim() || "Sideline";
      const contactForFolder =
        [order.customerFirstName, order.customerLastName].filter(Boolean).join(" ").trim() ||
        order.customerName?.trim() ||
        order.customerEmail ||
        "Unnamed Contact";
      const folder = await createClientFolder({ date: dateStr, companyName: companyForFolder, contactName: contactForFolder });
      if (!folder) return res.status(500).json({ error: "Drive folder creation failed — check GOOGLE_* env" });
      await storage.updateOrder(order.id, {
        driveFolderId: folder.id,
        driveFolderUrl: folder.webViewLink,
        driveFolderName: folder.name,
      });
      order.driveFolderId = folder.id;
      order.driveFolderUrl = folder.webViewLink;
      order.driveFolderName = folder.name;
      folderCreated = true;
    }

    // 2. Pull suppliers that received the original dispatch email
    const activities = await db
      .select()
      .from(orderActivity)
      .where(and(eq(orderActivity.orderId, order.id), eq(orderActivity.action, "po_raised_to_supplier")));
    const supplierEmails = new Map<string, string | null>(); // email -> ccEmail
    for (const a of activities) {
      const d = a.details as any;
      if (d?.supplierEmail) supplierEmails.set(d.supplierEmail, d.supplierCcEmail || null);
    }

    // 3. Share folder with each supplier (+ ccEmail) - reader role, no notify
    const driveShares: Array<{ email: string; permissionId: string | null }> = [];
    for (const [email, cc] of Array.from(supplierEmails.entries())) {
      const targets = [email, ...(cc ? [cc] : [])];
      for (const target of targets) {
        const permissionId = await shareFolderWithUser({
          fileOrFolderId: order.driveFolderId!,
          emailAddress: target,
          role: "reader",
          notify: false,
        }).catch((err) => {
          console.error(`[resend-artifacts] Drive share failed for ${target}:`, err);
          return null;
        });
        driveShares.push({ email: target, permissionId });
      }
    }

    // 4. Upload PO PDF
    const pdfResult = await uploadPoPdfToDrive(order.id, order.driveFolderId!).catch((err) => {
      console.error(`[resend-artifacts] PDF upload failed:`, err);
      return null;
    });

    // 5. Log + return
    await storage.logOrderActivity({
      orderId: order.id,
      userId: (req as any).user?.userId,
      action: "dispatch_artifacts_resent",
      details: {
        folderCreated,
        driveFolderId: order.driveFolderId,
        driveShares,
        pdfUploaded: !!pdfResult,
        pdfUrl: pdfResult?.pdfUrl,
        suppliersNotified: Array.from(supplierEmails.keys()),
      },
    });

    res.json({
      ok: true,
      folderCreated,
      driveFolderUrl: order.driveFolderUrl,
      driveShares,
      pdfUploaded: !!pdfResult,
      pdfUrl: pdfResult?.pdfUrl,
    });
  } catch (err: any) {
    console.error("Admin resend-dispatch-artifacts error:", err);
    res.status(500).json({ error: "Failed to resend dispatch artifacts" });
  }
});

// ---- Supplier invoice tracking (mark paid + upload PDF/image) ----
//
// Captures the supplier's invoice and payment receipt against the PO. Drives
// AP reconciliation and the green "Paid" chip in the orders list + the
// supplier portal (so the supplier knows when payment landed without asking).

const markPaidSchema = z.object({
  paymentRef: z.string().max(200).nullable().optional(),
  totalCents: z.number().int().min(0).nullable().optional(),
  currency: z.string().min(3).max(3).nullable().optional(),
  paidAt: z.string().datetime().optional(), // ISO; defaults to server now
}).strict();

// POST /orders/:id/supplier-invoice/mark-paid
router.post("/orders/:id/supplier-invoice/mark-paid", async (req, res) => {
  try {
    const data = markPaidSchema.parse(req.body);
    const user = (req as any).user as { userId: string };
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();
    await db.update(orders).set({
      supplierInvoicePaidAt: paidAt,
      supplierInvoicePaidBy: user.userId,
      supplierInvoicePaymentRef: data.paymentRef ?? null,
      supplierInvoiceTotalCents: data.totalCents ?? null,
      supplierInvoiceCurrency: data.currency ?? null,
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));
    await storage.logOrderActivity({
      orderId: order.id, userId: user.userId,
      action: "supplier_invoice_paid",
      details: { paymentRef: data.paymentRef, totalCents: data.totalCents, currency: data.currency, paidAt: paidAt.toISOString() },
    } as any).catch(() => {});
    res.json({ ok: true, paidAt: paidAt.toISOString() });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Mark supplier invoice paid error:", err);
    res.status(500).json({ error: "Failed to mark paid" });
  }
});

// DELETE /orders/:id/supplier-invoice/mark-paid — un-mark (mistake recovery).
router.delete("/orders/:id/supplier-invoice/mark-paid", async (req, res) => {
  try {
    const user = (req as any).user as { userId: string };
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    await db.update(orders).set({
      supplierInvoicePaidAt: null,
      supplierInvoicePaidBy: null,
      supplierInvoicePaymentRef: null,
      // Keep totalCents / currency / file_url — those describe the invoice
      // itself, not the payment status. Clearing only the payment fields lets
      // ops un-mark without losing the invoice metadata they captured.
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));
    await storage.logOrderActivity({
      orderId: order.id, userId: user.userId,
      action: "supplier_invoice_unmarked_paid",
      details: {},
    } as any).catch(() => {});
    res.json({ ok: true });
  } catch (err: any) {
    console.error("Unmark supplier invoice paid error:", err);
    res.status(500).json({ error: "Failed to un-mark" });
  }
});

// POST /orders/:id/supplier-invoice/upload — accepts { blobUrl, fileName }.
// Caller (admin UI) puts the file on Vercel Blob first; this endpoint mirrors
// to the PO's Drive folder under "08. Invoicing" and records the file URL.
const uploadInvoiceSchema = z.object({
  blobUrl: z.string().url(),
  fileName: z.string().max(200),
  totalCents: z.number().int().min(0).nullable().optional(),
  currency: z.string().min(3).max(3).nullable().optional(),
}).strict();

router.post("/orders/:id/supplier-invoice/upload", async (req, res) => {
  try {
    const data = uploadInvoiceSchema.parse(req.body);
    const user = (req as any).user as { userId: string };
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    let driveFileId: string | null = null;
    if (order.driveFolderId) {
      driveFileId = await mirrorBlobToPoFolder({
        poFolderId: order.driveFolderId,
        slot: "supplier-invoice",
        blobUrl: data.blobUrl,
        fileName: data.fileName,
        orderId: order.id,
      });
    }
    // Drive's public webViewLink. If the upload failed (or Drive isn't wired)
    // we still store the blob URL so the invoice is accessible — better than
    // dropping the record entirely.
    const fileUrl = driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : data.blobUrl;

    const patch: any = {
      supplierInvoiceFileUrl: fileUrl,
      supplierInvoiceFileName: data.fileName,
      supplierInvoiceUploadedAt: new Date(),
      updatedAt: new Date(),
    };
    if (data.totalCents != null) patch.supplierInvoiceTotalCents = data.totalCents;
    if (data.currency) patch.supplierInvoiceCurrency = data.currency;
    await db.update(orders).set(patch).where(eq(orders.id, order.id));

    await storage.logOrderActivity({
      orderId: order.id, userId: user.userId,
      action: "supplier_invoice_uploaded",
      details: { fileName: data.fileName, fileUrl, driveFileId, totalCents: data.totalCents, currency: data.currency },
    } as any).catch(() => {});

    res.json({ ok: true, fileUrl, fileName: data.fileName, driveFileId });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Upload supplier invoice error:", err);
    res.status(500).json({ error: "Failed to upload" });
  }
});

// POST /orders/:id/payment-receipt/upload — proof we paid the supplier
// (bank slip / Wise PDF / screenshot). Lives in the same Drive 08. Invoicing/
// subfolder as the supplier invoice itself.
const uploadReceiptSchema = z.object({
  blobUrl: z.string().url(),
  fileName: z.string().max(200),
}).strict();

router.post("/orders/:id/payment-receipt/upload", async (req, res) => {
  try {
    const data = uploadReceiptSchema.parse(req.body);
    const user = (req as any).user as { userId: string };
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    let driveFileId: string | null = null;
    if (order.driveFolderId) {
      driveFileId = await mirrorBlobToPoFolder({
        poFolderId: order.driveFolderId,
        slot: "supplier-invoice",
        blobUrl: data.blobUrl,
        fileName: data.fileName,
        orderId: order.id,
      });
    }
    const fileUrl = driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : data.blobUrl;

    await db.update(orders).set({
      paymentReceiptFileUrl: fileUrl,
      paymentReceiptFileName: data.fileName,
      paymentReceiptUploadedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));

    await storage.logOrderActivity({
      orderId: order.id, userId: user.userId,
      action: "payment_receipt_uploaded",
      details: { fileName: data.fileName, fileUrl, driveFileId },
    } as any).catch(() => {});

    res.json({ ok: true, fileUrl, fileName: data.fileName, driveFileId });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Upload payment receipt error:", err);
    res.status(500).json({ error: "Failed to upload" });
  }
});

// ---- Customer-side invoice (the other half of the AP/AR picture) ----
//
// Direct POs: ops records the Xero invoice ref + optionally uploads the PDF.
// Supporter-campaign POs: customer side lives in Shopify, fetched live.

const updateXeroRefSchema = z.object({
  xeroRef: z.string().max(50).nullable(),
}).strict();

router.patch("/orders/:id/customer-invoice/xero-ref", async (req, res) => {
  try {
    const data = updateXeroRefSchema.parse(req.body);
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    await db.update(orders).set({
      customerInvoiceXeroRef: data.xeroRef,
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));
    res.json({ ok: true, xeroRef: data.xeroRef });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Update xero ref error:", err);
    res.status(500).json({ error: "Failed to update" });
  }
});

const uploadCustomerInvoiceSchema = z.object({
  blobUrl: z.string().url(),
  fileName: z.string().max(200),
}).strict();

router.post("/orders/:id/customer-invoice/upload", async (req, res) => {
  try {
    const data = uploadCustomerInvoiceSchema.parse(req.body);
    const user = (req as any).user as { userId: string };
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    let driveFileId: string | null = null;
    if (order.driveFolderId) {
      driveFileId = await mirrorBlobToPoFolder({
        poFolderId: order.driveFolderId,
        slot: "supplier-invoice", // routes to 08. Invoicing — same folder as supplier files
        blobUrl: data.blobUrl,
        fileName: data.fileName,
        orderId: order.id,
      });
    }
    const fileUrl = driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : data.blobUrl;

    await db.update(orders).set({
      customerInvoiceFileUrl: fileUrl,
      customerInvoiceFileName: data.fileName,
      customerInvoiceUploadedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));

    await storage.logOrderActivity({
      orderId: order.id, userId: user.userId,
      action: "customer_invoice_uploaded",
      details: { fileName: data.fileName, fileUrl, driveFileId },
    } as any).catch(() => {});

    res.json({ ok: true, fileUrl, fileName: data.fileName, driveFileId });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Upload customer invoice error:", err);
    res.status(500).json({ error: "Failed to upload" });
  }
});

// ---- Xero OAuth + invoice pull ----
//
// Connect flow: admin clicks Connect → /xero/connect redirects to Xero with
// a signed state token → user grants access → Xero redirects to /xero/callback
// with code + state → we exchange code for tokens and store in xero_connections.
//
// State token = JWT signed with JWT_SECRET so we can verify it came from us
// (not a CSRF). Lifetime 10 min.

const XERO_STATE_LIFETIME_SEC = 600;

router.get("/xero/connect", async (req, res) => {
  try {
    const { isXeroEnvConfigured, buildAuthorizeUrl } = await import("../xero-client.js");
    if (!isXeroEnvConfigured()) {
      return res.status(500).json({ error: "Xero not configured", hint: "Set XERO_CLIENT_ID and XERO_CLIENT_SECRET env vars." });
    }
    const jwtMod = await import("jsonwebtoken");
    const user = (req as any).user as { userId: string };
    const state = jwtMod.default.sign({ userId: user.userId, nonce: Math.random().toString(36).slice(2) }, process.env.JWT_SECRET || "dev-secret-change-in-production", { expiresIn: XERO_STATE_LIFETIME_SEC });
    res.redirect(buildAuthorizeUrl(state));
  } catch (err: any) {
    console.error("Xero connect error:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

router.get("/xero/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error) return res.status(400).send(`Xero authorization rejected: ${error}`);
    if (!code || !state) return res.status(400).send("Missing code or state");
    const jwtMod = await import("jsonwebtoken");
    let decoded: any;
    try {
      decoded = jwtMod.default.verify(state, process.env.JWT_SECRET || "dev-secret-change-in-production");
    } catch {
      return res.status(400).send("Invalid or expired state token");
    }
    const { exchangeAuthCode } = await import("../xero-client.js");
    const { tenantName } = await exchangeAuthCode(code, { userId: decoded?.userId });
    // Bounce back to the settings page so the admin sees the connected state.
    const back = `/admin/settings?xero=connected${tenantName ? `&tenant=${encodeURIComponent(tenantName)}` : ""}`;
    res.redirect(back);
  } catch (err: any) {
    console.error("Xero callback error:", err);
    res.status(500).send(`Xero callback failed: ${err?.message || err}`);
  }
});

router.get("/xero/status", async (_req, res) => {
  try {
    const { isXeroEnvConfigured } = await import("../xero-client.js");
    const { xeroConnections } = await import("@shared/schema");
    const [conn] = await db.select().from(xeroConnections).limit(1);
    res.json({
      ok: true,
      envConfigured: isXeroEnvConfigured(),
      connected: !!conn,
      tenantName: conn?.tenantName || null,
      tenantId: conn?.tenantId || null,
      connectedAt: conn?.connectedAt || null,
      expiresAt: conn?.expiresAt || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

router.delete("/xero", async (_req, res) => {
  try {
    const { disconnectXero } = await import("../xero-client.js");
    await disconnectXero();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// POST /orders/:id/customer-invoice/pull-from-xero — uses the stored
// customer_invoice_xero_ref to fetch the PDF from Xero and mirror to Drive.
router.post("/orders/:id/customer-invoice/pull-from-xero", async (req, res) => {
  try {
    const user = (req as any).user as { userId: string };
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!order.customerInvoiceXeroRef) {
      return res.status(400).json({ error: "No Xero invoice reference set on this PO. Enter it first." });
    }
    const { fetchInvoicePdf } = await import("../xero-client.js");
    const result = await fetchInvoicePdf(order.customerInvoiceXeroRef);
    if (!result) return res.status(404).json({ error: `Xero invoice ${order.customerInvoiceXeroRef} not found` });

    const fileName = `${result.invoiceNumber}.pdf`;
    let driveFileId: string | null = null;
    if (order.driveFolderId) {
      // Push the buffer to Vercel Blob first, then reuse the existing mirror
      // helper. Avoids a second multipart Drive upload path.
      const { put } = await import("@vercel/blob");
      const blob = await put(fileName, result.buffer, {
        access: "public",
        contentType: "application/pdf",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      driveFileId = await mirrorBlobToPoFolder({
        poFolderId: order.driveFolderId,
        slot: "supplier-invoice",
        blobUrl: blob.url,
        fileName,
        orderId: order.id,
      });
    }
    const fileUrl = driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : null;

    await db.update(orders).set({
      customerInvoiceFileUrl: fileUrl || order.customerInvoiceFileUrl,
      customerInvoiceFileName: fileName,
      customerInvoiceUploadedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));

    await storage.logOrderActivity({
      orderId: order.id, userId: user.userId,
      action: "customer_invoice_pulled_from_xero",
      details: { xeroRef: order.customerInvoiceXeroRef, xeroInvoiceId: result.invoiceId, fileUrl, driveFileId },
    } as any).catch(() => {});

    res.json({ ok: true, fileUrl, fileName, driveFileId, invoiceId: result.invoiceId });
  } catch (err: any) {
    console.error("Pull from Xero error:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// GET /orders/:id/supporter-orders — fetch Shopify orders for this PO's
// club (the customer-side revenue for a supporter-campaign PO). Empty
// list for direct POs (no clubAccountId / shopifyOrderTag).
router.get("/orders/:id/supporter-orders", async (req, res) => {
  try {
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!order.clubAccountId) {
      return res.json({ ok: true, supporterPo: false, orders: [], summary: null });
    }
    const club = await storage.getClubAccount(order.clubAccountId);
    if (!club || !club.shopifyOrderTag) {
      return res.json({ ok: true, supporterPo: true, orders: [], summary: null, note: "Club has no shopify_order_tag set" });
    }
    const supporterOrders = await fetchSupporterOrdersByTag(club.shopifyOrderTag);
    const totalCents = supporterOrders.reduce((s, o) => s + (o.totalCents || 0), 0);
    const unitsSold = supporterOrders.reduce((s, o) => s + o.lines.reduce((s2, li) => s2 + (li.quantity || 0), 0), 0);
    res.json({
      ok: true,
      supporterPo: true,
      club: { id: club.id, clubName: club.clubName, shopifyOrderTag: club.shopifyOrderTag },
      orders: supporterOrders,
      summary: {
        orderCount: supporterOrders.length,
        unitsSold,
        revenueCents: totalCents,
        currency: supporterOrders[0]?.currency || "NZD",
      },
    });
  } catch (err: any) {
    console.error("Fetch supporter orders error:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// POST /orders/:id/raise-po — the main action that ties step 2 (GHL sync) and
// step 3 (supplier portal) together:
//   1. Validates the order has a supplier assigned (body.supplierId or order.assignedSupplierId)
//   2. Sets orders.assignedSupplierId if not already set
//   3. Pushes GHL opportunity to "PO Raised" stage (GHL webhook then mirrors
//      it back into orders.pipelineStage — we don't write pipelineStage ourselves)
//   4. Emails the supplier with a link to the portal
//   5. Writes an activity log row
//
// If GHL push fails (creds missing, network, etc), the order is still marked
// PO-raised internally via orderActivity — GHL sync will catch up on the next
// manual stage move. Don't fail the whole request just because GHL is down.
// Plain-text supplier instructions doc body. Uploaded to the PO Drive folder
// as a Google Doc on raise-po so the supplier sees due dates + checklist
// alongside the artwork. Mirrors the dates in the Gmail dispatch but persists
// inside the folder for handoff between supplier staff.
function buildSupplierInstructions(input: {
  orderNumber: string;
  poReference?: string | null;
  accountName?: string | null;
  supplierName?: string | null;
  dueDate?: string | null;
  deliveryAddress?: string | null;
  deliveryAttention?: string | null;
}): string {
  const milestones = input.dueDate ? computeMilestones(input.dueDate) : null;
  const ref = input.poReference || input.orderNumber;
  const lines: string[] = [];
  lines.push(`SIDELINE NZ — SUPPLIER INSTRUCTIONS`);
  lines.push(``);
  lines.push(`PO: ${ref}${input.accountName ? `  ·  ${input.accountName}` : ""}`);
  if (input.supplierName) lines.push(`Supplier: ${input.supplierName}`);
  lines.push(``);
  lines.push(`WHAT'S IN THIS FOLDER`);
  lines.push(`  • Production sheet (PDF) — every spec, size, and quantity`);
  lines.push(`  • Mockups — 3D vendor renders for visual reference`);
  lines.push(`  • Artwork — 2D vector flats (production-ready files)`);
  lines.push(`  • Logos — sponsor + club marks with placement notes`);
  lines.push(``);
  if (milestones) {
    lines.push(`SCHEDULE (35-day cycle, working back from customer delivery)`);
    for (const m of milestones) {
      const flag = m.key === "ship_production" ? "  ← YOUR DEADLINE" : "";
      lines.push(`  Day ${String(m.dayNumber).padStart(2, " ")}  ${m.date}  ${m.label}${flag}`);
    }
    lines.push(``);
  } else {
    lines.push(`SCHEDULE`);
    lines.push(`  Customer due date not yet set — we'll send revised dates once locked.`);
    lines.push(``);
  }
  if (input.deliveryAddress) {
    lines.push(`DELIVERY`);
    if (input.deliveryAttention) lines.push(`  Attn: ${input.deliveryAttention}`);
    for (const ln of input.deliveryAddress.split("\n")) lines.push(`  ${ln}`);
    lines.push(``);
  }
  lines.push(`CHECKLIST — REPLY TO orders@sidelinenz.com`);
  lines.push(`  [ ] Confirm receipt of this pack within 2 business days`);
  lines.push(`  [ ] Confirm production timeline + flag any blockers`);
  lines.push(`  [ ] Send a sample photo before bulk run starts`);
  lines.push(`  [ ] Provide tracking once shipped from production`);
  lines.push(``);
  lines.push(`Anything unclear in spec or dates — reply to the dispatch email and we'll sort it before production starts.`);
  lines.push(``);
  lines.push(`— Sideline NZ`);
  return lines.join("\n");
}

const raisePoSchema = z.object({
  supplierId: z.string().optional(), // optional if already assigned
  // Admin-only: dispatch even when the QC gate fails (sizes/quantities not yet
  // final, logos pending). Sizes & quantities always change, so the admin can
  // force the PO out and adjust later. Only reachable via the requireAdmin
  // router — the customer-approval auto-dispatch path never sets this.
  override: z.boolean().optional(),
});

// Resolve which supplier should receive a given order line.
// Precedence: per-line override → order-level supplier → category-based default.
// Returns null supplierId if nothing applies — the dispatch routine surfaces
// these orphans as a clear error rather than dropping them on the floor.
async function resolveSupplierForLine(
  item: OrderItem,
  orderLevelSupplierId: string | null,
): Promise<{ supplierId: string | null; reason: string }> {
  if (item.assignedSupplierId) return { supplierId: item.assignedSupplierId, reason: "line-override" };
  if (orderLevelSupplierId) return { supplierId: orderLevelSupplierId, reason: "order-default" };
  if (item.productType) {
    const product = SIDELINE_PRODUCTS.find((p) => p.id === item.productType);
    if (product?.category) {
      const match = await storage.findSupplierForCategory(product.category);
      if (match) return { supplierId: match.id, reason: `category-fallback:${product.category}` };
    }
  }
  return { supplierId: null, reason: "unresolved" };
}

type SupplierGroupResult = {
  supplierId: string;
  supplierName: string | null;
  supplierEmail: string;
  itemIds: string[];
  itemCount: number;
  emailSent: boolean;
  gmailMessageId: string | null;
  appliedCosts: Array<{ orderItemId: string; productType: string; unitCostCents: number; currency: string; sourceId: string }>;
  driveSharedWith: string[];
};

// Dispatch one supplier's portion of the order: stamp supplier costs on the
// supplier's items, email the supplier with ONLY their items, share the Drive
// folder, log activity. Used per-group by dispatchOrderToSuppliers below.
// Side-effects that are once-per-order (GHL push, PO PDF, marking dispatched)
// happen in the outer function, not here.
async function dispatchSupplierGroup(
  order: any,
  supplier: any,
  items: any[],
  opts: { userId?: string; resolutionReasons: Map<string, string> },
): Promise<SupplierGroupResult> {
  const appliedCosts: SupplierGroupResult["appliedCosts"] = [];
  for (const it of items) {
    if (!it.productType) continue;
    const price = await storage.findSupplierPriceForLine(supplier.id, it.productType, it.size ?? null);
    if (!price) continue;
    await db.update(orderItems)
      .set({
        supplierUnitCostCents: price.unitCostCents,
        supplierCostCurrency: price.currency,
        supplierCostSourceId: price.id,
        supplierCostAppliedAt: new Date(),
      })
      .where(eq(orderItems.id, it.id));
    appliedCosts.push({
      orderItemId: it.id,
      productType: it.productType,
      unitCostCents: price.unitCostCents,
      currency: price.currency,
      sourceId: price.id,
    });
  }

  // Share Drive folder with this supplier
  const driveShareResults: Array<{ email: string; permissionId: string | null }> = [];
  if (order.driveFolderId && supplier.email) {
    const targets = [supplier.email];
    if (supplier.ccEmail) targets.push(supplier.ccEmail);
    for (const email of targets) {
      const permissionId = await shareFolderWithUser({
        fileOrFolderId: order.driveFolderId,
        emailAddress: email,
        role: "reader",
        notify: false,
      }).catch((err) => {
        console.error(`[dispatch-po] Drive share failed for ${email}:`, err);
        return null;
      });
      driveShareResults.push({ email, permissionId });
    }
  }

  // Email this supplier with ONLY their lines (this is the whole point of the
  // multi-supplier dispatch system — each supplier never sees what other
  // suppliers are making for the same customer order).
  let gmailMessageId: string | null = null;
  if (supplier.email) {
    gmailMessageId = await tracked(
      {
        system: "gmail",
        action: "sendSupplierPo",
        orderId: order.id,
        userId: opts.userId,
        context: {
          poReference: order.poReference,
          supplierId: supplier.id,
          supplierEmail: supplier.email,
          itemCount: items.length,
        },
      },
      () => sendSupplierPoDispatchGmail({
        to: supplier.email!,
        cc: supplier.ccEmail || undefined,
        supplierName: supplier.teamName,
        orderNumber: order.orderNumber,
        poReference: order.poReference,
        accountName: order.accountName,
        dueDate: order.dueDate,
        deliveryAddress: order.deliveryAddress,
        driveFolderUrl: order.driveFolderUrl,
        items: items.map((it: any) => ({
          productName: it.productName,
          material: it.material,
          brandingMethod: it.brandingMethod,
          quantity: it.quantity,
          productColors: it.productColors,
        })),
      }),
    );
  }

  await db.insert(orderActivity).values({
    orderId: order.id,
    userId: opts.userId,
    action: "po_raised_to_supplier",
    details: {
      poKind: order.poKind,
      supplierId: supplier.id,
      supplierName: supplier.teamName,
      supplierEmail: supplier.email,
      supplierCcEmail: supplier.ccEmail || null,
      itemIds: items.map((it: any) => it.id),
      itemCount: items.length,
      resolutionReasons: items.map((it: any) => ({ itemId: it.id, reason: opts.resolutionReasons.get(it.id) || "unknown" })),
      appliedSupplierCosts: appliedCosts.length ? appliedCosts : undefined,
      gmailMessageId,
      driveShares: driveShareResults,
    },
  });

  return {
    supplierId: supplier.id,
    supplierName: supplier.teamName,
    supplierEmail: supplier.email!,
    itemIds: items.map((it: any) => it.id),
    itemCount: items.length,
    emailSent: !!gmailMessageId,
    gmailMessageId,
    appliedCosts,
    driveSharedWith: driveShareResults.filter((r) => r.permissionId).map((r) => r.email),
  };
}

// Main dispatch entry point. Resolves each line's supplier, groups lines by
// resolved supplier, and sends one PO email per supplier with only their lines.
// Side-effects that are once-per-order (GHL stage push, PO PDF gen, marking
// po_dispatched_at) happen ONCE here regardless of how many suppliers receive
// emails.
//
// opts.supplierId, when provided, forces ALL items to that supplier (legacy
// single-supplier path used by /po-decision when an admin taps "Send" on a
// specific supplier's approval card).
export async function dispatchOrderToSuppliers(
  orderId: string,
  opts: { supplierId?: string; userId?: string; override?: boolean },
): Promise<
  | {
      ok: true;
      groups: SupplierGroupResult[];
      poPdfUploaded: boolean;
      poPdfUrl: string | null;
      instructionsDocId: string | null;
      ghlPushed: boolean;
      ghlPushReason: string | undefined;
      overrideWarnings: string[];
    }
  | { ok: false; status: number; error: string; overridable?: boolean }
> {
  const order = await storage.getOrder(orderId);
  if (!order) return { ok: false, status: 404, error: "Order not found" };

  const allItems = await storage.getOrderItems(order.id);
  if (!allItems.length) {
    return { ok: false, status: 400, error: "Order has no items to dispatch" };
  }

  // Collected when opts.override is set and a QC gate would normally block —
  // logged on the dispatch activity so there's an audit trail of exactly what
  // was incomplete when the admin forced the PO out.
  const overrideWarnings: string[] = [];

  // Step 0: PO QC gate (Sideline Studio Phase 0) — block dispatch of an
  // incomplete PO before ANY side effect. Verifies fabric, branding method,
  // quantity, and size reconciliation on every garment line. Logo presence +
  // supplier cost are produced by later steps and checked in a future Pass B.
  {
    const { assertProductionReady, summarizeFailures } = await import("../po-qc.js");
    const qc = await assertProductionReady(order.id);
    if (!qc.ok) {
      if (!opts.override) {
        return { ok: false, status: 400, error: summarizeFailures(qc.failures), overridable: true };
      }
      // Admin override: dispatch despite incomplete sizes/quantities/spec.
      overrideWarnings.push(summarizeFailures(qc.failures));
      console.warn(`[dispatch-po] ADMIN OVERRIDE — ${order.poReference}: ${summarizeFailures(qc.failures)}`);
    }
  }

  // Step 1: resolve supplier per line.
  // If opts.supplierId is set, force every line to that supplier (legacy
  // single-supplier path used by /po-decision when admin taps "Send" on a
  // specific approval card). Otherwise resolve per-line via the precedence
  // chain in resolveSupplierForLine().
  const orderLevelSupplierId = opts.supplierId || order.assignedSupplierId || null;
  const resolutionReasons = new Map<string, string>();
  const buckets = new Map<string, any[]>();
  const unresolved: Array<{ itemId: string; productName: string }> = [];

  for (const item of allItems) {
    let resolution;
    if (opts.supplierId) {
      // Force-all path: every line goes to opts.supplierId regardless.
      resolution = { supplierId: opts.supplierId, reason: "forced-by-caller" };
    } else {
      resolution = await resolveSupplierForLine(item, orderLevelSupplierId);
    }
    resolutionReasons.set(item.id, resolution.reason);
    if (!resolution.supplierId) {
      unresolved.push({ itemId: item.id, productName: item.productName });
      continue;
    }
    const bucket = buckets.get(resolution.supplierId) || [];
    bucket.push(item);
    buckets.set(resolution.supplierId, bucket);
  }

  if (unresolved.length > 0) {
    const names = unresolved.map((u) => u.productName).join(", ");
    return {
      ok: false,
      status: 400,
      error: `Cannot resolve supplier for ${unresolved.length} line${unresolved.length === 1 ? "" : "s"}: ${names}. Assign a supplier on the line, or set a default supplier on the order.`,
    };
  }

  // Step 2: validate every resolved supplier exists + has supplier role.
  // Fetch them all up front so we can bail before any side effects fire.
  const suppliersById = new Map<string, any>();
  for (const supplierId of Array.from(buckets.keys())) {
    const sup = await storage.getUser(supplierId);
    if (!sup || sup.role !== "supplier") {
      return { ok: false, status: 400, error: `Invalid supplier ID ${supplierId}` };
    }
    suppliersById.set(supplierId, sup);
  }

  // Step 2.5: ensure Drive folder exists. POs created via the older GHL flow
  // (PO-2026-0007 → 0017) landed with driveFolderId=NULL — dispatch would
  // succeed but no PDF upload, no folder share with the supplier, and the PO
  // email link to Drive would be missing. Auto-create here so the dispatch
  // never half-completes.
  if (!order.driveFolderId) {
    const dateStr = (order.createdAt ? new Date(order.createdAt) : new Date()).toISOString().slice(0, 10);
    const companyForFolder = order.accountName?.trim() || "Sideline";
    const contactForFolder =
      [order.customerFirstName, order.customerLastName].filter(Boolean).join(" ").trim() ||
      order.customerName?.trim() ||
      order.customerEmail ||
      "Unnamed Contact";
    try {
      const folder = await createClientFolder({
        date: dateStr,
        companyName: companyForFolder,
        contactName: contactForFolder,
      });
      if (folder) {
        await db.update(orders).set({
          driveFolderId: folder.id,
          driveFolderUrl: folder.webViewLink,
          driveFolderName: folder.name,
          updatedAt: new Date(),
        }).where(eq(orders.id, order.id));
        // Mutate the local copy so downstream steps pick it up.
        order.driveFolderId = folder.id;
        order.driveFolderUrl = folder.webViewLink;
        order.driveFolderName = folder.name;
      } else {
        console.warn(`[dispatch-po] Drive folder auto-create returned null for ${order.poReference} — continuing without folder`);
      }
    } catch (err) {
      console.error(`[dispatch-po] Drive folder auto-create failed for ${order.poReference}:`, err);
    }
  }

  // Step 2.6 (Sideline Studio Phase 4): auto-attach ALL the club's placeable
  // marks (primary / secondary / sponsor) to each order_item, each at its OWN
  // stored placement + application from the Brand Identity — not just the
  // primary at a hardcoded Center Chest. Front/back DESIGNS are full-panel
  // artwork (not point marks), so they're skipped here. Idempotent + fail-soft.
  if (order.clubAccountId) {
    try {
      const allLogos = await storage.listClubLogoAssets(order.clubAccountId);
      // Only placeable logos with a RENDERED preview image. Without previewUrl,
      // logoElementFromAsset falls back to a Canva /edit URL, which would be
      // stamped onto the supplier PO PDF as an unrenderable "logo" (QC Pass B
      // only checks existence, not renderability). Skip those — they need a
      // preview rendered first.
      const placeable = allLogos.filter((l) => ["primary", "secondary", "sponsor"].includes(l.kind) && !!(l as any).previewUrl);
      if (placeable.length) {
        const { logoElementFromAsset, logoListHasAsset, clubLogoPlacement } = await import("../canva-logos.js");
        let stamped = 0;
        for (const item of allItems) {
          let els = (item.elementUrls as any[] | null) ?? [];
          let changed = false;
          for (const asset of placeable) {
            if (logoListHasAsset(els, asset)) continue;
            const pl = clubLogoPlacement((item as any).productType, asset as any);
            els = [...els, logoElementFromAsset(asset, { defaultPosition: pl.position, defaultApplication: pl.application })];
            changed = true;
          }
          if (changed) {
            await db.update(orderItems).set({ elementUrls: els as any }).where(eq(orderItems.id, item.id));
            (item as any).elementUrls = els; // local mutate so the PDF render picks it up
            stamped += 1;
          }
        }
        if (stamped > 0) {
          await storage.logOrderActivity({
            orderId: order.id,
            userId: opts.userId,
            action: "logos_auto_attached",
            details: { logoCount: placeable.length, kinds: placeable.map((l) => l.kind), itemsStamped: stamped },
          } as any).catch(() => {});
        }
      } else {
        console.warn(`[dispatch-po] Club ${order.clubAccountId} has no placeable logo assets — PO ${order.poReference} dispatched without auto-attach`);
      }
    } catch (err) {
      console.error(`[dispatch-po] Logo auto-attach failed for ${order.poReference}:`, err);
    }
  }

  // Step 2.7: auto-attach the Sideline maker's mark to every garment item that
  // doesn't already have one. Position is per-garment (Right Chest for tops/
  // jackets/singlets, Center Back for caps/hats, Front Pocket for beanies,
  // Bottom for shorts/pants); application follows the item's own branding
  // method. Equipment/socks/bags get nothing. Fail-soft. (Romero 2026-06-27.)
  try {
    const SIDELINE_LOGO_URL = "https://quote.sidelinenz.com/sideline-assets/sideline-logo.png";
    const markPosition = (pt?: string | null): string | null => {
      const t = (pt || "").toLowerCase();
      if (/(^|-)(ball|cones?|backpack|bag|towel|bottle|socks?)$/.test(t)) return null; // equipment/socks/bags
      if (/cap|bucket/.test(t)) return "Center Back";
      if (/beanie/.test(t)) return "Front Pocket";
      if (/scarf/.test(t)) return "Bottom";
      if (/short|pant|trouser|skort|skirt|spank|brief/.test(t)) return "Bottom";
      return "Right Chest"; // tops, jerseys, polos, tees, singlets, hoodies, jackets, dresses
    };
    let marks = 0;
    for (const item of allItems) {
      const pos = markPosition((item as any).productType);
      if (!pos) continue;
      const existing = ((item as any).elementUrls as any[] | null) ?? [];
      if (existing.some((e) => String(e?.name || "").toLowerCase().includes("sideline"))) continue;
      const mark = { name: "Sideline", url: SIDELINE_LOGO_URL, position: pos, application: (item as any).brandingMethod || "Embroidery", sizeMm: "60 mm", note: "Sideline maker's mark (auto)" };
      const next = [...existing, mark];
      await db.update(orderItems).set({ elementUrls: next as any }).where(eq(orderItems.id, item.id));
      (item as any).elementUrls = next;
      marks += 1;
    }
    if (marks > 0) {
      await storage.logOrderActivity({ orderId: order.id, userId: opts.userId, action: "sideline_mark_auto_attached", details: { itemsStamped: marks, logo: SIDELINE_LOGO_URL } } as any).catch(() => {});
    }
  } catch (err) {
    console.error(`[dispatch-po] Sideline mark auto-attach failed for ${order.poReference}:`, err);
  }

  // Step 2.8: PO QC Pass B (Sideline Studio Phase 1) — logos are now attached,
  // so verify every garment line carries BOTH a club logo and the Sideline
  // mark. Blocks BEFORE any external side effect (Instructions doc, GHL push,
  // supplier emails) so a logo-less PO never ships to the factory.
  {
    const { checkLogosAttached, summarizeFailures } = await import("../po-qc.js");
    const logoCheck = checkLogosAttached(allItems as any);
    if (!logoCheck.ok) {
      if (!opts.override) {
        return { ok: false, status: 400, error: summarizeFailures(logoCheck.failures), overridable: true };
      }
      overrideWarnings.push(summarizeFailures(logoCheck.failures));
      console.warn(`[dispatch-po] ADMIN OVERRIDE (logos) — ${order.poReference}: ${summarizeFailures(logoCheck.failures)}`);
    }
  }

  // Step 2.7: seed the 8-stage production pipeline if it hasn't been
  // initialized yet. Idempotent on second call (storage method checks).
  // Lets admin + supplier mark checkpoints from the order detail page.
  try {
    await storage.initializeProductionPipeline(order.id);
  } catch (err) {
    console.error(`[dispatch-po] Production pipeline init failed for ${order.poReference}:`, err);
  }

  // Step 3: shared side effects that happen once per order, not per supplier
  // group. Drop the Instructions doc into the Drive folder, push GHL stage.
  let instructionsDocId: string | null = null;
  if (order.driveFolderId) {
    // Instructions doc lists ALL suppliers receiving this order so internal
    // tracking is unified even though each supplier only sees their own email.
    const supplierNames = Array.from(suppliersById.values()).map((s) => s.teamName).filter(Boolean).join(", ");
    const instructionsBody = buildSupplierInstructions({
      orderNumber: order.orderNumber,
      poReference: order.poReference,
      accountName: order.accountName,
      supplierName: supplierNames || null,
      dueDate: order.dueDate,
      deliveryAddress: order.deliveryAddress,
      deliveryAttention: order.deliveryAttention,
    });
    const doc = await createDocInFolder({
      parentFolderId: order.driveFolderId,
      name: `${order.poReference || order.orderNumber} — Supplier Instructions`,
      body: instructionsBody,
    }).catch((err) => {
      console.error("[dispatch-po] instructions doc create failed:", err);
      return null;
    });
    if (doc) instructionsDocId = doc.id;
  }

  let ghlPushResult: { success: boolean; reason?: string } = { success: false, reason: "no_ghl_link" };
  if (order.ghlOpportunityId) {
    ghlPushResult = await updateGhlOpportunityStage(order.ghlOpportunityId, "PO Raised");
  }

  // Step 4: keep orders.assigned_supplier_id useful for callers that still
  // expect a single supplier on the order. Pin it to the supplier whose
  // bucket has the most items (most representative). Per-line records are
  // the source of truth from here on.
  let dominantSupplierId: string | null = null;
  let dominantCount = -1;
  for (const [sid, items] of Array.from(buckets.entries())) {
    if (items.length > dominantCount) {
      dominantCount = items.length;
      dominantSupplierId = sid;
    }
  }
  if (dominantSupplierId && order.assignedSupplierId !== dominantSupplierId) {
    await db.update(orders)
      .set({ assignedSupplierId: dominantSupplierId, updatedAt: new Date() })
      .where(eq(orders.id, order.id));
  }

  // Step 5: dispatch each supplier group (stamp costs, share Drive, send email,
  // log activity scoped to those items).
  const groups: SupplierGroupResult[] = [];
  for (const [supplierId, items] of Array.from(buckets.entries())) {
    const supplier = suppliersById.get(supplierId);
    const result = await dispatchSupplierGroup(order, supplier, items, {
      userId: opts.userId,
      resolutionReasons,
    });
    groups.push(result);
  }

  // Step 6: PO PDF (one PDF per order, contains all lines for admin reference).
  let poPdfResult: { pdfId: string; pdfUrl: string } | null = null;
  if (order.driveFolderId) {
    poPdfResult = await uploadPoPdfToDrive(order.id, order.driveFolderId).catch((err) => {
      console.error("[dispatch-po] PDF upload failed:", err);
      return null;
    });
  }

  // Step 7: mark order dispatched + clear any prior hold.
  await db.update(orders)
    .set({ poDispatchedAt: new Date(), poHeldAt: null, poHoldReason: null, poHeldBy: null, updatedAt: new Date() })
    .where(eq(orders.id, order.id));

  // Audit trail when the admin forced the dispatch past the QC gate.
  if (overrideWarnings.length) {
    await storage.logOrderActivity({
      orderId: order.id,
      userId: opts.userId,
      action: "po_dispatched_with_override",
      details: { incomplete: overrideWarnings },
    } as any).catch(() => {});
  }

  return {
    ok: true,
    groups,
    overrideWarnings,
    poPdfUploaded: !!poPdfResult,
    poPdfUrl: poPdfResult?.pdfUrl || null,
    instructionsDocId,
    ghlPushed: ghlPushResult.success,
    ghlPushReason: ghlPushResult.reason,
  };
}

router.post("/orders/:id/raise-po", async (req, res) => {
  try {
    const { supplierId: bodySupplierId, override } = raisePoSchema.parse(req.body ?? {});
    const result = await dispatchOrderToSuppliers(req.params.id, {
      supplierId: bodySupplierId,
      userId: (req as any).user?.userId,
      override,
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error, overridable: result.overridable });
    res.json(result);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin raise PO error:", err);
    res.status(500).json({ error: "Failed to raise PO" });
  }
});

// GET /orders/:id/dispatch-preview — compute the per-supplier split WITHOUT
// firing any side effects (no emails, no Drive shares, no GHL push). Mirrors
// the resolution logic in dispatchOrderToSuppliers() so the admin UI can
// surface "this PO will be split across N suppliers" before the user pulls
// the dispatch trigger.
router.get("/orders/:id/dispatch-preview", async (req, res) => {
  try {
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const items = await storage.getOrderItems(order.id);
    if (!items.length) return res.json({ groups: [], unresolved: [], itemCount: 0 });

    const orderLevelSupplierId = order.assignedSupplierId || null;
    const buckets = new Map<string, { items: typeof items; reasons: Set<string> }>();
    const unresolved: Array<{ itemId: string; productName: string; productType: string | null; reason: string }> = [];

    for (const item of items) {
      const resolution = await resolveSupplierForLine(item, orderLevelSupplierId);
      if (!resolution.supplierId) {
        unresolved.push({ itemId: item.id, productName: item.productName, productType: item.productType, reason: resolution.reason });
        continue;
      }
      const b = buckets.get(resolution.supplierId) || { items: [], reasons: new Set() };
      b.items.push(item);
      b.reasons.add(resolution.reason);
      buckets.set(resolution.supplierId, b);
    }

    const groups = [];
    for (const [supplierId, b] of Array.from(buckets.entries())) {
      const supplier = await storage.getUser(supplierId);
      groups.push({
        supplierId,
        supplierName: supplier?.teamName || supplier?.email || "Unknown",
        supplierEmail: supplier?.email || null,
        lineCount: b.items.length,
        totalQty: b.items.reduce((s, it) => s + (it.quantity || 0), 0),
        lines: b.items.map((it) => ({ itemId: it.id, productName: it.productName, quantity: it.quantity })),
        resolutionReasons: Array.from(b.reasons),
      });
    }

    // PO QC gate (dry-run) — surface fabric/branding/quantity/size gaps in the
    // preview so the operator sees what to fix before hitting dispatch.
    const { assertProductionReady } = await import("../po-qc.js");
    const qc = await assertProductionReady(order.id);

    res.json({
      groups,
      unresolved,
      itemCount: items.length,
      qcReady: qc.ok,
      qcFailures: qc.ok ? [] : qc.failures,
    });
  } catch (err: any) {
    console.error("Admin dispatch-preview error:", err);
    res.status(500).json({ error: "Failed to compute dispatch preview" });
  }
});

// ════════════════════════════════════════════════════════════════════════
// SAMPLE / BULK PO SPLIT — designed 2026-04-28, shipped 2026-05-07.
//
// Flow:
//   1. /raise-sample-po  — flags the order as poKind=sample (and sets every
//                          item qty=1 in a snapshot), posts an approval card
//                          to the Sideline Telegram thread (Send/Edit/Hold).
//   2. /po-decision      — Telegram callback hits this. action=send invokes
//                          the shared dispatchPoToSupplier(); action=hold
//                          parks the PO; action=edit is a no-op (admin
//                          tweaks in UI then re-taps Send on the same card).
//   3. /mark-sample-approved-by-client — client signed off the sample. If
//                          deposit also paid, auto-creates the bulk PO and
//                          posts its approval card.
//   4. /mark-deposit-paid — Enoch flips this from Xero. Same auto-bulk
//                          trigger when sample already approved.
//   5. /raise-bulk-po    — manual fallback that does the duplicate-from-
//                          sample → new bulk order step (in case the auto
//                          gates didn't fire).
//
// Both gate signals must be present before bulk auto-creates:
//   sampleApprovedByClientAt && depositPaidAt
// ════════════════════════════════════════════════════════════════════════

// Item summary line for the Telegram approval card.
async function summarizeOrderItems(orderId: string): Promise<{
  summary: string;
  totalCents: number;
  lineCount: number;
  totalQty: number;
}> {
  const items = await storage.getOrderItems(orderId);
  const lineCount = items.length;
  const totalQty = items.reduce((s, it) => s + (it.quantity || 0), 0);
  const totalCents = items.reduce((s, it) => s + (it.unitAmount || 0) * (it.quantity || 0), 0);
  return { summary: `${lineCount} line${lineCount === 1 ? "" : "s"} • qty ${totalQty}`, totalCents, lineCount, totalQty };
}

async function postApprovalCardForOrder(orderId: string): Promise<{ ok: boolean; messageId?: number; reason?: string }> {
  if (!isTelegramConfigured()) {
    console.warn("[po-card] Telegram not configured — skipping approval card post");
    return { ok: false, reason: "telegram_not_configured" };
  }
  const order = await storage.getOrder(orderId);
  if (!order) return { ok: false, reason: "order_not_found" };
  if (order.poKind !== "sample" && order.poKind !== "bulk") {
    return { ok: false, reason: `not_sample_or_bulk:${order.poKind}` };
  }

  let supplierName: string | null = null;
  if (order.assignedSupplierId) {
    const sup = await storage.getUser(order.assignedSupplierId);
    if (sup) supplierName = sup.teamName;
  }

  let parentSampleRef: string | null = null;
  if (order.poKind === "bulk" && order.parentOrderId) {
    const parent = await storage.getOrder(order.parentOrderId);
    if (parent) parentSampleRef = parent.poReference;
  }

  const { summary, totalCents } = await summarizeOrderItems(order.id);
  const card = buildPoApprovalCard({
    orderId: order.id,
    poReference: order.poReference || order.orderNumber,
    poKind: order.poKind as "sample" | "bulk",
    accountName: order.accountName,
    supplierName,
    itemSummary: summary,
    totalNzd: totalCents / 100,
    driveFolderUrl: order.driveFolderUrl,
    pdfUrl: null, // PDF is generated at dispatch time, not at card-post time
    parentSampleRef,
  });
  return sendTelegramCard(card);
}

// Shared bulk-from-sample duplicator. Used by both the manual /raise-bulk-po
// route and the auto-trigger inside the gate routes (deposit + sample-approved).
// Returns the new bulk order, or null + reason if it can't be created.
async function ensureBulkPoFromSample(
  sampleOrderId: string,
  userId: string | undefined,
): Promise<{ bulk: any; created: boolean } | { error: string; status: number }> {
  const sample = await storage.getOrderWithDetails(sampleOrderId);
  if (!sample) return { error: "Sample order not found", status: 404 };
  if (sample.order.poKind !== "sample") {
    return { error: `Source order is poKind=${sample.order.poKind}, expected sample`, status: 400 };
  }

  // Idempotent: if a bulk already exists for this sample, return it.
  const existing = await db
    .select()
    .from(orders)
    .where(eq(orders.parentOrderId, sample.order.id));
  const priorBulk = existing.find((o: any) => o.poKind === "bulk");
  if (priorBulk) return { bulk: priorBulk, created: false };

  // Duplicate the sample into a fresh bulk order. New PO reference, blank
  // quantities (admin/buyer fills these in before tapping Send on the card).
  const { id: _id, orderNumber: _n, createdAt: _c, updatedAt: _u, paidAt: _p, poReference: _po,
    poKind: _pk, parentOrderId: _pid, poDispatchedAt: _pd, poHeldAt: _ph, poHoldReason: _phr,
    poHeldBy: _phb, sampleApprovedByClientAt: _sa, depositPaidAt: _dp,
    driveFolderId: _df, driveFolderUrl: _du, driveFolderName: _dn,
    artworkApproved: _aa, artworkApprovedBy: _ab, artworkApprovedAt: _at,
    ...orderCopy } = sample.order as any;

  const newPoReference = await buildPoReference();
  const clientForSlug = sample.order.accountName || sample.order.customerName || null;
  const newOrder = await withPoNumberRetry(clientForSlug, async (orderNumber) =>
    storage.createOrder({
      ...orderCopy,
      orderNumber,
      poReference: newPoReference,
      poKind: "bulk",
      parentOrderId: sample.order.id,
      // ghlOpportunityId, assignedSupplierId, pipelineStage are intentionally
      // copied through — bulk inherits the same supplier and GHL deal.
    } as any),
  );

  // If the sample was built from a closed Shopify drop, real bulk size
  // totals were stashed on order.bulkSizeBreakdown — fan them out into
  // orderSizeBreakdowns rows so the bulk lands populated. Otherwise blank
  // qtys (legacy custom-order path).
  const stashedBulk = (sample.order as any).bulkSizeBreakdown as
    | Record<string, Record<string, number>>
    | null
    | undefined;

  // Build a map: sample item id → cloned bulk item id, so we can carry the
  // stashed breakdown across the duplication.
  const bulkItemIdBySampleItemId = new Map<string, string>();
  let bulkSubtotal = 0;
  for (const it of sample.items) {
    const { id: sampleItemId, orderId: _oid, ...itemCopy } = it as any;
    const sizes = stashedBulk?.[sampleItemId];
    const totalQty = sizes ? Object.values(sizes).reduce((a, b) => a + b, 0) : 0;
    const newItem = await storage.createOrderItem({
      ...itemCopy,
      orderId: newOrder.id,
      quantity: totalQty, // 0 if no stash → admin fills in; else real total
    } as any);
    bulkItemIdBySampleItemId.set(sampleItemId, newItem.id);
    bulkSubtotal += (it.unitAmount || 0) * totalQty;

    if (sizes) {
      for (const [size, qty] of Object.entries(sizes)) {
        if (qty <= 0) continue;
        await db.insert(orderSizeBreakdowns).values({
          orderItemId: newItem.id,
          orderId: newOrder.id,
          size,
          quantity: qty,
        });
      }
    }
  }

  if (stashedBulk) {
    await db.update(orders)
      .set({ subtotal: bulkSubtotal, total: bulkSubtotal, updatedAt: new Date() })
      .where(eq(orders.id, newOrder.id));
  }

  await db.insert(orderActivity).values({
    orderId: newOrder.id,
    userId,
    action: "bulk_po_duplicated_from_sample",
    details: {
      sampleOrderId: sample.order.id,
      samplePoReference: sample.order.poReference,
      populatedFromStash: Boolean(stashedBulk),
    },
  });

  return { bulk: newOrder, created: true };
}

// POST /orders/:id/raise-sample-po
// Flags the order as a sample run (poKind=sample), forces every line item to
// quantity 1, then posts an approval card to the Sideline Telegram thread.
// Does NOT dispatch — the supplier email goes out only when Romero taps Send.
router.post("/orders/:id/raise-sample-po", async (req, res) => {
  try {
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (order.poKind === "bulk") {
      return res.status(400).json({ error: "Order is already a bulk PO — can't downgrade to sample" });
    }
    if (order.poDispatchedAt) {
      return res.status(400).json({ error: "PO already dispatched — raise a new sample PO if needed" });
    }

    // Flag + reset hold state.
    await db.update(orders)
      .set({ poKind: "sample", poHeldAt: null, poHoldReason: null, poHeldBy: null, updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    // Force every item to qty 1 (sample run).
    const items = await storage.getOrderItems(order.id);
    for (const it of items) {
      if (it.quantity !== 1) {
        await db.update(orderItems).set({ quantity: 1 }).where(eq(orderItems.id, it.id));
      }
    }

    // Recompute order totals against the new quantities.
    const subtotal = items.reduce((s, it) => s + (it.unitAmount || 0) * 1, 0);
    await db.update(orders)
      .set({ subtotal, total: subtotal, updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    await db.insert(orderActivity).values({
      orderId: order.id,
      userId: (req as any).user?.userId,
      action: "sample_po_raised",
      details: { previousKind: order.poKind, itemCount: items.length },
    });

    const cardResult = await postApprovalCardForOrder(order.id);

    res.json({
      ok: true,
      poKind: "sample",
      itemCount: items.length,
      cardPosted: cardResult.ok,
      cardReason: cardResult.reason,
      cardMessageId: cardResult.messageId,
    });
  } catch (err: any) {
    console.error("Admin raise-sample-po error:", err);
    res.status(500).json({ error: "Failed to raise sample PO" });
  }
});

// POST /orders/:id/raise-bulk-po
// Manual fallback path. Duplicates the SAMPLE order at this :id into a new
// bulk order (qty blanked), then posts the bulk approval card. Most of the
// time this runs automatically when both gates land — see the gate routes
// below — but expose the manual path so admins can force it if Xero is slow
// or the sample-approved signal got lost.
router.post("/orders/:id/raise-bulk-po", async (req, res) => {
  try {
    const result = await ensureBulkPoFromSample(req.params.id, (req as any).user?.userId);
    if ("error" in result) return res.status(result.status).json({ error: result.error });

    const cardResult = await postApprovalCardForOrder(result.bulk.id);

    res.json({
      ok: true,
      bulkOrderId: result.bulk.id,
      bulkPoReference: result.bulk.poReference,
      created: result.created,
      cardPosted: cardResult.ok,
      cardReason: cardResult.reason,
      cardMessageId: cardResult.messageId,
    });
  } catch (err: any) {
    console.error("Admin raise-bulk-po error:", err);
    res.status(500).json({ error: "Failed to raise bulk PO" });
  }
});

// POST /orders/:id/po-decision
// Telegram approval-card callback target. Bridge POSTs here when Romero taps
// Send / Edit / Hold on a sample/bulk approval card.
//
//   action=send  → run dispatchPoToSupplier (same path as legacy /raise-po)
//   action=hold  → set poHeldAt + reason; flow pauses until manually resumed
//   action=edit  → no-op; admin edits in UI, then re-taps Send (we still log
//                  it so we can audit "card edited but never re-sent")
const poDecisionSchema = z.object({
  action: z.enum(["send", "hold", "edit"]),
  reason: z.string().optional(),
});

router.post("/orders/:id/po-decision", async (req, res) => {
  try {
    const { action, reason } = poDecisionSchema.parse(req.body ?? {});
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (action === "send") {
      const result = await dispatchOrderToSuppliers(order.id, { userId: (req as any).user?.userId });
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      const { ok: _ok, ...rest } = result;
      return res.json({ ok: true, action: "send", ...rest });
    }

    if (action === "hold") {
      await db.update(orders)
        .set({
          poHeldAt: new Date(),
          poHoldReason: reason || null,
          poHeldBy: (req as any).user?.userId || null,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
      await db.insert(orderActivity).values({
        orderId: order.id,
        userId: (req as any).user?.userId,
        action: "po_held",
        details: { reason: reason || null, poKind: order.poKind },
      });
      return res.json({ ok: true, action: "hold", heldAt: new Date().toISOString() });
    }

    // edit: just log it.
    await db.insert(orderActivity).values({
      orderId: order.id,
      userId: (req as any).user?.userId,
      action: "po_edit_requested",
      details: { poKind: order.poKind },
    });
    res.json({ ok: true, action: "edit", note: "Edit in admin UI, then re-tap Send on the card." });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin po-decision error:", err);
    res.status(500).json({ error: "Failed to record PO decision" });
  }
});

// POST /orders/:id/mark-sample-approved-by-client
// Called by the client-mockup-approval flow (or the Enoch observer when it
// detects "approved" in the client thread). Sets sampleApprovedByClientAt;
// if depositPaidAt is also set, auto-creates the bulk PO and posts its card.
router.post("/orders/:id/mark-sample-approved-by-client", async (req, res) => {
  try {
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.poKind !== "sample") {
      return res.status(400).json({ error: `Order poKind=${order.poKind}, expected sample` });
    }

    if (!order.sampleApprovedByClientAt) {
      await db.update(orders)
        .set({ sampleApprovedByClientAt: new Date(), updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      await db.insert(orderActivity).values({
        orderId: order.id,
        userId: (req as any).user?.userId,
        action: "sample_approved_by_client",
        details: {},
      });
    }

    // Both gates met → fire bulk.
    let bulkResult: any = null;
    if (order.depositPaidAt) {
      const bulk = await ensureBulkPoFromSample(order.id, (req as any).user?.userId);
      if (!("error" in bulk)) {
        const card = await postApprovalCardForOrder(bulk.bulk.id);
        bulkResult = { bulkOrderId: bulk.bulk.id, created: bulk.created, cardPosted: card.ok };
      }
    }

    res.json({ ok: true, sampleApproved: true, bulkTriggered: !!bulkResult, bulk: bulkResult });
  } catch (err: any) {
    console.error("Admin mark-sample-approved error:", err);
    res.status(500).json({ error: "Failed to mark sample approved" });
  }
});

// POST /orders/:id/mark-deposit-paid
// Enoch invokes this from the Xero deposit watcher. Mirror of the sample-
// approved gate: sets depositPaidAt, and if the sample is already approved
// auto-creates+cards the bulk PO.
router.post("/orders/:id/mark-deposit-paid", async (req, res) => {
  try {
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Deposit can be marked on either the sample or the bulk row — when it
    // hits the bulk row directly we just record it (no auto-trigger needed).
    if (!order.depositPaidAt) {
      await db.update(orders)
        .set({ depositPaidAt: new Date(), updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      await db.insert(orderActivity).values({
        orderId: order.id,
        userId: (req as any).user?.userId,
        action: "deposit_paid",
        details: {},
      });
    }

    let bulkResult: any = null;
    if (order.poKind === "sample" && order.sampleApprovedByClientAt) {
      const bulk = await ensureBulkPoFromSample(order.id, (req as any).user?.userId);
      if (!("error" in bulk)) {
        const card = await postApprovalCardForOrder(bulk.bulk.id);
        bulkResult = { bulkOrderId: bulk.bulk.id, created: bulk.created, cardPosted: card.ok };
      }
    }

    res.json({ ok: true, depositPaid: true, bulkTriggered: !!bulkResult, bulk: bulkResult });
  } catch (err: any) {
    console.error("Admin mark-deposit-paid error:", err);
    res.status(500).json({ error: "Failed to mark deposit paid" });
  }
});

// ====== File vault (Sideline portal step 7) ======
//
// Admin-side upload of design files with folder tagging. Mirrors the customer
// upload flow (server/routes/customer.ts) but without the order-ownership check
// and with a required `folder` field so files land in the right bucket:
//   - mockups   → visible to clients via the approval link
//   - tech-pack → visible to assigned suppliers
//   - logos / size-run / other → admin only
//
// The client uses @vercel/blob client upload against /api/uploads/token to
// push the file, then POSTs the metadata here.
const adminUploadDesignSchema = z.object({
  label: z.string().min(1),
  folder: z.enum(["logos", "mockups", "size-run", "tech-pack", "other"]),
  fileName: z.string(),
  fileUrl: z.string().url(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
});

// Ensure the order has a Drive folder, creating it on demand so uploads always
// have somewhere to sync. Returns the folder id (null if creation failed) and
// mutates `order` so the caller can mirror immediately. Without this, uploads
// to a folder-less order silently never reach Drive.
async function ensureOrderDriveFolder(order: any): Promise<string | null> {
  if (order.driveFolderId) return order.driveFolderId;
  const dateStr = (order.createdAt ? new Date(order.createdAt) : new Date()).toISOString().slice(0, 10);
  const companyForFolder = order.accountName?.trim() || "Sideline";
  const contactForFolder =
    [order.customerFirstName, order.customerLastName].filter(Boolean).join(" ").trim() ||
    order.customerName?.trim() || order.customerEmail || "Unnamed Contact";
  try {
    const folder = await createClientFolder({ date: dateStr, companyName: companyForFolder, contactName: contactForFolder });
    if (!folder) return null;
    await storage.updateOrder(order.id, {
      driveFolderId: folder.id, driveFolderUrl: folder.webViewLink, driveFolderName: folder.name,
    });
    order.driveFolderId = folder.id;
    order.driveFolderUrl = folder.webViewLink;
    order.driveFolderName = folder.name;
    return folder.id;
  } catch (e) {
    console.error("[ensureOrderDriveFolder] failed:", e);
    return null;
  }
}

router.post("/orders/:id/designs", async (req, res) => {
  try {
    const user = (req as any).user;
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const data = adminUploadDesignSchema.parse(req.body);

    const designFile = await storage.createDesignFile({
      orderId: order.id,
      userId: user.userId,
      label: data.label,
      folder: data.folder,
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      fileSize: data.fileSize ?? null,
      mimeType: data.mimeType ?? null,
      status: "approved", // admin-uploaded files don't need review
      version: 1,
    });

    // Mirror uploads into the PO's Drive folder so it's the single source of
    // truth regardless of upload path. Auto-create the folder if the order
    // doesn't have one yet — otherwise uploads to a folder-less order silently
    // never sync to Drive. Fire-and-forget once the folder exists.
    const designFolderId = await ensureOrderDriveFolder(order);
    if (designFolderId) {
      const slotMap: Record<typeof data.folder, "mockups" | "logos" | "artwork" | "approvals" | undefined> = {
        mockups: "mockups",
        logos: "logos",
        "tech-pack": "artwork",
        "size-run": undefined, // no direct match — lands in root
        other: undefined,
      };
      const slot = slotMap[data.folder];
      mirrorBlobToPoFolder({
        poFolderId: designFolderId,
        slot,
        blobUrl: data.fileUrl,
        fileName: data.fileName,
        orderId: order.id,
      }).catch((err) => console.error("[designs-upload] Drive mirror failed:", err));
    } else {
      console.warn(`[designs-upload] no Drive folder for ${order.poReference || order.id} — upload not mirrored`);
    }

    await db.insert(orderActivity).values({
      orderId: order.id,
      userId: user.userId,
      action: "admin_uploaded_file",
      details: { fileId: designFile.id, folder: data.folder, fileName: data.fileName },
    });

    res.status(201).json(designFile);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin upload design error:", err);
    res.status(500).json({ error: "Failed to upload design" });
  }
});

// PATCH /designs/:id/folder — move an existing file between folders.
// Useful for re-tagging files uploaded before folders existed, or fixing mistakes.
const updateFolderSchema = z.object({
  folder: z.enum(["logos", "mockups", "size-run", "tech-pack", "other"]).nullable(),
});

router.patch("/designs/:id/folder", async (req, res) => {
  try {
    const { folder } = updateFolderSchema.parse(req.body);
    const [updated] = await db
      .update(designFiles)
      .set({ folder })
      .where(eq(designFiles.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Design file not found" });
    res.json({ ok: true, folder: updated.folder });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin update folder error:", err);
    res.status(500).json({ error: "Failed to update folder" });
  }
});

// PATCH /designs/:id/file-url — repoint a design file at a new stored URL,
// optionally correcting its fileName/label at the same time. Repair tool for
// rows registered with non-renderable URLs (e.g. Drive /view HTML pages) or
// misnamed files — repoint at a Vercel Blob URL so the admin previews load.
const updateFileUrlSchema = z.object({
  fileUrl: z.string().url(),
  fileName: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
});

router.patch("/designs/:id/file-url", async (req, res) => {
  try {
    const { fileUrl, fileName, label } = updateFileUrlSchema.parse(req.body);
    const patch: Record<string, unknown> = { fileUrl };
    if (fileName) patch.fileName = fileName;
    if (label) patch.label = label;
    const [updated] = await db
      .update(designFiles)
      .set(patch)
      .where(eq(designFiles.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Design file not found" });
    res.json({ ok: true, fileUrl: updated.fileUrl, fileName: updated.fileName, label: updated.label });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin update file-url error:", err);
    res.status(500).json({ error: "Failed to update file URL" });
  }
});

// POST /orders/:id/send-for-approval — issues a tokenized approval link,
// emails the client, and pushes GHL to "Mockup Sent".
// Client clicks the link, lands on /approve/:token (public), approves or
// requests changes. See server/routes/approvals.ts for the full lifecycle.
const sendForApprovalSchema = z.object({
  clientEmail: z.string().email().optional(), // defaults to order.customerEmail if omitted
});

router.post("/orders/:id/send-for-approval", async (req, res) => {
  try {
    const { clientEmail: bodyEmail } = sendForApprovalSchema.parse(req.body ?? {});

    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const clientEmail = bodyEmail || order.customerEmail || order.deliveryEmail;
    if (!clientEmail) {
      return res.status(400).json({
        error: "No client email on file — pass clientEmail in the body or set customerEmail on the order",
      });
    }

    // Sanity check: is there at least one mockup file on the order?
    const files = await storage.getDesignFilesByOrder(order.id);
    const hasMockup = files.some((f) => f.folder === "mockups");
    if (!hasMockup) {
      return res.status(400).json({
        error: "No mockup files uploaded yet. Upload at least one file with folder=mockups first.",
      });
    }

    const { token, expiresAt } = await createApprovalToken({
      orderId: order.id,
      createdBy: (req as any).user?.userId,
      clientEmail,
      clientName: order.customerName,
      orderNumber: order.orderNumber,
      ghlOpportunityId: order.ghlOpportunityId,
    });

    const baseUrl = process.env.BASE_URL || "https://sidelinenz.com";
    res.json({
      ok: true,
      token,
      expiresAt,
      link: `${baseUrl}/approve/${token}`,
      clientEmail,
    });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin send-for-approval error:", err);
    res.status(500).json({ error: "Failed to send approval link" });
  }
});

// GET /orders/:id/proof-preview?audience=supplier|customer — render the PO HTML
// (supplier production sheet OR customer DESIGN PROOF) straight to the browser
// so admin can eyeball exactly what the supplier / customer will receive before
// dispatching. Customer audience renders the interactive editable proof (no
// submitUrl, so the action bar shows preview stubs — it never writes).
router.get("/orders/:id/proof-preview", async (req, res) => {
  try {
    const audience = req.query.audience === "customer" ? "customer" : "supplier";
    const html = await generatePoHtml(req.params.id, { audience, interactive: audience === "customer" });
    if (!html) return res.status(404).send("Order not found");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err: any) {
    console.error("Admin proof-preview error:", err);
    res.status(500).send("Failed to render proof preview");
  }
});

// POST /orders/:id/dispatch-to-customer — issues a tokenized proof link and
// emails the customer (FROM orders@sidelinenz.com) a link to the interactive
// customer DESIGN PROOF page (/proof/<token>). On approval the customer's
// submit fires the supplier dispatch automatically. Guarded by the same
// "at least one mockup attached" check the approval GET uses.
const dispatchToCustomerSchema = z.object({
  clientEmail: z.string().email().optional(), // defaults to order.customerEmail
});
router.post("/orders/:id/dispatch-to-customer", async (req, res) => {
  try {
    const { clientEmail: bodyEmail } = dispatchToCustomerSchema.parse(req.body ?? {});

    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const clientEmail = bodyEmail || order.customerEmail || order.deliveryEmail;
    if (!clientEmail) {
      return res.status(400).json({
        error: "No customer email on file — pass clientEmail in the body or set customerEmail on the order",
      });
    }

    // Guard: require at least one mockup (mirrors send-for-approval + the
    // public approval GET, which only serves files in the mockups folder).
    const files = await storage.getDesignFilesByOrder(order.id);
    const hasMockup = files.some((f) => f.folder === "mockups");
    if (!hasMockup) {
      return res.status(400).json({
        error: "No mockup files uploaded yet. Upload at least one file with folder=mockups before dispatching the proof.",
      });
    }

    // Mint the token but suppress the default /approve email — we send our own
    // customer proof email pointing at /proof/<token>.
    const { token, expiresAt } = await createApprovalToken({
      orderId: order.id,
      createdBy: (req as any).user?.userId,
      clientEmail,
      clientName: order.customerName,
      orderNumber: order.orderNumber,
      ghlOpportunityId: order.ghlOpportunityId,
      sendEmail: false,
    });

    const baseUrl = process.env.BASE_URL || "https://sidelinenz.com";
    const url = `${baseUrl}/proof/${token}`;

    const messageId = await sendCustomerDesignProofRequest(
      clientEmail,
      order.orderNumber || "your order",
      url,
      order.customerName,
    ).catch((err) => {
      console.error("Failed to send customer design-proof email:", err);
      return null;
    });

    await storage.logOrderActivity({
      orderId: order.id,
      userId: (req as any).user?.userId,
      action: "design_proof_dispatched_to_customer",
      details: { token, clientEmail, url, messageId, expiresAt: expiresAt.toISOString() },
    } as any).catch(() => {});

    res.json({ ok: true, token, url, clientEmail, emailSent: !!messageId, expiresAt });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin dispatch-to-customer error:", err);
    res.status(500).json({ error: "Failed to dispatch proof to customer" });
  }
});

// ====== CLUB MANAGERS (supporter-campaign portal) ======
//
// Romero creates a manager record per club. The returned password is shown
// once — share it with the club via WhatsApp/Telegram, then it's hashed-only.
// Tag is the Shopify order tag the club's supporter orders carry, e.g.
// "club:onewhero-rfc". Tier is in basis points (800 = 8%).

const createClubManagerSchema = z.object({
  email: z.string().email(),
  clubName: z.string().min(1).max(100),
  shopifyOrderTag: z.string().min(1).max(80).regex(/^[a-zA-Z0-9:_-]+$/, "Invalid tag — alphanumerics, colon, dash, underscore only"),
  shopifyStoreUrl: z.string().url().optional(),
  contactId: z.string().optional(),
  profitShareTierBps: z.number().int().min(0).max(10000).optional(),
  password: z.string().min(8).optional(), // optional — auto-generated if absent
});

function generatePassword(): string {
  // 12 chars, no ambiguous lookalikes (0/O/1/l/I).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

router.post("/club-managers", async (req, res) => {
  try {
    const parsed = createClubManagerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.errors });

    const { email, clubName, shopifyOrderTag, shopifyStoreUrl, contactId, profitShareTierBps, password } = parsed.data;

    const existing = await storage.getClubAccountByEmail(email);
    if (existing) return res.status(409).json({ error: "A club account already exists with that email" });

    const initialPassword = password || generatePassword();
    const passwordHash = await hashPassword(initialPassword);

    const account = await storage.createClubAccount({
      email,
      clubName,
      passwordHash,
      shopifyOrderTag,
      shopifyStoreUrl,
      contactId,
      profitShareTierBps: profitShareTierBps ?? 800,
    } as any);

    res.json({
      id: account.id,
      email: account.email,
      clubName: account.clubName,
      shopifyOrderTag: account.shopifyOrderTag,
      profitShareTierBps: account.profitShareTierBps,
      // Returned ONCE — share via WhatsApp/Telegram then forget.
      initialPassword,
    });
  } catch (err) {
    console.error("Create club manager error:", err);
    res.status(500).json({ error: "Failed to create club manager" });
  }
});

router.get("/club-managers", async (_req, res) => {
  try {
    const accounts = await storage.getAllClubAccounts();
    // Strip passwordHash before returning.
    res.json(accounts.map((a) => ({
      id: a.id,
      email: a.email,
      clubName: a.clubName,
      shopifyOrderTag: a.shopifyOrderTag,
      shopifyStoreUrl: a.shopifyStoreUrl,
      profitShareTierBps: a.profitShareTierBps,
      contactId: a.contactId,
      createdAt: a.createdAt,
    })));
  } catch (err) {
    console.error("List club managers error:", err);
    res.status(500).json({ error: "Failed to list club managers" });
  }
});

const reportRequestSchema = z.object({
  clubAccountId: z.string().min(1),
  from: z.string().optional(),
  to: z.string().optional(),
  previewOnly: z.boolean().optional(),
});

router.post("/reports/club-drop-summary", async (req, res) => {
  try {
    const parsed = reportRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.errors });

    const { generateDropSummary } = await import("../reports/drop-summary");
    const result = await generateDropSummary(parsed.data);

    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err: any) {
    console.error("Drop summary error:", err);
    res.status(500).json({ error: "Failed to generate drop summary", message: String(err?.message || err) });
  }
});

// ─── Closed-Drop PO Builder ──────────────────────────────────────
//
// When a club's supporter Shopify collection closes (publish=false), this
// endpoint aggregates every tagged order into a sample PO with:
//   • one line per canonical Supporters Range product (Bucket Hat, Cap, Tee,
//     Polo, Beanie, Shell, Singlet) found in the orders
//   • correct material from shared/product-catalog.ts defaultMaterial
//   • product image pulled from the Shopify product's featured image
//   • size breakdown rolled up across all supporter orders
//
// poKind=sample with all line qtys=1 (so the supplier sample run goes out
// first), and the full bulk size totals are stashed on orders.bulkSizeBreakdown
// so when sampleApproved + depositPaid both land, the auto-bulk fans out with
// real qtys instead of blank.
//
// Triggers: scripts/poll-supporter-collections.ts (cron, on publish→unpublish),
// or the manual "Close Drop & Build PO" button in the admin club page.
//
// Idempotent: if the club already has supporterDropClosedAt set, returns the
// existing sample order id instead of building a new one. Clear that field if
// a fresh drop reuses the same handle.

interface BuildClosedDropResult {
  ok: true;
  sampleOrderId: string;
  poReference: string;
  cardPosted: boolean;
  cardReason?: string;
  productsAdded: number;
  totalSupporterOrders: number;
  totalUnits: number;
  skippedLineItems: string[];
  reused: boolean;
}

async function buildPoFromClosedDrop(
  clubId: string,
  userId: string | undefined,
): Promise<BuildClosedDropResult | { error: string; status: number }> {
  if (!isShopifyAdminConfigured()) {
    return { error: "Shopify Admin API not configured", status: 503 };
  }

  const [club] = await db.select().from(clubAccounts).where(eq(clubAccounts.id, clubId)).limit(1);
  if (!club) return { error: "Club not found", status: 404 };
  if (!club.shopifyOrderTag) {
    return { error: "Club has no shopifyOrderTag — set it before building PO", status: 400 };
  }
  if (!club.supporterCollectionHandle) {
    return { error: "Club has no supporterCollectionHandle — set it before building PO", status: 400 };
  }

  // Idempotent: re-use existing sample if drop was already closed.
  if (club.supporterDropClosedAt) {
    const existing = await db
      .select()
      .from(orders)
      .where(and(
        eq(orders.poKind, "sample"),
        eq(orders.sourceCollectionHandle, club.supporterCollectionHandle),
      ))
      .limit(1);
    if (existing.length) {
      return {
        ok: true,
        sampleOrderId: existing[0].id,
        poReference: existing[0].poReference || existing[0].orderNumber,
        cardPosted: false,
        cardReason: "drop_already_closed",
        productsAdded: 0,
        totalSupporterOrders: 0,
        totalUnits: 0,
        skippedLineItems: [],
        reused: true,
      };
    }
  }

  // 1. Pull every Shopify order carrying the club's tag.
  //    Fallback: if Shopify Flow tagging is broken (we found 0/157 tagged on
  //    2026-05-19), retry against the collection's products by line-item
  //    handle. Tag path is preferred when it works (cheaper, exact).
  let supporterOrders: SupporterOrder[] = await fetchSupporterOrdersByTag(club.shopifyOrderTag);
  if (!supporterOrders.length) {
    console.warn(`[closed-drop-po] No tagged orders for ${club.shopifyOrderTag} — falling back to collection-handle lookup`);
    supporterOrders = await fetchSupporterOrdersByCollection(club.supporterCollectionHandle);
  }
  if (!supporterOrders.length) {
    return { error: "No supporter orders found via tag or collection-handle lookup", status: 400 };
  }

  // 2. Pull collection products so we can resolve title → product image.
  const products: ShopifyProductLite[] = await fetchProductsInCollection(club.supporterCollectionHandle);
  const productImageByTitle = new Map<string, string>();
  for (const p of products) {
    if (p.imageUrl) productImageByTitle.set(p.title.toLowerCase(), p.imageUrl);
  }

  // 3. Group supporter line items by canonical product id, rolling up size
  //    counts as we go. Skip lines that don't match the 7-SKU range
  //    (shipping, gift cards, custom add-ons).
  type Aggregate = { canonical: ReturnType<typeof matchSupporterProduct>; sizeTotals: Map<string, number>; titles: Set<string> };
  const byCanonical = new Map<string, Aggregate>();
  const skipped: string[] = [];
  let totalUnits = 0;

  for (const o of supporterOrders) {
    for (const line of o.lines) {
      const match = matchSupporterProduct(line.title);
      if (!match) {
        skipped.push(line.title);
        continue;
      }
      let agg = byCanonical.get(match.productId);
      if (!agg) {
        agg = { canonical: match, sizeTotals: new Map(), titles: new Set() };
        byCanonical.set(match.productId, agg);
      }
      agg.titles.add(line.title);
      const size = extractSizeFromVariant(line.variantTitle, match.productId);
      agg.sizeTotals.set(size, (agg.sizeTotals.get(size) || 0) + line.quantity);
      totalUnits += line.quantity;
    }
  }

  if (byCanonical.size === 0) {
    return { error: "No supporter range products matched in any order line", status: 400 };
  }

  // 4. Create the sample order.
  const poReference = await buildPoReference();
  const dueDate = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const order = await withPoNumberRetry(club.clubName, async (orderNumber) =>
    storage.createOrder({
      orderNumber,
      storeSlug: "sideline",
      orderType: "supporter-drop",
      status: "processing",
      subtotal: 0,
      total: 0,
      currency: "nzd",
      customerEmail: club.email,
      customerName: club.clubName,
      poReference,
      poKind: "sample",
      accountName: club.clubName,
      isRepeatOrder: false,
      dueDate,
      sourceCollectionHandle: club.supporterCollectionHandle,
    } as any),
  );

  // 5. One line per canonical product. Sample run = qty 1 each. Bulk totals
  //    stashed on order.bulkSizeBreakdown for later fan-out.
  const bulkSizeBreakdown: Record<string, Record<string, number>> = {};
  let productsAdded = 0;

  for (const entry of Array.from(byCanonical.entries())) {
    const [canonicalId, agg] = entry;
    const product = agg.canonical!.product;
    // Pick the highest-frequency Shopify title for display so the PO matches
    // what the club ordered (e.g. "Onewhero RFC Cotton Tee" not "Cotton T-Shirt").
    const displayTitle = Array.from(agg.titles)[0] || product.name;
    const imageUrl = productImageByTitle.get(displayTitle.toLowerCase()) || null;
    const chartType = suggestSizeChart(canonicalId);
    const isHeadwear = product.category === "Headwear";

    const item = await storage.createOrderItem({
      orderId: order.id,
      productId: canonicalId,
      priceId: "supporter-drop",
      productName: displayTitle,
      productImage: imageUrl,
      quantity: 1, // sample run
      unitAmount: 0,
      currency: "nzd",
      productType: canonicalId,
      material: product.defaultMaterial,
      sizeChartType: chartType,
      mockupImages: imageUrl ? [{ url: imageUrl, label: "Shopify product image" }] : null,
    } as any);

    // Sample size breakdown: one row at "Sample" qty 1 so the PO PDF shows
    // the line. Bulk breakdown (the real per-size totals) goes on the order.
    await db.insert(orderSizeBreakdowns).values({
      orderItemId: item.id,
      orderId: order.id,
      size: isHeadwear ? "One Size" : "Sample",
      quantity: 1,
    });

    bulkSizeBreakdown[item.id] = Object.fromEntries(agg.sizeTotals);
    productsAdded++;
  }

  // 6. Stash bulk totals + close-drop marker.
  await db.update(orders)
    .set({ bulkSizeBreakdown: bulkSizeBreakdown as any, updatedAt: new Date() })
    .where(eq(orders.id, order.id));
  await db.update(clubAccounts)
    .set({ supporterDropClosedAt: new Date(), supporterCollectionPublished: false, updatedAt: new Date() })
    .where(eq(clubAccounts.id, club.id));

  // 6a. Flip Shopify supporter_campaign.status -> closed so the teamstore
  // can split Open Pre-Orders (live only) from Shop by Club (live + closed).
  // Best-effort: a missing GID or transient API error must not abort the PO
  // build that already succeeded — log and continue.
  try {
    const collectionGid = await getCollectionGidByHandle(club.supporterCollectionHandle);
    if (collectionGid) {
      await setSupporterCampaignStatus(collectionGid, "closed");
    } else {
      console.warn(`[closed-drop-po] No Shopify collection found for handle ${club.supporterCollectionHandle} — skipping status metafield`);
    }
  } catch (err) {
    console.error(`[closed-drop-po] Failed to set supporter_campaign.status=closed on ${club.supporterCollectionHandle}:`, err);
  }

  await db.insert(orderActivity).values({
    orderId: order.id,
    userId,
    action: "closed_drop_po_built",
    details: {
      collection: club.supporterCollectionHandle,
      tag: club.shopifyOrderTag,
      supporterOrderCount: supporterOrders.length,
      totalUnits,
      productsAdded,
      skippedCount: skipped.length,
    },
  });

  // 7. Post the sample approval card to Telegram.
  const cardResult = await postApprovalCardForOrder(order.id);

  return {
    ok: true,
    sampleOrderId: order.id,
    poReference: order.poReference || order.orderNumber,
    cardPosted: cardResult.ok,
    cardReason: cardResult.reason,
    productsAdded,
    totalSupporterOrders: supporterOrders.length,
    totalUnits,
    skippedLineItems: Array.from(new Set(skipped)),
    reused: false,
  };
}

// GET /api/admin/clubs — list club accounts with their drop config + state.
router.get("/clubs", async (_req, res) => {
  try {
    const rows = await db.select({
      id: clubAccounts.id,
      email: clubAccounts.email,
      clubName: clubAccounts.clubName,
      shopifyOrderTag: clubAccounts.shopifyOrderTag,
      supporterCollectionHandle: clubAccounts.supporterCollectionHandle,
      supporterCollectionPublished: clubAccounts.supporterCollectionPublished,
      supporterDropClosedAt: clubAccounts.supporterDropClosedAt,
      profitShareTierBps: clubAccounts.profitShareTierBps,
    }).from(clubAccounts);
    res.json({ ok: true, clubs: rows });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// POST /api/admin/clubs/:id/set-collection-status — flip the supporter
// campaign status metafield on the club's Shopify collection. Lets ops
// correct a misfire (e.g. drop closed prematurely) or seed a new state
// (live/closed/upcoming) without touching the Shopify admin UI.
const setCollectionStatusSchema = z.object({
  status: z.enum(["live", "closed", "upcoming"]),
  closedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
router.post("/clubs/:id/set-collection-status", async (req, res) => {
  try {
    const { status, closedAt } = setCollectionStatusSchema.parse(req.body);
    const [club] = await db.select().from(clubAccounts).where(eq(clubAccounts.id, req.params.id)).limit(1);
    if (!club) return res.status(404).json({ error: "Club not found" });
    if (!club.supporterCollectionHandle) {
      return res.status(400).json({ error: "Club has no supporterCollectionHandle" });
    }
    if (!isShopifyAdminConfigured()) {
      return res.status(503).json({ error: "Shopify Admin API not configured" });
    }
    const collectionGid = await getCollectionGidByHandle(club.supporterCollectionHandle);
    if (!collectionGid) {
      return res.status(404).json({ error: `Shopify collection not found for handle ${club.supporterCollectionHandle}` });
    }
    await setSupporterCampaignStatus(collectionGid, status as SupporterCampaignStatus, closedAt);
    // No order_activity row — this action is club-scoped, not order-scoped,
    // and order_activity.order_id is NOT NULL. Logged to stdout for now;
    // promote to a club_activity table if we need a queryable audit trail.
    console.log(`[supporter-status] club=${club.id} handle=${club.supporterCollectionHandle} status=${status}${closedAt ? ` closedAt=${closedAt}` : ""} actor=${(req as any).user?.userId || "unknown"}`);
    res.json({ ok: true, handle: club.supporterCollectionHandle, status, closedAt: closedAt || null });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin set-collection-status error:", err);
    res.status(500).json({ error: "Failed to set status", message: String(err?.message || err) });
  }
});

// POST /api/admin/shopify/register-order-webhook — one-time setup that asks
// Shopify to start POSTing orders/create to our auto-tag handler. Idempotent:
// if a subscription with the same callback URL already exists, Shopify
// returns a takenAddress userError — we surface that without retrying.
router.post("/shopify/register-order-webhook", async (req, res) => {
  if (!isShopifyAdminConfigured()) {
    return res.status(503).json({ error: "Shopify Admin API not configured" });
  }
  const baseUrl = process.env.BASE_URL || "https://sidelinenz.com";
  const callbackUrl = `${baseUrl}/api/webhooks/shopify/orders-create`;
  const storeUrl = process.env.SHOPIFY_STORE_URL!;
  const token = process.env.SHOPIFY_ADMIN_TOKEN!;
  const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION || "2024-10";
  const MUTATION = /* GraphQL */ `
    mutation($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
        webhookSubscription { id callbackUrl topic format }
        userErrors { field message }
      }
    }
  `;
  try {
    const r = await fetch(`https://${storeUrl}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query: MUTATION, variables: {
        topic: "ORDERS_CREATE",
        sub: { callbackUrl, format: "JSON" },
      }}),
    });
    const body = await r.json();
    const userErrors = body?.data?.webhookSubscriptionCreate?.userErrors ?? [];
    const sub = body?.data?.webhookSubscriptionCreate?.webhookSubscription;
    res.json({ ok: !!sub, subscription: sub, userErrors, callbackUrl });
  } catch (err: any) {
    console.error("[register-webhook] error:", err);
    res.status(500).json({ error: "Failed to register webhook", message: String(err?.message || err) });
  }
});

// GET /api/admin/clubs/supporter-stats — live tally per club, pulled from
// Shopify by collection-handle (immune to broken tag automation). Used by
// the admin Supporter Campaigns page to render the build-PO table.
router.get("/clubs/supporter-stats", async (_req, res) => {
  try {
    if (!isShopifyAdminConfigured()) {
      return res.status(503).json({ error: "Shopify Admin API not configured" });
    }
    const allClubs = await db.select().from(clubAccounts);
    const clubsWithCollection = allClubs.filter((c) => c.supporterCollectionHandle);
    const stats = await Promise.all(clubsWithCollection.map(async (c) => {
      try {
        const orders = await fetchSupporterOrdersByCollection(c.supporterCollectionHandle!);
        const units = orders.reduce((sum, o) => sum + o.lines.reduce((s, l) => s + l.quantity, 0), 0);
        const revenueCents = orders.reduce((sum, o) => sum + o.totalCents, 0);
        return {
          id: c.id,
          clubName: c.clubName,
          email: c.email,
          shopifyOrderTag: c.shopifyOrderTag,
          collectionHandle: c.supporterCollectionHandle,
          supporterDropClosedAt: c.supporterDropClosedAt,
          profitShareTierBps: c.profitShareTierBps,
          orderCount: orders.length,
          unitsSold: units,
          revenueCents,
        };
      } catch (err: any) {
        return {
          id: c.id,
          clubName: c.clubName,
          email: c.email,
          shopifyOrderTag: c.shopifyOrderTag,
          collectionHandle: c.supporterCollectionHandle,
          supporterDropClosedAt: c.supporterDropClosedAt,
          profitShareTierBps: c.profitShareTierBps,
          orderCount: 0,
          unitsSold: 0,
          revenueCents: 0,
          error: String(err?.message || err),
        };
      }
    }));
    res.json({ ok: true, generatedAt: new Date().toISOString(), clubs: stats });
  } catch (err: any) {
    console.error("[supporter-stats] error:", err);
    res.status(500).json({ error: "Failed to load stats", message: String(err?.message || err) });
  }
});

// PATCH /api/admin/clubs/:id — set collection handle / clear drop-closed marker.
const patchClubSchema = z.object({
  supporterCollectionHandle: z.string().optional(),
  clearDropClosedAt: z.boolean().optional(),
});
router.patch("/clubs/:id", async (req, res) => {
  try {
    const data = patchClubSchema.parse(req.body);
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (data.supporterCollectionHandle !== undefined) {
      updates.supporterCollectionHandle = data.supporterCollectionHandle || null;
    }
    if (data.clearDropClosedAt) {
      updates.supporterDropClosedAt = null;
      updates.supporterCollectionPublished = null;
    }
    await db.update(clubAccounts).set(updates).where(eq(clubAccounts.id, req.params.id));
    const [club] = await db.select().from(clubAccounts).where(eq(clubAccounts.id, req.params.id)).limit(1);
    res.json({ ok: true, club });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// POST /api/admin/clubs/:id/build-po-from-closed-drop
// Manual + cron entry point for the closed-drop builder above.
router.post("/clubs/:id/build-po-from-closed-drop", async (req, res) => {
  try {
    const result = await buildPoFromClosedDrop(req.params.id, (req as any).user?.userId);
    if ("error" in result) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (err: any) {
    console.error("[closed-drop-po] build error:", err);
    res.status(500).json({ error: "Failed to build PO from closed drop", message: String(err?.message || err) });
  }
});

// Service-token variant for the Telegram bridge / cron poller. Same logic,
// X-Service-Token auth instead of admin JWT.
router.post("/clubs/:id/build-po-from-closed-drop-service", async (req, res) => {
  const expected = process.env.SIDELINE_SERVICE_TOKEN || process.env.SERVICE_TOKEN;
  if (!expected || req.header("X-Service-Token") !== expected) {
    return res.status(401).json({ error: "Invalid service token" });
  }
  try {
    const result = await buildPoFromClosedDrop(req.params.id, undefined);
    if ("error" in result) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (err: any) {
    console.error("[closed-drop-po] service build error:", err);
    res.status(500).json({ error: "Failed to build PO from closed drop", message: String(err?.message || err) });
  }
});

// GET /api/admin/clubs/:id/collection-status — cron poller calls this every
// 10 min to look for the publish→unpublish transition.
router.get("/clubs/:id/collection-status", async (req, res) => {
  try {
    const [club] = await db.select().from(clubAccounts).where(eq(clubAccounts.id, req.params.id)).limit(1);
    if (!club) return res.status(404).json({ error: "Club not found" });
    if (!club.supporterCollectionHandle) {
      return res.json({ ok: true, configured: false });
    }
    const status = await fetchCollectionStatus(club.supporterCollectionHandle);
    if (!status) return res.json({ ok: true, configured: true, found: false });
    res.json({
      ok: true,
      configured: true,
      found: true,
      publishedNow: status.publishedOnOnlineStore,
      publishedLastSeen: club.supporterCollectionPublished,
      transitionedToClosed:
        club.supporterCollectionPublished === true && status.publishedOnOnlineStore === false,
      dropClosedAt: club.supporterDropClosedAt,
      productCount: status.productCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// ---- Club logo assets (Canva-sourced, auto-attached on PO raise) ----
//
// Storage shape: club_logo_assets rows hold the canva_design_id + optional
// page index for a logo asset owned by a club. The PO-raise hook reads the
// row marked kind='primary' and stamps it into each order_item.elementUrls.
//
// Endpoints below are admin-only — mounted under /api/admin already.

const createLogoSchema = z.object({
  canvaUrl: z.string().url().optional(),
  canvaDesignId: z.string().min(8).optional(),
  canvaPageIndex: z.number().int().min(1).max(200).nullable().optional(),
  kind: z.enum(["primary", "secondary", "front-design", "back-design", "sponsor"]).default("primary"),
  displayLabel: z.string().max(200).nullable().optional(),
  previewUrl: z.string().url().nullable().optional(),
  imageUrl: z.string().url().optional(), // direct file upload (drag-and-drop) — no Canva
  defaultPosition: z.string().max(60).nullable().optional(), // placement on the garment
}).refine((d) => d.canvaUrl || d.canvaDesignId || d.imageUrl, { message: "Provide canvaUrl, canvaDesignId, or imageUrl" });

const updateLogoSchema = z.object({
  kind: z.enum(["primary", "secondary", "front-design", "back-design", "sponsor"]).optional(),
  displayLabel: z.string().max(200).nullable().optional(),
  canvaPageIndex: z.number().int().min(1).max(200).nullable().optional(),
  previewUrl: z.string().url().nullable().optional(),
  defaultPosition: z.string().max(60).nullable().optional(),
}).strict();

// Default garment placement per asset type (Sideline taxonomy). Sponsors pick a
// slot down the prominence ladder, so they default to its top (Front Center).
const TYPE_DEFAULT_POSITION: Record<string, string> = {
  primary: "Left Chest",
  secondary: "Center Back",
  "front-design": "Front",
  "back-design": "Back",
  sponsor: "Front Center",
};
const KIND_LABEL: Record<string, string> = {
  primary: "Primary Logo",
  secondary: "Secondary Logo",
  "front-design": "Front Design",
  "back-design": "Back Design",
  sponsor: "Sponsor",
};
// Auto-name a logo asset from the club + chosen type (no filename). Sponsors
// include their slot so multiples stay distinct. (Plain hyphen — no em dash.)
function autoAssetName(clubName: string, kind: string, position?: string | null): string {
  const label = KIND_LABEL[kind] || kind;
  return kind === "sponsor" && position ? `${clubName} - ${label} (${position})` : `${clubName} - ${label}`;
}

// GET /api/admin/clubs/:id/logos — list logos for one club
router.get("/clubs/:id/logos", async (req, res) => {
  try {
    const [club] = await db.select().from(clubAccounts).where(eq(clubAccounts.id, req.params.id)).limit(1);
    if (!club) return res.status(404).json({ error: "Club not found" });
    const logos = await storage.listClubLogoAssets(req.params.id);
    res.json({ ok: true, club: { id: club.id, clubName: club.clubName }, logos });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// POST /api/admin/clubs/:id/logos — add a logo from a Canva URL or raw ID
router.post("/clubs/:id/logos", async (req, res) => {
  try {
    const data = createLogoSchema.parse(req.body);
    const [club] = await db.select().from(clubAccounts).where(eq(clubAccounts.id, req.params.id)).limit(1);
    if (!club) return res.status(404).json({ error: "Club not found" });

    const { extractCanvaDesignId } = await import("../canva-logos.js");
    const designId = data.canvaDesignId ?? (data.canvaUrl ? extractCanvaDesignId(data.canvaUrl) : null);

    // Direct file-upload path (drag-and-drop) — no Canva. The uploaded image is
    // both the preview and the production artwork; a synthetic id satisfies the
    // notNull canva_design_id column. This is the bottleneck-killer for support.
    const position = data.defaultPosition ?? TYPE_DEFAULT_POSITION[data.kind] ?? null;

    if (!designId && data.imageUrl) {
      const created = await storage.createClubLogoAsset({
        clubAccountId: req.params.id,
        canvaDesignId: `upload:${Date.now()}`,
        canvaPageIndex: null,
        kind: data.kind,
        displayLabel: data.displayLabel ?? autoAssetName(club.clubName, data.kind, position),
        previewUrl: data.imageUrl,
        artworkFileUrl: data.imageUrl,
        defaultPosition: position,
        lastSyncedAt: null,
      } as any);
      return res.json({ ok: true, logo: created });
    }

    if (!designId) {
      return res.status(400).json({ error: "Could not extract Canva design ID from URL" });
    }
    const created = await storage.createClubLogoAsset({
      clubAccountId: req.params.id,
      canvaDesignId: designId,
      canvaPageIndex: data.canvaPageIndex ?? null,
      kind: data.kind,
      displayLabel: data.displayLabel ?? autoAssetName(club.clubName, data.kind, position),
      previewUrl: data.previewUrl ?? null,
      defaultPosition: position,
      lastSyncedAt: null,
    } as any);
    res.json({ ok: true, logo: created });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// PATCH /api/admin/clubs/:id/logos/:logoId — edit kind / label / preview
router.patch("/clubs/:id/logos/:logoId", async (req, res) => {
  try {
    const data = updateLogoSchema.parse(req.body);
    const updated = await storage.updateClubLogoAsset(req.params.logoId, data as any);
    if (!updated) return res.status(404).json({ error: "Logo not found" });
    res.json({ ok: true, logo: updated });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// DELETE /api/admin/clubs/:id/logos/:logoId
router.delete("/clubs/:id/logos/:logoId", async (req, res) => {
  try {
    const ok = await storage.deleteClubLogoAsset(req.params.logoId);
    if (!ok) return res.status(404).json({ error: "Logo not found" });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// GET /api/admin/clubs-missing-logos — health check used by the dashboard
// to surface clubs that won't auto-attach a logo on PO raise.
router.get("/clubs-missing-logos", async (_req, res) => {
  try {
    const rows = await storage.listClubsMissingPrimaryLogo();
    res.json({ ok: true, clubs: rows });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// GET /api/admin/clubs/structure — the CLUB/SCHOOL → TEAMS tree (clubs table),
// each club with its teams (club_accounts linked + standalone orders linked via
// orders.club_id) and its shared primary logo. Drives the Clubs panel so a club
// and its teams (incl. standalone orders like Mary/Miranda) are visible together.
router.get("/clubs/structure", async (_req, res) => {
  try {
    const R = (r: any) => (r && r.rows) ? r.rows : (Array.isArray(r) ? r : []);
    const clubsRows = R(await db.execute(sql`SELECT id, name, kind, primary_logo_url FROM clubs ORDER BY name`));
    const out: any[] = [];
    for (const c of clubsRows) {
      const teamAccts = R(await db.execute(sql`SELECT id, club_name FROM club_accounts WHERE club_id=${c.id} ORDER BY club_name`));
      const teamOrders = R(await db.execute(sql`SELECT DISTINCT account_name, po_reference FROM orders WHERE club_id=${c.id} AND po_reference IS NOT NULL ORDER BY po_reference DESC`));
      const teams = [
        ...teamAccts.map((t: any) => ({ name: t.club_name, kind: "account" })),
        ...teamOrders.map((o: any) => ({ name: o.account_name, po: o.po_reference, kind: "order" })),
      ];
      out.push({ id: c.id, name: c.name, kind: c.kind, primaryLogoUrl: c.primary_logo_url, teams });
    }
    res.json({ ok: true, clubs: out });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// GET /api/admin/clubs/logos-overview — every club with ALL its logo assets in
// one query, so the Club Logos page shows every asset at a glance (no per-club
// expand/fetch). Two cheap selects, grouped in memory.
router.get("/clubs/logos-overview", async (_req, res) => {
  try {
    const clubs = await db
      .select({ id: clubAccounts.id, clubName: clubAccounts.clubName, shopifyOrderTag: clubAccounts.shopifyOrderTag })
      .from(clubAccounts);
    const allLogos = await db.select().from(clubLogoAssets);
    const byClub = new Map<string, any[]>();
    for (const l of allLogos) {
      const arr = byClub.get(l.clubAccountId) || [];
      arr.push(l);
      byClub.set(l.clubAccountId, arr);
    }
    // Brand colours (COLOURS pillar) per club, from club_brand_identity.
    const _R = (r: any) => (r && r.rows) ? r.rows : (Array.isArray(r) ? r : []);
    const colorRows = _R(await db.execute(sql`SELECT club_account_id, colors FROM club_brand_identity`));
    const colorsByClub = new Map<string, any>(colorRows.map((r: any) => [r.club_account_id, r.colors]));
    // Each club's current PO = its latest order. One select, latest-per-club in memory.
    const allOrders = await db
      .select({ id: orders.id, poReference: orders.poReference, status: orders.status, clubAccountId: orders.clubAccountId, createdAt: orders.createdAt })
      .from(orders);
    const latestByClub = new Map<string, any>();
    for (const o of allOrders) {
      if (!o.clubAccountId) continue;
      const prev = latestByClub.get(o.clubAccountId);
      if (!prev || (o.createdAt && prev.createdAt && o.createdAt > prev.createdAt)) latestByClub.set(o.clubAccountId, o);
    }
    const out = clubs.map((c) => {
      const po = latestByClub.get(c.id);
      return { ...c, logos: byClub.get(c.id) || [], colors: colorsByClub.get(c.id) || null, currentPo: po ? { id: po.id, poReference: po.poReference, status: po.status } : null };
    });
    res.json({ ok: true, clubs: out });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// GET /api/admin/clubs/brand-identity — the CLUB-CENTRIC view: one entry per club/
// school, each with its resolved brand identity (logos + designs aggregated from
// its team accounts, colours) AND its teams nested (account-teams + standalone
// order-teams) with PO links. This is the single coherent hierarchy the Brand
// Identity page renders — no parallel structure/cards. `accountId` is the
// representative team-account that uploads + colours save to.
router.get("/clubs/brand-identity", async (_req, res) => {
  try {
    const R = (r: any) => (r && r.rows) ? r.rows : (Array.isArray(r) ? r : []);
    const mapAsset = (s: any) => ({ id: s.id, kind: s.kind, displayLabel: s.display_label, previewUrl: s.preview_url, defaultPosition: s.default_position, clubAccountId: s.club_account_id, canvaDesignId: s.canva_design_id, canvaPageIndex: s.canva_page_index });
    const LOGO_KINDS = ["primary", "secondary", "sponsor"]; const DESIGN_KINDS = ["front-design", "back-design"];
    const clubsRows = R(await db.execute(sql`SELECT id, name, kind, primary_logo_url FROM clubs ORDER BY name`));
    // Parent org details — OPTIONAL: tolerate a DB without the columns yet (returns
    // no details, never 500s). See migrations/club-parent-details.sql.
    let detailsByClub = new Map<string, any>();
    try {
      const dRows = R(await db.execute(sql`SELECT id, website, delivery_address, contact_name, contact_email, contact_phone, ghl_business_id FROM clubs`));
      detailsByClub = new Map(dRows.map((r: any) => [r.id, { website: r.website, deliveryAddress: r.delivery_address, contactName: r.contact_name, contactEmail: r.contact_email, contactPhone: r.contact_phone, ghlBusinessId: r.ghl_business_id }]));
    } catch { /* columns not migrated yet */ }
    const accts = R(await db.execute(sql`SELECT id, club_name, club_id FROM club_accounts WHERE club_id IS NOT NULL`));
    const assets = R(await db.execute(sql`SELECT id, club_account_id, kind, display_label, preview_url, default_position, canva_design_id, canva_page_index FROM club_logo_assets`));
    const colorRows = R(await db.execute(sql`SELECT club_account_id, colors, enrichment_stage FROM club_brand_identity`));
    // Verified = a human advanced the brand identity past 'lead' (the human gate).
    const VERIFIED_STAGES = ["mockup", "design_approved", "production_ready"];
    const verifiedByAcct = new Map<string, boolean>(colorRows.map((r: any) => [r.club_account_id, VERIFIED_STAGES.includes(String(r.enrichment_stage || "lead"))]));
    const ords = R(await db.execute(sql`SELECT id, account_name, po_reference, status, club_id, club_account_id, team_id, created_at FROM orders WHERE po_reference IS NOT NULL`));
    const teamRows = R(await db.execute(sql`SELECT id, name, notes, secondary_logo_url, club_id FROM teams`));
    const acctsByClub = new Map<string, any[]>(); for (const a of accts) { const x = acctsByClub.get(a.club_id) || []; x.push(a); acctsByClub.set(a.club_id, x); }
    const assetsByAcct = new Map<string, any[]>(); for (const s of assets) { const x = assetsByAcct.get(s.club_account_id) || []; x.push(s); assetsByAcct.set(s.club_account_id, x); }
    const colorsByAcct = new Map<string, any>(colorRows.map((r: any) => [r.club_account_id, r.colors]));
    const teamsByClub = new Map<string, any[]>(); for (const t of teamRows) { const x = teamsByClub.get(t.club_id) || []; x.push(t); teamsByClub.set(t.club_id, x); }
    const ordsByTeam = new Map<string, any[]>(); for (const o of ords) { if (o.team_id) { const x = ordsByTeam.get(o.team_id) || []; x.push(o); ordsByTeam.set(o.team_id, x); } }
    const out = clubsRows.map((c: any) => {
      const cAccts = acctsByClub.get(c.id) || [];
      const rep = cAccts.find((a: any) => a.club_name === c.name) || cAccts[0] || null;
      const allAssets = cAccts.flatMap((a: any) => assetsByAcct.get(a.id) || []);
      const logos = allAssets.filter((s: any) => LOGO_KINDS.includes(s.kind)).map(mapAsset);
      const designs = allAssets.filter((s: any) => DESIGN_KINDS.includes(s.kind)).map(mapAsset);
      const colors = rep ? (colorsByAcct.get(rep.id) || null) : null;
      const primaryLogoUrl = (logos.find((l: any) => l.kind === "primary")?.previewUrl) || c.primary_logo_url || null;
      // Teams (middle level) with their LIST of orders nested: Club > Team > Orders.
      const teams = (teamsByClub.get(c.id) || []).map((t: any) => ({
        id: t.id, name: t.name, notes: t.notes, secondaryLogoUrl: t.secondary_logo_url,
        orders: (ordsByTeam.get(t.id) || [])
          .sort((a: any, b: any) => String(b.po_reference).localeCompare(String(a.po_reference)))
          .map((o: any) => ({ poRef: o.po_reference, poId: o.id, status: o.status, name: o.account_name })),
      })).sort((a: any, b: any) => a.name.localeCompare(b.name));
      const verified = rep ? !!verifiedByAcct.get(rep.id) : false;
      return { id: c.id, name: c.name, kind: c.kind, accountId: rep?.id || null, primaryLogoUrl, colors, verified, details: detailsByClub.get(c.id) || null, logos, designs, teams };
    });
    res.json({ ok: true, clubs: out });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// PUT /api/admin/clubs/:id/colours — save the COLOURS pillar (primary/secondary/
// accent hex) to the club's brand identity. Single source of truth that flows
// into the club's POs.
router.put("/clubs/:id/colours", async (req, res) => {
  try {
    const body = (req.body && req.body.colors) as { primary?: string; secondary?: string; accent?: string } | undefined;
    if (!body || typeof body !== "object") return res.status(400).json({ error: "colors required" });
    const clean = {
      primary: String(body.primary || "").trim() || null,
      secondary: String(body.secondary || "").trim() || null,
      accent: String(body.accent || "").trim() || null,
    };
    await storage.ensureClubBrandIdentity(req.params.id);
    await storage.updateClubBrandIdentity(req.params.id, { colors: clean } as any);
    res.json({ ok: true, colors: clean });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// POST /api/admin/clubs/:clubId/verify-brand — the HUMAN GATE. A person confirms
// the parent's brand identity (logos + colours) is correct; only then may free
// mockups be generated for it. Toggles the rep account's brand identity between
// 'lead' (unverified) and 'mockup' (verified-ready). :clubId is the CLUB id.
router.post("/clubs/:clubId/verify-brand", async (req, res) => {
  try {
    const verified = (req.body && req.body.verified) !== false; // default true
    const accountId = await storage.ensureRepAccountForClub(req.params.clubId);
    if (!accountId) return res.status(404).json({ error: "Club not found" });
    await storage.ensureClubBrandIdentity(accountId);
    await storage.updateClubBrandIdentity(accountId, { enrichmentStage: verified ? "mockup" : "lead" } as any);
    res.json({ ok: true, verified });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// PUT /api/admin/clubs/:id/details — save parent (Club/School) org details:
// website, delivery address, main contact, GHL business link. :id is the CLUB id.
router.put("/clubs/:id/details", async (req, res) => {
  try {
    const b = (req.body || {}) as any;
    const s = (v: any) => { const t = String(v ?? "").trim(); return t || null; };
    await db.execute(sql`UPDATE clubs SET
      website=${s(b.website)},
      delivery_address=${s(b.deliveryAddress)},
      contact_name=${s(b.contactName)},
      contact_email=${s(b.contactEmail)},
      contact_phone=${s(b.contactPhone)},
      ghl_business_id=${s(b.ghlBusinessId)},
      updated_at=now()
      WHERE id=${req.params.id}`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// GET /api/admin/clubs/ghl-search?q= — look up GHL contacts/businesses to fast-fill
// a parent's details. Returns ready-to-apply field sets. (The parent IS the GHL org.)
router.get("/clubs/ghl-search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ ok: true, results: [] });
    const { searchGhlContacts } = await import("../ghl-contacts.js");
    const { contacts } = await searchGhlContacts(q, 8);
    const results = (contacts || []).map((c: any) => {
      const name = c.name || [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.companyName || "(no name)";
      const addr = [c.address1, c.city, c.state, c.postalCode, c.country].filter(Boolean).join(", ");
      return { id: c.id, label: c.companyName && c.companyName !== name ? `${name} · ${c.companyName}` : name, website: c.website || null, deliveryAddress: addr || null, contactName: name, contactEmail: c.email || null, contactPhone: c.phone || null, ghlBusinessId: c.id };
    });
    res.json({ ok: true, results });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// Ensure a representative club_account exists for a club (so account-less parents
// can still hold brand assets). Creates a lightweight, non-login container account.
async function ensureRepAccountForClub(clubId: string): Promise<string | null> {
  const R = (r: any) => (r && r.rows) ? r.rows : (Array.isArray(r) ? r : []);
  const club = R(await db.execute(sql`SELECT id, name FROM clubs WHERE id=${clubId}`))[0];
  if (!club) return null;
  const ex = R(await db.execute(sql`SELECT id, club_name FROM club_accounts WHERE club_id=${clubId}`));
  if (ex.length) { const rep = ex.find((a: any) => a.club_name === club.name) || ex[0]; return rep.id; }
  const email = `brand-${clubId}@brand.sideline.local`;
  const hash = (await import("crypto")).randomUUID(); // non-login placeholder
  const ins = R(await db.execute(sql`INSERT INTO club_accounts (club_id, email, password_hash, club_name, profit_share_tier_bps) VALUES (${clubId}, ${email}, ${hash}, ${club.name}, 800) ON CONFLICT (email) DO UPDATE SET club_id=${clubId} RETURNING id`))[0];
  return ins?.id || null;
}

// POST /api/admin/clubs/:clubId/ensure-account — resolve/create the parent's
// asset-container account; returns its id so any parent can take logo/design uploads.
router.post("/clubs/:clubId/ensure-account", async (req, res) => {
  try {
    const accountId = await ensureRepAccountForClub(req.params.clubId);
    if (!accountId) return res.status(404).json({ error: "Club not found" });
    res.json({ ok: true, accountId });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// POST /api/admin/clubs/:clubId/fetch-brand — read the parent's website and return
// LOGO CANDIDATES (apple-touch-icon / favicon / og:image). Suggestions only, no save.
router.post("/clubs/:clubId/fetch-brand", async (req, res) => {
  try {
    const R = (r: any) => (r && r.rows) ? r.rows : (Array.isArray(r) ? r : []);
    const club = R(await db.execute(sql`SELECT website FROM clubs WHERE id=${req.params.clubId}`))[0];
    let url = String(club?.website || "").trim();
    if (!url) return res.json({ ok: true, candidates: [], note: "No website set on this parent." });
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const abs = (u: string, base: string) => { try { return new URL(u, base).href; } catch { return u; } };
    const pick = (html: string, re: RegExp) => { const m = html.match(re); return m ? m[1] : null; };
    let r: Response;
    try { r = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 Sideline/brand" }, signal: AbortSignal.timeout(12000) }); }
    catch (e: any) { return res.json({ ok: true, candidates: [], note: `Could not reach ${url} (${String(e?.message || e).slice(0, 60)})` }); }
    if (!r.ok) return res.json({ ok: true, candidates: [], note: `Site returned HTTP ${r.status}` });
    const base = r.url; const html = (await r.text()).slice(0, 200000);
    const apple = pick(html, /<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i) || pick(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*apple-touch-icon/i);
    const og = pick(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    const icon = pick(html, /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i) || pick(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i);
    const cands: any[] = [];
    const add = (u: string | null, source: string) => { if (!u) return; const full = abs(u, base); if (!cands.some((c) => c.url === full)) cands.push({ url: full, source, likelyLogo: /logo|crest|badge/i.test(full) }); };
    // og:image first when it looks like a logo (NZ sporty.co.nz clubs expose og:image=logo.png), then the icons
    if (og && /logo|crest|badge/i.test(og)) add(og, "og:image (logo)");
    add(apple, "apple-touch-icon");
    add(og, "og:image");
    add(icon, "favicon");
    // Brand COLOURS — extract from the best logo candidate (the crest's colours are
    // the kit colours; far better than the site's generic theme-color). Gemini vision.
    // Brand COLOURS from the WEBSITE itself — the page CSS (inline + <style> +
    // linked stylesheets). Rank by usage; drop white/black/greys (template noise).
    let css = html;
    const sheetRe = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi;
    const sheets: string[] = []; let sm: RegExpExecArray | null;
    while ((sm = sheetRe.exec(html)) !== null && sheets.length < 3) sheets.push(abs(sm[1], base));
    for (const href of sheets) { try { const cr = await fetch(href, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0 Sideline/brand" } }); if (cr.ok) css += "\n" + (await cr.text()).slice(0, 300000); } catch { /* skip */ } }
    const counts = new Map<string, number>();
    const norm = (h: string) => (h.length === 4 ? "#" + h.slice(1).split("").map((c) => c + c).join("") : h).toLowerCase();
    const hexRe = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g; let hm: RegExpExecArray | null;
    while ((hm = hexRe.exec(css)) !== null) { const h = norm(hm[0]); counts.set(h, (counts.get(h) || 0) + 1); }
    const rgbRe = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g; let rm: RegExpExecArray | null;
    while ((rm = rgbRe.exec(css)) !== null) { const h = "#" + [1, 2, 3].map((i) => Math.min(255, +rm![i]).toString(16).padStart(2, "0")).join(""); counts.set(h, (counts.get(h) || 0) + 1); }
    const isBrand = (h: string) => { const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx > 238 && mn > 238) return false; if (mx < 22) return false; if (mx - mn < 18) return false; return true; };
    let colors: any[] = Array.from(counts.entries()).filter((e) => isBrand(e[0])).sort((a, b) => b[1] - a[1]).slice(0, 6).map((e) => ({ hex: e[0].toUpperCase(), source: "website css", count: e[1] }));
    // Fallback: if the site CSS yielded nothing usable, derive colours from the logo.
    if (colors.length === 0) {
      const logoForColours = cands.find((c) => c.likelyLogo) || cands[0];
      if (logoForColours) { try { const { extractColorsFromImage } = await import("../mockup/color-extract.js"); const ex = await extractColorsFromImage(logoForColours.url); if (ex) colors = ex.map((c: any) => ({ hex: c.hex, name: c.name, pms: c.pms, source: "logo" })); } catch { /* */ } }
    }
    res.json({ ok: true, candidates: cands, colors, site: base });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// DELETE /api/admin/clubs/:id — remove a parent (Club/School) from Brand Identity.
// NON-destructive to POs: unlinks orders (club_id/team_id -> NULL) and accounts,
// deletes the club's teams, then the club. Orders + accounts survive (re-parent later).
router.delete("/clubs/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await db.execute(sql`UPDATE orders SET team_id=NULL WHERE team_id IN (SELECT id FROM teams WHERE club_id=${id})`);
    await db.execute(sql`UPDATE orders SET club_id=NULL WHERE club_id=${id}`);
    await db.execute(sql`UPDATE club_accounts SET club_id=NULL WHERE club_id=${id}`);
    await db.execute(sql`DELETE FROM teams WHERE club_id=${id}`);
    await db.execute(sql`DELETE FROM clubs WHERE id=${id}`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// GET /api/admin/orders/populate-status — EVERY live PO (club or standalone) with
// its populate gaps (logos / sizes / fabric / branding). The bulk worklist: see
// every PO that needs work in one place, including non-club orders.
router.get("/orders/populate-status", async (_req, res) => {
  try {
    const R = (r: any) => (r && r.rows) ? r.rows : (Array.isArray(r) ? r : []);
    const arr = (e: any) => { try { const a = typeof e === "string" ? JSON.parse(e || "[]") : (e || []); return Array.isArray(a) ? a : []; } catch { return []; } };
    const os = R(await db.execute(sql`SELECT id, po_reference, account_name, status, club_account_id, production_stage, pipeline_stage FROM orders WHERE po_reference IS NOT NULL ORDER BY po_reference DESC`));
    // Resolve each order's CLUB — FULLY OPTIONAL. Tolerate a DB that doesn't have
    // the clubs table / club_id columns yet: just skip grouping, never 500 the
    // whole worklist. (club_id is queried separately, not in the orders SELECT.)
    let clubFor = (_o: any): string | null => null;
    try {
      const orderClub = new Map<string, string>(R(await db.execute(sql`SELECT id, club_id FROM orders WHERE club_id IS NOT NULL`)).map((r: any) => [r.id, r.club_id]));
      const allClubs = R(await db.execute(sql`SELECT id, name FROM clubs`));
      const clubNameById = new Map<string, string>(allClubs.map((c: any) => [c.id, c.name]));
      const caClub = new Map<string, string>(R(await db.execute(sql`SELECT id, club_id FROM club_accounts WHERE club_id IS NOT NULL`)).map((r: any) => [r.id, r.club_id]));
      clubFor = (o: any) => { const cid = orderClub.get(o.id) || (o.club_account_id ? caClub.get(o.club_account_id) : null); return cid ? (clubNameById.get(cid) || null) : null; };
    } catch (e: any) { console.warn("[populate-status] club grouping unavailable:", e?.message); }
    const dead = (o: any) => /deliver|complete|cancel/i.test(String(o.production_stage || "")) || /deliver|complete|cancel/i.test(String(o.pipeline_stage || ""));
    const live = os.filter((o: any) => !dead(o));
    const pos: any[] = [];
    for (const o of live) {
      const its = R(await db.execute(sql`SELECT id, product_type, material, branding_method, quantity, element_urls FROM order_items WHERE order_id=${o.id}`));
      const n = its.length;
      // Equipment (balls/cones/bags/towels/bottles/socks) never gets a club logo
      // by design (attach-logo skips it), so it must NOT count against the logo
      // denominator or a mixed PO reads "incomplete" forever.
      const isNonGarment = (pt?: string | null) => /(^|[-_ ])(balls?|cones?|backpacks?|bags?|towels?|bottles?|socks?)$/i.test((pt || "").toLowerCase());
      const garmentN = its.filter((it: any) => !isNonGarment(it.product_type)).length;
      let logos = 0, sized = 0, fab = 0, brand = 0;
      for (const it of its) {
        if (!isNonGarment(it.product_type) && arr(it.element_urls).some((e: any) => e?.url && !String(e?.name || "").toLowerCase().includes("sideline"))) logos++;
        const sb = R(await db.execute(sql`SELECT COALESCE(SUM(quantity),0) s FROM order_size_breakdowns WHERE order_item_id=${it.id}`))[0];
        if (Number(sb?.s) > 0 && Number(sb.s) === Number(it.quantity)) sized++;
        if (String(it.material || "").trim()) fab++;
        if (String(it.branding_method || "").trim()) brand++;
      }
      const mk = R(await db.execute(sql`SELECT count(*)::int c FROM design_files WHERE order_id=${o.id} AND folder='mockups'`))[0];
      const mockups = Number(mk?.c || 0);
      const needs: string[] = [];
      if (logos < garmentN) needs.push("logos");
      if (sized < n) needs.push("sizes");
      if (fab < n) needs.push("fabric");
      if (brand < n) needs.push("branding");
      pos.push({ id: o.id, poReference: o.po_reference, accountName: o.account_name, clubName: clubFor(o), status: o.status, clubAccountId: o.club_account_id, itemCount: n, logos, sized, fabric: fab, branding: brand, mockups, needs, complete: needs.length === 0 });
    }
    res.json({ ok: true, pos });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// POST /api/admin/clubs/:id/apply-logos-to-current-po — push the club's logos
// onto its current (latest) PO's garment items: the primary logo at its
// placement + the Sideline maker's mark. Idempotent + additive — never emails or
// re-dispatches, just makes the live order carry the uploaded logos.
router.post("/clubs/:id/apply-logos-to-current-po", async (req, res) => {
  try {
    const clubId = req.params.id;
    const order = await storage.getClubOrder(clubId);
    if (!order) return res.status(404).json({ error: "No PO found for this club yet" });
    const primary = await storage.getPrimaryClubLogo(clubId);
    if (!primary || !primary.previewUrl) return res.status(400).json({ error: "No primary logo on file — upload one first" });

    const items = await storage.getOrderItems(order.id);
    const SIDELINE_LOGO_URL = "https://quote.sidelinenz.com/sideline-assets/sideline-logo.png";
    const markPosition = (pt?: string | null): string | null => {
      const t = (pt || "").toLowerCase();
      if (/(^|-)(ball|cones?|backpack|bag|towel|bottle|socks?)$/.test(t)) return null;
      if (/cap|bucket/.test(t)) return "Center Back";
      if (/beanie/.test(t)) return "Front Pocket";
      if (/scarf/.test(t)) return "Bottom";
      if (/short|pant|trouser|skort|skirt|spank|brief/.test(t)) return "Bottom";
      return "Right Chest";
    };

    let updated = 0;
    for (const item of items) {
      const existing = ((item as any).elementUrls as any[] | null) ?? [];
      const next = [...existing];
      let changed = false;
      // Per-asset check: add the PRIMARY iff the primary specifically is absent.
      // (The old coarse "has any non-sideline mark" test skipped the primary
      // whenever a sponsor was already on the item.)
      const hasPrimary = next.some((e) => e?.url && primary.previewUrl && e.url === primary.previewUrl);
      if (!hasPrimary) {
        const pl = clubLogoPlacement((item as any).productType, primary as any);
        next.push({ name: primary.displayLabel || "Club Logo", url: primary.previewUrl, position: pl.position, application: pl.application });
        changed = true;
      }
      const pos = markPosition((item as any).productType);
      if (pos && !next.some((e) => String(e?.name || "").toLowerCase().includes("sideline"))) {
        next.push({ name: "Sideline", url: SIDELINE_LOGO_URL, position: pos, application: (item as any).brandingMethod || "Embroidery", sizeMm: "60 mm", note: "Sideline maker's mark (auto)" });
        changed = true;
      }
      if (changed) { await db.update(orderItems).set({ elementUrls: next as any }).where(eq(orderItems.id, item.id)); updated += 1; }
    }
    await storage.logOrderActivity({ orderId: order.id, action: "logos_applied_from_club", details: { itemsUpdated: updated, primaryLogoAssetId: primary.id } } as any).catch(() => {});
    res.json({ ok: true, poReference: order.poReference, orderId: order.id, itemsUpdated: updated });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// POST /api/admin/orders/:id/attach-logo — attach an uploaded logo URL to an
// order's garment items (Left Chest), works for ANY PO incl. standalone ones.
// Lets the worklist populate a logo on a PO directly. Idempotent.
router.post("/orders/:id/attach-logo", async (req, res) => {
  try {
    const imageUrl = (req.body && req.body.imageUrl) as string | undefined;
    if (!imageUrl) return res.status(400).json({ error: "imageUrl required" });
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const items = await storage.getOrderItems(order.id);
    const arr = (e: any) => { try { const a = typeof e === "string" ? JSON.parse(e || "[]") : (e || []); return Array.isArray(a) ? a : []; } catch { return []; } };
    const isNonGarment = (pt?: string | null) => /(^|[-_ ])(balls?|cones?|backpacks?|bags?|towels?|bottles?|socks?)$/i.test((pt || "").toLowerCase());
    let updated = 0;
    for (const it of items) {
      if (isNonGarment((it as any).productType)) continue;
      const existing = arr((it as any).elementUrls);
      if (existing.some((e: any) => e?.url && !String(e?.name || "").toLowerCase().includes("sideline"))) continue;
      const pl = clubLogoPlacement((it as any).productType);
      const next = [...existing, { name: "Logo", url: imageUrl, position: pl.position, application: pl.application }];
      await db.update(orderItems).set({ elementUrls: next as any }).where(eq(orderItems.id, it.id));
      updated += 1;
    }
    // Sync the logo asset into the PO's Drive folder (create the folder if needed).
    const logoFolderId = await ensureOrderDriveFolder(order);
    if (logoFolderId) {
      mirrorBlobToPoFolder({
        poFolderId: logoFolderId, slot: "logos", blobUrl: imageUrl,
        fileName: (imageUrl.split("/").pop()?.split("?")[0]) || "logo.png", orderId: order.id,
      }).catch((err) => console.error("[attach-logo] Drive mirror failed:", err));
    }
    await storage.logOrderActivity({ orderId: order.id, action: "logo_attached_to_order", details: { itemsUpdated: updated, url: imageUrl } } as any).catch(() => {});
    res.json({ ok: true, poReference: order.poReference, itemsUpdated: updated });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// POST /api/admin/orders/:id/mockup — admin attaches a front/back mockup image
// onto a PO (uploaded via /api/uploads/blob). Stored as a design_file
// (folder='mockups') so it shows on the approval form + production sheet.
router.post("/orders/:id/mockup", async (req, res) => {
  try {
    const { imageUrl, label, fileName, mimeType } = req.body as { imageUrl?: string; label?: string; fileName?: string; mimeType?: string };
    if (!imageUrl) return res.status(400).json({ error: "imageUrl required" });
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const [df] = await db.insert(designFiles).values({
      orderId: order.id, userId,
      label: label || "mockup", folder: "mockups",
      fileName: fileName || "mockup", fileUrl: imageUrl, mimeType: mimeType || "image/png",
    } as any).returning();
    // Sync the mockup into the PO's Drive folder (create the folder if needed).
    const mockupFolderId = await ensureOrderDriveFolder(order);
    if (mockupFolderId) {
      mirrorBlobToPoFolder({
        poFolderId: mockupFolderId, slot: "mockups", blobUrl: imageUrl,
        fileName: fileName || `${order.poReference || "mockup"}.png`, orderId: order.id,
      }).catch((err) => console.error("[mockup-upload] Drive mirror failed:", err));
    }
    await storage.logOrderActivity({ orderId: order.id, userId, action: "mockup_uploaded", details: { label: label || "mockup", fileId: df.id } } as any).catch(() => {});
    res.json({ ok: true, id: df.id, poReference: order.poReference });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// ---- In-app AI worker (Phase 1: name-asset) ----
//
// POST /ai/name-asset
//   body: { assetUrl, context: { orderId?, clubAccountId?, productHint?, side? } }
//   returns: { canonicalName, confidence, reasoning }
//   Pure suggestion endpoint — does not persist. UI calls
//   PATCH /designs/:id/canonical-name on accept.
const nameAssetSchema = z.object({
  assetUrl: z.string().url(),
  context: z
    .object({
      orderId: z.string().optional(),
      clubAccountId: z.string().optional(),
      clubName: z.string().max(80).optional(),
      productHint: z.string().max(80).optional(),
      side: z.enum(["front", "back"]).optional(),
    })
    .default({}),
});

// Unpack the AggregateError shape that postgres-js throws on Neon timeouts
// into something a human can act on (the default toString is just
// "AggregateError" which is useless).
function describeError(err: any): string {
  if (err?.errors && Array.isArray(err.errors) && err.errors.length) {
    const first = err.errors[0];
    return `${err.name || "Error"}: ${first?.message || first?.code || String(first)}`;
  }
  return String(err?.message || err);
}

router.post("/ai/name-asset", async (req, res) => {
  try {
    const body = nameAssetSchema.parse(req.body ?? {});
    const userId = (req as any).user?.userId as string | undefined;
    const result = await runAiTask({
      taskName: "name-asset",
      input: { assetUrl: body.assetUrl, context: body.context, userId },
    });
    res.json(result);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid data", details: err.errors });
    }
    console.error("Admin ai/name-asset error:", err);
    res.status(500).json({ error: describeError(err) });
  }
});

// ---- Ezra copilot chat (Phase A) ----
//
// POST /ai/chat — single chat turn. Returns the full assistant response
// (non-streaming for Phase A; SSE is a planned upgrade). Tool calls happen
// inside the runner; each is persisted as a message row so the conversation
// IS the audit trail.
const chatSchema = z.object({
  message: z.string().min(1).max(8000),
  conversationId: z.string().optional(),
  scopeKind: z.enum(["order", "club", "global"]).optional(),
  scopeId: z.string().optional(),
});

router.post("/ai/chat", async (req, res) => {
  try {
    const body = chatSchema.parse(req.body ?? {});
    const userId = (req as any).user?.userId as string;
    if (!userId) return res.status(401).json({ error: "no_user" });

    let conversationId = body.conversationId;
    if (!conversationId) {
      const conv = await getOrCreateConversation({
        userId,
        channel: "web",
        scopeKind: body.scopeKind || "global",
        scopeId: body.scopeId,
      });
      conversationId = conv.id;
    }

    const result = await runChatTurn({ conversationId, userId, message: body.message });
    res.json(result);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin ai/chat error:", err);
    res.status(500).json({ error: describeError(err) });
  }
});

// GET /ai/conversations — list the caller's conversations (most recent first).
router.get("/ai/conversations", async (req, res) => {
  try {
    const userId = (req as any).user?.userId as string;
    if (!userId) return res.status(401).json({ error: "no_user" });
    const list = await listConversations(userId);
    res.json({ conversations: list });
  } catch (err: any) {
    res.status(500).json({ error: describeError(err) });
  }
});

// GET /ai/conversations/:id/messages — load the messages for a conversation.
router.get("/ai/conversations/:id/messages", async (req, res) => {
  try {
    const userId = (req as any).user?.userId as string;
    if (!userId) return res.status(401).json({ error: "no_user" });
    // Defence in depth: confirm the conversation belongs to this caller before
    // returning messages. (Service-token sessions bypass this — same pattern
    // as the rest of the admin routes.)
    const { ezraConversations } = await import("@shared/schema");
    const { eq: eqOp, and: andOp } = await import("drizzle-orm");
    const [conv] = await db.select().from(ezraConversations).where(andOp(eqOp(ezraConversations.id, req.params.id), eqOp(ezraConversations.userId, userId))).limit(1);
    if (!conv) {
      // Allow service-token (admin) sessions to read any conversation.
      if ((req as any).user?.userId?.startsWith("service:")) {
        // fall through
      } else {
        return res.status(404).json({ error: "not_found" });
      }
    }
    const messages = await listMessages(req.params.id);
    res.json({ conversation: conv, messages });
  } catch (err: any) {
    res.status(500).json({ error: describeError(err) });
  }
});

// GET /ai/tools — list the tools currently available to Ezra (for the UI
// to show what it can do).
router.get("/ai/tools", async (_req, res) => {
  res.json({ tools: EZRA_TOOLS_AVAILABLE });
});

// GET /ai/lookups — clubs + products for the AI page dropdowns. One call,
// 30s cache on the client (react-query default). Skips per-keystroke DB hits
// when the operator is using the worker repeatedly.
router.get("/ai/lookups", async (_req, res) => {
  try {
    const { desc } = await import("drizzle-orm");
    const clubs = await db
      .select({ id: clubAccounts.id, name: clubAccounts.clubName, tag: clubAccounts.shopifyOrderTag })
      .from(clubAccounts)
      .orderBy(clubAccounts.clubName);
    const products = SIDELINE_PRODUCTS.map((p) => ({ id: p.id, name: p.name, category: p.category }));
    res.json({ clubs, products });
  } catch (err: any) {
    console.error("Admin ai/lookups error:", err);
    res.status(500).json({ error: describeError(err) });
  }
});

// PATCH /designs/:id/canonical-name — admin applies a proposed canonical name.
const updateCanonicalNameSchema = z.object({
  canonicalName: z.string().min(1).max(200),
});

router.patch("/designs/:id/canonical-name", async (req, res) => {
  try {
    const { canonicalName } = updateCanonicalNameSchema.parse(req.body ?? {});
    const [updated] = await db
      .update(designFiles)
      .set({ canonicalName })
      .where(eq(designFiles.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Design file not found" });
    res.json({ ok: true, canonicalName: updated.canonicalName });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid data", details: err.errors });
    }
    console.error("Admin update canonical-name error:", err);
    res.status(500).json({ error: "Failed to update canonical name" });
  }
});

export default router;
