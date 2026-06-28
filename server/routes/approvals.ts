// Tokenized client approval routes.
//
// Two surfaces:
//   1. publicApprovalRouter — mounted at /api/approve. No auth required.
//      Clients click an emailed link like https://sidelinenz.com/approve/<token>
//      and hit these endpoints via the public /approve/:token page.
//
//   2. The admin "Send for approval" action lives in routes/admin.ts and calls
//      `createApprovalToken()` exported below — kept colocated here so the token
//      lifecycle is in one place.
//
// Lifecycle:
//   admin clicks "Send for approval"
//     → createApprovalToken() issues a random URL-safe token + 14d expiry
//     → sendMockupApprovalRequest() emails the client with /approve/<token>
//     → updateGhlOpportunityStage("Mockup Sent") pushes GHL forward
//   client visits /approve/<token>
//     → GET /api/approve/:token returns order summary + mockup file URLs
//     → client clicks Approve or Request Changes
//     → POST /api/approve/:token records the decision in approval_tokens,
//        writes orderActivity, notifies admin by email
//     → if "changes_requested", GHL is pushed back to "Mockup In Progress"
//        (admin can send a new version; that re-advances to "Mockup Sent")
//     → if "approved", no stage change here — Enoch issues the deposit invoice
//        next, and Stripe webhook moves the stage to "Deposit Paid"

import { Router, json } from "express";
import { z } from "zod";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { approvalTokens, orderActivity, orders, designFiles, orderItems, orderSizeBreakdowns, clubBrandIdentity } from "@shared/schema";
import { storage } from "../storage";
import { updateGhlOpportunityStage } from "./ghl";
import { sendMockupApprovalRequest, sendClientApprovalResult } from "../email";

// ===== Exported helper: create a token + send the email =====

export async function createApprovalToken(params: {
  orderId: string;
  createdBy: string;
  clientEmail: string;
  clientName?: string | null;
  orderNumber: string | null;
  ghlOpportunityId: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days (matches quote terms)

  await db.insert(approvalTokens).values({
    orderId: params.orderId,
    token,
    expiresAt,
    createdBy: params.createdBy,
  });

  const baseUrl = process.env.BASE_URL || "https://sidelinenz.com";
  const link = `${baseUrl}/approve/${token}`;

  // Fire email in the background — don't block the admin response on SMTP
  sendMockupApprovalRequest(
    params.clientEmail,
    params.orderNumber || "your order",
    link,
    params.clientName || null,
  ).catch((err) => console.error("Failed to send mockup approval email:", err));

  // Push GHL forward (best-effort; if the order isn't GHL-linked, skip silently)
  if (params.ghlOpportunityId) {
    updateGhlOpportunityStage(params.ghlOpportunityId, "Mockup Sent").catch((err) =>
      console.error("Failed to push GHL to Mockup Sent:", err),
    );
  }

  // Log the issue event
  await db.insert(orderActivity).values({
    orderId: params.orderId,
    userId: params.createdBy,
    action: "approval_link_issued",
    details: { token, expiresAt: expiresAt.toISOString(), clientEmail: params.clientEmail },
  });

  return { token, expiresAt };
}

// ===== Public router (no auth) =====

const publicApprovalRouter = Router();

// GET /:token — hydrate the approval page
publicApprovalRouter.get("/:token", async (req, res) => {
  try {
    const [tokenRow] = await db
      .select()
      .from(approvalTokens)
      .where(eq(approvalTokens.token, req.params.token))
      .limit(1);

    if (!tokenRow) {
      return res.status(404).json({ error: "Invalid or expired approval link" });
    }
    if (tokenRow.expiresAt && new Date(tokenRow.expiresAt) < new Date()) {
      return res.status(410).json({ error: "This approval link has expired. Contact Sideline NZ for a new one." });
    }
    if (tokenRow.usedAt) {
      return res.status(409).json({
        error: "This approval link has already been used.",
        decision: tokenRow.decision,
        usedAt: tokenRow.usedAt,
      });
    }

    const [order] = await db.select().from(orders).where(eq(orders.id, tokenRow.orderId)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Fetch mockup files only (role-scoped reads — clients see /mockups folder)
    const allFiles = await db.select().from(designFiles).where(eq(designFiles.orderId, order.id));
    const mockups = allFiles
      .filter((f) => f.folder === "mockups")
      .map((f) => ({
        id: f.id,
        fileName: f.fileName,
        fileUrl: f.fileUrl,
        mimeType: f.mimeType,
      }));

    // Fetch garment lines — clients need to see what they're approving
    const items = await storage.getOrderItems(order.id);
    const safeItems = items.map((i) => ({
      id: i.id,
      productName: i.productName,
      quantity: i.quantity,
      size: i.size,
      brandingMethod: i.brandingMethod,
      gradeGroup: i.gradeGroup,
      // NO unit price — clients see totals elsewhere via the quote, not here
    }));

    res.json({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        poReference: order.poReference,
        accountName: order.accountName,
        customerName: order.customerName,
      },
      items: safeItems,
      mockups,
      expiresAt: tokenRow.expiresAt,
    });
  } catch (e: any) {
    console.error("Approval hydrate error:", e);
    res.status(500).json({ error: "Failed to load approval page" });
  }
});

// POST /:token — submit the decision
const decisionSchema = z.object({
  decision: z.enum(["approved", "changes_requested"]),
  changesNotes: z.string().optional(), // serves as the customer's comments/requests box
  // Per-garment sizing the customer fills on the order form (approve + sizing step).
  sizes: z.array(z.object({
    itemId: z.string(),
    rows: z.array(z.object({ size: z.string().min(1), quantity: z.number().int().min(0) })),
  })).optional(),
  // Design elements the customer provides in the same step (PO-push collector).
  colours: z.array(z.string().max(60)).max(10).optional(),
  sponsors: z.string().max(4000).optional(),
  brandLogoUrls: z.array(z.string().url()).max(30).optional(), // uploaded via /:token/upload
});

publicApprovalRouter.post("/:token", async (req, res) => {
  try {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid payload" });
    }
    const { decision, changesNotes } = parsed.data;

    const [tokenRow] = await db
      .select()
      .from(approvalTokens)
      .where(eq(approvalTokens.token, req.params.token))
      .limit(1);

    if (!tokenRow) return res.status(404).json({ error: "Invalid approval link" });
    if (tokenRow.usedAt) {
      return res.status(409).json({ error: "This approval link has already been used." });
    }
    if (tokenRow.expiresAt && new Date(tokenRow.expiresAt) < new Date()) {
      return res.status(410).json({ error: "This approval link has expired." });
    }

    const [order] = await db.select().from(orders).where(eq(orders.id, tokenRow.orderId)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Mark the token consumed
    await db
      .update(approvalTokens)
      .set({ usedAt: new Date(), decision, changesNotes: changesNotes || null })
      .where(eq(approvalTokens.id, tokenRow.id));

    // Capture the customer's size breakdown (the order form's sizing step).
    // itemId is validated against this order's lines so a token can't write to another order.
    let sizesWritten = 0;
    if (Array.isArray(parsed.data.sizes) && parsed.data.sizes.length) {
      const lineRows = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, order.id));
      const validIds = new Set(lineRows.map((r) => r.id));
      for (const grp of parsed.data.sizes) {
        if (!validIds.has(grp.itemId)) continue;
        for (const row of grp.rows || []) {
          const qty = Math.max(0, Math.min(parseInt(String(row.quantity), 10) || 0, 999));
          if (!row.size || qty < 1) continue;
          await db.insert(orderSizeBreakdowns).values({
            orderId: order.id,
            orderItemId: grp.itemId,
            size: String(row.size).trim().slice(0, 20),
            quantity: qty,
          } as any);
          sizesWritten++;
        }
      }
    }

    // Log the event on the order
    await db.insert(orderActivity).values({
      orderId: order.id,
      userId: null, // client has no user account
      action: decision === "approved" ? "client_approved" : "client_requested_changes",
      details: {
        source: "public_approval_link",
        tokenId: tokenRow.id,
        changesNotes: changesNotes || null,
        sizeRowsWritten: sizesWritten,
      },
    });

    // Capture the design elements the customer provided in the same step
    // (colours, sponsors, uploaded logos) — record on the order timeline, and
    // enrich the club Brand Identity if this order is club-linked.
    const colours = (parsed.data.colours || []).map((c) => c.trim()).filter(Boolean);
    const sponsors = (parsed.data.sponsors || "").trim();
    const brandLogoUrls = parsed.data.brandLogoUrls || [];
    if (colours.length || sponsors || brandLogoUrls.length) {
      await db.insert(orderActivity).values({
        orderId: order.id,
        userId: null,
        action: "design_elements_submitted",
        details: { source: "public_approval_link", colours, sponsors: sponsors || null, logoCount: brandLogoUrls.length, logoUrls: brandLogoUrls },
      });
      if (order.clubAccountId) {
        try {
          const brand = await storage.ensureClubBrandIdentity(order.clubAccountId, { sourceChannel: "free_mockup_form" });
          const colorObjs = colours.map((c, i) => ({ role: i === 0 ? "primary" : i === 1 ? "secondary" : "accent", hex: c.startsWith("#") ? c : undefined, name: c }));
          const artwork = brandLogoUrls.map((u) => ({ label: "Customer-supplied logo", fileUrl: u, kind: "png" as const }));
          await storage.updateClubBrandIdentity(order.clubAccountId, {
            ...(colours.length ? { colors: colorObjs as any } : {}),
            ...(sponsors ? { designBrief: `${brand.designBrief || ""}\nSponsors: ${sponsors}`.trim() } : {}),
            ...(brandLogoUrls.length ? { artworkFiles: [...(((brand.artworkFiles as any[]) || [])), ...artwork] as any } : {}),
          } as any);
        } catch (e) {
          console.error("[approve] brand identity enrich failed:", e);
        }
      }
    }

    // Update the order's designStatus so admin UI reflects reality
    await db
      .update(orders)
      .set({
        designStatus: decision === "approved" ? "approved" : "needs_revision",
        mockupApprovedAt: decision === "approved" ? new Date() : null,
        revisionNotes: decision === "changes_requested" ? (changesNotes || null) : null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    // Push GHL stage if changes requested (back to Mockup In Progress)
    // On approval we DON'T advance GHL — the next stage ("Deposit Paid") is
    // triggered by Stripe webhook once Enoch's invoice gets paid.
    if (decision === "changes_requested" && order.ghlOpportunityId) {
      updateGhlOpportunityStage(order.ghlOpportunityId, "Mockup In Progress").catch((err) =>
        console.error("Failed to push GHL back to Mockup In Progress:", err),
      );
    }

    // Notify admin by email (best-effort)
    const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || "info@sidelinenz.com";
    sendClientApprovalResult(
      adminEmail,
      order.orderNumber || order.id,
      decision,
      changesNotes || null,
    ).catch((err) => console.error("Failed to send admin approval notification:", err));

    res.json({ ok: true, decision });
  } catch (e: any) {
    console.error("Approval submission error:", e);
    res.status(500).json({ error: "Failed to submit decision" });
  }
});

// POST /:token/upload — customer uploads a logo / design file from the approval
// page. Token-scoped (the token is the auth, no login). File goes to Vercel
// Blob; the URL is returned and the client includes it in the decision submit
// (brandLogoUrls). Route-scoped 30MB JSON limit (global is 100KB).
const largeJson = json({ limit: "30mb" });
publicApprovalRouter.post("/:token/upload", largeJson, async (req, res) => {
  try {
    const [tokenRow] = await db.select().from(approvalTokens).where(eq(approvalTokens.token, req.params.token)).limit(1);
    if (!tokenRow) return res.status(404).json({ error: "Invalid link" });
    if (tokenRow.expiresAt && new Date(tokenRow.expiresAt) < new Date()) return res.status(410).json({ error: "This link has expired." });
    if (tokenRow.usedAt) return res.status(409).json({ error: "This link has already been used." });
    const { filename, contentType, dataBase64 } = req.body as { filename?: string; contentType?: string; dataBase64?: string };
    if (!filename || !contentType || !dataBase64) return res.status(400).json({ error: "filename, contentType, dataBase64 required" });
    const allowed = ["image/png", "image/jpeg", "image/svg+xml", "image/webp", "application/pdf"];
    if (!allowed.includes(contentType)) return res.status(400).json({ error: `Unsupported file type: ${contentType}` });
    const buffer = Buffer.from(dataBase64, "base64");
    if (buffer.byteLength > 25 * 1024 * 1024) return res.status(400).json({ error: "File over 25MB" });
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) return res.status(500).json({ error: "Uploads are not configured on this environment" });
    const { put } = await import("@vercel/blob");
    const blob = await put(`approve-uploads/${filename}`, buffer, { access: "public", contentType, token: blobToken, addRandomSuffix: true });
    res.json({ ok: true, url: blob.url });
  } catch (e: any) {
    console.error("Approval upload error:", e);
    res.status(500).json({ error: "Upload failed" });
  }
});

// NOTE: the public client-facing PO view (GET /:token/po) was removed
// 2026-06-24. The PO / production sheet is admin + supplier access only
// (Romero rule). Client artwork sign-off still runs through GET/POST
// /:token above, which serves mockups for approval, not the PO.

export { publicApprovalRouter };
