import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { storage } from "../storage";
import { hashPassword, verifyPassword, setAuthCookie, clearAuthCookie } from "../auth";
import { emailService } from "../email";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const COOKIE_NAME = "snz_token";

interface ClubJwtPayload {
  clubId: string;
  email: string;
}

function signClubToken(payload: ClubJwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

// Middleware to verify club portal auth
function requireClubAuth(req: Request, res: Response, next: Function) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as ClubJwtPayload;
    if (!payload.clubId) {
      return res.status(401).json({ error: "Not a club account" });
    }
    (req as any).clubId = payload.clubId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ====== LOGIN ======
const clubLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const parsed = clubLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const { email, password } = parsed.data;
    const account = await storage.getClubAccountByEmail(email);

    if (!account) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isValid = await verifyPassword(password, account.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Create token with clubId
    const token = signClubToken({ clubId: account.id, email: account.email });
    setAuthCookie(res, token);

    res.json({
      id: account.id,
      clubName: account.clubName,
      email: account.email,
    });
  } catch (e) {
    console.error("Club login error:", e);
    res.status(500).json({ error: "Login failed" });
  }
});

// ====== GET ME ======
router.get("/me", requireClubAuth, async (req: Request, res: Response) => {
  try {
    const clubId = (req as any).clubId;
    const account = await storage.getClubAccount(clubId);

    if (!account) {
      return res.status(401).json({ error: "Account not found" });
    }

    const order = await storage.getClubOrder(clubId);

    res.json({
      id: account.id,
      clubName: account.clubName,
      email: account.email,
      shopifyStoreUrl: account.shopifyStoreUrl,
      currentOrderStatus: order?.clubPortalStatus || null,
      currentOrderId: order?.id || null,
      contactId: account.contactId,
    });
  } catch (e) {
    console.error("Get me error:", e);
    res.status(500).json({ error: "Failed to fetch account" });
  }
});

// ====== GET ORDER ======
router.get("/order", requireClubAuth, async (req: Request, res: Response) => {
  try {
    const clubId = (req as any).clubId;
    const order = await storage.getClubOrder(clubId);

    if (!order) {
      return res.status(404).json({ error: "No order found" });
    }

    const items = await storage.getOrderItems(order.id);

    res.json({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.clubPortalStatus,
      kitItems: items.map(i => i.productName).join(", "),
      quantity: items.reduce((sum, i) => sum + i.quantity, 0),
      mockupUrl: order.mockupUrl,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      estimatedDeliveryDate: order.estimatedDeliveryDate,
      revisionNotes: order.revisionNotes,
      mockupApprovedAt: order.mockupApprovedAt,
      createdAt: order.createdAt,
    });
  } catch (e) {
    console.error("Get order error:", e);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// ====== APPROVE MOCKUP ======
router.post("/approve-mockup", requireClubAuth, async (req: Request, res: Response) => {
  try {
    const clubId = (req as any).clubId;
    const order = await storage.getClubOrder(clubId);

    if (!order) {
      return res.status(404).json({ error: "No order found" });
    }

    // Update order status
    const updated = await storage.updateOrder(order.id, {
      clubPortalStatus: "design_approved",
      mockupApprovedAt: new Date(),
    });

    // Send email to info@sidelinenz.com
    await emailService.send({
      to: "info@sidelinenz.com",
      subject: `Mockup Approved: ${order.orderNumber}`,
      text: `Club has approved mockup for order ${order.orderNumber}`,
      html: `
        <p>Club has approved their mockup for order <strong>${order.orderNumber}</strong>.</p>
        <p>Order is now ready for production.</p>
        <p><strong>Club:</strong> ${order.customerName}</p>
        <p><strong>Email:</strong> ${order.customerEmail}</p>
      `,
    });

    res.json({ success: true, status: "design_approved" });
  } catch (e) {
    console.error("Approve mockup error:", e);
    res.status(500).json({ error: "Failed to approve mockup" });
  }
});

// ====== REQUEST REVISION ======
const revisionSchema = z.object({
  notes: z.string().min(1).max(500),
});

router.post("/request-revision", requireClubAuth, async (req: Request, res: Response) => {
  try {
    const clubId = (req as any).clubId;
    const parsed = revisionSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid revision notes" });
    }

    const { notes } = parsed.data;
    const order = await storage.getClubOrder(clubId);

    if (!order) {
      return res.status(404).json({ error: "No order found" });
    }

    // Update order status and notes
    const updated = await storage.updateOrder(order.id, {
      clubPortalStatus: "revision_in_progress",
      revisionNotes: notes,
    });

    const account = await storage.getClubAccount(clubId);

    // Send email to info@sidelinenz.com
    await emailService.send({
      to: "info@sidelinenz.com",
      subject: `Revision Request: ${order.orderNumber}`,
      text: `${account?.clubName} has requested a revision for order ${order.orderNumber}`,
      html: `
        <p><strong>${account?.clubName}</strong> has requested a revision for order <strong>${order.orderNumber}</strong>.</p>
        <p><strong>Revision notes:</strong></p>
        <blockquote>${notes}</blockquote>
        <p><strong>Club Email:</strong> ${order.customerEmail}</p>
      `,
    });

    res.json({ success: true, status: "revision_in_progress" });
  } catch (e) {
    console.error("Request revision error:", e);
    res.status(500).json({ error: "Failed to request revision" });
  }
});

// ====== LOGOUT ======
router.post("/logout", (req: Request, res: Response) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

export default router;
