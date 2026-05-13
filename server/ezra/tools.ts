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
import { orders, clubAccounts, orderItems, designFiles } from "@shared/schema";
import { eq, desc, and, or, ilike } from "drizzle-orm";
import { SIDELINE_PRODUCTS } from "@shared/product-catalog";
import { runTask as runAiTask } from "../ai";
import { fetchCollectionStatus, isShopifyAdminConfigured } from "../shopify-admin";
import { extractColorsFromImage } from "../mockup/color-extract";

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

const getOrderTool: ToolDefinition = {
  name: "get_order",
  description: "Look up a single order by id. Returns the order row including customer, PO reference, due date, status, totals.",
  parameters: {
    type: "object",
    properties: { orderId: { type: "string", description: "Order id (uuid)" } },
    required: ["orderId"],
  },
  async execute(args) {
    const rows = await db.select().from(orders).where(eq(orders.id, args.orderId)).limit(1);
    return rows[0] || { error: "not_found" };
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
