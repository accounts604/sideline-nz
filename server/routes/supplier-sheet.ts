// Supplier tracking sheet — a NO-LOGIN, single-link view of a supplier's open orders.
//
// Why this exists: the supplier portal at /supplier works but is behind a login, and our
// manufacturer does not use it. They answer WhatsApp sporadically and email rarely, so we
// have orders sitting for 70+ days with no recorded ship date. This gives them one link,
// one table, and three fields to fill in. Lower friction than a login, by design.
//
// Security model, deliberately narrow:
//   - Access is an HMAC-signed token over the supplier id. No DB row, nothing to migrate.
//     Rotate SUPPLIER_SHEET_SECRET to revoke every issued link at once.
//   - READ is scoped to orders where assignedSupplierId === the token's supplier, and
//     returns ONLY production fields. Never pricing, never adminNotes, never customer email.
//   - WRITE is limited to three fields: estimated ship date, tracking number, and a note.
//     A supplier cannot move the pipeline stage, edit quantities, or touch anything financial.
//   - Every write is logged to orderActivity attributed to the supplier, so the admin sees
//     who said what and when.
import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
// NB: a "supplier" is a row in `users` with role = supplier. orders.assignedSupplierId
// references users.id — there is no separate suppliers table.
import { orders, orderItems, orderActivity, users } from "@shared/schema";

const router = Router();

const SECRET = process.env.SUPPLIER_SHEET_SECRET || process.env.JWT_SECRET || "dev-secret-change-in-production";

// token = <supplierId>.<hmac>  — URL safe, no storage required.
export function signSupplierToken(supplierId: string): string {
  const mac = crypto.createHmac("sha256", SECRET).update(supplierId).digest("base64url").slice(0, 32);
  return `${supplierId}.${mac}`;
}

function verifySupplierToken(token: string): string | null {
  const i = token.lastIndexOf(".");
  if (i < 1) return null;
  const supplierId = token.slice(0, i);
  const expected = signSupplierToken(supplierId);
  // constant-time compare on equal-length buffers
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return supplierId;
}

// Stages we are willing to show the supplier, in plain words.
const STAGE_LABEL: Record<string, string> = {
  order_received: "Order received",
  design_review: "Design review",
  design_confirmed: "Design confirmed",
  in_production: "In production",
  packing: "Packing",
  shipped: "Shipped",
  delivered: "Delivered",
};

const OPEN_STATUSES = ["pending", "processing", "paid"];

// GET /api/sheet/:token — the supplier's open orders.
router.get("/:token", async (req, res) => {
  try {
    const supplierId = verifySupplierToken(req.params.token);
    if (!supplierId) return res.status(404).json({ error: "Not found" });

    const [sup] = await db.select().from(users).where(eq(users.id, supplierId)).limit(1);
    if (!sup || sup.role !== "supplier") return res.status(404).json({ error: "Not found" });

    const rows = await db.select().from(orders).where(eq(orders.assignedSupplierId, supplierId));
    const open = rows.filter((o) => OPEN_STATUSES.includes(String(o.status)) && o.productionStage !== "delivered");

    const ids = open.map((o) => o.id);
    const items = ids.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ids)) : [];

    const payload = open
      .map((o) => {
        const mine = items.filter((i) => i.orderId === o.id);
        return {
          id: o.id,
          poReference: o.poReference,
          client: o.accountName,
          units: mine.reduce((s, i) => s + (i.quantity || 0), 0),
          lines: mine.map((i) => `${i.productName} x${i.quantity}`),
          stage: STAGE_LABEL[String(o.productionStage)] || String(o.productionStage || ""),
          sentToYou: o.poDispatchedAt,
          weNeedBy: o.dueDate,
          // the three fields they fill in
          shipDate: o.estimatedDeliveryDate,
          trackingNumber: o.trackingNumber,
        };
      })
      .sort((a, b) => String(a.weNeedBy || "9999").localeCompare(String(b.weNeedBy || "9999")));

    res.json({ supplier: sup.teamName || sup.username || "Supplier", orders: payload });
  } catch (err: any) {
    console.error("supplier sheet read error:", err);
    res.status(500).json({ error: "Could not load orders" });
  }
});

// POST /api/sheet/:token/:orderId — the supplier updates their three fields.
const updateSchema = z.object({
  shipDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  trackingNumber: z.string().max(120).optional(),
  note: z.string().max(1000).optional(),
});

router.post("/:token/:orderId", async (req, res) => {
  try {
    const supplierId = verifySupplierToken(req.params.token);
    if (!supplierId) return res.status(404).json({ error: "Not found" });

    const order = await storage.getOrder(req.params.orderId);
    if (!order || order.assignedSupplierId !== supplierId) return res.status(404).json({ error: "Not found" });

    const data = updateSchema.parse(req.body ?? {});
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const said: string[] = [];

    if (data.shipDate) { patch.estimatedDeliveryDate = new Date(data.shipDate); said.push(`ship date ${data.shipDate}`); }
    if (data.trackingNumber) { patch.trackingNumber = data.trackingNumber.trim(); said.push(`tracking ${data.trackingNumber.trim()}`); }
    if (data.note) said.push(`note: ${data.note.trim()}`);

    if (!said.length) return res.status(400).json({ error: "Nothing to save" });

    if (Object.keys(patch).length > 1) {
      await db.update(orders).set(patch).where(eq(orders.id, order.id));
    }

    await db.insert(orderActivity).values({
      orderId: order.id,
      userId: supplierId,
      action: "supplier_sheet_update",
      details: { source: "supplier tracking sheet", saved: said, note: data.note?.trim() || null },
    });

    res.json({ ok: true, saved: said });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "Check the date format, it should be YYYY-MM-DD" });
    console.error("supplier sheet write error:", err);
    res.status(500).json({ error: "Could not save" });
  }
});

export default router;
