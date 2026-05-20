// Ezra's tool registry — Phase A read-only set.
//
// Each tool is { name, description, parameters (JSON Schema), execute }.
// Gemini function calling consumes the JSON Schema as its tool definition;
// the runner dispatches functionCall events back here by name.
//
// All tools take a `ctx` (userId, conversationId) so they can scope DB
// queries and write to audit log with the right identity.
//
// New tools land here in Phase B-D. Skill-created tools (Phase C) live in
// a separate dynamic registry layered on top.

import { db } from "../db";
import { orders, clubAccounts, orderItems, designFiles, orderSizeBreakdowns, clubLogoAssets } from "@shared/schema";
import { eq, desc, and, or, ilike } from "drizzle-orm";
import { SIDELINE_PRODUCTS } from "@shared/product-catalog";
import { runTask as runAiTask } from "../ai";
import { fetchCollectionStatus, fetchShopifyOrderByNumberOrEmail, isShopifyAdminConfigured } from "../shopify-admin";
import { searchGmailMessages, getGmailThread, createGmailDraft, sendGmail, isGmailConfigured } from "../gmail";
import { sendTelegramCard, isTelegramConfigured } from "../telegram";
import { extractColorsFromImage } from "../mockup/color-extract";
import { storage } from "../storage";
import { extractCanvaDesignId, buildCanvaEditUrl } from "../canva-logos";

export type ToolContext = {
  userId: string;
  conversationId: string;
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema (OpenAPI-flavored, Gemini-compatible subset)
  execute: (args: any, ctx: ToolContext) => Promise<any>;
};

// ─── Tool implementations ─────────────────────────────────────────────

const nameAssetTool: ToolDefinition = {
  name: "name_asset",
  description: "Generate the canonical name for a product image / logo / mockup uploaded to Sideline. Returns `<year> <club> <product> [- <side>]`. Use this when the user asks to name, rename, or label an image. The asset must be reachable as a public URL.",
  parameters: {
    type: "object",
    properties: {
      assetUrl: { type: "string", description: "Public URL of the image (Vercel Blob, Shopify CDN, Drive, etc.)" },
      orderId: { type: "string", description: "Optional — pulls club from the order" },
      clubAccountId: { type: "string", description: "Optional — club account id" },
      clubName: { type: "string", description: "Optional — explicit club name, wins over clubAccountId lookup" },
      productHint: { type: "string", description: "Optional — e.g. 'bucket hat', 'rugby jersey'" },
      side: { type: "string", enum: ["front", "back"], description: "Optional — for torso garments where front/back differs" },
    },
    required: ["assetUrl"],
  },
  async execute(args, ctx) {
    return runAiTask({
      taskName: "name-asset",
      input: {
        assetUrl: args.assetUrl,
        context: {
          orderId: args.orderId,
          clubAccountId: args.clubAccountId,
          clubName: args.clubName,
          productHint: args.productHint,
          side: args.side,
        },
        userId: ctx.userId,
      },
    });
  },
};

// Helper: hydrate an order row with its line items + existing size totals
// so Ezra has everything it needs to plan size allocation in one tool call.
async function hydrateOrder(order: any) {
  const items = await db
    .select({
      id: orderItems.id,
      productName: orderItems.productName,
      productType: orderItems.productType,
      gradeGroup: orderItems.gradeGroup,
      quantity: orderItems.quantity,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));
  // Per-item current size totals so Ezra can show what's already filled
  const existing = await db.select().from(orderSizeBreakdowns).where(eq(orderSizeBreakdowns.orderId, order.id));
  const filledByItem: Record<string, { totalUnits: number; rowCount: number }> = {};
  for (const b of existing) {
    const slot = filledByItem[b.orderItemId] ||= { totalUnits: 0, rowCount: 0 };
    slot.totalUnits += b.quantity;
    slot.rowCount += 1;
  }
  return {
    ...order,
    items: items.map((i) => ({
      ...i,
      currentSizeUnits: filledByItem[i.id]?.totalUnits || 0,
      currentSizeRowCount: filledByItem[i.id]?.rowCount || 0,
    })),
  };
}

const getOrderTool: ToolDefinition = {
  name: "get_order",
  description: "Look up a single order AND its line items (garments). Accepts UUID, PO reference (e.g. 'PO-2026-0018'), or order number (e.g. 'SL-2026-OU7-001'). Returns the order plus an `items[]` array — each item has id, productName, productType, gradeGroup, quantity, currentSizeUnits (already-allocated total). Use this whenever the user references an order, then use the returned item IDs as orderItemId when calling add_size_breakdowns.",
  parameters: {
    type: "object",
    properties: {
      orderId: { type: "string", description: "Order UUID, PO reference (PO-YYYY-NNNN), or order number (SL-YYYY-XXX-NNN). All three resolve to the same order." },
    },
    required: ["orderId"],
  },
  async execute(args) {
    const q = String(args.orderId || "").trim();
    if (!q) return { error: "no_identifier_provided" };

    // 1. Exact UUID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)) {
      const rows = await db.select().from(orders).where(eq(orders.id, q)).limit(1);
      if (rows[0]) return hydrateOrder(rows[0]);
      return { error: "not_found", tried: "uuid" };
    }

    // 2. PO reference (case-insensitive exact)
    const byPo = await db.select().from(orders).where(ilike(orders.poReference, q)).limit(2);
    if (byPo.length === 1) return hydrateOrder(byPo[0]);
    if (byPo.length > 1) return { error: "ambiguous", field: "poReference", matches: byPo.map((o) => ({ id: o.id, poReference: o.poReference, orderNumber: o.orderNumber, accountName: o.accountName })) };

    // 3. Order number (case-insensitive exact)
    const byNum = await db.select().from(orders).where(ilike(orders.orderNumber, q)).limit(2);
    if (byNum.length === 1) return hydrateOrder(byNum[0]);
    if (byNum.length > 1) return { error: "ambiguous", field: "orderNumber", matches: byNum.map((o) => ({ id: o.id, poReference: o.poReference, orderNumber: o.orderNumber, accountName: o.accountName })) };

    // 4. Last resort — partial match on either field
    const partial = await db.select().from(orders).where(or(ilike(orders.poReference, `%${q}%`), ilike(orders.orderNumber, `%${q}%`))).limit(5);
    if (partial.length === 1) return hydrateOrder(partial[0]);
    if (partial.length > 1) return { error: "ambiguous", field: "partial_match", matches: partial.map((o) => ({ id: o.id, poReference: o.poReference, orderNumber: o.orderNumber, accountName: o.accountName })) };

    return { error: "not_found", searched: q };
  },
};

const getClubTool: ToolDefinition = {
  name: "get_club",
  description: "Look up a club account by id, name, or shopify_order_tag (e.g. 'club:onewhero-rfc'). Returns club name, supporter collection handle, profit share basis points, and drop-close timestamp.",
  parameters: {
    type: "object",
    properties: {
      idOrTag: { type: "string", description: "Club account id (uuid), shopify_order_tag, or partial club name" },
    },
    required: ["idOrTag"],
  },
  async execute(args) {
    const q = String(args.idOrTag);
    // try id, then tag, then ilike name
    const byId = await db.select().from(clubAccounts).where(eq(clubAccounts.id, q)).limit(1);
    if (byId[0]) return byId[0];
    const byTag = await db.select().from(clubAccounts).where(eq(clubAccounts.shopifyOrderTag, q)).limit(1);
    if (byTag[0]) return byTag[0];
    const byName = await db.select().from(clubAccounts).where(ilike(clubAccounts.clubName, `%${q}%`)).limit(3);
    if (byName.length === 1) return byName[0];
    if (byName.length > 1) return { error: "ambiguous", matches: byName.map((c) => ({ id: c.id, name: c.clubName, tag: c.shopifyOrderTag })) };
    return { error: "not_found" };
  },
};

const listOrdersTool: ToolDefinition = {
  name: "list_orders",
  description: "List recent orders, optionally filtered. Use this for 'show me recent orders' or 'what's open for Onewhero'.",
  parameters: {
    type: "object",
    properties: {
      clubAccountId: { type: "string", description: "Filter by club" },
      stage: { type: "string", description: "Filter by stage (e.g. 'production', 'design_review')" },
      limit: { type: "integer", description: "Default 20, max 100" },
    },
  },
  async execute(args) {
    const limit = Math.min(Math.max(parseInt(args.limit ?? 20, 10) || 20, 1), 100);
    const conds: any[] = [];
    if (args.clubAccountId) conds.push(eq(orders.clubAccountId, args.clubAccountId));
    if (args.stage) conds.push(eq(orders.pipelineStage, args.stage));
    const rows = conds.length
      ? await db.select().from(orders).where(and(...conds)).orderBy(desc(orders.createdAt)).limit(limit)
      : await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(limit);
    return { orders: rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      poReference: o.poReference,
      customerEmail: o.customerEmail,
      stage: o.pipelineStage,
      dueDate: o.dueDate,
      clubAccountId: o.clubAccountId,
      createdAt: o.createdAt,
    })), count: rows.length };
  },
};

const searchProductsTool: ToolDefinition = {
  name: "search_products",
  description: "Search the Sideline product catalogue (rugby jersey, cricket polo, netball dress, bucket hat, etc.). Returns matching products with material, category, and min order qty.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Substring of the product name or category" },
    },
    required: ["query"],
  },
  async execute(args) {
    const q = String(args.query).toLowerCase();
    const matches = SIDELINE_PRODUCTS.filter(
      (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    ).slice(0, 20);
    return { products: matches.map((p) => ({ id: p.id, name: p.name, category: p.category, material: p.defaultMaterial, minOrder: p.minOrder })) };
  },
};

const getDropStatusTool: ToolDefinition = {
  name: "get_drop_status",
  description: "Get the live status of a club's supporter campaign drop on Shopify. Returns whether the collection is currently published, product count, and the last-seen state used by the auto-PO cron.",
  parameters: {
    type: "object",
    properties: {
      clubAccountId: { type: "string", description: "Club account id" },
    },
    required: ["clubAccountId"],
  },
  async execute(args) {
    if (!isShopifyAdminConfigured()) return { error: "shopify_admin_not_configured" };
    const [club] = await db.select().from(clubAccounts).where(eq(clubAccounts.id, args.clubAccountId)).limit(1);
    if (!club) return { error: "club_not_found" };
    if (!club.supporterCollectionHandle) return { error: "no_supporter_collection_handle_set" };
    const status = await fetchCollectionStatus(club.supporterCollectionHandle);
    if (!status) return { error: "collection_not_found", clubName: club.clubName, collectionHandle: club.supporterCollectionHandle };
    return {
      clubName: club.clubName,
      collectionHandle: club.supporterCollectionHandle,
      publishedNow: status.publishedOnOnlineStore,
      publishedLastSeen: club.supporterCollectionPublished,
      productCount: status.productCount,
      dropClosedAt: club.supporterDropClosedAt,
    };
  },
};

const listRecentDesignsTool: ToolDefinition = {
  name: "list_recent_designs",
  description: "List design files uploaded to an order, newest first. Useful before naming or matching logos.",
  parameters: {
    type: "object",
    properties: {
      orderId: { type: "string", description: "Order id" },
      limit: { type: "integer", description: "Default 20" },
    },
    required: ["orderId"],
  },
  async execute(args) {
    const limit = Math.min(Math.max(parseInt(args.limit ?? 20, 10) || 20, 1), 100);
    const rows = await db
      .select()
      .from(designFiles)
      .where(eq(designFiles.orderId, args.orderId))
      .orderBy(desc(designFiles.createdAt))
      .limit(limit);
    return { designs: rows.map((d) => ({ id: d.id, fileName: d.fileName, fileUrl: d.fileUrl, label: d.label, folder: d.folder, canonicalName: d.canonicalName, status: d.status, createdAt: d.createdAt })) };
  },
};

const extractColoursTool: ToolDefinition = {
  name: "extract_colours",
  description: "Extract the dominant colours used in a design image and propose the nearest Pantone Solid Coated (PMS) code for each. Use when the user asks 'what colours are in this design' or 'what's the PMS code'. Read-only — does NOT save to the order; the user applies via the Extract Colours button in the UI.",
  parameters: {
    type: "object",
    properties: {
      imageUrl: { type: "string", description: "Public URL of a mockup or design image" },
    },
    required: ["imageUrl"],
  },
  async execute(args) {
    const colors = await extractColorsFromImage(args.imageUrl);
    if (!colors) return { error: "extraction_failed" };
    return { colors };
  },
};

// ─── Action tool: bulk-write size breakdowns ─────────────────────────
//
// First action tool exposed to Ezra (read-only set is everything above).
// Used when the user pastes a size list / roster and asks to apply it to
// an order. Each row becomes one orderSizeBreakdowns row — already the
// right shape for the per-player customisation flow shipped earlier.
//
// Does NOT delete or modify existing breakdowns; it appends. If Romero
// wants a clean rewrite he says "clear sizes first" and Ezra would call
// delete (not yet implemented) before this.

const addSizeBreakdownsTool: ToolDefinition = {
  name: "add_size_breakdowns",
  description: "Append per-row size breakdowns to an order item. Use when the user pastes or describes a size list / customisation roster and asks to apply it to an order. Each row creates one orderSizeBreakdowns row. Existing breakdowns are NOT touched — this is additive. If the user says 'replace' or 'clear first', refuse and tell them to delete in the UI before re-adding (no delete tool yet).",
  parameters: {
    type: "object",
    properties: {
      orderItemId: { type: "string", description: "Order item id (use list_recent_designs or get_order to find it)" },
      rows: {
        type: "array",
        description: "Per-row size data. Each row = one unit unless `quantity` is set.",
        items: {
          type: "object",
          properties: {
            size: { type: "string", description: "Size code (e.g. 'Y12', 'M', 'XL', '2XL')" },
            quantity: { type: "integer", description: "Default 1. Set higher for blank/unnamed bulk sizes." },
            playerName: { type: "string", description: "Optional player name for customisation" },
            playerNumber: { type: "string", description: "Optional player number" },
            namePlacement: { type: "string", description: "Where on the garment the name goes. Use canonical options when possible: 'Back Below Number', 'Back Upper', 'Back Mid', 'Left Chest', 'Right Chest', 'Front Center', 'Left Sleeve', 'Right Sleeve'. Free-text accepted for custom placements." },
          },
          required: ["size"],
        },
      },
    },
    required: ["orderItemId", "rows"],
  },
  async execute(args) {
    const [item] = await db.select().from(orderItems).where(eq(orderItems.id, args.orderItemId)).limit(1);
    if (!item) return { error: "order_item_not_found", orderItemId: args.orderItemId };

    const rows = Array.isArray(args.rows) ? args.rows : [];
    if (rows.length === 0) return { error: "no_rows_provided" };
    if (rows.length > 100) return { error: "too_many_rows", limit: 100, received: rows.length };

    const inserted: any[] = [];
    for (const r of rows) {
      if (!r.size || typeof r.size !== "string") continue;
      const [row] = await db
        .insert(orderSizeBreakdowns)
        .values({
          orderId: item.orderId,
          orderItemId: item.id,
          size: String(r.size).trim(),
          quantity: Math.max(1, Math.min(parseInt(r.quantity, 10) || 1, 999)),
          playerName: r.playerName ? String(r.playerName).slice(0, 80) : null,
          playerNumber: r.playerNumber ? String(r.playerNumber).slice(0, 20) : null,
          namePlacement: r.namePlacement ? String(r.namePlacement).slice(0, 60) : null,
          notes: null,
        })
        .returning();
      inserted.push({ id: row.id, size: row.size, quantity: row.quantity, playerName: row.playerName, namePlacement: row.namePlacement });
    }

    return {
      ok: true,
      orderId: item.orderId,
      orderItemId: item.id,
      inserted_count: inserted.length,
      inserted,
    };
  },
};

// ─── Logo asset tools ─────────────────────────────────────────────────
//
// The PO-raise hook reads club_logo_assets to auto-attach the primary
// logo to each order_item.elementUrls. These tools let Ezra answer
// "what logo will go on this PO?" / "which clubs are missing logos?" /
// "set the primary logo for <club> to <Canva URL>" without leaving chat.

const listClubLogosTool: ToolDefinition = {
  name: "list_club_logos",
  description: "Return all logo assets stored for a club. Use this to answer 'what logo will be on the PO for <club>?' or 'show me <club>'s logos'. The row marked kind='primary' is the one the PO-raise hook auto-attaches.",
  parameters: {
    type: "object",
    properties: {
      clubAccountId: { type: "string", description: "Club account id (uuid)" },
    },
    required: ["clubAccountId"],
  },
  async execute(args) {
    const logos = await storage.listClubLogoAssets(String(args.clubAccountId));
    return {
      count: logos.length,
      primary: logos.find((l) => l.kind === "primary") || null,
      logos: logos.map((l) => ({
        id: l.id,
        kind: l.kind,
        displayLabel: l.displayLabel,
        canvaDesignId: l.canvaDesignId,
        canvaPageIndex: l.canvaPageIndex,
        canvaUrl: buildCanvaEditUrl(l.canvaDesignId, l.canvaPageIndex),
        previewUrl: l.previewUrl,
        lastSyncedAt: l.lastSyncedAt,
      })),
    };
  },
};

const setPrimaryLogoTool: ToolDefinition = {
  name: "set_primary_logo",
  description: "Set or replace the primary logo for a club from a Canva URL. The primary logo auto-attaches to every order_item.elementUrls when the PO is raised. Use when the user says 'use <Canva URL> as the logo for <club>' or 'make this the primary logo for <club>'.",
  parameters: {
    type: "object",
    properties: {
      clubAccountId: { type: "string", description: "Club account id (uuid)" },
      canvaUrl: { type: "string", description: "Canva design URL — supports /d/<id> and /design/<id> shapes" },
      canvaPageIndex: { type: "integer", description: "1-based page number for multi-page decks (e.g. the 27-page Sideline Customer Logos master). Omit for single-page designs." },
      displayLabel: { type: "string", description: "Optional human label. Defaults to '<club> — primary'." },
    },
    required: ["clubAccountId", "canvaUrl"],
  },
  async execute(args) {
    const designId = extractCanvaDesignId(String(args.canvaUrl));
    if (!designId) return { error: "could_not_extract_design_id", canvaUrl: args.canvaUrl };
    const [club] = await db.select().from(clubAccounts).where(eq(clubAccounts.id, String(args.clubAccountId))).limit(1);
    if (!club) return { error: "club_not_found" };
    const created = await storage.createClubLogoAsset({
      clubAccountId: club.id,
      canvaDesignId: designId,
      canvaPageIndex: args.canvaPageIndex ?? null,
      kind: "primary",
      displayLabel: args.displayLabel ?? `${club.clubName} — primary`,
      previewUrl: null,
      lastSyncedAt: null,
    } as any);
    return { ok: true, logo: created, club: { id: club.id, name: club.clubName } };
  },
};

const findClubsMissingLogosTool: ToolDefinition = {
  name: "find_clubs_missing_logos",
  description: "List club_accounts that have no primary logo assigned — these clubs will dispatch POs without an auto-attached logo. Use this for 'which clubs need logos?' or before a batch of dispatches to triage.",
  parameters: { type: "object", properties: {} },
  async execute() {
    const rows = await storage.listClubsMissingPrimaryLogo();
    return { count: rows.length, clubs: rows };
  },
};

// ─── Customer-context read tools ──────────────────────────────────────
//
// The three tools below feed Ezra the context it needs to draft replies to
// customer queries. They are read-only and have no isolation boundary — the
// scope check is on the caller (an admin chatting with Ezra, or the
// label-triggered draft pipeline). Don't expose these via any
// unauthenticated route.

const lookupShopifyOrderTool: ToolDefinition = {
  name: "lookup_shopify_order",
  description: "Look up a Shopify order by order number (e.g. '#1042' or '1042') or by customer email. Returns fulfillment status, tracking numbers/URLs, line items, shipping address, and total. When searching by email, returns the most recent order as `primary` plus up to 5 other recent orders for that customer in `others` so you can disambiguate. Use this whenever a customer asks 'where's my order' or references an order number — never guess fulfillment state.",
  parameters: {
    type: "object",
    properties: {
      needle: { type: "string", description: "Either a Shopify order number ('#1042', '1042') or a customer email address." },
      extraMatches: { type: "integer", description: "When the needle is an email, how many additional recent orders to return alongside the primary. Default 5, max 20." },
    },
    required: ["needle"],
  },
  async execute(args) {
    if (!isShopifyAdminConfigured()) return { error: "shopify_admin_not_configured" };
    const needle = String(args.needle || "").trim();
    if (!needle) return { error: "no_needle_provided" };
    const result = await fetchShopifyOrderByNumberOrEmail(needle, { extraMatches: args.extraMatches });
    if (!result.primary) return { error: "not_found", searched: needle };
    return result;
  },
};

const getEmailThreadTool: ToolDefinition = {
  name: "get_email_thread",
  description: "Read a Gmail thread from the orders@sidelinenz.com inbox. Pass `threadId` to load a known thread (every message, oldest first), OR pass `searchQuery` to find recent threads using Gmail search syntax (e.g. 'from:foo@bar.com newer_than:30d', 'subject:#1042'). Returns the parsed messages — From/To/Subject/Snippet/body and labelIds. Use before drafting a customer reply so you have the full conversation history.",
  parameters: {
    type: "object",
    properties: {
      threadId: { type: "string", description: "Gmail thread id (preferred when known)." },
      searchQuery: { type: "string", description: "Gmail search query — used when no threadId is known. Examples: 'from:customer@example.com', 'subject:order #1042'." },
      maxResults: { type: "integer", description: "When using searchQuery, max threads to consider. Default 5, max 25." },
    },
  },
  async execute(args) {
    if (!isGmailConfigured()) return { error: "gmail_not_configured" };
    if (args.threadId) {
      const messages = await getGmailThread(String(args.threadId));
      if (messages.length === 0) return { error: "thread_not_found_or_empty", threadId: args.threadId };
      return { threadId: args.threadId, messages };
    }
    if (!args.searchQuery) return { error: "no_thread_id_or_query" };
    const maxResults = Math.min(Math.max(parseInt(args.maxResults ?? 5, 10) || 5, 1), 25);
    const refs = await searchGmailMessages(String(args.searchQuery), maxResults);
    if (refs.length === 0) return { matches: [], note: "no_messages_for_query" };
    const seen = new Set<string>();
    const threadIds: string[] = [];
    for (const r of refs) {
      if (!seen.has(r.threadId)) {
        seen.add(r.threadId);
        threadIds.push(r.threadId);
      }
    }
    const matches = [];
    for (const tid of threadIds.slice(0, maxResults)) {
      const messages = await getGmailThread(tid);
      if (messages.length) matches.push({ threadId: tid, messages });
    }
    return { matches };
  },
};

// Customer-safe stage mapping. The internal pipeline has many stages;
// Ezra needs a short English phrase it can use in a customer-facing reply
// without leaking internal terms ("design_review_internal", etc.).
function customerSafeStage(o: { pipelineStage: string | null; productionStage: string | null; status: string }): string {
  const ps = (o.pipelineStage || o.productionStage || o.status || "").toLowerCase();
  if (!ps) return "received";
  if (ps.includes("deliver")) return "delivered";
  if (ps.includes("ship") || ps.includes("dispatch")) return "shipped";
  if (ps.includes("quality") || ps.includes("qc")) return "quality check";
  if (ps.includes("production") || ps.includes("manufacture")) return "in production";
  if (ps.includes("sample")) return "sample run";
  if (ps.includes("approve")) return "awaiting approval";
  if (ps.includes("design") || ps.includes("mockup")) return "in design";
  if (ps.includes("brief") || ps.includes("received") || ps.includes("pending")) return "received";
  if (ps.includes("hold")) return "on hold";
  return ps.replace(/[_-]+/g, " ");
}

const getOrderStatusTool: ToolDefinition = {
  name: "get_order_status",
  description: "Customer-safe status view of a Sideline order — what you can quote back to a customer in an email reply. Returns the order number, PO reference, plain-English stage, due date, tracking info, dispatched/on-hold flags, and a one-line line-item summary. Distinct from `get_order` (which exposes supplier costs and internal fields you must NOT share with customers). Accepts UUID, PO reference (PO-YYYY-NNNN), or order number (SL-YYYY-XXX-NNN). Use this when drafting a customer reply.",
  parameters: {
    type: "object",
    properties: {
      orderId: { type: "string", description: "Order UUID, PO reference (PO-YYYY-NNNN), or order number (SL-YYYY-XXX-NNN)." },
    },
    required: ["orderId"],
  },
  async execute(args) {
    const q = String(args.orderId || "").trim();
    if (!q) return { error: "no_identifier_provided" };

    let order: any = null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)) {
      const [row] = await db.select().from(orders).where(eq(orders.id, q)).limit(1);
      order = row;
    }
    if (!order) {
      const [row] = await db.select().from(orders).where(ilike(orders.poReference, q)).limit(1);
      order = row;
    }
    if (!order) {
      const [row] = await db.select().from(orders).where(ilike(orders.orderNumber, q)).limit(1);
      order = row;
    }
    if (!order) return { error: "not_found", searched: q };

    const items = await db
      .select({
        productName: orderItems.productName,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    return {
      orderNumber: order.orderNumber,
      poReference: order.poReference,
      accountName: order.accountName,
      customerStage: customerSafeStage(order),
      rawPipelineStage: order.pipelineStage,
      rawProductionStage: order.productionStage,
      dueDate: order.dueDate,
      estimatedDeliveryDate: order.estimatedDeliveryDate,
      poDispatchedAt: order.poDispatchedAt,
      onHold: Boolean(order.poHeldAt),
      holdReason: order.poHeldAt ? order.poHoldReason : null,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      sampleApprovedByClientAt: order.sampleApprovedByClientAt,
      itemSummary: items.map((i) => `${i.quantity}× ${i.productName}`).join(", "),
      items,
    };
  },
};

// ─── Customer-reply: draft (Gmail draft, never sends) ─────────────────

const FROM_HEADER =
  process.env.SIDELINE_REPLY_FROM ||
  "Sideline NZ Orders <orders@sidelinenz.com>";

function plainTextToHtml(s: string): string {
  const esc = s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = esc.split(/\n\s*\n/).map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`);
  return paragraphs.join("\n");
}

const draftCustomerReplyTool: ToolDefinition = {
  name: "draft_customer_reply",
  description: "Create a Gmail DRAFT customer reply from orders@sidelinenz.com. Does NOT send — the draft lands in Gmail Drafts for a human to review and click Send (or for the Telegram approval flow to release). If `threadId` is given the draft attaches to that thread (i.e. replies inline); otherwise it starts a fresh thread. Use AFTER you've gathered context with lookup_shopify_order / get_email_thread / get_order_status. Never expose supplier names, supplier costs, internal stage strings, or admin notes — phrase status in customer-safe English (see get_order_status output).",
  parameters: {
    type: "object",
    properties: {
      to: { type: "string", description: "Recipient email address." },
      subject: { type: "string", description: "Subject line. If replying into an existing thread, Gmail will normalise to the thread's subject — pass the same subject anyway so the RFC2822 headers match." },
      body: { type: "string", description: "Plain-text body. Greeting, message, sign-off. Don't include HTML — it's wrapped automatically." },
      threadId: { type: "string", description: "Optional Gmail thread id (returned by get_email_thread) to attach the draft to as a reply. Omit for a fresh thread." },
      cc: { type: "string", description: "Optional Cc address (comma-separated for multiple)." },
    },
    required: ["to", "subject", "body"],
  },
  async execute(args) {
    if (!isGmailConfigured()) return { error: "gmail_not_configured" };
    const to = String(args.to || "").trim();
    const subject = String(args.subject || "").trim();
    const body = String(args.body || "");
    if (!to || !subject || !body) return { error: "missing_required_field", required: ["to", "subject", "body"] };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { error: "invalid_to_address", to };

    const draftId = await createGmailDraft(
      {
        from: FROM_HEADER,
        to,
        cc: args.cc ? String(args.cc) : undefined,
        subject,
        html: plainTextToHtml(body),
        text: body,
      },
      args.threadId ? String(args.threadId) : undefined,
    );
    if (!draftId) return { error: "draft_creation_failed", hint: "Check Gmail OAuth creds and server logs." };
    return {
      ok: true,
      draftId,
      to,
      subject,
      threadId: args.threadId || null,
      note: "Draft created in Gmail. NOT sent. Open Drafts in Gmail to review + send.",
    };
  },
};

// ─── Auto-send + escalation (the bounded send path) ───────────────────
//
// send_customer_reply auto-sends a reply ONLY when the body is provably
// safe to send. The tool validates the body itself — Ezra doesn't get to
// declare "this is safe", it has to actually meet the gates.

const PHONE_SHAPED = /(?:\+?\d{1,3}[\s.()\-])?(?:\(?\d{2,4}\)?[\s.()\-])\d{3,4}[\s.()\-]?\d{3,4}/;
const NZ_UNSEPARATED = /\b0(?:[28]00|5[08]00|2[01279]|[3-9])\d{6,8}\b/;
const ESCALATION_KEYWORDS = [
  "refund", "chargeback", "cancel", "cancellation",
  "wrong", "missing", "broken", "damaged", "defective",
  "complaint", "complain", "disappointed", "unhappy", "angry", "upset",
  "lawyer", "legal", "consumer guarantees", "fair trading",
  "manager", "speak to someone", "speak with someone", "call me", "phone me",
  "escalate", "supervisor", "head office",
];
const AUDIT_BCC = process.env.SIDELINE_AUTO_SEND_BCC || "orders@sidelinenz.com";

export function looksLikePhone(body: string): boolean {
  if (PHONE_SHAPED.test(body)) return true;
  if (NZ_UNSEPARATED.test(body)) return true;
  return false;
}

export function escalationHit(text: string): string | null {
  const lower = text.toLowerCase();
  for (const kw of ESCALATION_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

function htmlEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const sendCustomerReplyTool: ToolDefinition = {
  name: "send_customer_reply",
  description: "AUTO-SEND a customer reply via Gmail (from orders@sidelinenz.com). Only use when ALL of these hold: (a) you've gathered context via lookup_shopify_order + get_order_status; (b) the customer's question is a plain order-status query (where is my order, when will it ship, what's the status); (c) you know exactly which order they mean — no ambiguity; (d) the order has a real status signal (dispatched_at, tracking #, or a clear stage). For ANYTHING involving refunds/cancellations/complaints/missing/wrong/manager/legal — DO NOT use this tool. Call flag_for_escalation instead. The tool re-validates these gates server-side: it will REJECT a send if the body contains a phone number or any escalation keyword. Every send BCCs the ops inbox and posts an audit card to Telegram thread 614.",
  parameters: {
    type: "object",
    properties: {
      to: { type: "string", description: "Recipient email address." },
      subject: { type: "string", description: "Subject line. Match the inbound thread's subject when replying inline." },
      body: { type: "string", description: "Plain-text body. Must reference only facts pulled from tool calls. Must NOT contain any phone number. Must NOT contain escalation keywords." },
      threadId: { type: "string", description: "Optional Gmail thread id (from get_email_thread) — attaches the reply inline to that thread." },
      internalOrderRef: { type: "string", description: "Required for audit — the PO reference or order number you're answering about." },
      customerStage: { type: "string", description: "Optional — the customerStage value get_order_status returned, recorded in the audit card." },
    },
    required: ["to", "subject", "body", "internalOrderRef"],
  },
  async execute(args) {
    if (!isGmailConfigured()) return { error: "gmail_not_configured" };
    const to = String(args.to || "").trim();
    const subject = String(args.subject || "").trim();
    const body = String(args.body || "");
    if (!to || !subject || !body) return { error: "missing_required_field", required: ["to", "subject", "body"] };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { error: "invalid_to_address", to };
    if (!args.internalOrderRef) return { error: "missing_internal_order_ref", hint: "Pass the PO reference / order number you're answering about so the audit card has a link." };

    if (looksLikePhone(body)) {
      return {
        error: "blocked_phone_number_in_body",
        reason: "Body contains a phone-number-shaped digit run. Never include a phone number in a customer reply. Direct them to orders@sidelinenz.com instead.",
      };
    }
    const hit = escalationHit(body) || escalationHit(subject);
    if (hit) {
      return {
        error: "blocked_escalation_keyword",
        keyword: hit,
        reason: `The draft contains '${hit}' — this is an escalation signal. Call flag_for_escalation instead of auto-sending.`,
      };
    }

    const msgId = await sendGmail({
      from: process.env.SIDELINE_REPLY_FROM || "Sideline NZ Orders <orders@sidelinenz.com>",
      to,
      bcc: AUDIT_BCC,
      subject,
      html: plainTextToHtml(body),
      text: body,
    });
    if (!msgId) return { error: "gmail_send_failed", hint: "Check Gmail OAuth creds and server logs." };

    if (isTelegramConfigured()) {
      const orderRefStr = String(args.internalOrderRef);
      const stage = args.customerStage ? ` (${htmlEsc(String(args.customerStage))})` : "";
      const preview = body.length > 320 ? body.slice(0, 320) + "…" : body;
      try {
        await sendTelegramCard({
          text: [
            `<b>📤 Ezra auto-reply sent</b>`,
            `Order: ${htmlEsc(orderRefStr)}${stage}`,
            `To: ${htmlEsc(to)}`,
            `Subject: ${htmlEsc(subject)}`,
            "",
            `<i>${htmlEsc(preview)}</i>`,
          ].join("\n"),
        });
      } catch (err) {
        console.error("[ezra] audit card post failed:", err);
      }
    }

    return {
      ok: true,
      sent: true,
      gmailMessageId: msgId,
      to,
      bcc: AUDIT_BCC,
      subject,
      threadId: args.threadId || null,
    };
  },
};

const flagForEscalationTool: ToolDefinition = {
  name: "flag_for_escalation",
  description: "Hand a customer thread off to a human. Use this whenever the inbound carries any whiff of refund/cancellation/complaint/missing/wrong item/legal/'manager'/'call me', OR when you don't have enough context to answer confidently, OR when send_customer_reply rejected your draft on a gate. Posts an escalation card to Telegram thread 614 (Sideline ops) so a human picks it up. Does NOT draft, does NOT send — handing off means a human writes the reply from scratch.",
  parameters: {
    type: "object",
    properties: {
      customerEmail: { type: "string", description: "The customer's email address." },
      customerName: { type: "string", description: "Optional — customer's name if known." },
      orderRef: { type: "string", description: "Optional — PO reference / order number / Shopify order # the query is about." },
      reason: { type: "string", description: "Short classification of why this needs a human: 'refund', 'cancel', 'complaint', 'missing items', 'wrong item', 'asking to speak to manager', 'ambiguous match', 'low confidence', etc." },
      summary: { type: "string", description: "1–3 sentence summary of what the customer is asking / saying, so the human knows what they're picking up." },
      gmailThreadId: { type: "string", description: "Optional Gmail thread id — included in the card so the human can jump straight to the thread." },
    },
    required: ["customerEmail", "reason", "summary"],
  },
  async execute(args) {
    if (!isTelegramConfigured()) {
      return { error: "telegram_not_configured", hint: "Set JARVESI_BOT_TOKEN + KIG_GROUP_CHAT_ID. Falling back: draft a holding reply with draft_customer_reply." };
    }
    const customerEmail = String(args.customerEmail || "").trim();
    if (!customerEmail) return { error: "missing_customer_email" };

    const lines: string[] = [
      `<b>🚨 Sideline customer escalation</b>`,
      `Reason: <b>${htmlEsc(String(args.reason))}</b>`,
      `From: ${htmlEsc(args.customerName ? `${args.customerName} <${customerEmail}>` : customerEmail)}`,
    ];
    if (args.orderRef) lines.push(`Order: ${htmlEsc(String(args.orderRef))}`);
    if (args.gmailThreadId) {
      lines.push(`<a href="https://mail.google.com/mail/u/0/#inbox/${htmlEsc(String(args.gmailThreadId))}">📧 Open thread</a>`);
    }
    lines.push("");
    lines.push(`<i>${htmlEsc(String(args.summary))}</i>`);

    const result = await sendTelegramCard({ text: lines.join("\n") });
    if (!result.ok) return { error: "telegram_post_failed", reason: result.reason };
    return {
      ok: true,
      escalated: true,
      telegramMessageId: result.messageId,
      note: "Posted to Sideline ops thread 614. A human will handle the reply — do not auto-send or draft.",
    };
  },
};

// ─── Registry ─────────────────────────────────────────────────────────

export const EZRA_TOOLS: ToolDefinition[] = [
  nameAssetTool,
  getOrderTool,
  getClubTool,
  listOrdersTool,
  searchProductsTool,
  getDropStatusTool,
  listRecentDesignsTool,
  extractColoursTool,
  addSizeBreakdownsTool,
  listClubLogosTool,
  setPrimaryLogoTool,
  findClubsMissingLogosTool,
  lookupShopifyOrderTool,
  getEmailThreadTool,
  getOrderStatusTool,
  draftCustomerReplyTool,
  sendCustomerReplyTool,
  flagForEscalationTool,
];

export function findTool(name: string): ToolDefinition | undefined {
  return EZRA_TOOLS.find((t) => t.name === name);
}

// Gemini function-calling tool schema. Wraps the tool list in the shape
// Gemini's generateContent API expects.
export function geminiToolSchema() {
  return [{
    functionDeclarations: EZRA_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  }];
}
