// Backdate scanner for un-handled customer enquiries.
//
// The Gmail filter only labels NEW inbound mail with `sideline-auto-queue`.
// Anything that arrived before the filter was wired up sits in the inbox
// without the label and so the 15-min cron never touches it. This script
// finds those threads, runs them through the same Ezra pipeline, and
// labels them as handled when done.
//
// Behaviour mirrors process-sideline-queue.ts — same Ezra runner, same
// reply paths (send / draft / escalate), same Telegram audit. The only
// difference is the Gmail search: we cast a wider net (date range, no
// label requirement) so historical enquiries get picked up.
//
// SAFE BY DEFAULT — dry-runs unless --live. Always print the summary
// before running --live.
//
// Run:
//   npx tsx scripts/backdate-customer-enquiries.ts                       # dry-run, last 30d
//   npx tsx scripts/backdate-customer-enquiries.ts --since 2026-04-01    # dry-run, custom start
//   npx tsx scripts/backdate-customer-enquiries.ts --since 2026-04-01 --live --limit 25
//   npx tsx scripts/backdate-customer-enquiries.ts --thread <id> --live
//
// Tuning:
//   --since YYYY-MM-DD    Start date inclusive (default: 30 days ago)
//   --before YYYY-MM-DD   End date exclusive (default: today)
//   --limit N             Max threads per run (default 25, hard cap 100)
//   --live                Actually call Ezra + send/draft/escalate (default off)
//   --thread <id>         Process exactly one Gmail thread id, ignore other filters
//   --include-suppliers   Don't exclude supplier domains (default: excludes)

import "dotenv/config";
import { processCustomerQueue, processThread } from "../server/ezra/queue-processor";

const HARD_LIMIT = 100;
const DEFAULT_LIMIT = 25;
const DEFAULT_LOOKBACK_DAYS = 30;

const SUPPLIER_DOMAINS = ["puffin-sports.com", "wdnice.com"];
const INTERNAL_DOMAINS = ["sidelinenz.com", "kig.co.nz"];

function arg(name: string): string | undefined {
  const i = process.argv.findIndex((a) => a === `--${name}`);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function isoDateOrThrow(s: string | undefined, fallback: () => string): string {
  if (!s) return fallback();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`Invalid date "${s}" — expected YYYY-MM-DD`);
  }
  return s;
}

function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildQuery(opts: { since: string; before: string; includeSuppliers: boolean }): string {
  const parts: string[] = [
    `to:orders@sidelinenz.com`,
    `after:${opts.since.replace(/-/g, "/")}`,
    `before:${opts.before.replace(/-/g, "/")}`,
    `-label:sideline-auto-handled`,
  ];
  for (const d of INTERNAL_DOMAINS) parts.push(`-from:@${d}`);
  if (!opts.includeSuppliers) {
    for (const d of SUPPLIER_DOMAINS) parts.push(`-from:@${d}`);
  }
  return parts.join(" ");
}

async function main() {
  const threadId = arg("thread");
  const since = isoDateOrThrow(arg("since"), () => daysAgo(DEFAULT_LOOKBACK_DAYS));
  const before = isoDateOrThrow(arg("before"), () => {
    // before: is exclusive in Gmail; bump tomorrow so today's mail is included
    return daysAgo(-1);
  });
  const limit = Math.min(Math.max(parseInt(arg("limit") || `${DEFAULT_LIMIT}`, 10), 1), HARD_LIMIT);
  const live = flag("live");
  const includeSuppliers = flag("include-suppliers");

  console.log("─".repeat(60));
  console.log("Sideline backdate scan");
  console.log("─".repeat(60));

  if (threadId) {
    console.log(`Mode: single thread (${threadId})`);
  } else {
    const query = buildQuery({ since, before, includeSuppliers });
    console.log(`Date window: ${since} → ${before} (exclusive)`);
    console.log(`Limit: ${limit}`);
    console.log(`Gmail query: ${query}`);
  }
  console.log(`Live: ${live ? "YES — will reply / draft / escalate" : "no (dry-run)"}`);
  console.log("─".repeat(60));

  const log = (line: string) => console.log(line);

  if (threadId) {
    const r = await processThread(threadId, { live, log });
    console.log("\nResult:", JSON.stringify(r, null, 2));
    return;
  }

  const query = buildQuery({ since, before, includeSuppliers });
  const result = await processCustomerQueue({ live, limit, query, log });

  console.log("\n─".repeat(60));
  console.log("Summary");
  console.log("─".repeat(60));
  console.log(`Scanned: ${result.scanned}`);
  if (Object.keys(result.totals).length === 0) {
    console.log("Totals: (none)");
  } else {
    for (const [status, n] of Object.entries(result.totals)) {
      console.log(`  ${status.padEnd(28)} ${n}`);
    }
  }

  if (!live && result.scanned > 0) {
    console.log("\nDry-run only. Re-run with --live to actually reply / draft / escalate.");
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
