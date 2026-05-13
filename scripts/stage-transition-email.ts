// Stage 1→2 transition email drafter.
//
// Given a club_accounts row currently classified as stage:2-eligible by the
// stage-tagger, pull the club's real Stage-1 numbers from Shopify, render
// them into the stage-transition-email skill prompt, and call the AI
// provider for a JSON-shaped draft.
//
// Output: subject + body + A/B alt subject + optional RTS soft-intro
// paragraph. Print to stdout; user pastes into GHL / Gmail to send.
//
// Safe by design: this script reads only. It never sends an email.
//
// Usage:
//   npx tsx scripts/stage-transition-email.ts --club-id <uuid>
//   npx tsx scripts/stage-transition-email.ts --tag club:onewhero-rfc
//   npx tsx scripts/stage-transition-email.ts --tag club:kbhs-rugby --no-rts

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

interface Args {
  clubId?: string;
  tag?: string;
  includeRts: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = { includeRts: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--club-id") args.clubId = argv[++i];
    else if (a === "--tag") args.tag = argv[++i];
    else if (a === "--no-rts") args.includeRts = false;
    else if (a === "--include-rts") args.includeRts = true;
  }
  if (!args.clubId && !args.tag) {
    console.error("Usage: stage-transition-email.ts --club-id <id> | --tag <club:slug> [--no-rts]");
    process.exit(1);
  }
  return args;
}

function loadSkill(name: string): string {
  const skillsDir = path.join(__dirname, "..", "server", "ai", "skills");
  const body = fs.readFileSync(path.join(skillsDir, `${name}.md`), "utf8");
  return body.replace(/^---\n[\s\S]*?\n---\n/, "");
}

async function loadClub(args: Args): Promise<ClubAccount> {
  if (args.clubId) {
    const rows = await db.select().from(clubAccounts).where(eq(clubAccounts.id, args.clubId)).limit(1);
    if (!rows[0]) throw new Error(`No club_account found for id=${args.clubId}`);
    return rows[0];
  }
  const rows = await db
    .select()
    .from(clubAccounts)
    .where(eq(clubAccounts.shopifyOrderTag, args.tag!))
    .limit(1);
  if (!rows[0]) throw new Error(`No club_account found for tag=${args.tag}`);
  return rows[0];
}

function countDropMonths(orders: SupporterOrder[]): number {
  const months = new Set<string>();
  for (const o of orders) {
    const d = new Date(o.createdAt);
    if (!Number.isFinite(d.getTime())) continue;
    months.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months.size;
}

function daysSince(iso: string): number {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtMoney(cents: number, currency = "NZD"): string {
  const symbol = currency === "NZD" ? "$" : currency + " ";
  return symbol + (cents / 100).toLocaleString("en-NZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface ClubStats {
  orderCount: number;
  dropMonths: number;
  totalSpendCents: number;
  totalCommissionCents: number;
  currency: string;
  daysSinceLastOrder: number | null;
}

function summarise(orders: SupporterOrder[], tierBps: number): ClubStats {
  let totalSpendCents = 0;
  for (const o of orders) totalSpendCents += o.totalCents;
  const commissionCents = Math.round((totalSpendCents * tierBps) / 10000);
  return {
    orderCount: orders.length,
    dropMonths: countDropMonths(orders),
    totalSpendCents,
    totalCommissionCents: commissionCents,
    currency: orders[0]?.currency || "NZD",
    daysSinceLastOrder: orders.length ? daysSince(orders[0].createdAt) : null,
  };
}

function buildUserPrompt(club: ClubAccount, stats: ClubStats, includeRts: boolean): string {
  const tierPct = (club.profitShareTierBps / 100).toFixed(0);
  const lastDrop = stats.daysSinceLastOrder === null
    ? "no orders yet"
    : stats.daysSinceLastOrder === 0
    ? "today"
    : `${stats.daysSinceLastOrder} days ago`;
  return [
    `Club name: ${club.clubName}`,
    `Club manager email: ${club.email}`,
    `Profit share tier: ${tierPct}%`,
    "",
    "Their Stage 1 performance to date:",
    `- Distinct drop-months run: ${stats.dropMonths}`,
    `- Total supporter orders: ${stats.orderCount}`,
    `- Total supporter spend across all drops: ${fmtMoney(stats.totalSpendCents, stats.currency)}`,
    `- Total commission earned by the club at ${tierPct}%: ${fmtMoney(stats.totalCommissionCents, stats.currency)}`,
    `- Most recent order: ${lastDrop}`,
    `- Committee hours spent on these drops: 0`,
    "",
    `Include RTS soft-intro paragraph: ${includeRts ? "yes" : "no"}`,
    "",
    "Draft the Stage 1→2 transition email per the system prompt rules. Return strict JSON only.",
  ].join("\n");
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    preview_text: { type: "string" },
    body: { type: "string" },
    alternative_subject: { type: "string" },
    rts_intro_paragraph: { type: ["string", "null"] },
    reasoning: { type: "string" },
  },
  required: ["subject", "preview_text", "body", "alternative_subject", "reasoning"],
} as const;

interface Draft {
  subject: string;
  preview_text: string;
  body: string;
  alternative_subject: string;
  rts_intro_paragraph: string | null;
  reasoning: string;
}

function printDraft(d: Draft, club: ClubAccount, stats: ClubStats, includeRts: boolean): void {
  const tierPct = (club.profitShareTierBps / 100).toFixed(0);
  const hr = "━".repeat(72);
  console.log("\n" + hr);
  console.log(`STAGE 1→2 TRANSITION EMAIL — ${club.clubName}`);
  console.log(`To: ${club.email}`);
  console.log(
    `Context: ${stats.dropMonths} drops · ${stats.orderCount} orders · ` +
      `${fmtMoney(stats.totalSpendCents, stats.currency)} supporter spend · ` +
      `${fmtMoney(stats.totalCommissionCents, stats.currency)} commission @ ${tierPct}%`,
  );
  console.log(hr);
  console.log("\nSUBJECT:        " + d.subject);
  console.log("ALT SUBJECT:    " + d.alternative_subject);
  console.log("PREVIEW TEXT:   " + d.preview_text);
  console.log("\nBODY:");
  console.log("─".repeat(72));
  console.log(d.body);
  console.log("─".repeat(72));
  if (includeRts && d.rts_intro_paragraph) {
    console.log("\nOPTIONAL RTS SOFT-INTRO PARAGRAPH (keep or cut independently):");
    console.log("─".repeat(72));
    console.log(d.rts_intro_paragraph);
    console.log("─".repeat(72));
  }
  console.log("\nAI reasoning: " + d.reasoning);
  console.log(hr + "\n");
}

async function main() {
  const args = parseArgs();

  if (!isShopifyAdminConfigured()) {
    console.error("[stage-transition-email] ✕ Shopify Admin not configured. Aborting.");
    process.exit(1);
  }

  const club = await loadClub(args);
  if (!club.shopifyOrderTag) {
    console.error(`[stage-transition-email] ✕ Club ${club.clubName} has no shopifyOrderTag.`);
    process.exit(1);
  }

  console.log(`[stage-transition-email] Loading orders for ${club.clubName} (${club.shopifyOrderTag})...`);
  const orders = await fetchSupporterOrdersByTag(club.shopifyOrderTag);
  const stats = summarise(orders, club.profitShareTierBps);

  if (stats.orderCount === 0) {
    console.error(`[stage-transition-email] ✕ ${club.clubName} has 0 orders. Not eligible for transition email.`);
    process.exit(1);
  }

  console.log(
    `[stage-transition-email] ${stats.orderCount} orders, ${stats.dropMonths} drop-months, ` +
      `${fmtMoney(stats.totalCommissionCents, stats.currency)} commission earned.\n`,
  );

  const system = loadSkill("stage-transition-email");
  const user = buildUserPrompt(club, stats, args.includeRts);
  const provider = getProvider();

  console.log(`[stage-transition-email] Calling ${provider.name}...`);
  const res = await provider.complete({
    system,
    user,
    jsonSchema: OUTPUT_SCHEMA as any,
    temperature: 0.4,
    maxOutputTokens: 1200,
  });

  let draft: Draft;
  try {
    draft = JSON.parse(res.text) as Draft;
  } catch (err) {
    console.error("[stage-transition-email] ✕ Provider returned non-JSON. Raw response:\n");
    console.error(res.text);
    process.exit(1);
  }

  printDraft(draft, club, stats, args.includeRts);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[stage-transition-email] fatal:", err);
    process.exit(1);
  });
