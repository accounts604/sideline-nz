import { Router } from "express";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { hashPassword } from "../auth";
import { z } from "zod";
import { notifyDesignApproved, notifyDesignRejected, notifyOrderStatusChange } from "../notifications";
import { sendInviteEmail, sendSupplierPoRaisedEmail } from "../email";
import { db } from "../db";
import { orders, orderActivity, designFiles } from "@shared/schema";
import { eq } from "drizzle-orm";
import { updateGhlOpportunityStage } from "./ghl";
import { createApprovalToken } from "./approvals";

const router = Router();

// All admin routes require admin authentication
router.use(requireAdmin);

// GET /dashboard — stats
router.get("/dashboard", async (_req, res) => {
  try {
    const stats = await storage.getDashboardStats();
    res.json(stats);
  } catch (err) {
    console.error("Admin dashboard error:", err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

// GET /orders — all orders, filterable/paginated
router.get("/orders", async (req, res) => {
  try {
    const { status, designStatus, search, limit, offset } = req.query;
    const result = await storage.getAllOrders({
      status: status as string | undefined,
      designStatus: designStatus as string | undefined,
      search: search as string | undefined,
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
    res.json(result);
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
  poReference: z.string().optional(),
  accountName: z.string().optional(),
  isRepeatOrder: z.boolean().optional(),
  poComments: z.string().optional(),
  deliveryAttention: z.string().optional(),
  deliveryAddress: z.string().optional(),
  deliveryEmail: z.string().optional(),
  deliveryPhone: z.string().optional(),
});

router.patch("/orders/:id", async (req, res) => {
  try {
    const data = updateOrderSchema.parse(req.body);
    const oldOrder = await storage.getOrder(req.params.id);
    const order = await storage.updateOrder(req.params.id, data);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Notify customer on status change
    if (data.status && data.status !== oldOrder?.status && order.userId) {
      notifyOrderStatusChange({
        userId: order.userId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        newStatus: data.status,
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
    res.json(customer);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin update customer error:", err);
    res.status(500).json({ error: "Failed to update customer" });
  }
});

// POST /customers/invite — create account + invite link
const inviteSchema = z.object({
  email: z.string().email(),
  teamName: z.string().optional(),
});

router.post("/customers/invite", async (req, res) => {
  try {
    const { email, teamName } = inviteSchema.parse(req.body);

    // Check if email already exists
    const existing = await storage.getUserByEmail(email);
    if (existing) return res.status(409).json({ error: "An account with this email already exists" });

    const user = await storage.createInvite(email, teamName);

    // Send invite email
    if (user.inviteToken) {
      sendInviteEmail(email, user.inviteToken, teamName).catch(err =>
        console.error("Failed to send invite email:", err)
      );
    }

    res.status(201).json({
      id: user.id,
      email: user.email,
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
  productColors: z.array(z.object({ hex: z.string(), name: z.string().optional() })).optional(),
  brandingMethod: z.string().optional(),
  frontDesignUrl: z.string().optional(),
  backDesignUrl: z.string().optional(),
  elementUrls: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
  gradeGroup: z.string().optional(),
  designNotes: z.string().optional(),
});

router.patch("/orders/:id/items/:itemId", async (req, res) => {
  try {
    const data = updateItemSchema.parse(req.body);
    const user = (req as any).user;
    const updated = await storage.updateOrderItem(req.params.itemId, data);
    if (!updated) return res.status(404).json({ error: "Item not found" });

    await storage.logOrderActivity({
      orderId: req.params.id,
      userId: user.userId,
      action: "item_updated",
      details: { itemId: req.params.itemId, fields: Object.keys(data) },
    });

    res.json(updated);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin update item error:", err);
    res.status(500).json({ error: "Failed to update item" });
  }
});

// POST /orders/create-po — create a new purchase order from scratch (admin-initiated)
const createPoSchema = z.object({
  storeSlug: z.string(),
  customerEmail: z.string().email().optional(),
  customerName: z.string().optional(),
  poReference: z.string(),
  accountName: z.string().optional(),
  isRepeatOrder: z.boolean().optional(),
  poComments: z.string().optional(),
  deliveryAttention: z.string().optional(),
  deliveryAddress: z.string().optional(),
  deliveryEmail: z.string().optional(),
  deliveryPhone: z.string().optional(),
  items: z.array(z.object({
    productName: z.string(),
    quantity: z.number().int().min(1),
    unitAmount: z.number().int().min(0),
    gradeGroup: z.string().optional(),
    brandingMethod: z.string().optional(),
  })).min(1),
});

router.post("/orders/create-po", async (req, res) => {
  try {
    const data = createPoSchema.parse(req.body);
    const user = (req as any).user;

    // Generate PO number
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
    const orderNumber = `SNZ-${ts}-${rand}`;

    // Calculate totals
    const subtotal = data.items.reduce((sum, i) => sum + (i.unitAmount * i.quantity), 0);

    // Create order
    const order = await storage.createOrder({
      orderNumber,
      storeSlug: data.storeSlug,
      status: "processing",
      subtotal,
      total: subtotal,
      currency: "nzd",
      customerEmail: data.customerEmail ?? null,
      customerName: data.customerName ?? null,
      poReference: data.poReference,
      accountName: data.accountName ?? null,
      isRepeatOrder: data.isRepeatOrder ?? false,
      poComments: data.poComments ?? null,
      deliveryAttention: data.deliveryAttention ?? null,
      deliveryAddress: data.deliveryAddress ?? null,
      deliveryEmail: data.deliveryEmail ?? null,
      deliveryPhone: data.deliveryPhone ?? null,
    } as any);

    // Create order items
    for (const item of data.items) {
      await storage.createOrderItem({
        orderId: order.id,
        productId: "manual",
        priceId: "manual",
        productName: item.productName,
        quantity: item.quantity,
        unitAmount: item.unitAmount,
        currency: "nzd",
        gradeGroup: item.gradeGroup ?? null,
        brandingMethod: item.brandingMethod ?? null,
      } as any);
    }

    // Link to customer if email matches
    if (data.customerEmail) {
      const customer = await storage.getUserByEmail(data.customerEmail);
      if (customer) {
        await storage.updateOrder(order.id, {} as any);
        // Set userId directly via raw update
        await storage.linkOrdersByEmail(data.customerEmail, customer.id);
      }
    }

    // Initialize production pipeline
    await storage.initializeProductionPipeline(order.id);

    await storage.logOrderActivity({
      orderId: order.id,
      userId: user.userId,
      action: "po_created",
      details: { poReference: data.poReference, itemCount: data.items.length },
    });

    res.status(201).json(order);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin create PO error:", err);
    res.status(500).json({ error: "Failed to create purchase order" });
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
router.patch("/orders/:id/size-breakdowns/:bid", async (req, res) => {
  try {
    const updated = await storage.updateSizeBreakdown(req.params.bid, req.body);
    if (!updated) return res.status(404).json({ error: "Breakdown not found" });
    res.json(updated);
  } catch (err) {
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
const raisePoSchema = z.object({
  supplierId: z.string().optional(), // optional if already assigned
});

router.post("/orders/:id/raise-po", async (req, res) => {
  try {
    const { supplierId: bodySupplierId } = raisePoSchema.parse(req.body ?? {});

    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const supplierId = bodySupplierId || order.assignedSupplierId;
    if (!supplierId) {
      return res.status(400).json({ error: "No supplier assigned — pass supplierId in the body or assign first" });
    }

    const supplier = await storage.getUser(supplierId);
    if (!supplier || supplier.role !== "supplier") {
      return res.status(400).json({ error: "Invalid supplier ID" });
    }

    // 1. Assign if not already
    if (order.assignedSupplierId !== supplierId) {
      await db.update(orders)
        .set({ assignedSupplierId: supplierId, updatedAt: new Date() })
        .where(eq(orders.id, order.id));
    }

    // 2. Push GHL to PO Raised (if the order is linked to a GHL opportunity)
    let ghlPushResult: { success: boolean; reason?: string } = { success: false, reason: "no_ghl_link" };
    if (order.ghlOpportunityId) {
      ghlPushResult = await updateGhlOpportunityStage(order.ghlOpportunityId, "PO Raised");
    }

    // 3. Email the supplier
    if (supplier.email) {
      sendSupplierPoRaisedEmail(
        supplier.email,
        order.orderNumber,
        order.poReference,
        order.deliveryAddress,
      ).catch((err) => console.error("Failed to send supplier PO email:", err));
    }

    // 4. Log the action
    await db.insert(orderActivity).values({
      orderId: order.id,
      userId: (req as any).user?.userId,
      action: "po_raised_to_supplier",
      details: {
        supplierId,
        supplierName: supplier.teamName,
        supplierEmail: supplier.email,
        ghlPushed: ghlPushResult.success,
        ghlPushReason: ghlPushResult.reason,
      },
    });

    res.json({
      ok: true,
      supplierId,
      ghlPushed: ghlPushResult.success,
      ghlPushReason: ghlPushResult.reason,
    });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin raise PO error:", err);
    res.status(500).json({ error: "Failed to raise PO" });
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

export default router;
