// Which POs genuinely need chasing with the supplier? Read-only, emits JSON.
//
// Exists because po-health-check's "Dispatched POs (awaiting supplier reply)" section
// is not safe to act on: on 17 Aug 2026 it listed PO-2026-0005 at "111 days" when that
// order had already been DELIVERED, and its ages come from a different field than the
// actual dispatch date. Emailing a supplier about a delivered order burns trust, so the
// batch reads this instead.
//
//   npx tsx scripts/chase-candidates.ts [--stale-days 21]

import "dotenv/config";
import { db } from "../server/db";
import { orders, orderActivity } from "../shared/schema";
import { isNotNull, eq, desc } from "drizzle-orm";

const DAY = 86400000;

const argIdx = process.argv.indexOf("--stale-days");
const STALE_DAYS = argIdx > -1 ? parseInt(process.argv[argIdx + 1], 10) : 21;

// An order that has arrived, been cancelled, or closed is not waiting on the supplier.
const FINISHED = new Set(["delivered", "cancelled", "canceled", "closed", "refunded", "completed"]);

// Regenerating a PDF or somebody opening a link is not progress. Anything else recent
// means the order is actively moving and chasing it would just be noise.
const NOT_PROGRESS = new Set([
  "po_pdf_generated",
  "po_viewed_by_supplier",
  "po_viewed_by_customer",
]);
const MOVING_WINDOW_DAYS = 7;

async function main() {
  const rows = await db.select().from(orders).where(isNotNull(orders.poDispatchedAt));

  const candidates: any[] = [];
  const excluded: any[] = [];

  for (const o of rows as any[]) {
    const ref = o.poReference;
    if (!ref) continue;

    const status = String(o.status ?? "").toLowerCase();
    const stage = String(o.pipelineStage ?? "").toLowerCase();
    if (FINISHED.has(status) || FINISHED.has(stage)) {
      excluded.push({ po: ref, reason: `finished (${o.pipelineStage ?? o.status})` });
      continue;
    }

    const days = Math.floor((Date.now() - new Date(o.poDispatchedAt).getTime()) / DAY);
    if (days < STALE_DAYS) {
      excluded.push({ po: ref, reason: `only ${days}d since dispatch` });
      continue;
    }

    const acts = await db.select().from(orderActivity)
      .where(eq(orderActivity.orderId, o.id))
      .orderBy(desc(orderActivity.createdAt)).limit(15);

    const moving = (acts as any[]).find((a) => {
      if (NOT_PROGRESS.has(String(a.action))) return false;
      const age = (Date.now() - new Date(a.createdAt).getTime()) / DAY;
      return age <= MOVING_WINDOW_DAYS;
    });
    if (moving) {
      excluded.push({ po: ref, reason: `still moving (${moving.action})` });
      continue;
    }

    candidates.push({
      po: ref,
      days,
      customerName: o.customerName ?? null,
      customerEmail: o.customerEmail ?? null,
    });
  }

  candidates.sort((a, b) => b.days - a.days);
  console.log(JSON.stringify({ staleDays: STALE_DAYS, candidates, excluded }, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
