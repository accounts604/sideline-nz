// SLA safety nets: nudge before a deadline, release after it.
//
// Neither existed. SL-0064 was assigned on 20 Jul with a 23 Jul deadline, was
// never opened, and NOTHING chased it — the first anyone knew was me reading the
// row eight days later. With one designer that is embarrassing; with three it is
// a client finding out before you do.
//
// Two rules, both deliberately conservative:
//   nudges   at 50% and 80% of elapsed time, to the designer only. Romero does
//            not need to know a job is merely in progress.
//   release  once past the deadline AND a grace period, the job returns to the
//            board so somebody else can take it, and Romero IS told.
//
// Every action is recorded in sla_nudges_sent so a 30-minute cron cannot fire
// the same warning 48 times.
import { and, eq, isNotNull, or } from "drizzle-orm";
import { db } from "./db";
import { designerJobs, designers } from "@shared/schema";
import { emailService } from "./email";

/** Hours past the deadline before a job is taken back. */
export const RELEASE_GRACE_HOURS = 12;

type Stage = "half" | "most" | "released";

function stagesFor(job: typeof designerJobs.$inferSelect, now: number): Stage | null {
  if (!job.claimedAt || !job.deadlineAt) return null;
  const start = new Date(job.claimedAt).getTime();
  const end = new Date(job.deadlineAt).getTime() + job.pausedMs;
  if (now >= end + RELEASE_GRACE_HOURS * 3600e3) return "released";
  const pct = (now - start) / (end - start);
  if (pct >= 0.8) return "most";
  if (pct >= 0.5) return "half";
  return null;
}

const COPY: Record<Exclude<Stage, "released">, (h: number, club: string) => { subject: string; line: string }> = {
  half: (h, club) => ({
    subject: `Halfway — ${club}`,
    line: `You're about halfway through your time on ${club}. Roughly ${h} hours left. No action needed if you're on track.`,
  }),
  most: (h, club) => ({
    subject: `${h}h left — ${club}`,
    line: `About ${h} hours left on ${club}. If something on our side is blocking you, tell us now and we'll stop the clock.`,
  }),
};

export interface SlaResult { checked: number; nudged: string[]; released: string[]; errors: string[] }

export async function runDesignerSla(opts: { dryRun?: boolean } = {}): Promise<SlaResult> {
  const now = Date.now();
  const out: SlaResult = { checked: 0, nudged: [], released: [], errors: [] };

  const live = await db
    .select()
    .from(designerJobs)
    .where(and(
      or(eq(designerJobs.status, "in_progress"), eq(designerJobs.status, "revision")),
      isNotNull(designerJobs.deadlineAt),
    ));

  for (const job of live) {
    out.checked++;
    // An open engine-down pause means the clock is stopped; chasing then would
    // be chasing someone for our own outage.
    if (job.pauseOpenAt) continue;

    const stage = stagesFor(job, now);
    if (!stage) continue;

    const sent = (Array.isArray(job.slaNudgesSent) ? job.slaNudgesSent : []) as string[];
    if (sent.includes(stage)) continue;

    const club = job.club || job.quoteId;

    if (stage === "released") {
      if (opts.dryRun) { out.released.push(`${job.quoteId} (dry run)`); continue; }
      try {
        // Conditional on still being unfinished, so a submission landing in the
        // same moment is never clobbered.
        const done = await db.update(designerJobs).set({
          status: "available",
          designerName: "unassigned",
          designerEmail: null,
          claimedAt: null,
          assignedAt: null,
          deadlineAt: null,
          postedAt: new Date(),
          releaseCount: job.releaseCount + 1,
          slaNudgesSent: [],
          updatedAt: new Date(),
        }).where(and(
          eq(designerJobs.id, job.id),
          or(eq(designerJobs.status, "in_progress"), eq(designerJobs.status, "revision")),
        )).returning();
        if (!done.length) continue; // finished underneath us — leave it alone

        out.released.push(`${job.quoteId} from ${job.designerName}`);
        console.warn(`[sla] released ${job.quoteId} back to the board (was ${job.designerName}, release #${job.releaseCount + 1})`);

        // Romero IS told about a release — a job going back on the board means a
        // client is waiting longer than promised.
        await emailService.send({
          to: process.env.ADMIN_NOTIFY_EMAIL || "info@sidelinenz.com",
          subject: `Drop returned to the board — ${club}`,
          text: `${job.quoteId} (${club}) passed its deadline by more than ${RELEASE_GRACE_HOURS}h with no submission from ${job.designerName}.\n\nIt is back on the board for someone else to claim. This is release #${job.releaseCount + 1} for this drop.`,
          html: `<p><strong>${job.quoteId}</strong> (${club}) passed its deadline by more than ${RELEASE_GRACE_HOURS}h with no submission from <strong>${job.designerName}</strong>.</p><p>It is back on the board for someone else to claim. This is release #${job.releaseCount + 1} for this drop.</p>`,
        }).catch((e) => out.errors.push(`notify ${job.quoteId}: ${e.message}`));
      } catch (e: any) {
        out.errors.push(`release ${job.quoteId}: ${e.message}`);
      }
      continue;
    }

    // ---- nudge the designer only ----
    const hoursLeft = Math.max(0, Math.round((new Date(job.deadlineAt!).getTime() + job.pausedMs - now) / 3600e3));
    const { subject, line } = COPY[stage](hoursLeft, club);
    if (opts.dryRun) { out.nudged.push(`${job.quoteId} ${stage} (dry run)`); continue; }

    if (job.designerEmail) {
      const url = `${process.env.SITE_URL || "https://sidelinenz.com"}/job/${job.token}`;
      await emailService.send({
        to: job.designerEmail,
        subject,
        text: `${line}\n\nYour job: ${url}\n\nOur review time never counts against you.`,
        html: `<p>${line}</p><p><a href="${url}">${url}</a></p><p style="color:#666;font-size:13px">Our review time never counts against you.</p>`,
      }).catch((e) => out.errors.push(`nudge ${job.quoteId}: ${e.message}`));
    }

    await db.update(designerJobs)
      .set({ slaNudgesSent: [...sent, stage], updatedAt: new Date() })
      .where(eq(designerJobs.id, job.id));
    out.nudged.push(`${job.quoteId} ${stage}`);
  }

  return out;
}
