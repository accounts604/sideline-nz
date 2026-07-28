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
import { ALL_CHART_SIZES } from "@shared/size-charts";
import { storage } from "../storage";
import { clubLogoPlacement } from "../canva-logos";
import { updateGhlOpportunityStage } from "./ghl";
import { sendMockupApprovalRequest, sendClientApprovalResult } from "../email";
import { routeClientChangesToDesigner } from "../designer-feedback";
import { recordPoView, PO_VIEWED_BY_CUSTOMER } from "../po-views";

// ===== Exported helper: create a token + send the email =====

export async function createApprovalToken(params: {
  orderId: string;
  createdBy: string;
  clientEmail: string;
  clientName?: string | null;
  orderNumber: string | null;
  ghlOpportunityId: string | null;
  // When false, skip the default /approve mockup email. Used by the
  // dispatch-to-customer flow, which sends its own /proof email instead.
  sendEmail?: boolean;
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
  if (params.sendEmail !== false) {
    sendMockupApprovalRequest(
      params.clientEmail,
      params.orderNumber || "your order",
      link,
      params.clientName || null,
    ).catch((err) => console.error("Failed to send mockup approval email:", err));
  }

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

    // View tracking — the customer opened their PO via the emailed approval
    // link. Fire-and-forget; deduped per token per hour inside recordPoView.
    void recordPoView({
      orderId: order.id,
      action: PO_VIEWED_BY_CUSTOMER,
      userId: null,
      viewerKey: `token:${tokenRow.token}`,
      viewer: { via: "approval_link" },
      userAgent: req.headers["user-agent"],
      path: req.originalUrl,
    });

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

    // Send the club's change request straight to the designer instead of parking
    // it in Romero's inbox for him to relay by hand. Best-effort: a failure here
    // must never break the client's submission.
    if (decision === "changes_requested") {
      try {
        const outcome = await routeClientChangesToDesigner({
          orderId: order.id,
          orderNumber: order.orderNumber,
          notes: changesNotes || null,
        });
        console.log(`[approvals] ${order.orderNumber} client changes -> designer: ${outcome}`);
        await db.insert(orderActivity).values({
          orderId: order.id,
          userId: null,
          action: "client_changes_sent_to_designer",
          details: { outcome },
        });
      } catch (e: any) {
        console.error(`[approvals] routing client changes to designer failed:`, e?.message);
      }
    }

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

    // Close the loop: attach the customer's primary uploaded logo onto the
    // order's garment items so it actually reaches the PO / production.
    // Idempotent — skips lines that already carry a club logo, and equipment.
    if (brandLogoUrls.length) {
      const primaryUrl = brandLogoUrls[0];
      const parseEls = (e: any) => { try { const a = typeof e === "string" ? JSON.parse(e || "[]") : (e || []); return Array.isArray(a) ? a : []; } catch { return []; } };
      const isNonGarment = (pt?: string | null) => /(^|[-_ ])(balls?|cones?|backpacks?|bags?|towels?|bottles?|socks?)$/i.test((pt || "").toLowerCase());
      const lineItems = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      for (const it of lineItems) {
        if (isNonGarment((it as any).productType)) continue;
        const existing = parseEls((it as any).elementUrls);
        if (existing.some((e: any) => e?.url && !String(e?.name || "").toLowerCase().includes("sideline"))) continue;
        const pl = clubLogoPlacement((it as any).productType);
        const next = [...existing, { name: "Customer Logo", url: primaryUrl, position: pl.position, application: pl.application }];
        await db.update(orderItems).set({ elementUrls: next as any }).where(eq(orderItems.id, it.id));
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

// ===== Interactive customer DESIGN PROOF submit =====
//
// POST /:token/submit — the action bar on the /proof/<token> page posts the
// collected form state here (delivery address, per-line size/qty/name rosters,
// one-size quantities, notes) with a decision of "approved" | "changes".
//
// Defensive by design: quantities are clamped >= 0, empty rows are dropped,
// sizes are validated against the known set, item ids are validated against
// THIS order's lines (a token can never write to another order), and client
// totals are never trusted. Single-use — the token is consumed on submit.
//
// On "approved" this also fires the SAME supplier dispatch the admin
// "Raise PO" button uses (dispatchOrderToSuppliers in routes/admin.ts), so
// customer approval raises + emails the PO to the supplier automatically.

// Accept any size label from any assigned size chart (the customer grid lists
// each garment's chart), plus the legacy bare-numeric/adult set and one-size.
const KNOWN_SIZES = new Set<string>([
  ...ALL_CHART_SIZES,
  "12", "14", "16", "S", "M", "L", "XL", "2XL", "3XL", "One Size", "OSFA",
]);

const proofSubmitSchema = z.object({
  decision: z.enum(["approved", "changes", "changes_requested"]),
  deliveryAddress: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional(),
  // Per-line rosters (the editable "Sizes, Quantities & Names" tables).
  rosters: z.array(z.object({
    itemId: z.string(),
    rows: z.array(z.object({
      playerName: z.string().max(120).optional(),
      size: z.string().max(20).optional(),
      quantity: z.union([z.number(), z.string()]).optional(),
      nameOnBack: z.string().max(120).optional(),
    })).max(500),
  })).max(50).optional(),
  // One-size line quantities (e.g. caps).
  oneSizes: z.array(z.object({
    itemId: z.string(),
    quantity: z.union([z.number(), z.string()]).optional(),
  })).max(50).optional(),
});

function clampQty(v: unknown): number {
  const n = parseInt(String(v ?? "0"), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 9999);
}

publicApprovalRouter.post("/:token/submit", async (req, res) => {
  try {
    const parsed = proofSubmitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid payload" });
    }
    const body = parsed.data;
    const decision: "approved" | "changes" = body.decision === "approved" ? "approved" : "changes";

    const [tokenRow] = await db
      .select()
      .from(approvalTokens)
      .where(eq(approvalTokens.token, req.params.token))
      .limit(1);

    if (!tokenRow) return res.status(404).json({ error: "Invalid approval link" });
    if (tokenRow.usedAt) return res.status(409).json({ error: "This proof has already been submitted." });
    if (tokenRow.expiresAt && new Date(tokenRow.expiresAt) < new Date()) {
      return res.status(410).json({ error: "This proof link has expired. Contact Sideline NZ for a new one." });
    }

    const [order] = await db.select().from(orders).where(eq(orders.id, tokenRow.orderId)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Validate item ids against THIS order's lines — never trust client ids.
    const lineRows = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const validItemIds = new Set(lineRows.map((r) => r.id));

    // ── Replace size breakdowns for each submitted roster line ──
    let rowsWritten = 0;
    for (const roster of body.rosters || []) {
      if (!validItemIds.has(roster.itemId)) continue;
      // Build the cleaned rows first; only replace if we have at least one valid row.
      const clean = (roster.rows || [])
        .map((r) => ({
          size: (r.size || "").trim(),
          quantity: clampQty(r.quantity),
          playerName: (r.playerName || "").trim().slice(0, 120) || null,
          namePlacement: (r.nameOnBack || "").trim().slice(0, 120) || null,
        }))
        .filter((r) => r.size && KNOWN_SIZES.has(r.size) && r.quantity > 0);
      if (!clean.length) continue;
      // Replace this line's breakdowns wholesale with the customer's roster.
      await db.delete(orderSizeBreakdowns).where(eq(orderSizeBreakdowns.orderItemId, roster.itemId));
      for (const r of clean) {
        await db.insert(orderSizeBreakdowns).values({
          orderId: order.id,
          orderItemId: roster.itemId,
          size: r.size,
          quantity: r.quantity,
          playerName: r.playerName,
          namePlacement: r.namePlacement,
        } as any);
        rowsWritten++;
      }
      // Keep the line's headline quantity in sync with the roster total.
      const total = clean.reduce((s, r) => s + r.quantity, 0);
      await db.update(orderItems).set({ quantity: total }).where(eq(orderItems.id, roster.itemId));
    }

    // ── One-size line quantities (e.g. caps) ──
    for (const os of body.oneSizes || []) {
      if (!validItemIds.has(os.itemId)) continue;
      await db.update(orderItems).set({ quantity: clampQty(os.quantity) }).where(eq(orderItems.id, os.itemId));
    }

    // ── Delivery address ──
    const deliveryAddress = (body.deliveryAddress || "").trim().slice(0, 2000);
    const notes = (body.notes || "").trim().slice(0, 4000);

    const approverName = order.customerName
      || [order.customerFirstName, order.customerLastName].filter(Boolean).join(" ").trim()
      || null;

    if (decision === "approved") {
      await db.update(orders).set({
        ...(deliveryAddress ? { deliveryAddress } : {}),
        designStatus: "approved",
        clubPortalStatus: "design_approved",
        mockupApprovedAt: new Date(),
        artworkApproved: true,
        artworkApprovedBy: approverName,
        artworkApprovedAt: new Date(),
        productionStage: "design_confirmed",
        updatedAt: new Date(),
      } as any).where(eq(orders.id, order.id));
    } else {
      await db.update(orders).set({
        ...(deliveryAddress ? { deliveryAddress } : {}),
        designStatus: "needs_revision",
        clubPortalStatus: "revision_in_progress",
        revisionNotes: notes || null,
        updatedAt: new Date(),
      } as any).where(eq(orders.id, order.id));
    }

    // Consume the token (single-use — matches the legacy approve handler).
    await db.update(approvalTokens)
      .set({ usedAt: new Date(), decision: decision === "approved" ? "approved" : "changes_requested", changesNotes: notes || null })
      .where(eq(approvalTokens.id, tokenRow.id));

    await db.insert(orderActivity).values({
      orderId: order.id,
      userId: null,
      action: decision === "approved" ? "client_approved_proof" : "client_requested_proof_changes",
      details: {
        source: "design_proof_link",
        tokenId: tokenRow.id,
        rowsWritten,
        deliveryAddressUpdated: !!deliveryAddress,
        notes: notes || null,
      },
    });

    // GHL: push back to "Mockup In Progress" on a change request (mirrors the
    // legacy approve handler). On approval, dispatch advances GHL to PO Raised.
    if (decision === "changes" && order.ghlOpportunityId) {
      updateGhlOpportunityStage(order.ghlOpportunityId, "Mockup In Progress").catch((err) =>
        console.error("Failed to push GHL back to Mockup In Progress:", err),
      );
    }

    // Notify admin (best-effort) — reuse the existing result notifier.
    const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || "info@sidelinenz.com";
    sendClientApprovalResult(
      adminEmail,
      order.orderNumber || order.id,
      decision === "approved" ? "approved" : "changes_requested",
      notes || null,
    ).catch((err) => console.error("Failed to send admin proof notification:", err));

    // ── HARD REQUIREMENT: customer approval fires the supplier dispatch ──
    // Calls the SAME function the admin "Raise PO" button uses, so the PO is
    // raised + emailed to the supplier(s) automatically. Dynamic import avoids
    // the admin↔approvals circular static dependency. If dispatch can't run
    // (QC gate, unresolved supplier), we DON'T roll back the approval — we log
    // it so ops can finish the dispatch from the admin order page.
    let dispatch: { ok: boolean; error?: string; groups?: number } = { ok: false };
    if (decision === "approved") {
      try {
        const { dispatchOrderToSuppliers } = await import("./admin");
        const result = await dispatchOrderToSuppliers(order.id, { userId: tokenRow.createdBy || undefined });
        if (result.ok) {
          dispatch = { ok: true, groups: result.groups.length };
        } else {
          dispatch = { ok: false, error: result.error };
          console.error(`[proof-submit] Supplier dispatch failed for ${order.poReference || order.id}: ${result.error}`);
        }
      } catch (e: any) {
        dispatch = { ok: false, error: String(e?.message || e) };
        console.error("[proof-submit] Supplier dispatch threw:", e);
      }
      await db.insert(orderActivity).values({
        orderId: order.id,
        userId: null,
        action: dispatch.ok ? "supplier_dispatch_auto_fired" : "supplier_dispatch_auto_failed",
        details: { source: "design_proof_approval", ...dispatch },
      }).catch(() => {});
    }

    res.json({ ok: true, decision, rowsWritten, dispatch });
  } catch (e: any) {
    console.error("Proof submit error:", e);
    res.status(500).json({ error: "Failed to submit your proof. Please try again." });
  }
});

// NOTE: the public client-facing PO view (GET /:token/po) was removed
// 2026-06-24. The PO / production sheet is admin + supplier access only
// (Romero rule). Client artwork sign-off still runs through GET/POST
// /:token above, which serves mockups for approval, not the PO.

// ===== Public proof page (no auth — token in URL) =====
//
// GET /proof/:token — serves the interactive customer DESIGN PROOF straight as
// HTML (not the SPA). Mirrors the GET /:token validation (not expired, not
// used), then renders generatePoHtml(orderId, { audience:'customer',
// interactive:true, submitUrl }) with the action bar wired to POST the form
// state to /api/approve/:token/submit. Mounted at /proof in routes/index.ts.

function proofMessagePage(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
  <body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#faf7f3;margin:0">
    <div style="max-width:540px;margin:90px auto;text-align:center;padding:0 22px">
      <h1 style="color:#5b1a2e;font-size:22px;margin:0 0 12px">${title}</h1>
      <p style="font-size:15px;color:#444;line-height:1.6">${body}</p>
      <p style="font-size:13px;color:#888;margin-top:20px">Need a hand? Email <a href="mailto:orders@sidelinenz.com" style="color:#5b1a2e">orders@sidelinenz.com</a></p>
    </div>
  </body></html>`;
}

const publicProofRouter = Router();

publicProofRouter.get("/:token", async (req, res) => {
  try {
    const [tokenRow] = await db
      .select()
      .from(approvalTokens)
      .where(eq(approvalTokens.token, req.params.token))
      .limit(1);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (!tokenRow) {
      return res.status(404).send(proofMessagePage("Link not found", "This design-proof link is invalid. Please check the link in your email or contact us for a new one."));
    }
    if (tokenRow.expiresAt && new Date(tokenRow.expiresAt) < new Date()) {
      return res.status(410).send(proofMessagePage("Link expired", "This design-proof link has expired. Contact Sideline NZ and we'll send you a fresh one."));
    }
    if (tokenRow.usedAt) {
      const wasApproved = tokenRow.decision === "approved";
      return res.status(409).send(proofMessagePage(
        wasApproved ? "Already approved" : "Already submitted",
        wasApproved
          ? "Thanks — this design has already been approved and your order is in production. Get in touch if anything needs to change."
          : "Thanks — we've already received your response on this proof. Our team will follow up shortly.",
      ));
    }

    // View tracking — the customer opened the interactive design proof (their
    // PO) via the emailed link. Same viewerKey as the approval hydrate so the
    // two surfaces dedupe together (one event per token per hour).
    void recordPoView({
      orderId: tokenRow.orderId,
      action: PO_VIEWED_BY_CUSTOMER,
      userId: null,
      viewerKey: `token:${tokenRow.token}`,
      viewer: { via: "proof_link" },
      userAgent: req.headers["user-agent"],
      path: req.originalUrl,
    });

    const { generatePoHtml } = await import("../po-pdf");
    // Relative submit URL — resolves to the same origin serving this page.
    const submitUrl = `/api/approve/${req.params.token}/submit`;
    const html = await generatePoHtml(tokenRow.orderId, { audience: "customer", interactive: true, submitUrl });
    if (!html) return res.status(404).send(proofMessagePage("Order not found", "We couldn't load this order. Please contact Sideline NZ."));
    res.send(html);
  } catch (e: any) {
    console.error("Proof page error:", e);
    res.status(500).setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(proofMessagePage("Something went wrong", "We couldn't load your design proof right now. Please try again shortly."));
  }
});

export { publicApprovalRouter, publicProofRouter };
