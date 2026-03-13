/**
 * Smart Quote API routes
 *
 * Admin:
 *   GET    /api/admin/quotes              — List all quotes
 *   GET    /api/admin/quotes/stats        — Quote stats
 *   POST   /api/admin/quotes              — Create a quote
 *   GET    /api/admin/quotes/:id          — Get quote detail
 *   PATCH  /api/admin/quotes/:id          — Update quote
 *   POST   /api/admin/quotes/:id/send     — Send quote to customer
 *   POST   /api/admin/quotes/:id/convert  — Convert to PO/order
 *   DELETE /api/admin/quotes/:id          — Delete quote
 *
 * Templates:
 *   GET    /api/admin/quote-templates           — List templates
 *   POST   /api/admin/quote-templates           — Create template
 *   PATCH  /api/admin/quote-templates/:id       — Update template
 *   DELETE /api/admin/quote-templates/:id       — Delete template
 *
 * Public:
 *   GET    /api/quotes/:token             — View quote (customer)
 *   POST   /api/quotes/:token/accept      — Accept quote
 *   POST   /api/quotes/:token/reject      — Reject quote
 */
import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { quotes, quoteItems, quoteTemplates, orders, orderItems } from "../../shared/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { requireAdmin } from "../auth";
import { emailService } from "../email";
import { createGhlContact } from "./ghl";
import { syncGhlTag } from "../ghl-sync";
import crypto from "crypto";

// GHL custom fields for quote data
const QUOTE_GHL_FIELDS: Record<string, string> = {
  quote_number: "quote_number",
  quote_total: "quote_total",
  quote_status: "quote_status",
  quote_items: "quote_items",
  quote_valid_until: "quote_valid_until",
  quote_url: "quote_url",
};

// ====== ADMIN QUOTE ROUTES ======

const adminQuoteRouter = Router();
adminQuoteRouter.use(requireAdmin);

// GET /api/admin/quotes/stats
adminQuoteRouter.get("/stats", async (_req, res) => {
  try {
    const [stats] = await db
      .select({
        total: sql<number>`count(*)`,
        draft: sql<number>`count(*) filter (where ${quotes.status} = 'draft')`,
        sent: sql<number>`count(*) filter (where ${quotes.status} = 'sent')`,
        viewed: sql<number>`count(*) filter (where ${quotes.status} = 'viewed')`,
        accepted: sql<number>`count(*) filter (where ${quotes.status} = 'accepted')`,
        rejected: sql<number>`count(*) filter (where ${quotes.status} = 'rejected')`,
        totalValue: sql<number>`coalesce(sum(${quotes.total}), 0)`,
        acceptedValue: sql<number>`coalesce(sum(${quotes.total}) filter (where ${quotes.status} = 'accepted'), 0)`,
      })
      .from(quotes);

    res.json(stats);
  } catch (err) {
    console.error("[Quotes] Stats error:", err);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// GET /api/admin/quotes
adminQuoteRouter.get("/", async (req, res) => {
  try {
    const status = req.query.status as string;
    const search = req.query.search as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (status) conditions.push(eq(quotes.status, status));
    if (search) {
      conditions.push(
        sql`(${quotes.customerName} ILIKE ${"%" + search + "%"} OR ${quotes.customerEmail} ILIKE ${"%" + search + "%"} OR ${quotes.teamName} ILIKE ${"%" + search + "%"} OR ${quotes.quoteNumber} ILIKE ${"%" + search + "%"})`
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const allQuotes = await db
      .select()
      .from(quotes)
      .where(where)
      .orderBy(desc(quotes.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(quotes)
      .where(where);

    res.json({ quotes: allQuotes, total: Number(count), page, totalPages: Math.ceil(Number(count) / limit) });
  } catch (err) {
    console.error("[Quotes] List error:", err);
    res.status(500).json({ error: "Failed to list quotes" });
  }
});

// POST /api/admin/quotes — Create quote
const createQuoteSchema = z.object({
  templateId: z.string().optional(),
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  customerPhone: z.string().optional(),
  teamName: z.string().optional(),
  sport: z.string().optional(),
  items: z.array(z.object({
    productName: z.string().min(1),
    description: z.string().optional(),
    quantity: z.number().min(1),
    unitPrice: z.number().min(0), // cents
    sizes: z.string().optional(),
    brandingMethod: z.string().optional(),
    sortOrder: z.number().optional(),
  })),
  discount: z.number().optional(),
  discountLabel: z.string().optional(),
  shipping: z.number().optional(),
  adminNotes: z.string().optional(),
  customerNotes: z.string().optional(),
  terms: z.string().optional(),
  validUntilDays: z.number().optional(),
});

adminQuoteRouter.post("/", async (req, res) => {
  try {
    const data = createQuoteSchema.parse(req.body);

    // Generate quote number
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(quotes);
    const quoteNumber = `QT-${String(Number(count) + 1).padStart(4, "0")}`;

    // Calculate totals
    const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discount = data.discount || 0;
    const shipping = data.shipping || 0;
    const tax = Math.round((subtotal - discount + shipping) * 0.15); // 15% GST
    const total = subtotal - discount + shipping + tax;

    const validDays = data.validUntilDays || 30;
    const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);
    const accessToken = crypto.randomBytes(32).toString("hex");

    const [quote] = await db
      .insert(quotes)
      .values({
        quoteNumber,
        templateId: data.templateId || null,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone || null,
        teamName: data.teamName || null,
        sport: data.sport || null,
        status: "draft",
        subtotal,
        discount,
        discountLabel: data.discountLabel || null,
        shipping,
        tax,
        total,
        adminNotes: data.adminNotes || null,
        customerNotes: data.customerNotes || null,
        terms: data.terms || "Quote valid for 30 days. Prices exclude GST unless stated. Production times vary by order size.",
        validUntil,
        accessToken,
        createdBy: (req as any).user?.id || null,
      })
      .returning();

    // Insert line items
    if (data.items.length > 0) {
      await db.insert(quoteItems).values(
        data.items.map((item, i) => ({
          quoteId: quote.id,
          productName: item.productName,
          description: item.description || null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.quantity * item.unitPrice,
          sizes: item.sizes || null,
          brandingMethod: item.brandingMethod || null,
          sortOrder: item.sortOrder ?? i,
        }))
      );
    }

    // Sync to GHL — create/update contact with quote data
    const baseUrl = process.env.BASE_URL || "https://sidelinenz.com";
    const quoteUrl = `${baseUrl}/quote-view/${accessToken}`;
    const itemSummary = data.items.map(i => `${i.quantity}x ${i.productName}`).join(", ");

    createGhlContact(
      {
        name: data.customerName,
        email: data.customerEmail,
        phone: data.customerPhone || "",
        source: "sidelinenz.com smart-quote",
        organization: data.teamName || "",
        sports: data.sport || "",
        estimated_quantity: String(data.items.reduce((s, i) => s + i.quantity, 0)),
        needs: data.items.map(i => i.productName).join(", "),
        // Quote-specific custom fields
        quote_number: quoteNumber,
        quote_total: `$${(total / 100).toFixed(2)}`,
        quote_status: "draft",
        quote_items: itemSummary,
        quote_valid_until: validUntil.toLocaleDateString("en-NZ"),
        quote_url: quoteUrl,
      },
      ["Website Lead", "Smart Quote", `Sport: ${data.sport || "General"}`]
    ).catch(err => console.error("[Quotes] GHL sync error:", err));

    res.json(quote);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error", details: err.errors });
    console.error("[Quotes] Create error:", err);
    res.status(500).json({ error: "Failed to create quote" });
  }
});

// GET /api/admin/quotes/:id
adminQuoteRouter.get("/:id", async (req, res) => {
  try {
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, req.params.id));
    if (!quote) return res.status(404).json({ error: "Not found" });

    const items = await db
      .select()
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, quote.id))
      .orderBy(quoteItems.sortOrder);

    res.json({ quote, items });
  } catch (err) {
    console.error("[Quotes] Detail error:", err);
    res.status(500).json({ error: "Failed to get quote" });
  }
});

// PATCH /api/admin/quotes/:id
adminQuoteRouter.patch("/:id", async (req, res) => {
  try {
    const updates: Record<string, any> = {};
    const allowed = ["customerName", "customerEmail", "customerPhone", "teamName", "sport", "status",
      "discount", "discountLabel", "shipping", "adminNotes", "customerNotes", "terms"];

    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    // Recalculate if discount/shipping changed
    if (updates.discount !== undefined || updates.shipping !== undefined) {
      const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, req.params.id));
      const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
      const discount = updates.discount ?? 0;
      const shipping = updates.shipping ?? 0;
      const tax = Math.round((subtotal - discount + shipping) * 0.15);
      updates.subtotal = subtotal;
      updates.tax = tax;
      updates.total = subtotal - discount + shipping + tax;
    }

    updates.updatedAt = new Date();

    const [updated] = await db
      .update(quotes)
      .set(updates)
      .where(eq(quotes.id, req.params.id))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error("[Quotes] Update error:", err);
    res.status(500).json({ error: "Failed to update quote" });
  }
});

// POST /api/admin/quotes/:id/send — Email to customer
adminQuoteRouter.post("/:id/send", async (req, res) => {
  try {
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, req.params.id));
    if (!quote) return res.status(404).json({ error: "Not found" });

    const baseUrl = process.env.BASE_URL || "https://sidelinenz.com";
    const quoteUrl = `${baseUrl}/quote-view/${quote.accessToken}`;

    await emailService.send({
      to: quote.customerEmail,
      subject: `Quote ${quote.quoteNumber} from Sideline NZ${quote.teamName ? ` — ${quote.teamName}` : ""}`,
      text: `Hi ${quote.customerName},\n\nWe've prepared a quote for you.\n\nView your quote: ${quoteUrl}\n\nQuote #: ${quote.quoteNumber}\nTotal: $${(quote.total / 100).toFixed(2)} NZD (incl. GST)\nValid until: ${quote.validUntil ? new Date(quote.validUntil).toLocaleDateString("en-NZ") : "30 days"}\n\n${quote.customerNotes || ""}\n\nCheers,\nThe Sideline Team`,
      html: `
        <div style="font-family:'Inter',sans-serif;max-width:600px;margin:0 auto;color:#333">
          <div style="text-align:center;padding:32px 0;border-bottom:2px solid #f97316">
            <h1 style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:3px;margin:0"><span style="color:#f97316">S</span>IDELINE</h1>
          </div>
          <div style="padding:32px 0">
            <p>Hi ${quote.customerName},</p>
            <p>We've prepared a custom quote for ${quote.teamName || "your team"}.</p>
            <div style="text-align:center;margin:32px 0">
              <a href="${quoteUrl}" style="display:inline-block;padding:16px 40px;background:#f97316;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px">View Your Quote</a>
            </div>
            <table style="width:100%;border-collapse:collapse;margin-top:16px">
              <tr><td style="padding:8px 0;color:#666">Quote #</td><td style="padding:8px 0;text-align:right;font-weight:600">${quote.quoteNumber}</td></tr>
              <tr><td style="padding:8px 0;color:#666">Total (incl. GST)</td><td style="padding:8px 0;text-align:right;font-weight:600;font-size:18px">$${(quote.total / 100).toFixed(2)} NZD</td></tr>
              <tr><td style="padding:8px 0;color:#666">Valid until</td><td style="padding:8px 0;text-align:right">${quote.validUntil ? new Date(quote.validUntil).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" }) : "30 days"}</td></tr>
            </table>
            ${quote.customerNotes ? `<div style="margin-top:24px;padding:16px;background:#f9fafb;border-radius:8px"><p style="margin:0;color:#666">${quote.customerNotes}</p></div>` : ""}
            <p style="margin-top:32px">Cheers,<br><strong>The Sideline Team</strong></p>
          </div>
        </div>`,
    });

    await db
      .update(quotes)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(quotes.id, req.params.id));

    // GHL: tag contact as "Quote Sent"
    syncGhlTag(quote.customerEmail, "Quote Sent").catch(err =>
      console.error("[Quotes] GHL tag sync error:", err)
    );

    res.json({ sent: true });
  } catch (err) {
    console.error("[Quotes] Send error:", err);
    res.status(500).json({ error: "Failed to send quote" });
  }
});

// POST /api/admin/quotes/:id/convert — Convert to PO
adminQuoteRouter.post("/:id/convert", async (req, res) => {
  try {
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, req.params.id));
    if (!quote) return res.status(404).json({ error: "Not found" });

    const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, quote.id));

    // Generate order number
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(orders);
    const orderNumber = `PO-${String(Number(count) + 1).padStart(4, "0")}`;

    // Create order from quote
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber,
        storeSlug: "custom",
        status: "pending",
        customerName: quote.customerName,
        customerEmail: quote.customerEmail,
        subtotal: quote.subtotal,
        shipping: quote.shipping || 0,
        tax: quote.tax || 0,
        total: quote.total,
        poReference: quote.quoteNumber,
        accountName: quote.teamName,
      })
      .returning();

    // Create order items
    for (const item of items) {
      await db.insert(orderItems).values({
        orderId: order.id,
        productId: `quote-${item.id}`,
        priceId: `quote-${item.id}`,
        productName: item.productName,
        quantity: item.quantity,
        unitAmount: item.unitPrice,
        brandingMethod: item.brandingMethod,
      });
    }

    // Update quote
    await db
      .update(quotes)
      .set({ convertedToOrderId: order.id, status: "accepted" })
      .where(eq(quotes.id, req.params.id));

    res.json({ orderId: order.id, orderNumber });
  } catch (err) {
    console.error("[Quotes] Convert error:", err);
    res.status(500).json({ error: "Failed to convert quote" });
  }
});

// DELETE /api/admin/quotes/:id
adminQuoteRouter.delete("/:id", async (req, res) => {
  try {
    await db.delete(quoteItems).where(eq(quoteItems.quoteId, req.params.id));
    await db.delete(quotes).where(eq(quotes.id, req.params.id));
    res.json({ deleted: true });
  } catch (err) {
    console.error("[Quotes] Delete error:", err);
    res.status(500).json({ error: "Failed to delete" });
  }
});

// ====== TEMPLATE ROUTES ======

const templateRouter = Router();
templateRouter.use(requireAdmin);

templateRouter.get("/", async (_req, res) => {
  try {
    const templates = await db.select().from(quoteTemplates).orderBy(desc(quoteTemplates.createdAt));
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: "Failed to list templates" });
  }
});

const templateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  sport: z.string().optional(),
  category: z.string().optional(),
  items: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    unitPrice: z.number(),
    minQty: z.number().optional(),
    sizes: z.string().optional(),
    brandingMethod: z.string().optional(),
  })),
  validUntilDays: z.number().optional(),
});

templateRouter.post("/", async (req, res) => {
  try {
    const data = templateSchema.parse(req.body);
    const [template] = await db
      .insert(quoteTemplates)
      .values({
        name: data.name,
        description: data.description || null,
        sport: data.sport || null,
        category: data.category || "custom",
        items: data.items,
        validUntilDays: data.validUntilDays || 30,
        createdBy: (req as any).user?.id || null,
      })
      .returning();
    res.json(template);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Validation error", details: err.errors });
    res.status(500).json({ error: "Failed to create template" });
  }
});

templateRouter.patch("/:id", async (req, res) => {
  try {
    const data = templateSchema.partial().parse(req.body);
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (data.name) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.sport !== undefined) updates.sport = data.sport;
    if (data.category) updates.category = data.category;
    if (data.items) updates.items = data.items;
    if (data.validUntilDays) updates.validUntilDays = data.validUntilDays;

    const [updated] = await db.update(quoteTemplates).set(updates).where(eq(quoteTemplates.id, req.params.id)).returning();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update template" });
  }
});

templateRouter.delete("/:id", async (req, res) => {
  try {
    await db.delete(quoteTemplates).where(eq(quoteTemplates.id, req.params.id));
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete template" });
  }
});

// ====== PUBLIC QUOTE VIEW ======

const publicQuoteRouter = Router();

// GET /api/quotes/:token — View quote
publicQuoteRouter.get("/:token", async (req, res) => {
  try {
    const [quote] = await db.select().from(quotes).where(eq(quotes.accessToken, req.params.token));
    if (!quote) return res.status(404).json({ error: "Quote not found" });

    // Mark as viewed + GHL tag
    if (quote.status === "sent") {
      await db.update(quotes).set({ status: "viewed", viewedAt: new Date() }).where(eq(quotes.id, quote.id));
      syncGhlTag(quote.customerEmail, "Quote Viewed").catch(() => {});
    }

    const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, quote.id)).orderBy(quoteItems.sortOrder);

    // Don't expose internal fields
    const { accessToken, adminNotes, createdBy, ...publicQuote } = quote;

    res.json({ quote: publicQuote, items });
  } catch (err) {
    res.status(500).json({ error: "Failed to load quote" });
  }
});

// POST /api/quotes/:token/accept
publicQuoteRouter.post("/:token/accept", async (req, res) => {
  try {
    const [quote] = await db.select().from(quotes).where(eq(quotes.accessToken, req.params.token));
    if (!quote) return res.status(404).json({ error: "Quote not found" });
    if (quote.status === "accepted") return res.json({ already: true });
    if (quote.status === "expired" || quote.status === "rejected") {
      return res.status(400).json({ error: `Quote is ${quote.status}` });
    }

    await db.update(quotes).set({ status: "accepted", acceptedAt: new Date() }).where(eq(quotes.id, quote.id));
    syncGhlTag(quote.customerEmail, "Quote Accepted").catch(() => {});
    res.json({ accepted: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to accept quote" });
  }
});

// POST /api/quotes/:token/reject
publicQuoteRouter.post("/:token/reject", async (req, res) => {
  try {
    const [quote] = await db.select().from(quotes).where(eq(quotes.accessToken, req.params.token));
    if (!quote) return res.status(404).json({ error: "Quote not found" });

    await db
      .update(quotes)
      .set({ status: "rejected", rejectedAt: new Date(), rejectionReason: req.body.reason || null })
      .where(eq(quotes.id, quote.id));
    syncGhlTag(quote.customerEmail, "Quote Rejected").catch(() => {});
    res.json({ rejected: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to reject quote" });
  }
});

export { adminQuoteRouter, templateRouter, publicQuoteRouter };
