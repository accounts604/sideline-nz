// Supplier portal API.
//
// All routes here require `role = supplier` (enforced via requireSupplier).
// Every data read is scoped to orders where `assignedSupplierId === req.user.userId`,
// so a supplier can only see orders explicitly assigned to them. Never return
// pricing, internal admin notes, or files outside the `tech-pack` folder.
//
// Two action endpoints write to orderActivity but do NOT advance the GHL stage
// themselves — the admin confirms delivery (or a separate workflow step does)
// and that's what pushes the stage to "Delivered" via updateGhlOpportunityStage.
// Keeping supplier actions as micro-states inside the "PO Raised → Delivered"
// span means the supplier can't accidentally move the pipeline.

import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireSupplier } from "../auth";
import type { JwtPayload } from "../auth";
import { db } from "../db";
import { orderActivity } from "@shared/schema";
import { linkOrdersToShipment, findOrdersByPoReferences } from "../shipments";

const router = Router();

// All supplier routes require supplier authentication
router.use(requireSupplier);

// Helper — fetch an order that is assigned to the current supplier.
// Returns undefined if the order doesn't exist OR isn't assigned to this supplier.
async function getSupplierOrder(orderId: string, supplierId: string) {
  const order = await storage.getOrder(orderId);
  if (!order || order.assignedSupplierId !== supplierId) return undefined;
  return order;
}

// GET /me — current supplier profile (mirrors /api/auth/me but scoped)
router.get("/me", async (req, res) => {
  try {
    const { userId } = (req as any).user as JwtPayload;
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      supplierName: user.teamName, // users.teamName holds the supplier org name for suppliers
    });
  } catch (e: any) {
    console.error("Supplier me error:", e);
    res.status(500).json({ error: "Failed to load supplier profile" });
  }
});

// GET /orders — list all orders assigned to the current supplier
router.get("/orders", async (req, res) => {
  try {
    const { userId } = (req as any).user as JwtPayload;
    const orders = await storage.getOrdersByAssignedSupplier(userId);
    // Strip pricing and internal-only fields from the list view. Payment
    // status (date only, not the amount) is exposed so the supplier sees the
    // "Paid ✓" chip on their dashboard — saves them asking "did you get the
    // invoice / has payment cleared?"
    const safe = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      poReference: o.poReference,
      accountName: o.accountName,
      customerName: o.customerName,
      pipelineStage: o.pipelineStage,
      deliveryAddress: o.deliveryAddress,
      deliveryAttention: o.deliveryAttention,
      supplierInvoicePaidAt: o.supplierInvoicePaidAt,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    }));
    res.json({ orders: safe });
  } catch (e: any) {
    console.error("Supplier orders list error:", e);
    res.status(500).json({ error: "Failed to load orders" });
  }
});

// GET /orders/:id — order detail (tech-pack files only, no pricing)
router.get("/orders/:id", async (req, res) => {
  try {
    const { userId } = (req as any).user as JwtPayload;
    const order = await getSupplierOrder(req.params.id, userId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Fetch design files and filter to tech-pack folder only
    const allFiles = await storage.getDesignFilesByOrder(order.id);
    const techPackFiles = allFiles
      .filter((f) => f.folder === "tech-pack")
      .map((f) => ({
        id: f.id,
        fileName: f.fileName,
        fileUrl: f.fileUrl,
        fileSize: f.fileSize,
        mimeType: f.mimeType,
        label: f.label,
        createdAt: f.createdAt,
      }));

    // Fetch order items (garment lines) — suppliers need to see what to produce
    const items = order.id ? await storage.getOrderItems(order.id) : [];
    const safeItems = items.map((i) => ({
      id: i.id,
      productName: i.productName,
      productType: i.productType,
      material: i.material,
      quantity: i.quantity,
      size: i.size,
      productColors: i.productColors,
      brandingMethod: i.brandingMethod,
      designNotes: i.designNotes,
      designBrief: i.designBrief,
      sizeChartType: i.sizeChartType,
      frontDesignUrl: i.frontDesignUrl,
      backDesignUrl: i.backDesignUrl,
      elementUrls: i.elementUrls,
      // NO unitAmount — supplier never sees pricing
    }));

    res.json({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        poReference: order.poReference,
        accountName: order.accountName,
        customerName: order.customerName,
        customerFirstName: order.customerFirstName,
        customerLastName: order.customerLastName,
        pipelineStage: order.pipelineStage,
        dueDate: order.dueDate,
        driveFolderUrl: order.driveFolderUrl,
        deliveryAddress: order.deliveryAddress,
        deliveryAttention: order.deliveryAttention,
        deliveryPhone: order.deliveryPhone,
        poComments: order.poComments,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        // NO pricing (total, subtotal) — supplier never sees cost
      },
      items: safeItems,
      files: techPackFiles,
    });
  } catch (e: any) {
    console.error("Supplier order detail error:", e);
    res.status(500).json({ error: "Failed to load order" });
  }
});

// POST /orders/:id/files-received — supplier acknowledges receipt of tech-pack
// Writes an activity log row only. Does NOT change pipelineStage.
router.post("/orders/:id/files-received", async (req, res) => {
  try {
    const { userId } = (req as any).user as JwtPayload;
    const order = await getSupplierOrder(req.params.id, userId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    await db.insert(orderActivity).values({
      orderId: order.id,
      userId,
      action: "supplier_files_received",
      details: {
        source: "supplier_portal",
        supplierId: userId,
      },
    });

    res.json({ ok: true });
  } catch (e: any) {
    console.error("Supplier files-received error:", e);
    res.status(500).json({ error: "Failed to record action" });
  }
});

// POST /orders/:id/dispatched — supplier marks the production batch as dispatched
// Writes an activity log row. Admin (or a separate workflow) confirms receipt
// to advance the GHL stage to "Delivered".
const dispatchedSchema = z.object({
  trackingNumber: z.string().optional(),
  trackingUrl: z.string().url().optional(),
  notes: z.string().optional(),
  // DHL waybill capture (the reliable anchor). `waybill` defaults to
  // trackingNumber if omitted. `poReferences` lets the supplier flag OTHER POs
  // consolidated onto the same waybill — only those also assigned to this
  // supplier are linked; the rest are silently skipped (no existence leak).
  waybill: z.string().min(3).optional(),
  poReferences: z.array(z.string()).optional(),
  parcels: z
    .array(
      z.object({
        pieceId: z.string().optional(),
        description: z.string().optional(),
        declaredItems: z
          .array(z.object({ productName: z.string().optional(), size: z.string().nullish(), qty: z.number().optional() }))
          .optional(),
        weightGrams: z.number().int().optional(),
      }),
    )
    .optional(),
});

// GET /orders/:id/stages — production stages for this order (supplier-scoped)
router.get("/orders/:id/stages", async (req, res) => {
  try {
    const { userId } = (req as any).user as JwtPayload;
    const order = await getSupplierOrder(req.params.id, userId);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const stages = await storage.getProductionStages(order.id);
    res.json({ stages });
  } catch (e: any) {
    console.error("Supplier stages error:", e);
    res.status(500).json({ error: "Failed to load stages" });
  }
});

// POST /orders/:id/stages/:stageId/complete — supplier marks a stage as
// completed. The stage must belong to this order. Notes/photoUrl optional.
const completeStageSchema = z.object({
  notes: z.string().max(2000).optional(),
  photoUrl: z.string().url().optional(),
});

router.post("/orders/:id/stages/:stageId/complete", async (req, res) => {
  try {
    const { userId } = (req as any).user as JwtPayload;
    const order = await getSupplierOrder(req.params.id, userId);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const parsed = completeStageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid payload" });

    // Verify the stage belongs to this order before updating.
    const stages = await storage.getProductionStages(order.id);
    const target = stages.find((s) => s.id === req.params.stageId);
    if (!target) return res.status(404).json({ error: "Stage not found on this order" });

    const now = new Date();
    await storage.updateProductionStage(target.id, {
      status: "completed",
      completedAt: now,
      completedBy: userId,
      notes: parsed.data.notes ?? target.notes,
    });

    // Auto-advance the next stage to in_progress (mirrors the admin advance flow)
    const idx = stages.findIndex((s) => s.id === target.id);
    if (idx >= 0 && idx < stages.length - 1) {
      const next = stages[idx + 1];
      if (next.status === "pending") {
        await storage.updateProductionStage(next.id, { status: "in_progress", enteredAt: now });
        await storage.updateOrder(order.id, { productionStage: next.stage } as any);
      }
    }

    await db.insert(orderActivity).values({
      orderId: order.id,
      userId,
      action: "supplier_stage_completed",
      details: {
        source: "supplier_portal",
        stage: target.stage,
        stageId: target.id,
        notes: parsed.data.notes,
        photoUrl: parsed.data.photoUrl,
      },
    });

    res.json({ ok: true, stage: target.stage });
  } catch (e: any) {
    console.error("Supplier complete stage error:", e);
    res.status(500).json({ error: "Failed to mark stage complete" });
  }
});

router.post("/orders/:id/dispatched", async (req, res) => {
  try {
    const { userId } = (req as any).user as JwtPayload;
    const order = await getSupplierOrder(req.params.id, userId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const parsed = dispatchedSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid payload" });
    }

    await db.insert(orderActivity).values({
      orderId: order.id,
      userId,
      action: "supplier_dispatched",
      details: {
        source: "supplier_portal",
        supplierId: userId,
        trackingNumber: parsed.data.trackingNumber,
        trackingUrl: parsed.data.trackingUrl,
        notes: parsed.data.notes,
      },
    });

    // Capture the DHL waybill → PO link (the reliable anchor). Link this order
    // plus any consolidated POs the supplier flagged that are also theirs.
    const waybill = parsed.data.waybill || parsed.data.trackingNumber;
    let shipment: { linkedOrderIds: string[] } | undefined;
    if (waybill) {
      const extra = await findOrdersByPoReferences(parsed.data.poReferences ?? [], { assignedSupplierId: userId });
      const orderIds = Array.from(new Set([order.id, ...extra.orders.map((o) => o.id)]));
      const result = await linkOrdersToShipment({
        waybill,
        orderIds,
        source: "supplier",
        linkSource: "supplier",
        parcels: parsed.data.parcels,
        userId,
      });
      shipment = { linkedOrderIds: result.linkedOrderIds };
    }

    res.json({ ok: true, shipment });
  } catch (e: any) {
    console.error("Supplier dispatched error:", e);
    res.status(500).json({ error: "Failed to record action" });
  }
});

export default router;
