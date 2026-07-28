// designer-feedback.ts — route a client's change request straight to the designer.
//
// The asymmetry this deliberately preserves (2026-07-20 stress test): the
// CLIENT'S words flow inbound to the designer automatically, but the designer
// gets no outbound channel to the client. An offshore freelancer replying
// directly to a Pacific club without brand or cultural context is a real risk
// to relationships Sideline has spent years building. So: feedback in, comms
// still gated.
//
// Best-effort by design. A failure here must never break the client's approval
// submission, which is the thing that actually moves money.
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { designerJobs, orders } from "@shared/schema";
import { emailService } from "./email";

/**
 * Link a designer job to the order its design became.
 *
 * The design happens BEFORE the order exists (concepts → client approves →
 * deposit → order), so the link cannot be made at job creation. The natural
 * moment is when mockups are sent to a client for a specific order, which is
 * exactly when an approval token is issued.
 *
 * Matching is on client email, the only identifier both sides reliably carry.
 * Idempotent and non-destructive: an existing link is never overwritten, and a
 * job already tied to a different order is left alone.
 */
export async function linkDesignerJobToOrder(orderId: string, clientEmail: string | null | undefined): Promise<string> {
  const email = (clientEmail || "").trim().toLowerCase();
  if (!email) return "no client email to match on";

  // Already linked? Nothing to do.
  const [already] = await db.select({ q: designerJobs.quoteId }).from(designerJobs).where(eq(designerJobs.orderId, orderId)).limit(1);
  if (already) return `already linked to ${already.q}`;

  // Most recent unlinked job for this client. Unlinked only, so a second order
  // from the same club can never steal the first order's job.
  const [job] = await db
    .select({ id: designerJobs.id, quoteId: designerJobs.quoteId })
    .from(designerJobs)
    .where(and(sql`lower(${designerJobs.clientEmail}) = ${email}`, isNull(designerJobs.orderId)))
    .orderBy(desc(designerJobs.createdAt))
    .limit(1);
  if (!job) return `no unlinked designer job for ${email}`;

  await db.update(designerJobs).set({ orderId, updatedAt: new Date() }).where(eq(designerJobs.id, job.id));
  return `linked ${job.quoteId} to this order`;
}

export interface ClientChangeRequest {
  orderId: string;
  orderNumber: string;
  notes: string | null;
}

/**
 * Flip the designer job tied to this order into a revision round and tell the
 * designer. Returns a short human-readable outcome for the activity log.
 */
export async function routeClientChangesToDesigner(req: ClientChangeRequest): Promise<string> {
  let [job] = await db.select().from(designerJobs).where(eq(designerJobs.orderId, req.orderId)).limit(1);

  // Fallback: a job created before the linking hook existed, or one whose link
  // was never made, still has a client email. Match on that, link it, and carry
  // on rather than dropping the client's feedback on the floor.
  if (!job) {
    const [order] = await db.select({ email: orders.customerEmail }).from(orders).where(eq(orders.id, req.orderId)).limit(1);
    const email = (order?.email || "").trim().toLowerCase();
    if (email) {
      const [candidate] = await db
        .select()
        .from(designerJobs)
        .where(and(sql`lower(${designerJobs.clientEmail}) = ${email}`, isNull(designerJobs.orderId)))
        .orderBy(desc(designerJobs.createdAt))
        .limit(1);
      if (candidate) {
        await db.update(designerJobs).set({ orderId: req.orderId, updatedAt: new Date() }).where(eq(designerJobs.id, candidate.id));
        job = { ...candidate, orderId: req.orderId };
      }
    }
  }
  if (!job) return "no designer job linked to this order";
  if (job.status === "approved") {
    // The drop already passed QC and was paid out. Reopening it here would
    // silently reverse a completed job, so flag instead of mutating.
    return `designer job ${job.quoteId} is already approved — not reopened, needs a decision`;
  }

  const now = new Date();
  const round = job.revisions + 1;
  const notes = (req.notes || "").trim() || "The club asked for changes but did not leave a note.";
  const prior = Array.isArray(job.revisionRequests) ? (job.revisionRequests as unknown[]) : [];

  await db
    .update(designerJobs)
    .set({
      status: "revision",
      revisions: round,
      // Clearing submittedAt makes the resubmission restamp, which is what the
      // speed ladder measures. The designer is not penalised for our review time.
      submittedAt: null,
      // qcReason drives the "Changes needed" panel already on the job page.
      qcReason: notes,
      qcFailedItems: null, // a club comments in prose, not against our checklist
      revisionRequests: [...prior, { at: now.toISOString(), source: "client", notes, round }],
      updatedAt: now,
    })
    .where(eq(designerJobs.id, job.id));

  if (!job.designerEmail) {
    return `job ${job.quoteId} moved to revision ${round}, but ${job.designerName} has no email on file — they will only see it when they open their job page`;
  }

  // Deliberately minimal: the club's words and a link to their own job page.
  // No client name, email or phone — the designer has no reason to hold those.
  const jobUrl = `${process.env.SITE_URL || "https://sidelinenz.com"}/job/${job.token}`;
  try {
    await emailService.send({
      to: job.designerEmail,
      subject: `Changes requested — ${job.club || job.quoteId}`,
      html:
        `<p>The club has asked for changes on <strong>${escapeHtml(job.club || job.quoteId)}</strong>.</p>` +
        `<p><strong>What they said:</strong></p>` +
        `<blockquote style="margin:0;padding:10px 14px;border-left:3px solid #f97316;background:#f7f7f7">${escapeHtml(notes)}</blockquote>` +
        `<p>Open your job to see the brief and upload the revised set:<br>` +
        `<a href="${jobUrl}">${jobUrl}</a></p>` +
        `<p style="color:#666;font-size:13px">This is revision round ${round}. Your clock does not restart, ` +
        `and the time we take to review never counts against you.</p>`,
      text:
        `The club has asked for changes on ${job.club || job.quoteId}.\n\n` +
        `What they said:\n${notes}\n\n` +
        `Open your job: ${jobUrl}\n\n` +
        `Revision round ${round}. Your clock does not restart, and our review time never counts against you.`,
    });
    return `job ${job.quoteId} moved to revision ${round}, ${job.designerName} emailed`;
  } catch (e: any) {
    return `job ${job.quoteId} moved to revision ${round}, but emailing ${job.designerName} failed: ${e?.message}`;
  }
}

function escapeHtml(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
