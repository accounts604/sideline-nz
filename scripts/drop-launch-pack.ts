// Drop launch content pack generator.
//
// Given a Shopify collection handle (or a club tag → its supporter
// collection), pull the collection metadata + product mix + the matching
// club_account, render into the drop-launch-pack skill prompt, and call
// the AI provider for a full launch content pack.
//
// Outputs (printed to stdout, copy-pasteable):
//   • Instagram feed caption
//   • Instagram Story 3-slide deck
//   • Facebook caption
//   • LinkedIn caption (Sideline B2B angle)
//   • 4 TikTok / Reel hooks
//   • WhatsApp blurb for the club committee to forward
//   • Drop-launch email (subject, preview, body)
//   • 5 Canva image briefs
//   • Template health note (flags missing hoodie anchor / SKU thin)
//
// Safe: read-only. Never sends, never posts.
//
// Usage:
//   npx tsx scripts/drop-launch-pack.ts --handle 2026-onewhero-rugby-supporters-merch-range
//   npx tsx scripts/drop-launch-pack.ts --tag club:onewhero-rfc
//   npx tsx scripts/drop-launch-pack.ts --tag club:kbhs-rugby --save ~/Desktop/kbhs-launch.json

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../server/db";
import { clubAccounts, type ClubAccount } from "../shared/schema";
import { eq } from "drizzle-orm";
import {
  fetchSupporterOrdersByTag,
  isShopifyAdminConfigured,
} from "../server/shopify-admin";
import { getProvider } from "../server/ai/providers/select";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORE_DOMAIN = process.env.SHOPIFY_STORE_URL || "";
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || "";
const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || "2024-10";

interface Args {
  handle?: string;
  tag?: string;
  savePath?: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--handle") args.handle = argv[++i];
    else if (a === "--tag") args.tag = argv[++i];
    else if (a === "--save") args.savePath = argv[++i];
  }
  if (!args.handle && !args.tag) {
    console.error("Usage: drop-launch-pack.ts --handle <collection-handle> | --tag <club:slug> [--save <path>]");
    process.exit(1);
  }
  return args;
}

function loadSkill(name: string): string {
  const skillsDir = path.join(__dirname, "..", "server", "ai", "skills");
  const body = fs.readFileSync(path.join(skillsDir, `${name}.md`), "utf8");
  return body.replace(/^---\n[\s\S]*?\n---\n/, "");
}

interface CollectionProduct {
  title: string;
  handle: string;
  productType: string | null;
  minPrice: number;
  currency: string;
  imageUrl: string | null;
}

interface Collection {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string | null;
  imageUrl: string | null;
  productCount: number;
  products: CollectionProduct[];
}

async function adminFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (!STORE_DOMAIN || !ADMIN_TOKEN) {
    throw new Error("Shopify Admin not configured (SHOPIFY_STORE_URL + SHOPIFY_ADMIN_TOKEN).");
  }
  const endpoint = `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": ADMIN_TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify Admin HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json: any = await res.json();
  if (json.errors?.length) throw new Error("Shopify Admin GraphQL: " + json.errors.map((e: any) => e.message).join("; "));
  return json.data as T;
}

const COLLECTION_BY_HANDLE_QUERY = /* GraphQL */ `
  query CollectionByHandle($handle: String!) {
    collections(first: 1, query: $handle) {
      nodes {
        id
        title
        handle
        descriptionHtml
        image { url }
        productsCount { count }
        products(first: 20, sortKey: BEST_SELLING) {
          nodes {
            title
            handle
            productType
            featuredImage { url }
            priceRangeV2 { minVariantPrice { amount currencyCode } }
          }
        }
      }
    }
  }
`;

async function fetchCollectionByHandle(handle: string): Promise<Collection | null> {
  const data: any = await adminFetch(COLLECTION_BY_HANDLE_QUERY, { handle: `handle:${handle}` });
  const node = data?.collections?.nodes?.[0];
  if (!node) return null;
  return {
    id: node.id,
    title: node.title,
    handle: node.handle,
    descriptionHtml: node.descriptionHtml || null,
    imageUrl: node.image?.url || null,
    productCount: node.productsCount?.count ?? node.products.nodes.length,
    products: node.products.nodes.map((p: any) => ({
      title: p.title,
      handle: p.handle,
      productType: p.productType || null,
      minPrice: Number(p.priceRangeV2?.minVariantPrice?.amount || 0),
      currency: p.priceRangeV2?.minVariantPrice?.currencyCode || "NZD",
      imageUrl: p.featuredImage?.url || null,
    })),
  };
}

async function loadClubByTag(tag: string): Promise<ClubAccount | null> {
  const rows = await db.select().from(clubAccounts).where(eq(clubAccounts.shopifyOrderTag, tag)).limit(1);
  return rows[0] || null;
}

async function loadClubByHandle(handle: string): Promise<ClubAccount | null> {
  const rows = await db.select().from(clubAccounts).where(eq(clubAccounts.supporterCollectionHandle, handle)).limit(1);
  return rows[0] || null;
}

// Best-effort cutoff date extraction from descriptionHtml (per
// "Sideline drop cutoff rule" memory). Looks for "closes <date>",
// "closing <date>", "cutoff <date>", or ISO dates. Returns ISO string
// or null if not found.
function extractCutoffDate(html: string | null): string | null {
  if (!html) return null;
  const text = html.replace(/<[^>]+>/g, " ");
  // ISO yyyy-mm-dd
  const iso = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) {
    const y = iso[1];
    const m = iso[2].padStart(2, "0");
    const d = iso[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // "closes Friday 30 May" / "closes 30 May 2026" / "closing 30/5/2026"
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const m = text.match(/clos(?:es|ing)\s+(?:on\s+)?(?:[A-Za-z]+\s+)?(\d{1,2})\s+([A-Za-z]+)\s*(20\d{2})?/i);
  if (m) {
    const day = m[1].padStart(2, "0");
    const monKey = m[2].slice(0, 3).toLowerCase();
    const mon = months[monKey];
    const year = m[3] || String(new Date().getUTCFullYear());
    if (mon) return `${year}-${mon}-${day}`;
  }
  return null;
}

function fmtMoney(cents: number, currency = "NZD"): string {
  const symbol = currency === "NZD" ? "$" : currency + " ";
  return symbol + (cents / 100).toLocaleString("en-NZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface PriorStats {
  orderCount: number;
  totalSpendCents: number;
  totalCommissionCents: number;
  currency: string;
}

async function priorStats(club: ClubAccount): Promise<PriorStats | null> {
  if (!club.shopifyOrderTag) return null;
  try {
    const orders = await fetchSupporterOrdersByTag(club.shopifyOrderTag);
    let totalSpendCents = 0;
    for (const o of orders) totalSpendCents += o.totalCents;
    const commission = Math.round((totalSpendCents * club.profitShareTierBps) / 10000);
    return {
      orderCount: orders.length,
      totalSpendCents,
      totalCommissionCents: commission,
      currency: orders[0]?.currency || "NZD",
    };
  } catch (err: any) {
    console.warn(`[drop-launch-pack] ⚠ Prior-stats fetch failed: ${err?.message || err}`);
    return null;
  }
}

function buildUserPrompt(args: {
  club: ClubAccount;
  collection: Collection;
  cutoffDate: string | null;
  prior: PriorStats | null;
}): string {
  const { club, collection, cutoffDate, prior } = args;
  const tierPct = (club.profitShareTierBps / 100).toFixed(0);

  const productLines = collection.products.map(
    (p) => `  - ${p.title}${p.productType ? ` [${p.productType}]` : ""} — from $${p.minPrice.toFixed(0)} ${p.currency}`,
  );

  const priorLines: string[] = [];
  if (prior && prior.orderCount > 0) {
    priorLines.push(
      "",
      `Prior performance with this club (across all past drops):`,
      `  - Supporter orders to date: ${prior.orderCount}`,
      `  - Total supporter spend: ${fmtMoney(prior.totalSpendCents, prior.currency)}`,
      `  - Total commission earned by the club at ${tierPct}%: ${fmtMoney(prior.totalCommissionCents, prior.currency)}`,
      `  (Don't repeat these as "raised" — they are supporter spend / commission. Use them with care if at all.)`,
    );
  } else {
    priorLines.push("", "Prior performance: this is the club's first drop, or no prior orders yet.");
  }

  return [
    `Club name: ${club.clubName}`,
    `Profit share tier: ${tierPct}%`,
    "",
    `Drop / collection: ${collection.title}`,
    `Handle: ${collection.handle}`,
    `Drop cutoff date: ${cutoffDate || "not specified — assume ~14 days from now and bake general urgency without naming a date"}`,
    `Total products in this drop: ${collection.productCount}`,
    "",
    "Products in this collection:",
    ...productLines,
    ...priorLines,
    "",
    "Generate the full launch content pack per the system prompt rules. Return strict JSON only.",
  ].join("\n");
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    instagram_feed_caption: { type: "string" },
    instagram_story_slides: {
      type: "array",
      items: {
        type: "object",
        properties: {
          slide: { type: "number" },
          headline: { type: "string" },
          subline: { type: "string" },
        },
        required: ["slide", "headline", "subline"],
      },
    },
    facebook_caption: { type: "string" },
    linkedin_caption: { type: "string" },
    tiktok_reel_hooks: { type: "array", items: { type: "string" } },
    whatsapp_blurb_for_committee: { type: "string" },
    email_subject: { type: "string" },
    email_preview_text: { type: "string" },
    email_body: { type: "string" },
    image_briefs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          size: { type: "string" },
          brief: { type: "string" },
        },
        required: ["name", "size", "brief"],
      },
    },
    template_health_note: { type: "string" },
    reasoning: { type: "string" },
  },
  required: [
    "instagram_feed_caption",
    "instagram_story_slides",
    "facebook_caption",
    "linkedin_caption",
    "tiktok_reel_hooks",
    "whatsapp_blurb_for_committee",
    "email_subject",
    "email_preview_text",
    "email_body",
    "image_briefs",
    "template_health_note",
    "reasoning",
  ],
} as const;

interface Pack {
  instagram_feed_caption: string;
  instagram_story_slides: { slide: number; headline: string; subline: string }[];
  facebook_caption: string;
  linkedin_caption: string;
  tiktok_reel_hooks: string[];
  whatsapp_blurb_for_committee: string;
  email_subject: string;
  email_preview_text: string;
  email_body: string;
  image_briefs: { name: string; size: string; brief: string }[];
  template_health_note: string;
  reasoning: string;
}

function printPack(p: Pack, header: { club: string; collection: string; cutoff: string | null }): void {
  const hr = "━".repeat(72);
  const sub = "─".repeat(72);
  console.log("\n" + hr);
  console.log(`DROP LAUNCH CONTENT PACK — ${header.club}`);
  console.log(`Collection: ${header.collection}`);
  console.log(`Cutoff: ${header.cutoff || "unspecified — generic urgency baked in"}`);
  console.log(hr);

  console.log("\n[ TEMPLATE HEALTH ]");
  console.log("  " + p.template_health_note);

  console.log("\n[ INSTAGRAM — FEED CAPTION ]");
  console.log(sub);
  console.log(p.instagram_feed_caption);
  console.log(sub);

  console.log("\n[ INSTAGRAM — STORY SLIDES (3) ]");
  for (const s of p.instagram_story_slides) {
    console.log(`  Slide ${s.slide}: ${s.headline}`);
    console.log(`            ${s.subline}`);
  }

  console.log("\n[ FACEBOOK CAPTION ]");
  console.log(sub);
  console.log(p.facebook_caption);
  console.log(sub);

  console.log("\n[ LINKEDIN CAPTION — Sideline B2B angle ]");
  console.log(sub);
  console.log(p.linkedin_caption);
  console.log(sub);

  console.log("\n[ TIKTOK / REEL HOOKS — A/B test ]");
  p.tiktok_reel_hooks.forEach((h, i) => console.log(`  ${String.fromCharCode(65 + i)}. ${h}`));

  console.log("\n[ WHATSAPP — for the club committee to forward ]");
  console.log(sub);
  console.log(p.whatsapp_blurb_for_committee);
  console.log(sub);

  console.log("\n[ EMAIL — drop launch ]");
  console.log(`  Subject:      ${p.email_subject}`);
  console.log(`  Preview text: ${p.email_preview_text}`);
  console.log("  Body:");
  console.log(sub);
  console.log(p.email_body);
  console.log(sub);

  console.log("\n[ CANVA IMAGE BRIEFS ]");
  for (const b of p.image_briefs) {
    console.log(`  ${b.name} (${b.size})`);
    console.log(`    ${b.brief}`);
  }

  console.log("\nAI reasoning: " + p.reasoning);
  console.log(hr + "\n");
}

async function main() {
  const args = parseArgs();

  if (!isShopifyAdminConfigured()) {
    console.error("[drop-launch-pack] ✕ Shopify Admin not configured. Aborting.");
    process.exit(1);
  }

  // Resolve club + collection
  let club: ClubAccount | null = null;
  let handle: string | undefined = args.handle;

  if (args.tag) {
    club = await loadClubByTag(args.tag);
    if (!club) throw new Error(`No club_account found for tag=${args.tag}`);
    if (!club.supporterCollectionHandle) {
      throw new Error(
        `Club ${club.clubName} has no supporterCollectionHandle set. Pass --handle directly.`,
      );
    }
    handle = club.supporterCollectionHandle;
  } else if (handle) {
    club = await loadClubByHandle(handle);
    // It's OK if there's no club account match — drop can still be launched.
  }

  if (!handle) throw new Error("No collection handle resolved.");

  console.log(`[drop-launch-pack] Fetching collection ${handle}...`);
  const collection = await fetchCollectionByHandle(handle);
  if (!collection) throw new Error(`No Shopify collection found for handle=${handle}`);

  if (!club) {
    // Best-effort: derive a club display name from the collection title.
    club = {
      id: "(no-club-account)",
      email: "",
      passwordHash: "",
      clubName: collection.title.replace(/\b20\d{2}\b/g, "").replace(/supporters?.*$/i, "").trim() || collection.title,
      contactId: null,
      shopifyStoreUrl: null,
      shopifyOrderTag: null,
      supporterCollectionHandle: handle,
      supporterCollectionPublished: null,
      supporterDropClosedAt: null,
      profitShareTierBps: 800,
      createdAt: null,
      updatedAt: null,
    } as unknown as ClubAccount;
  }

  const cutoffDate = extractCutoffDate(collection.descriptionHtml);
  const prior = await priorStats(club);

  console.log(
    `[drop-launch-pack] Club: ${club.clubName} · ${collection.productCount} products · ` +
      `cutoff: ${cutoffDate || "unspecified"} · prior orders: ${prior?.orderCount ?? 0}`,
  );

  const system = loadSkill("drop-launch-pack");
  const user = buildUserPrompt({ club, collection, cutoffDate, prior });
  const provider = getProvider();

  console.log(`[drop-launch-pack] Calling ${provider.name}...\n`);
  const res = await provider.complete({
    system,
    user,
    jsonSchema: OUTPUT_SCHEMA as any,
    temperature: 0.5,
    maxOutputTokens: 3000,
  });

  let pack: Pack;
  try {
    pack = JSON.parse(res.text) as Pack;
  } catch (err) {
    console.error("[drop-launch-pack] ✕ Provider returned non-JSON. Raw response:\n");
    console.error(res.text);
    process.exit(1);
  }

  printPack(pack, {
    club: club.clubName,
    collection: collection.title,
    cutoff: cutoffDate,
  });

  if (args.savePath) {
    const expanded = args.savePath.replace(/^~/, process.env.HOME || "~");
    fs.writeFileSync(expanded, JSON.stringify(pack, null, 2));
    console.log(`[drop-launch-pack] Saved JSON to ${expanded}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[drop-launch-pack] fatal:", err?.message || err);
    process.exit(1);
  });
