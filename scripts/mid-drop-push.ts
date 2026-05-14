// Mid-drop momentum push generator.
//
// Halfway through a live supporter drop: pull live numbers, render
// reactivation copy (manager nudge + supporter caption + Story slides +
// lapsed-supporter email + share-card brief).
//
// Safe: read-only. Never sends, never posts.
//
// Usage:
//   npx tsx scripts/mid-drop-push.ts --tag club:onewhero-rfc
//   npx tsx scripts/mid-drop-push.ts --tag club:kbhs-rugby --save ~/Desktop/kbhs-midpush.json

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
  let tag: string | undefined;
  let savePath: string | undefined;
  let cutoffDate: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--tag") tag = argv[++i];
    else if (argv[i] === "--save") savePath = argv[++i];
    else if (argv[i] === "--cutoff") cutoffDate = argv[++i];
  }
  if (!tag) {
    console.error("Usage: mid-drop-push.ts --tag <club:slug> [--cutoff YYYY-MM-DD] [--save <path>]");
    process.exit(1);
  }
  return { tag, savePath, cutoffDate };
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

function daysSince(iso: string): number {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// "Current drop" = orders within the last 30 days. Good-enough proxy.
function currentDropOrders(all: SupporterOrder[]): SupporterOrder[] {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return all.filter((o) => new Date(o.createdAt).getTime() >= cutoff);
}

const SCHEMA = {
  type: "object",
  properties: {
    manager_whatsapp_nudge: { type: "string" },
    supporter_facing_caption: { type: "string" },
    instagram_story_slides: {
      type: "array",
      items: {
        type: "object",
        properties: { slide: { type: "number" }, headline: { type: "string" }, subline: { type: "string" } },
        required: ["slide", "headline", "subline"],
      },
    },
    lapsed_supporter_email: {
      type: "object",
      properties: { subject: { type: "string" }, preview_text: { type: "string" }, body: { type: "string" } },
      required: ["subject", "preview_text", "body"],
    },
    share_card_brief: {
      type: "object",
      properties: { name: { type: "string" }, size: { type: "string" }, brief: { type: "string" } },
      required: ["name", "size", "brief"],
    },
    reasoning: { type: "string" },
  },
  required: [
    "manager_whatsapp_nudge",
    "supporter_facing_caption",
    "instagram_story_slides",
    "lapsed_supporter_email",
    "share_card_brief",
    "reasoning",
  ],
} as const;

async function main() {
  const args = parseArgs();
  if (!isShopifyAdminConfigured()) {
    console.error("[mid-drop-push] ✕ Shopify Admin not configured."); process.exit(1);
  }

  const rows = await db.select().from(clubAccounts).where(eq(clubAccounts.shopifyOrderTag, args.tag)).limit(1);
  const club = rows[0];
  if (!club) throw new Error(`No club_account for tag=${args.tag}`);

  const all = await fetchSupporterOrdersByTag(args.tag);
  const live = currentDropOrders(all);
  if (live.length === 0) {
    console.error(`[mid-drop-push] ✕ No orders in the last 30 days for ${args.tag}. No live drop to push.`);
    process.exit(1);
  }

  let spendCents = 0;
  for (const o of live) spendCents += o.totalCents;
  const commissionCents = Math.round((spendCents * club.profitShareTierBps) / 10000);
  const currency = live[0]?.currency || "NZD";
  const firstOrderDaysAgo = daysSince(live[live.length - 1].createdAt);
  const tierPct = (club.profitShareTierBps / 100).toFixed(0);

  let cutoffLine = "Cutoff date: unspecified — use general urgency (e.g. 'closes soon'), do not name a date";
  let daysRemainingLine = "";
  if (args.cutoffDate) {
    const cutoffMs = new Date(args.cutoffDate + "T23:59:59Z").getTime();
    const daysLeft = Math.max(0, Math.floor((cutoffMs - Date.now()) / (1000 * 60 * 60 * 24)));
    cutoffLine = `Cutoff date: ${args.cutoffDate}`;
    daysRemainingLine = `Days remaining: ${daysLeft}`;
  }

  const userPrompt = [
    `Club name: ${club.clubName}`,
    `Profit share tier: ${tierPct}%`,
    "",
    "Live drop snapshot (orders in last 30 days):",
    `- Orders so far: ${live.length}`,
    `- Supporter spend so far: ${fmtMoney(spendCents, currency)}`,
    `- Commission to club at ${tierPct}% so far: ${fmtMoney(commissionCents, currency)}`,
    `- Days since first order in this drop: ${firstOrderDaysAgo}`,
    cutoffLine,
    daysRemainingLine,
    "",
    "Generate the mid-drop momentum push pack per the system rules. Return strict JSON only.",
  ].filter(Boolean).join("\n");

  const provider = getProvider();
  console.log(`[mid-drop-push] ${club.clubName} · ${live.length} orders · ${fmtMoney(commissionCents, currency)} commission so far. Calling ${provider.name}...\n`);

  const res = await provider.complete({
    system: loadSkill("mid-drop-push"),
    user: userPrompt,
    jsonSchema: SCHEMA as any,
    temperature: 0.4,
    maxOutputTokens: 1800,
  });

  let pack: any;
  try { pack = JSON.parse(res.text); } catch {
    console.error("[mid-drop-push] ✕ Non-JSON response:\n"); console.error(res.text); process.exit(1);
  }

  const hr = "━".repeat(72); const sub = "─".repeat(72);
  console.log("\n" + hr);
  console.log(`MID-DROP MOMENTUM PUSH — ${club.clubName}`);
  console.log(`${live.length} orders · ${fmtMoney(spendCents, currency)} spend · ${fmtMoney(commissionCents, currency)} commission @ ${tierPct}%`);
  console.log(hr);
  console.log("\n[ MANAGER — WhatsApp nudge ]");
  console.log(sub); console.log(pack.manager_whatsapp_nudge); console.log(sub);
  console.log("\n[ SUPPORTER — IG/FB caption ]");
  console.log(sub); console.log(pack.supporter_facing_caption); console.log(sub);
  console.log("\n[ IG STORY — 2 slides ]");
  for (const s of pack.instagram_story_slides) {
    console.log(`  Slide ${s.slide}: ${s.headline}`);
    console.log(`            ${s.subline}`);
  }
  console.log("\n[ LAPSED-SUPPORTER EMAIL ]");
  console.log(`  Subject:      ${pack.lapsed_supporter_email.subject}`);
  console.log(`  Preview:      ${pack.lapsed_supporter_email.preview_text}`);
  console.log("  Body:"); console.log(sub); console.log(pack.lapsed_supporter_email.body); console.log(sub);
  console.log("\n[ SHARE CARD BRIEF ]");
  console.log(`  ${pack.share_card_brief.name} (${pack.share_card_brief.size})`);
  console.log(`  ${pack.share_card_brief.brief}`);
  console.log("\nAI reasoning: " + pack.reasoning);
  console.log(hr + "\n");

  if (args.savePath) {
    const expanded = args.savePath.replace(/^~/, process.env.HOME || "~");
    fs.writeFileSync(expanded, JSON.stringify(pack, null, 2));
    console.log(`[mid-drop-push] Saved JSON to ${expanded}`);
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error("[mid-drop-push] fatal:", err?.message || err); process.exit(1); });
