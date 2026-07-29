// Designer pay accrual.
//
// This has never run. Accrual previously lived in a workspace jsonl file synced
// by a cron keyed on quote.json, and the ledger file was never created — so the
// money path was entirely unproven while everything upstream of it worked.
//
// Now the approval that earns the money and the row that records it happen in
// the same request. UNIQUE(job_id, kind) means a retried or double-tapped
// approve cannot pay twice; the second insert simply conflicts and is ignored.
import { eq } from "drizzle-orm";
import { db } from "./db";
import { designerJobs, designerLedger } from "@shared/schema";

/** Locked 2026-07-18: USD 15 per approved on-time drop, USD 30 store bonus. */
export const DROP_RATE_USD = 15;
export const STORE_BONUS_USD = 30;

/**
 * Accrue the drop fee for a job that has just passed QC.
 * Idempotent by DB constraint, not by checking first — a check-then-insert race
 * is exactly how double payments happen.
 */
export async function accrueDropFee(job: typeof designerJobs.$inferSelect): Promise<string> {
  if (job.practice) return "practice drop — no accrual";
  if (!job.designerName || job.designerName === "unassigned") return "no designer on the job — nothing to accrue";

  // Late work still passed QC, so it is recorded rather than silently skipped;
  // on_time carries the fact so the Friday pay run can apply the rule.
  const onTime = job.qcOnTime !== false;

  const rows = await db
    .insert(designerLedger)
    .values({
      jobId: job.id,
      designerName: job.designerName,
      kind: "drop",
      amountUsd: String(onTime ? DROP_RATE_USD : 0),
      onTime,
      note: onTime ? `Approved on time — ${job.quoteId}` : `Approved LATE — ${job.quoteId}, no drop fee`,
    })
    .onConflictDoNothing({ target: [designerLedger.jobId, designerLedger.kind] })
    .returning();

  if (!rows.length) return `already accrued for ${job.quoteId}`;
  return `accrued $${onTime ? DROP_RATE_USD : 0} to ${job.designerName} for ${job.quoteId} (on_time=${onTime})`;
}

/** Everything owed but not yet paid, for the Friday run. */
export async function unpaidLedger() {
  return db.select().from(designerLedger).where(eq(designerLedger.paidAt, null as any));
}
