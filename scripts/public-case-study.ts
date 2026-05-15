// Public case study generator.
//
// Turn a closed Sideline NZ supporter drop into an SEO-ready case study
// at sidelinenz.com/case-studies/<slug>. Outputs URL slug, SEO meta,
// hero, numbers block, story, product breakdown, pull-quote, OG image
// brief.
//
// Safe: read-only.
//
// Usage:
//   npx tsx scripts/public-case-study.ts --tag club:onewhero-rfc
//   npx tsx scripts/public-case-study.ts --tag club:kbhs-rugby --save ~/Desktop/kbhs-case-study.json

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
  type SupporterOrder,
} from "../server/shopify-admin";
import { getProvider } from "../server/ai/providers/select";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const argv = process.argv.slice(2);
  let tag: string | undefined; let savePath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--tag") tag = argv[++i];
    else if (argv[i] === "--save") savePath = argv[++i];
  }
  if (!tag) { console.error("Usage: public-case-study.ts --tag <club:slug> [--save <path>]"); process.exit(1); }
  return { tag, savePath };
}

function loadSkill(name: string): string {
  const skillsDir = path.join(__dirname, "..", "server", "ai", "skills");
  const body = fs.readFileSync(path.join(skillsDir, `${name}.md`), "utf8");
  return body.replace(/^---\n[\s\S]*?\n---\n/, "");
}

function fmtMoney(cents: number, currency = "NZD"): string {
  const symbol = currency === "NZD" ? "$" : currency + " ";
  return symbol + (cents / 100).toLocaleString("en-NZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface ProductLine {
  title: string;
  unitsSold: number;
  spendCents: number;
  commissionCents: number;
}

function topProducts(orders: SupporterOrder[], tierBps: number): ProductLine[] {
  const map = new Map<string, ProductLine>();
  for (const o of orders) {
    for (const l of o.lines) {
      const key = l.title;
      const existing = map.get(key) || { title: l.title, unitsSold: 0, spendCents: 0, commissionCents: 0 };
      existing.unitsSold += l.quantity;
      existing.spendCents += l.unitPriceCents * l.quantity;
      map.set(key, existing);
    }
  }
  for (const p of map.values()) p.commissionCents = Math.round((p.spendCents * tierBps) / 10000);
  return Array.from(map.values()).sort((a, b) => b.spendCents - a.spendCents).slice(0, 8);
}

const SCHEMA = {
  type: "object",
  properties: {
    url_slug: { type: "string" },
    seo_title: { type: "string" },
    meta_description: { type: "string" },
    hero_h1: { type: "string" },
    hero_subhead: { type: "string" },
    the_numbers_block: {
      type: "array",
      items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" }, context: { type: "string" } }, required: ["label", "value", "context"] },
    },
    the_story: { type: "string" },
    the_breakdown: {
      type: "array",
      items: { type: "object", properties: { product: { type: "string" }, units_sold: { type: "number" }, spend_cents: { type: "number" }, commission_cents: { type: "number" } }, required: ["product", "units_sold", "spend_cents", "commission_cents"] },
    },
    pull_quote: { type: "string" },
    cta_block: {
      type: "object",
      properties: { headline: { type: "string" }, body: { type: "string" }, button_text: { type: "string" } },
      required: ["headline", "body", "button_text"],
    },
    og_image_brief: {
      type: "object",
      properties: { size: { type: "string" }, brief: { type: "string" } },
      required: ["size", "brief"],
    },
    reasoning: { type: "string" },
  },
  required: ["url_slug", "seo_title", "meta_description", "hero_h1", "hero_subhead", "the_numbers_block", "the_story", "the_breakdown", "pull_quote", "cta_block", "og_image_brief", "reasoning"],
} as const;

async function main() {
  const args = parseArgs();
  if (!isShopifyAdminConfigured()) { console.error("[public-case-study] ✕ Shopify Admin not configured."); process.exit(1); }

  const rows = await db.select().from(clubAccounts).where(eq(clubAccounts.shopifyOrderTag, args.tag)).limit(1);
  const club: ClubAccount | undefined = rows[0];
  if (!club) throw new Error(`No club_account for tag=${args.tag}`);

  const orders = await fetchSupporterOrdersByTag(args.tag);
  if (orders.length === 0) { console.error(`[public-case-study] ✕ No orders found for ${args.tag}.`); process.exit(1); }

  let spendCents = 0; let unitsSold = 0;
  for (const o of orders) { spendCents += o.totalCents; for (const l of o.lines) unitsSold += l.quantity; }
  const commissionCents = Math.round((spendCents * club.profitShareTierBps) / 10000);
  const currency = orders[0].currency || "NZD";
  const tierPct = (club.profitShareTierBps / 100).toFixed(0);
  const products = topProducts(orders, club.profitShareTierBps);
  const dropDates = orders.map((o) => o.createdAt.slice(0, 10)).sort();
  const firstDate = dropDates[0]; const lastDate = dropDates[dropDates.length - 1];

  const userPrompt = [
    `Club name: ${club.clubName}`,
    `Year: ${new Date().getUTCFullYear()}`,
    `Profit share tier: ${tierPct}%`,
    "",
    "Aggregate performance across all closed drops:",
    `- Total supporter orders: ${orders.length}`,
    `- Total units sold: ${unitsSold}`,
    `- Total supporter spend: ${fmtMoney(spendCents, currency)}`,
    `- Total commission to club at ${tierPct}%: ${fmtMoney(commissionCents, currency)}`,
    `- Committee hours spent: 0`,
    `- Date range: ${firstDate} to ${lastDate}`,
    "",
    "Top products (by spend):",
    ...products.map((p) => `  - ${p.title}: ${p.unitsSold} units, ${fmtMoney(p.spendCents, currency)} spend, ${fmtMoney(p.commissionCents, currency)} commission`),
    "",
    "Generate the public case study per the system rules. Return strict JSON only.",
  ].join("\n");

  const provider = getProvider();
  console.log(`[public-case-study] ${club.clubName} · ${orders.length} orders · ${fmtMoney(commissionCents, currency)} commission. Calling ${provider.name}...\n`);
  const res = await provider.complete({
    system: loadSkill("public-case-study"),
    user: userPrompt,
    jsonSchema: SCHEMA as any,
    temperature: 0.4,
    maxOutputTokens: 2500,
  });

  let pack: any;
  try { pack = JSON.parse(res.text); } catch { console.error("[public-case-study] ✕ Non-JSON:\n"); console.error(res.text); process.exit(1); }

  const hr = "━".repeat(72); const sub = "─".repeat(72);
  console.log("\n" + hr);
  console.log(`PUBLIC CASE STUDY — ${club.clubName}`);
  console.log(`URL: sidelinenz.com/case-studies/${pack.url_slug}`);
  console.log(hr);
  console.log("\n[ SEO ]");
  console.log(`  Title:           ${pack.seo_title}`);
  console.log(`  Meta description: ${pack.meta_description}`);
  console.log(`  URL slug:        ${pack.url_slug}`);
  console.log("\n[ HERO ]");
  console.log(`  H1:      ${pack.hero_h1}`);
  console.log(`  Subhead: ${pack.hero_subhead}`);
  console.log("\n[ THE NUMBERS BLOCK ]");
  for (const n of pack.the_numbers_block) console.log(`  ${n.label.padEnd(28)} ${n.value.padEnd(14)} — ${n.context}`);
  console.log("\n[ THE STORY ]");
  console.log(sub); console.log(pack.the_story); console.log(sub);
  console.log("\n[ THE BREAKDOWN ]");
  for (const b of pack.the_breakdown) {
    console.log(`  ${b.product.padEnd(36)} ${String(b.units_sold).padStart(4)} units · ${fmtMoney(b.spend_cents, currency).padStart(8)} · ${fmtMoney(b.commission_cents, currency)} comm`);
  }
  console.log("\n[ PULL QUOTE ]");
  console.log(`  "${pack.pull_quote}"`);
  console.log("\n[ CTA BLOCK ]");
  console.log(`  ${pack.cta_block.headline}`);
  console.log(`  ${pack.cta_block.body}`);
  console.log(`  Button: ${pack.cta_block.button_text}`);
  console.log("\n[ OG IMAGE BRIEF ]");
  console.log(`  ${pack.og_image_brief.size}`);
  console.log(`  ${pack.og_image_brief.brief}`);
  console.log("\nAI reasoning: " + pack.reasoning);
  console.log(hr + "\n");

  if (args.savePath) {
    const expanded = args.savePath.replace(/^~/, process.env.HOME || "~");
    fs.writeFileSync(expanded, JSON.stringify(pack, null, 2));
    console.log(`[public-case-study] Saved JSON to ${expanded}`);
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error("[public-case-study] fatal:", err?.message || err); process.exit(1); });
