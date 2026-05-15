// Voice-note amplifier.
//
// Takes Romero's weekly 5-min founder voice-note transcript and produces:
//   • LinkedIn post (B2B angle, Sideline POV)
//   • Beehiiv newsletter (subject + preview + body, Romero's voice)
//   • Instagram caption (grassroots audience)
//   • 3 pull-quote card briefs (Canva-ready)
//   • Extracted themes (for future planning)
//
// Optionally enriched with current-week Shopify stats if --club is passed.
//
// Input is a plain-text transcript file (.txt or .md). On iPhone, Voice
// Memos auto-transcribes — export the transcript text and drop the .txt
// into your weekly raw folder.
//
// Safe: read-only.
//
// Usage:
//   npx tsx scripts/voice-note-amplifier.ts --transcript ~/Drive/sideline-content-raw/2026-W20/transcript.txt
//   npx tsx scripts/voice-note-amplifier.ts --transcript <file> --club club:onewhero-rfc
//   npx tsx scripts/voice-note-amplifier.ts --transcript <file> --save ~/Desktop/W20-amplified.json

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../server/db";
import { clubAccounts, type ClubAccount } from "../shared/schema";
import { eq, isNotNull } from "drizzle-orm";
import {
  fetchSupporterOrdersByTag,
  isShopifyAdminConfigured,
  type SupporterOrder,
} from "../server/shopify-admin";
import { getProvider } from "../server/ai/providers/select";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Args {
  transcriptPath: string;
  clubTag?: string;
  savePath?: string;
  allClubs: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let transcriptPath: string | undefined;
  let clubTag: string | undefined;
  let savePath: string | undefined;
  let allClubs = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--transcript") transcriptPath = argv[++i];
    else if (argv[i] === "--club") clubTag = argv[++i];
    else if (argv[i] === "--save") savePath = argv[++i];
    else if (argv[i] === "--all-clubs") allClubs = true;
  }
  if (!transcriptPath) {
    console.error("Usage: voice-note-amplifier.ts --transcript <file> [--club <club:slug> | --all-clubs] [--save <path>]");
    process.exit(1);
  }
  return {
    transcriptPath: transcriptPath.replace(/^~/, process.env.HOME || "~"),
    clubTag,
    savePath: savePath?.replace(/^~/, process.env.HOME || "~"),
    allClubs,
  };
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

function daysAgo(iso: string): number {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

interface ClubStat {
  clubName: string;
  tag: string;
  orderCount7d: number;
  orderCount30d: number;
  spendCents30d: number;
  commissionCents30d: number;
  currency: string;
  tierPct: string;
}

async function statsForClub(club: ClubAccount, orders: SupporterOrder[]): Promise<ClubStat> {
  const last7 = orders.filter((o) => daysAgo(o.createdAt) <= 7);
  const last30 = orders.filter((o) => daysAgo(o.createdAt) <= 30);
  let spendCents = 0;
  for (const o of last30) spendCents += o.totalCents;
  const commission = Math.round((spendCents * club.profitShareTierBps) / 10000);
  return {
    clubName: club.clubName,
    tag: club.shopifyOrderTag!,
    orderCount7d: last7.length,
    orderCount30d: last30.length,
    spendCents30d: spendCents,
    commissionCents30d: commission,
    currency: orders[0]?.currency || "NZD",
    tierPct: (club.profitShareTierBps / 100).toFixed(0),
  };
}

async function gatherStats(args: Args): Promise<ClubStat[]> {
  if (!isShopifyAdminConfigured()) return [];
  const stats: ClubStat[] = [];
  if (args.clubTag) {
    const rows = await db.select().from(clubAccounts).where(eq(clubAccounts.shopifyOrderTag, args.clubTag)).limit(1);
    const club = rows[0];
    if (!club) return [];
    const orders = await fetchSupporterOrdersByTag(args.clubTag);
    stats.push(await statsForClub(club, orders));
  } else if (args.allClubs) {
    const clubs = await db.select().from(clubAccounts).where(isNotNull(clubAccounts.shopifyOrderTag));
    for (const club of clubs) {
      try {
        const orders = await fetchSupporterOrdersByTag(club.shopifyOrderTag!);
        stats.push(await statsForClub(club, orders));
      } catch (err: any) {
        console.warn(`  ⚠ Stats fetch failed for ${club.clubName}: ${err?.message || err}`);
      }
    }
  }
  return stats;
}

const SCHEMA = {
  type: "object",
  properties: {
    linkedin_post: { type: "string" },
    beehiiv_newsletter: {
      type: "object",
      properties: {
        subject: { type: "string" },
        preview_text: { type: "string" },
        body: { type: "string" },
      },
      required: ["subject", "preview_text", "body"],
    },
    instagram_caption: { type: "string" },
    quote_cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          card: { type: "number" },
          quote: { type: "string" },
          design_brief: { type: "string" },
        },
        required: ["card", "quote", "design_brief"],
      },
    },
    extracted_themes: { type: "array", items: { type: "string" } },
    reasoning: { type: "string" },
  },
  required: ["linkedin_post", "beehiiv_newsletter", "instagram_caption", "quote_cards", "extracted_themes", "reasoning"],
} as const;

async function main() {
  const args = parseArgs();

  if (!fs.existsSync(args.transcriptPath)) {
    console.error(`[voice-note-amplifier] ✕ Transcript not found: ${args.transcriptPath}`);
    process.exit(1);
  }
  const transcript = fs.readFileSync(args.transcriptPath, "utf8").trim();
  if (transcript.length < 50) {
    console.error(`[voice-note-amplifier] ✕ Transcript suspiciously short (${transcript.length} chars). Aborting.`);
    process.exit(1);
  }

  console.log(`[voice-note-amplifier] Transcript loaded: ${transcript.length} chars (~${Math.round(transcript.split(/\s+/).length / 150)} min spoken)`);

  const stats = await gatherStats(args);
  if (stats.length > 0) {
    console.log(`[voice-note-amplifier] Stats loaded for ${stats.length} club(s).`);
  } else {
    console.log(`[voice-note-amplifier] Running without Shopify stats (no --club / --all-clubs flag).`);
  }

  const statsBlock = stats.length === 0
    ? "No live Shopify stats provided this week."
    : [
        "Current-week Shopify performance (use these if relevant; cite both supporter spend AND commission together):",
        ...stats.map((s) =>
          `  - ${s.clubName} (${s.tag}): ${s.orderCount7d} orders in last 7d, ${s.orderCount30d} in last 30d. ` +
          `Spend 30d: ${fmtMoney(s.spendCents30d, s.currency)}, commission to club at ${s.tierPct}%: ${fmtMoney(s.commissionCents30d, s.currency)}.`,
        ),
      ].join("\n");

  const userPrompt = [
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "Romero's weekly voice-note transcript follows. Select, sequence, and tighten — but never invent.",
    "",
    "=== TRANSCRIPT START ===",
    transcript,
    "=== TRANSCRIPT END ===",
    "",
    statsBlock,
    "",
    "Generate the four-surface amplification pack per the system rules. Return strict JSON only.",
  ].join("\n");

  const provider = getProvider();
  console.log(`[voice-note-amplifier] Calling ${provider.name}...\n`);

  const res = await provider.complete({
    system: loadSkill("voice-note-amplifier"),
    user: userPrompt,
    jsonSchema: SCHEMA as any,
    temperature: 0.5,
    maxOutputTokens: 3000,
  });

  let pack: any;
  try {
    pack = JSON.parse(res.text);
  } catch {
    console.error("[voice-note-amplifier] ✕ Non-JSON response:\n");
    console.error(res.text);
    process.exit(1);
  }

  const hr = "━".repeat(72);
  const sub = "─".repeat(72);

  console.log("\n" + hr);
  console.log(`VOICE-NOTE AMPLIFIER — ${new Date().toISOString().slice(0, 10)}`);
  console.log(hr);

  console.log("\n[ EXTRACTED THEMES ]");
  pack.extracted_themes.forEach((t: string, i: number) => console.log(`  ${i + 1}. ${t}`));

  console.log("\n[ LINKEDIN POST — Romero's personal page ]");
  console.log(sub); console.log(pack.linkedin_post); console.log(sub);

  console.log("\n[ BEEHIIV NEWSLETTER ]");
  console.log(`  Subject:      ${pack.beehiiv_newsletter.subject}`);
  console.log(`  Preview text: ${pack.beehiiv_newsletter.preview_text}`);
  console.log("  Body:");
  console.log(sub); console.log(pack.beehiiv_newsletter.body); console.log(sub);

  console.log("\n[ INSTAGRAM CAPTION ]");
  console.log(sub); console.log(pack.instagram_caption); console.log(sub);

  console.log("\n[ QUOTE CARDS — for Canva ]");
  for (const c of pack.quote_cards) {
    console.log(`\n  Card ${c.card}:`);
    console.log(`    Quote:  "${c.quote}"`);
    console.log(`    Brief:  ${c.design_brief}`);
  }

  console.log("\nAI reasoning: " + pack.reasoning);
  console.log(hr + "\n");

  if (args.savePath) {
    fs.writeFileSync(args.savePath, JSON.stringify(pack, null, 2));
    console.log(`[voice-note-amplifier] Saved JSON to ${args.savePath}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[voice-note-amplifier] fatal:", err?.message || err);
    process.exit(1);
  });
