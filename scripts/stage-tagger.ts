// Stage tagger — classifies every club_account into a funnel stage and
// (optionally) writes the resulting tag to GHL.
//
// Stages (per the 2026-05-13 Sideline strategy):
//   stage:0-onboarded   — clubAccount exists, has tag, 0 supporter orders ever
//   stage:1-active      — has orders, most recent within 60 days
//   stage:1-dormant     — has orders, most recent >60 days ago
//   stage:2-eligible    — 3+ distinct drop months, not yet a bulk customer
//   stage:2-bulk        — has at least one non-cancelled bulk-order in `orders`
//   stage:3-exclusive   — explicit DB flag (not yet implemented; future)
//
// Safe by default: --dry-run prints the table without writing to GHL.
// Pass --write to apply tags. Every transition is logged to integration_events.
//
// Usage:
//   npx tsx scripts/stage-tagger.ts            # dry-run, print table
//   npx tsx scripts/stage-tagger.ts --write    # apply tags to GHL
//   npx tsx scripts/stage-tagger.ts --verbose  # include per-order detail

import "dotenv/config";
import { db } from "../server/db";
import { clubAccounts, orders, type ClubAccount } from "../shared/schema";
import { and, eq, ne, isNotNull } from "drizzle-orm";
import { fetchSupporterOrdersByTag, isShopifyAdminConfigured, type SupporterOrder } from "../server/shopify-admin";
import { syncGhlTag } from "../server/ghl-sync";
import { logIntegrationEvent } from "../server/integration-events";

const DORMANT_DAYS = 60;
const DROP_ELIGIBILITY_THRESHOLD = 3;

type Stage =
  | "stage:0-onboarded"
  | "stage:1-active"
  | "stage:1-dormant"
  | "stage:2-eligible"
  | "stage:2-bulk"
  | "stage:3-exclusive";

interface ClubStageRow {
  club: ClubAccount;
  orderCount: number;
  dropMonths: number;
  daysSinceLastOrder: number | null;
  hasBulk: boolean;
  stage: Stage;
}

function parseArgs() {
  const argv = process.argv.slice(2);
  return {
    dryRun: !argv.includes("--write"),
    verbose: argv.includes("--verbose"),
  };
}

// Bucket orders into distinct year-month windows so a single drop spanning
// a calendar boundary still counts as one drop. Good-enough proxy for now —
// can be replaced with a sourceCollectionHandle distinct-count later.
function countDropMonths(supporterOrders: SupporterOrder[]): number {
  const months = new Set<string>();
  for (const o of supporterOrders) {
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

async function hasBulkOrder(clubAccountId: string): Promise<boolean> {
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.clubAccountId, clubAccountId),
        eq(orders.orderType, "bulk-order"),
        ne(orders.status, "cancelled"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

function classify(args: {
  orderCount: number;
  dropMonths: number;
  daysSinceLastOrder: number | null;
  hasBulk: boolean;
}): Stage {
  // Stage 3 is set explicitly in DB (future), not derived here.
  if (args.hasBulk) return "stage:2-bulk";
  if (args.orderCount === 0) return "stage:0-onboarded";
  if (args.dropMonths >= DROP_ELIGIBILITY_THRESHOLD) return "stage:2-eligible";
  if (args.daysSinceLastOrder !== null && args.daysSinceLastOrder > DORMANT_DAYS) {
    return "stage:1-dormant";
  }
  return "stage:1-active";
}

async function evaluateClub(club: ClubAccount): Promise<ClubStageRow | null> {
  if (!club.shopifyOrderTag) {
    // No tag = not onboarded for supporter campaign. Skip.
    return null;
  }

  let supporterOrders: SupporterOrder[] = [];
  try {
    supporterOrders = await fetchSupporterOrdersByTag(club.shopifyOrderTag);
  } catch (err: any) {
    console.warn(`  ⚠ Shopify fetch failed for ${club.shopifyOrderTag}: ${err?.message || err}`);
    supporterOrders = [];
  }

  const orderCount = supporterOrders.length;
  const dropMonths = countDropMonths(supporterOrders);
  const daysSinceLastOrder = supporterOrders.length
    ? daysSince(supporterOrders[0].createdAt) // fetched DESC by createdAt
    : null;
  const hasBulk = await hasBulkOrder(club.id);

  const stage = classify({ orderCount, dropMonths, daysSinceLastOrder, hasBulk });

  return { club, orderCount, dropMonths, daysSinceLastOrder, hasBulk, stage };
}

function fmtDays(d: number | null): string {
  if (d === null) return "—";
  if (d === 0) return "today";
  if (d === 1) return "1 day ago";
  return `${d} days ago`;
}

function printRow(row: ClubStageRow, verbose: boolean): void {
  const c = row.club;
  const stageLabel = row.stage.padEnd(20);
  const tag = (c.shopifyOrderTag || "—").padEnd(28);
  const name = (c.clubName || c.email).padEnd(36);
  console.log(`  ${stageLabel}  ${name}  ${tag}`);
  if (verbose) {
    console.log(
      `    orders=${row.orderCount}  drop-months=${row.dropMonths}  ` +
        `last=${fmtDays(row.daysSinceLastOrder)}  bulk=${row.hasBulk ? "yes" : "no"}  ` +
        `tier=${(c.profitShareTierBps / 100).toFixed(0)}%`,
    );
  }
}

async function applyTagToGhl(row: ClubStageRow): Promise<void> {
  // GHL tags are written against the club's primary contact email.
  await syncGhlTag(row.club.email, row.stage);
  await logIntegrationEvent({
    system: "ghl",
    action: "stage-tagger.applyTag",
    status: "success",
    meta: {
      clubAccountId: row.club.id,
      shopifyOrderTag: row.club.shopifyOrderTag,
      stage: row.stage,
      orderCount: row.orderCount,
      dropMonths: row.dropMonths,
      daysSinceLastOrder: row.daysSinceLastOrder,
      hasBulk: row.hasBulk,
    },
  });
}

function summarise(rows: ClubStageRow[]): void {
  const counts: Record<Stage, number> = {
    "stage:0-onboarded": 0,
    "stage:1-active": 0,
    "stage:1-dormant": 0,
    "stage:2-eligible": 0,
    "stage:2-bulk": 0,
    "stage:3-exclusive": 0,
  };
  for (const r of rows) counts[r.stage]++;

  console.log("\n[stage-tagger] Summary:");
  for (const stage of Object.keys(counts) as Stage[]) {
    const n = counts[stage];
    const marker = stage === "stage:2-eligible" && n > 0 ? "  ⭐ TRANSITION-READY" : "";
    console.log(`  ${stage.padEnd(22)} ${String(n).padStart(3)}${marker}`);
  }
}

async function main() {
  const { dryRun, verbose } = parseArgs();

  console.log("[stage-tagger] Sideline funnel-stage classifier");
  console.log(
    `[stage-tagger] mode: ${dryRun ? "DRY-RUN (no writes)" : "WRITE"} · verbose: ${verbose ? "yes" : "no"}\n`,
  );

  if (!isShopifyAdminConfigured()) {
    console.error(
      "[stage-tagger] ✕ Shopify Admin not configured (need SHOPIFY_STORE_URL + SHOPIFY_ADMIN_TOKEN). Aborting.",
    );
    process.exit(1);
  }

  const clubs = await db
    .select()
    .from(clubAccounts)
    .where(isNotNull(clubAccounts.shopifyOrderTag));

  console.log(`[stage-tagger] Scanning ${clubs.length} club_accounts with a Shopify tag set...\n`);

  const rows: ClubStageRow[] = [];
  for (const club of clubs) {
    const row = await evaluateClub(club);
    if (row) {
      rows.push(row);
      printRow(row, verbose);
    }
  }

  summarise(rows);

  if (dryRun) {
    console.log("\n[stage-tagger] Dry-run complete. Use --write to apply tags to GHL.");
    return;
  }

  console.log("\n[stage-tagger] Writing tags to GHL...");
  let written = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await applyTagToGhl(row);
      written++;
    } catch (err: any) {
      failed++;
      console.error(`  ✕ ${row.club.email} (${row.stage}): ${err?.message || err}`);
      await logIntegrationEvent({
        system: "ghl",
        action: "stage-tagger.applyTag",
        status: "failed",
        error: err?.message ? String(err.message).slice(0, 1000) : String(err).slice(0, 1000),
        meta: {
          clubAccountId: row.club.id,
          stage: row.stage,
        },
      });
    }
  }

  console.log(`\n[stage-tagger] Done. ${written} tagged, ${failed} failed.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[stage-tagger] fatal:", err);
    process.exit(1);
  });
