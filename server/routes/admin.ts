import { Router } from "express";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { hashPassword } from "../auth";
import { z } from "zod";
import { notifyDesignApproved, notifyDesignRejected, notifyOrderStatusChange } from "../notifications";
import { sendInviteEmail } from "../email";

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

// PATCH /orders/:id — update status, admin notes
const updateOrderSchema = z.object({
  status: z.string().optional(),
  designStatus: z.string().optional(),
  adminNotes: z.string().optional(),
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

export default router;
