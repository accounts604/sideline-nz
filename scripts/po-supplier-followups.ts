// Daily supplier follow-up cron for active POs.
//
// For every order in stage "PO Raised" with an assigned supplier:
//   1. Look up the original PO dispatch Gmail thread (via the gmailMessageId
//      written to orderActivity by raise-po).
//   2. Detect whether the supplier has replied since dispatch. If yes, log a
//      `supplier_reply_detected` activity row with a keyword classification
//      (ack | samples_ready | shipped | issue | unknown).
//   3. Apply timing rules and create Gmail DRAFTS (not sends) when chase is
//      due. Drafts attach to the original thread so Romero just clicks Send
//      from the orders@ inbox to chase. Three triggers:
//        - 2+ business days since dispatch and no supplier reply → ack chase
//        - production due in <=7 days and no shipped/sample reply → status chase
//        - delivery due in <=3 days and stage still "PO Raised" → escalation chase
//   4. Activity rows are idempotent — re-running the cron the same day does
//      not duplicate replies (matched by Gmail message id) or drafts (matched
//      by trigger type within the past 5 days).
//
// Usage (cron — BSD cron on macOS, absolute paths only per memory):
//   0 8 * * * cd /Users/kigagent/Projects/sideline-nz && /opt/homebrew/bin/npx tsx scripts/po-supplier-followups.ts >> /tmp/sideline-followups.log 2>&1
//
// One-shot dry-run (prints what it would do, writes nothing, no drafts):
//   npx tsx scripts/po-supplier-followups.ts --dry-run

import "dotenv/config";
import { db } from "../server/db";
import { orders, orderActivity, users } from "../shared/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import {
  searchGmailMessages,
  getGmailThread,
  createGmailDraft,
  isGmailConfigured,
} from "../server/gmail";
import { SIDELINE_ORDERS_FROM } from "../server/email";
import { computeMilestones } from "../shared/po-milestones";

type Classification = "ack" | "samples_ready" | "shipped" | "issue" | "unknown";

const DRY_RUN = process.argv.includes("--dry-run");
const SIDELINE_FROM_DOMAINS = ["sidelinenz.com", "kig.co.nz"];

// ──────────────────────────────────────────────────────────────────
// Reply classification — pure heuristic, no LLM. Keep it conservative;
// "unknown" is fine — it just means no auto-action, Romero handles it.
// ──────────────────────────────────────────────────────────────────
function classifyReply(body: string): Classification {
  const s = body.toLowerCase();
  if (/\b(problem|issue|delay|delayed|hold up|can't|unable|sorry)\b/.test(s)) return "issue";
  if (/\b(shipped|dispatched|tracking|courier|on its way|sent today)\b/.test(s)) return "shipped";
  if (/\b(sample(s)? ready|sample(s)? done|samples? approved|first piece)\b/.test(s)) return "samples_ready";
  if (/\b(received|got it|confirmed|noted|will do|on it|acknowledge|in production)\b/.test(s)) return "ack";
  return "unknown";
}

function isFromSideline(email: string): boolean {
  const lower = email.toLowerCase();
  return SIDELINE_FROM_DOMAINS.some((d) => lower.endsWith("@" + d) || lower.endsWith("." + d));
}

function businessDaysBetween(a: Date, b: Date): number {
  let count = 0;
  const cur = new Date(a);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(b);
  end.setHours(0, 0, 0, 0);
  while (cur < end) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function daysUntil(iso: string): number {
  const target = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

// ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`=== Sideline supplier follow-up cron @ ${new Date().toISOString()} ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);

  if (!isGmailConfigured()) {
    console.error("Gmail not configured — set GOOGLE_REFRESH_TOKEN. Aborting.");
    process.exit(1);
  }

  const active = await db.select().from(orders)
    .where(and(eq(orders.pipelineStage, "PO Raised"), sql`${orders.assignedSupplierId} IS NOT NULL`))
    .orderBy(desc(orders.createdAt));

  console.log(`Found ${active.length} active PO(s) in stage "PO Raised"\n`);

  let repliesLogged = 0, draftsCreated = 0, errors = 0;

  for (const po of active) {
    const ref = po.poReference || po.orderNumber;
    console.log(`── ${ref} ──`);

    // Supplier
    const [supplier] = await db.select().from(users).where(eq(users.id, po.assignedSupplierId!));
    if (!supplier?.email) { console.log(`  no supplier email — skip`); continue; }

    // Find dispatch activity to get gmailMessageId + dispatchedAt
    const [dispatchRow] = await db.select().from(orderActivity)
      .where(and(eq(orderActivity.orderId, po.id), eq(orderActivity.action, "po_raised_to_supplier")))
      .orderBy(desc(orderActivity.createdAt))
      .limit(1);

    if (!dispatchRow) { console.log(`  no dispatch activity row — skip`); continue; }

    const dispatchedAt = dispatchRow.createdAt!;
    const daysSinceDispatch = businessDaysBetween(dispatchedAt, new Date());
    const dispatchGmailId = (dispatchRow.details as any)?.gmailMessageId as string | null;

    // Locate Gmail thread — start from the dispatch message id, fall back to
    // a subject search using the PO reference.
    let threadId: string | null = null;
    if (dispatchGmailId) {
      const [hit] = await searchGmailMessages(`rfc822msgid:${dispatchGmailId}`, 1).catch(() => []);
      if (hit) threadId = hit.threadId;
    }
    if (!threadId) {
      const subjQuery = `subject:(${ref}) from:orders@sidelinenz.com`;
      const [hit] = await searchGmailMessages(subjQuery, 1);
      if (hit) threadId = hit.threadId;
    }
    if (!threadId) { console.log(`  Gmail thread not found — skip`); continue; }

    // Walk thread for supplier replies since dispatch
    const messages = await getGmailThread(threadId);
    const supplierReplies = messages
      .filter((m) => m.internalDate >= dispatchedAt.getTime())
      .filter((m) => !isFromSideline(m.fromEmail))
      .filter((m) => m.fromEmail.toLowerCase() === supplier.email!.toLowerCase());

    let lastClassification: Classification = "unknown";
    for (const reply of supplierReplies) {
      // Idempotency — skip if we've already logged this exact gmail message id
      const existing = await db.select().from(orderActivity).where(and(
        eq(orderActivity.orderId, po.id),
        eq(orderActivity.action, "supplier_reply_detected"),
        sql`${orderActivity.details}->>'gmailMessageId' = ${reply.id}`,
      )).limit(1);
      if (existing.length) { lastClassification = (existing[0].details as any)?.classification || "unknown"; continue; }

      const classification = classifyReply(reply.body || reply.snippet);
      lastClassification = classification;
      console.log(`  ↳ reply from ${reply.fromEmail} on ${new Date(reply.internalDate).toISOString().slice(0, 10)} → ${classification}`);

      if (!DRY_RUN) {
        await db.insert(orderActivity).values({
          orderId: po.id,
          userId: null,
          action: "supplier_reply_detected",
          details: {
            gmailMessageId: reply.id,
            threadId: reply.threadId,
            fromEmail: reply.fromEmail,
            classification,
            snippet: (reply.snippet || reply.body || "").slice(0, 280),
            receivedAt: new Date(reply.internalDate).toISOString(),
          },
        });
        repliesLogged++;
      }
    }

    const hasShippedSignal = lastClassification === "shipped";
    const hasSampleSignal = lastClassification === "samples_ready" || hasShippedSignal;
    const hasAnyAck = supplierReplies.length > 0;

    // Timing rules → trigger types we may need to draft
    const milestones = po.dueDate ? computeMilestones(po.dueDate) : null;
    const shipMilestone = milestones?.find((m) => m.key === "ship_production");
    const doorMilestone = milestones?.find((m) => m.key === "door_to_customer");
    const daysToShip = shipMilestone ? daysUntil(shipMilestone.date) : null;
    const daysToDoor = doorMilestone ? daysUntil(doorMilestone.date) : null;

    type Trigger = "ack_chase" | "production_chase" | "delivery_escalation";
    const triggers: Trigger[] = [];
    if (!hasAnyAck && daysSinceDispatch >= 2) triggers.push("ack_chase");
    if (daysToShip !== null && daysToShip <= 7 && daysToShip > 0 && !hasSampleSignal) triggers.push("production_chase");
    if (daysToDoor !== null && daysToDoor <= 3 && daysToDoor > 0) triggers.push("delivery_escalation");

    if (triggers.length === 0) {
      console.log(`  no triggers (days-since-dispatch=${daysSinceDispatch}, days-to-ship=${daysToShip ?? "-"}, days-to-door=${daysToDoor ?? "-"}, last-classification=${lastClassification})`);
      continue;
    }

    for (const trigger of triggers) {
      // Idempotency — skip if we drafted the same trigger type in the last 5 days
      const recent = await db.select().from(orderActivity).where(and(
        eq(orderActivity.orderId, po.id),
        eq(orderActivity.action, "supplier_followup_drafted"),
        sql`${orderActivity.details}->>'trigger' = ${trigger}`,
        sql`${orderActivity.createdAt} > NOW() - INTERVAL '5 days'`,
      )).limit(1);
      if (recent.length) { console.log(`  ${trigger}: already drafted in last 5d — skip`); continue; }

      const subject = followupSubject(trigger, ref, po.accountName);
      const html = followupBody(trigger, {
        ref,
        accountName: po.accountName,
        supplierName: supplier.teamName,
        daysSinceDispatch,
        daysToShip,
        daysToDoor,
        shipDate: shipMilestone?.date,
        doorDate: doorMilestone?.date,
      });

      console.log(`  ${trigger}: drafting → ${subject}`);
      if (DRY_RUN) continue;

      const draftId = await createGmailDraft({
        from: SIDELINE_ORDERS_FROM,
        to: supplier.email,
        cc: supplier.ccEmail || undefined,
        replyTo: "orders@sidelinenz.com",
        subject,
        html,
      }, threadId);

      if (!draftId) { errors++; console.log(`    ✗ draft create failed`); continue; }
      draftsCreated++;

      await db.insert(orderActivity).values({
        orderId: po.id,
        userId: null,
        action: "supplier_followup_drafted",
        details: { trigger, draftId, threadId, subject, daysSinceDispatch, daysToShip, daysToDoor },
      });
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`POs scanned: ${active.length}`);
  console.log(`Replies logged: ${repliesLogged}${DRY_RUN ? " (would have been)" : ""}`);
  console.log(`Drafts created: ${draftsCreated}${DRY_RUN ? " (would have been)" : ""}`);
  if (errors) console.log(`Errors: ${errors}`);
}

function followupSubject(t: "ack_chase" | "production_chase" | "delivery_escalation", ref: string, accountName: string | null): string {
  const tag = /^PO[-\s]/i.test(ref) ? ref : `PO ${ref}`;
  const acct = accountName ? ` - ${accountName}` : "";
  if (t === "ack_chase") return `${tag}${acct} - confirming receipt?`;
  if (t === "production_chase") return `${tag}${acct} - production timeline check`;
  return `${tag}${acct} - URGENT: delivery date approaching`;
}

function followupBody(
  t: "ack_chase" | "production_chase" | "delivery_escalation",
  ctx: {
    ref: string;
    accountName: string | null;
    supplierName: string | null;
    daysSinceDispatch: number;
    daysToShip: number | null;
    daysToDoor: number | null;
    shipDate?: string;
    doorDate?: string;
  },
): string {
  const hi = ctx.supplierName ? `Hi ${ctx.supplierName},` : "Hi team,";
  const acctLine = ctx.accountName ? ` for <strong>${ctx.accountName}</strong>` : "";

  const wrap = (inner: string) =>
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;max-width:640px">
      <p>${hi}</p>
      ${inner}
      <p style="color:#666;font-size:12px">Thanks,<br/>Sideline NZ</p>
    </div>`;

  if (t === "ack_chase") {
    return wrap(`
      <p>Following up on <strong>${ctx.ref}</strong>${acctLine} — sent ${ctx.daysSinceDispatch} business day(s) ago and we haven't seen a reply yet.</p>
      <p>Can you confirm:</p>
      <ul>
        <li>Pack received OK (Drive folder + production sheet)?</li>
        <li>Production timeline still on track for the schedule we sent?</li>
        <li>Any blockers we need to know about now?</li>
      </ul>
      <p>Quick reply is all we need — even just "got it, all good".</p>
    `);
  }
  if (t === "production_chase") {
    return wrap(`
      <p>Checking in on <strong>${ctx.ref}</strong>${acctLine}.</p>
      <p>Ship-from-production date is <strong>${ctx.shipDate}</strong> — that's ${ctx.daysToShip} day(s) away.</p>
      <p>Can you send through:</p>
      <ul>
        <li>Sample photo (if you haven't already)</li>
        <li>Confirmed dispatch date</li>
        <li>Tracking once it goes</li>
      </ul>
    `);
  }
  // delivery_escalation
  return wrap(`
    <p><strong>Customer delivery is in ${ctx.daysToDoor} day(s)</strong> (target: ${ctx.doorDate}).</p>
    <p>${ctx.ref}${acctLine} hasn't been marked as shipped on our side.</p>
    <p>Please confirm by reply today:</p>
    <ul>
      <li>Has it shipped from production? Tracking number?</li>
      <li>If not, what's the realistic dispatch date so we can update the customer?</li>
    </ul>
    <p>Calling now if it's faster — flag any blocker we can help unblock.</p>
  `);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error("[followups] crashed:", err); process.exit(1); });
