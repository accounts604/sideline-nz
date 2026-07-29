import { touchClubAccount } from "../last-seen";
import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { storage } from "../storage";
import { hashPassword, verifyPassword, setAuthCookie, clearAuthCookie } from "../auth";
import { emailService } from "../email";
import {
  fetchSupporterOrdersByTag,
  filterByDateRange,
  summarizeSupporterOrders,
  isShopifyAdminConfigured,
  type SupporterOrder,
} from "../shopify-admin";

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
function requireClubAuth(req: Request, res: Response, next: NextFunction) {
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
    touchClubAccount(payload.clubId); // usage tracking, throttled + fire-and-forget
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ====== LOGIN RATE LIMITER ======
// 5 attempts per IP per 15 min. In-memory — fine for one Vercel instance per
// region; if we ever scale horizontally, swap for Upstash/Redis.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX = 5;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function loginRateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = (req.ip || req.headers["x-forwarded-for"] || "unknown").toString();
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return next();
  }
  if (entry.count >= LOGIN_MAX) {
    const retryInSec = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retryInSec));
    return res.status(429).json({ error: "Too many login attempts. Try again later." });
  }
  entry.count += 1;
  next();
}

// ====== LOGIN ======
const clubLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", loginRateLimiter, async (req: Request, res: Response) => {
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
      shopifyOrderTag: account.shopifyOrderTag,
      profitShareTierBps: account.profitShareTierBps,
      hasSupporterCampaign: Boolean(account.shopifyOrderTag),
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

// ====== SUPPORTER CAMPAIGN — LIVE SHOPIFY ORDERS ======
//
// Tag isolation is the security boundary. The tag is read from the club_accounts
// row keyed by the JWT's clubId — never from a header, query string, or body.
// shopify-admin.ts also re-checks the tag on every order it returns.

const dateRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

type LoadResult =
  | { ok: true; account: NonNullable<Awaited<ReturnType<typeof storage.getClubAccount>>>; all: SupporterOrder[]; filtered: SupporterOrder[] }
  | { ok: false; status: number; body: { error: string } };

async function loadSupporterOrdersForClub(clubId: string, from?: string, to?: string): Promise<LoadResult> {
  const account = await storage.getClubAccount(clubId);
  if (!account) return { ok: false, status: 401, body: { error: "Account not found" } };
  if (!account.shopifyOrderTag) return { ok: false, status: 409, body: { error: "Supporter campaign not configured for this club. Contact Sideline." } };
  if (!isShopifyAdminConfigured()) return { ok: false, status: 503, body: { error: "Shopify Admin API not configured" } };
  const all = await fetchSupporterOrdersByTag(account.shopifyOrderTag);
  const filtered = filterByDateRange(all, from, to);
  return { ok: true, account, all, filtered };
}

router.get("/supporter-orders", requireClubAuth, async (req: Request, res: Response) => {
  try {
    const clubId = (req as any).clubId;
    const parsed = dateRangeSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid date range" });

    const result = await loadSupporterOrdersForClub(clubId, parsed.data.from, parsed.data.to);
    if (!result.ok) return res.status(result.status).json(result.body);

    res.json({
      orders: result.filtered.map(serializeSupporterOrder),
      summary: summarizeSupporterOrders(result.filtered, result.account.profitShareTierBps),
    });
  } catch (e: any) {
    console.error("Supporter orders error:", e);
    res.status(500).json({ error: "Failed to load supporter orders" });
  }
});

router.get("/supporter-summary", requireClubAuth, async (req: Request, res: Response) => {
  try {
    const clubId = (req as any).clubId;
    const parsed = dateRangeSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid date range" });

    const result = await loadSupporterOrdersForClub(clubId, parsed.data.from, parsed.data.to);
    if (!result.ok) return res.status(result.status).json(result.body);

    res.json(summarizeSupporterOrders(result.filtered, result.account.profitShareTierBps));
  } catch (e: any) {
    console.error("Supporter summary error:", e);
    res.status(500).json({ error: "Failed to load summary" });
  }
});

router.get("/supporter-orders.csv", requireClubAuth, async (req: Request, res: Response) => {
  try {
    const clubId = (req as any).clubId;
    const parsed = dateRangeSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid date range" });

    const result = await loadSupporterOrdersForClub(clubId, parsed.data.from, parsed.data.to);
    if (!result.ok) return res.status(result.status).json(result.body);

    const csv = ordersToCsv(result.filtered);
    const filename = `${result.account.clubName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-supporter-orders.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e: any) {
    console.error("Supporter CSV error:", e);
    res.status(500).json({ error: "Failed to export CSV" });
  }
});

function serializeSupporterOrder(o: SupporterOrder) {
  return {
    id: o.id,
    number: o.number,
    customerName: o.customerName,
    customerEmail: o.customerEmail,
    totalCents: o.totalCents,
    currency: o.currency,
    financialStatus: o.financialStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    createdAt: o.createdAt,
    items: o.lines.map((l) => `${l.quantity}× ${l.title}`).join(", "),
    unitCount: o.lines.reduce((n, l) => n + l.quantity, 0),
  };
}

function csvEscape(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function ordersToCsv(orders: SupporterOrder[]): string {
  const header = ["Order", "Date", "Supporter", "Email", "Items", "Units", "Total", "Currency", "Financial Status", "Fulfillment Status"];
  const rows = orders.map((o) => [
    o.number,
    o.createdAt,
    o.customerName ?? "",
    o.customerEmail ?? "",
    o.lines.map((l) => `${l.quantity}× ${l.title}`).join(" | "),
    o.lines.reduce((n, l) => n + l.quantity, 0),
    (o.totalCents / 100).toFixed(2),
    o.currency,
    o.financialStatus ?? "",
    o.fulfillmentStatus ?? "",
  ].map(csvEscape).join(","));
  return [header.join(","), ...rows].join("\n");
}

// ====== LOGOUT ======
router.post("/logout", (req: Request, res: Response) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

export default router;
