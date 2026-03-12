import { Router } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { z } from "zod";

const router = Router();

// All customer portal routes require authentication
router.use(requireAuth);

// GET /orders — customer's orders
router.get("/orders", async (req, res) => {
  try {
    const user = (req as any).user;
    const orders = await storage.getOrdersByUser(user.userId);
    res.json(orders);
  } catch (err) {
    console.error("Portal orders error:", err);
    res.status(500).json({ error: "Failed to load orders" });
  }
});

// GET /orders/:id — order detail (only if owned by customer)
router.get("/orders/:id", async (req, res) => {
  try {
    const user = (req as any).user;
    const result = await storage.getOrderWithDetails(req.params.id);
    if (!result) return res.status(404).json({ error: "Order not found" });
    if (result.order.userId !== user.userId) return res.status(403).json({ error: "Not your order" });
    res.json(result);
  } catch (err) {
    console.error("Portal order detail error:", err);
    res.status(500).json({ error: "Failed to load order" });
  }
});

// POST /orders/:id/designs — upload a design file record (after Blob upload)
const uploadDesignSchema = z.object({
  label: z.enum(["jersey", "shorts", "socks", "logo", "other"]),
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
    if (order.userId !== user.userId) return res.status(403).json({ error: "Not your order" });

    const data = uploadDesignSchema.parse(req.body);

    const designFile = await storage.createDesignFile({
      orderId: order.id,
      userId: user.userId,
      label: data.label,
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      fileSize: data.fileSize ?? null,
      mimeType: data.mimeType ?? null,
      status: "pending",
      version: 1,
    });

    // Update order design status to pending_review
    if (order.designStatus === "not_started" || order.designStatus === "needs_revision") {
      await storage.updateOrder(order.id, { designStatus: "pending_review" });
    }

    res.status(201).json(designFile);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Portal upload design error:", err);
    res.status(500).json({ error: "Failed to upload design" });
  }
});

// POST /orders/:id/designs/:did/reupload — re-upload a rejected design
router.post("/orders/:id/designs/:did/reupload", async (req, res) => {
  try {
    const user = (req as any).user;
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.userId !== user.userId) return res.status(403).json({ error: "Not your order" });

    const parentFile = await storage.getDesignFile(req.params.did);
    if (!parentFile) return res.status(404).json({ error: "Design file not found" });
    if (parentFile.status !== "rejected") return res.status(400).json({ error: "Only rejected designs can be re-uploaded" });

    const data = uploadDesignSchema.parse(req.body);

    const designFile = await storage.createDesignFile({
      orderId: order.id,
      userId: user.userId,
      label: parentFile.label,
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      fileSize: data.fileSize ?? null,
      mimeType: data.mimeType ?? null,
      status: "pending",
      version: parentFile.version + 1,
      parentFileId: parentFile.id,
    });

    // Update order design status back to pending_review
    await storage.updateOrder(order.id, { designStatus: "pending_review" });

    res.status(201).json(designFile);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Portal reupload design error:", err);
    res.status(500).json({ error: "Failed to re-upload design" });
  }
});

// GET /notifications — customer notifications
router.get("/notifications", async (req, res) => {
  try {
    const user = (req as any).user;
    const notifs = await storage.getNotifications(user.userId);
    res.json(notifs);
  } catch (err) {
    console.error("Portal notifications error:", err);
    res.status(500).json({ error: "Failed to load notifications" });
  }
});

// PATCH /notifications/:id/read — mark notification as read
router.patch("/notifications/:id/read", async (req, res) => {
  try {
    await storage.markNotificationRead(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("Portal mark read error:", err);
    res.status(500).json({ error: "Failed to mark notification" });
  }
});

// GET /profile — customer profile
router.get("/profile", async (req, res) => {
  try {
    const user = (req as any).user;
    const profile = await storage.getUser(user.userId);
    if (!profile) return res.status(404).json({ error: "User not found" });
    // Don't send password hash
    const { password, ...safe } = profile;
    res.json(safe);
  } catch (err) {
    console.error("Portal profile error:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// PATCH /profile — update customer profile
const updateProfileSchema = z.object({
  teamName: z.string().optional(),
  contactPhone: z.string().optional(),
});

router.patch("/profile", async (req, res) => {
  try {
    const user = (req as any).user;
    const data = updateProfileSchema.parse(req.body);
    const updated = await storage.updateCustomer(user.userId, data);
    if (!updated) return res.status(404).json({ error: "User not found" });
    const { password, ...safe } = updated;
    res.json(safe);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Portal update profile error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

export default router;
