/**
 * Seed club_logo_assets rows from a list of Canva designs.
 *
 * The server has no direct Canva API integration. This script consumes a
 * JSON file (produced by a Canva MCP query in a separate process) and
 * inserts club_logo_assets rows for every design that matches a known
 * club by name. Run --dry-run first; pass --commit to actually write.
 *
 * How to produce the input JSON:
 *
 *   In a Claude/Canva-MCP session, run search-designs with query "2026"
 *   (and again with "logos", "merch range") to enumerate the supporter
 *   merch-range files. Save the items[] array straight to a file:
 *
 *     [
 *       {
 *         "id": "DAHIYGO5yQ4",
 *         "title": "2026 Wesley College Rugby Supporters Merch Range",
 *         "thumbnail": { "url": "https://design.canva.ai/..." },
 *         "urls": { "view_url": "https://www.canva.com/d/..." },
 *         "page_count": 14
 *       },
 *       ...
 *     ]
 *
 * Run:
 *   npx tsx scripts/seed-club-logo-assets.ts --input /tmp/canva-2026-designs.json
 *   npx tsx scripts/seed-club-logo-assets.ts --input /tmp/canva-2026-designs.json --commit
 *
 * Match scoring: token-overlap between the design title and each club's
 * club_name, with the 2026 / Rugby / Merch / Range / Supporters tokens
 * stop-listed. Threshold is conservative (>= 0.6 jaccard) — anything below
 * gets emitted to the "unmatched" report for manual UI assignment.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { db } from "../server/db";
import { clubAccounts, clubLogoAssets } from "../shared/schema";
import { and, eq } from "drizzle-orm";

interface CanvaItem {
  id: string;
  title?: string;
  thumbnail?: { url?: string };
  urls?: { view_url?: string; edit_url?: string };
  page_count?: number;
}

interface ParsedArgs {
  input?: string;
  commit?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") out.input = argv[++i];
    else if (a === "--commit") out.commit = true;
  }
  return out;
}

// Words that don't help identify the club — drop these before token compare.
const STOP_TOKENS = new Set([
  "2026", "2025", "2024", "the", "merch", "range", "supporters", "supporter",
  "rugby", "club", "sports", "fc", "logos", "logo", "x", "sideline", "nz",
  "and", "&", "set", "1st", "u13", "u14", "u15", "u16", "u17", "u18", "u19",
  "u20", "1st xv", "centenary", "jersey",
]);

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOP_TOKENS.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const t of Array.from(a)) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error("Usage: seed-club-logo-assets.ts --input <canva-designs.json> [--commit]");
    process.exit(1);
  }

  const raw = readFileSync(args.input, "utf8");
  const items: CanvaItem[] = JSON.parse(raw);
  if (!Array.isArray(items)) {
    console.error("Input must be a JSON array of Canva design items");
    process.exit(1);
  }

  const clubs = await db.select().from(clubAccounts);
  console.log(`Loaded ${clubs.length} club_accounts, ${items.length} Canva designs`);

  const matched: Array<{ designId: string; title: string; clubId: string; clubName: string; score: number }> = [];
  const unmatched: Array<{ designId: string; title: string; topMatch?: { clubName: string; score: number } }> = [];

  for (const item of items) {
    if (!item.id || !item.title) continue;
    const designTokens = tokenize(item.title);
    let best: { club: typeof clubs[number]; score: number } | null = null;
    for (const club of clubs) {
      const clubTokens = tokenize(club.clubName);
      const score = jaccard(designTokens, clubTokens);
      if (!best || score > best.score) best = { club, score };
    }
    if (best && best.score >= 0.6) {
      matched.push({
        designId: item.id,
        title: item.title,
        clubId: best.club.id,
        clubName: best.club.clubName,
        score: best.score,
      });
    } else {
      unmatched.push({
        designId: item.id,
        title: item.title,
        topMatch: best ? { clubName: best.club.clubName, score: best.score } : undefined,
      });
    }
  }

  console.log(`\nMatched: ${matched.length}`);
  console.table(matched.slice(0, 30));
  console.log(`\nUnmatched: ${unmatched.length}`);
  console.table(unmatched.slice(0, 30));

  if (!args.commit) {
    console.log("\nDry run — no rows written. Re-run with --commit to insert.");
    return;
  }

  // Idempotent: only insert if (clubAccountId, canvaDesignId) doesn't already
  // exist. Inserted as kind='secondary' so it doesn't bump an existing primary
  // — the operator promotes via the admin UI / Ezra after eyeballing.
  let inserted = 0;
  let skipped = 0;
  for (const m of matched) {
    const existing = await db.select().from(clubLogoAssets)
      .where(and(eq(clubLogoAssets.clubAccountId, m.clubId), eq(clubLogoAssets.canvaDesignId, m.designId)))
      .limit(1);
    if (existing[0]) {
      skipped++;
      continue;
    }
    const source = items.find((i) => i.id === m.designId);
    await db.insert(clubLogoAssets).values({
      clubAccountId: m.clubId,
      canvaDesignId: m.designId,
      canvaPageIndex: null,
      kind: "secondary",
      displayLabel: source?.title || `${m.clubName} — Canva design ${m.designId}`,
      previewUrl: source?.thumbnail?.url ?? null,
      lastSyncedAt: new Date(),
    });
    inserted++;
  }
  console.log(`\nInserted ${inserted}, skipped ${skipped} (already exist).`);
  if (unmatched.length) {
    console.log("Unmatched designs need manual assignment via the admin UI (Club > Logos tab).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
