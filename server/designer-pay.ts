// Designer pay accrual, on the NZD ladder.
//
// Speed and effort are scored separately (shared/designer-pay-ladder.ts) and the
// row is written in the same request as the QC approve that earns it.
// UNIQUE(job_id, kind) means a retried or double-tapped approve cannot pay
// twice — the second insert conflicts and is ignored, rather than relying on a
// check-then-insert that races.
import { eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { designerJobs, designerLedger } from "@shared/schema";
import { computeDropPay, computeOrderCut, MIN_ITEMS } from "@shared/designer-pay-ladder";
import { elapsedHours } from "@shared/designer-clock";

/** How many items the set was. The brief's garment list is the contract. */
function itemCount(job: typeof designerJobs.$inferSelect): number {
  const pack = job.promptPack as { garments?: unknown[] } | null;
  if (Array.isArray(pack?.garments) && pack.garments.length) return pack.garments.length;
  const subs = Array.isArray(job.submissions) ? job.submissions.length : 0;
  return subs || MIN_ITEMS;
}

/**
 * Accrue the drop fee for a job that has just passed QC.
 * Idempotent by DB constraint, not by checking first.
 */
export async function accrueDropFee(job: typeof designerJobs.$inferSelect): Promise<string> {
  if (job.practice) return "practice drop — no accrual";
  if (!job.designerName || job.designerName === "unassigned") return "no designer on the job — nothing to accrue";
  if (!job.claimedAt || !job.submittedAt) return "no claim/submit timestamps — cannot score the ladder";

  const items = itemCount(job);
  const elapsed = elapsedHours(job.claimedAt, job.submittedAt, job.pausedMs);
  const pay = computeDropPay(items, elapsed);

  const rows = await db
    .insert(designerLedger)
    .values({
      jobId: job.id,
      designerName: job.designerName,
      kind: "drop",
      amountNzd: String(pay.totalNzd),
      onTime: job.qcOnTime !== false,
      note: `${job.quoteId} — ${pay.label}, ${pay.items} items`,
      breakdown: pay,
    })
    .onConflictDoNothing({ target: [designerLedger.jobId, designerLedger.kind] })
    .returning();

  if (!rows.length) return `already accrued for ${job.quoteId}`;
  return `accrued NZD $${pay.totalNzd} to ${job.designerName} for ${job.quoteId} (${pay.items} items, ${pay.elapsedHours}h vs ${pay.targetHours}h target)`;
}

/**
 * Accrue the order cut once a drop's order is actually paid. Separate kind, so
 * the unique constraint lets it sit alongside the drop fee without colliding.
 */
export async function accrueOrderCut(jobId: string, designerName: string, orderTotalNzd: number, ref: string): Promise<string> {
  const amount = computeOrderCut(orderTotalNzd);
  if (amount <= 0) return "no order value — nothing to accrue";
  const rows = await db
    .insert(designerLedger)
    .values({
      jobId, designerName, kind: "order_cut",
      amountNzd: String(amount),
      note: `2% of ${ref} (NZD $${orderTotalNzd.toFixed(2)})${amount >= 100 ? " — capped" : ""}`,
      breakdown: { orderTotalNzd, pct: 0.02, capped: amount >= 100 },
    })
    .onConflictDoNothing({ target: [designerLedger.jobId, designerLedger.kind] })
    .returning();
  return rows.length ? `accrued NZD $${amount} order cut for ${ref}` : `order cut already accrued for ${ref}`;
}

/** Everything owed but not yet paid, for the Friday run. */
export async function unpaidLedger() {
  return db.select().from(designerLedger).where(isNull(designerLedger.paidAt));
}
