// Cron endpoints — schedulable from Railway cron / GitHub Actions / external.
//
// All endpoints require either:
//   1. An admin session cookie (so the admin can hit "Run now" buttons from
//      the UI without exposing a secret to the browser), OR
//   2. An X-Cron-Secret header matching the CRON_SECRET env var (for
//      external schedulers that have no cookie).
//
// Endpoints:
//   POST /api/cron/daily-digest — morning Telegram digest (overdue, at-risk,
//                                  AP backlog, live supporter drops)

import { Router } from "express";
import { db } from "../db";
import { orders, clubAccounts } from "@shared/schema";
import { sql, and, eq, isNotNull } from "drizzle-orm";
import { triageOrder } from "@shared/triage";
import { sendTelegramCard, isTelegramConfigured } from "../telegram";

const router = Router();

// Gate: admin cookie OR X-Cron-Secret header. Either path lets you through.
function gate(req: any, res: any, next: any) {
  // 1. Cron secret header
  const provided = req.header("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (expected && provided && provided === expected) return next();

  // 2. Admin cookie (reuse the JWT verifier — keep imports local to avoid cycles)
  const token = req.cookies?.snz_token;
  if (token) {
    try {
      const jwt = require("jsonwebtoken");
      const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-secret-change-in-production");
      if (payload?.role === "admin") {
        (req as any).user = payload;
        return next();
      }
    } catch {
      /* fall through */
    }
  }
  return res.status(401).json({ error: "Cron auth failed", hint: "Pass X-Cron-Secret or an admin session cookie." });
}

router.use(gate);

// ─── Daily digest ───────────────────────────────────────────────────────
//
// Collects today's operational signals + asks Ezra to write a short
// narrative + priorities, then posts to Telegram thread 614. Idempotent
// only insofar as Telegram doesn't dedupe — double-posting is safe but
// you'll see two cards.

router.post("/daily-digest", async (req, res) => {
  try {
    const dryRun = req.query.dryRun === "true";
    const digest = await buildDailyDigest();
    if (dryRun) {
      return res.json({ ok: true, dryRun: true, digest });
    }
    if (!isTelegramConfigured()) {
      return res.status(500).json({ error: "Telegram not configured", hint: "Set JARVESI_BOT_TOKEN + KIG_GROUP_CHAT_ID." });
    }
    const result = await sendTelegramCard({ text: digest.text });
    res.json({ ok: true, posted: result.ok, telegramMessageId: result.messageId, digest });
  } catch (err: any) {
    console.error("[cron/digest] error:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

interface DigestPayload {
  date: string;
  overdue: Array<{ poRef: string | null; account: string | null; daysPast: number; stage: string | null }>;
  atRisk: Array<{ poRef: string | null; account: string | null; daysUntilDue: number; reason: string }>;
  supplierUnpaid: Array<{ poRef: string | null; account: string | null; supplierName: string | null; daysSinceDispatch: number }>;
  dropsClosing: Array<{ clubName: string; daysUntilClose: number | null }>;
  narrative: string; // Ezra-written summary + top priority
  text: string;      // Final HTML-formatted Telegram body
}

async function buildDailyDigest(): Promise<DigestPayload> {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  // 1. Active orders → triage them client-side using shared/triage.ts
  const activeOrders = await db.select().from(orders).where(
    sql`po_reference IS NOT NULL AND COALESCE(pipeline_stage,'') NOT IN ('Cancelled','Completed','Delivered')`,
  );

  const overdue: DigestPayload["overdue"] = [];
  const atRisk: DigestPayload["atRisk"] = [];
  for (const o of activeOrders) {
    const t = triageOrder(
      { pipelineStage: o.pipelineStage, status: o.status, dueDate: o.dueDate, productionStage: o.productionStage },
      today,
    );
    if (t.state === "overdue") {
      overdue.push({
        poRef: o.poReference,
        account: o.accountName,
        daysPast: Math.abs(t.daysUntilDue ?? 0),
        stage: o.pipelineStage,
      });
    } else if (t.state === "at_risk" && (t.daysUntilDue ?? 999) <= 7) {
      atRisk.push({
        poRef: o.poReference,
        account: o.accountName,
        daysUntilDue: t.daysUntilDue ?? 0,
        reason: t.reason,
      });
    }
  }
  overdue.sort((a, b) => b.daysPast - a.daysPast);
  atRisk.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  // 2. Dispatched POs with unpaid supplier invoice (>7 days)
  const cutoff = new Date(today.getTime() - 7 * 86_400_000);
  const dispatchedUnpaid: any = await db.execute(sql`
    SELECT o.po_reference, o.account_name, o.po_dispatched_at, u.team_name AS supplier_name
      FROM orders o
      LEFT JOIN users u ON u.id = o.assigned_supplier_id
     WHERE o.po_dispatched_at IS NOT NULL
       AND o.po_dispatched_at < ${cutoff.toISOString()}
       AND o.supplier_invoice_paid_at IS NULL
       AND COALESCE(o.pipeline_stage,'') NOT IN ('Cancelled')
     ORDER BY o.po_dispatched_at ASC
  `);
  const unpaidRows: any[] = Array.isArray(dispatchedUnpaid) ? dispatchedUnpaid : (dispatchedUnpaid.rows ?? []);
  const supplierUnpaid = unpaidRows.map((r: any) => ({
    poRef: r.po_reference,
    account: r.account_name,
    supplierName: r.supplier_name,
    daysSinceDispatch: Math.floor((today.getTime() - new Date(r.po_dispatched_at).getTime()) / 86_400_000),
  }));

  // 3. Supporter drops closing in next 7 days. Heuristic: club has a
  //    supporter_collection_handle and supporter_collection_published is true
  //    and (if we had a close date) it's <= 7d. We don't track close dates
  //    explicitly so list all currently-live drops with a hint.
  const liveClubs = await db.select().from(clubAccounts).where(
    and(isNotNull(clubAccounts.supporterCollectionHandle), eq(clubAccounts.supporterCollectionPublished, true)),
  );
  const dropsClosing = liveClubs.map((c) => ({
    clubName: c.clubName,
    daysUntilClose: null as number | null, // We don't track this yet; left null so the digest just lists live drops.
  }));

  // 4. Narrative: deterministic single line for now. AI-generated commentary
  //    is a follow-up — bigger lift because it needs an Ezra conversation
  //    bound to a system user and an LLM token spend per digest.
  const narrative = overdue.length > 0
    ? `${overdue.length} PO${overdue.length === 1 ? "" : "s"} overdue, top priority: ${overdue[0].poRef} (${overdue[0].account}, ${overdue[0].daysPast}d past).`
    : atRisk.length > 0
    ? `No overdue, but ${atRisk.length} at-risk this week — earliest: ${atRisk[0].poRef} (${atRisk[0].account}, ${atRisk[0].daysUntilDue}d).`
    : supplierUnpaid.length > 0
    ? `Pipeline healthy. AP backlog: ${supplierUnpaid.length} supplier invoice${supplierUnpaid.length === 1 ? "" : "s"} unpaid >7d.`
    : `Pipeline healthy. No overdue, no at-risk, no AP backlog.`;

  // 5. Build the Telegram body. Telegram allows HTML — keep it terse.
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines: string[] = [
    `<b>🌅 Sideline — Daily Digest</b> · ${todayIso}`,
    ``,
    `<i>${esc(narrative)}</i>`,
    ``,
  ];
  if (overdue.length > 0) {
    lines.push(`<b>⚠️ ${overdue.length} overdue</b>`);
    for (const o of overdue.slice(0, 8)) {
      lines.push(`• ${esc(o.poRef || "—")} <i>${esc(o.account || "")}</i> · ${o.daysPast}d past · ${esc(o.stage || "—")}`);
    }
    lines.push(``);
  }
  if (atRisk.length > 0) {
    lines.push(`<b>📅 ${atRisk.length} at-risk this week</b>`);
    for (const o of atRisk.slice(0, 8)) {
      lines.push(`• ${esc(o.poRef || "—")} <i>${esc(o.account || "")}</i> · ${o.daysUntilDue}d to due`);
    }
    lines.push(``);
  }
  if (supplierUnpaid.length > 0) {
    lines.push(`<b>💸 ${supplierUnpaid.length} unpaid supplier invoices &gt;7d</b>`);
    for (const o of supplierUnpaid.slice(0, 8)) {
      lines.push(`• ${esc(o.poRef || "—")} <i>${esc(o.account || "")}</i> · ${o.daysSinceDispatch}d since dispatch`);
    }
    lines.push(``);
  }
  if (dropsClosing.length > 0) {
    lines.push(`<b>🛍️ ${dropsClosing.length} live supporter drops</b>`);
    for (const d of dropsClosing.slice(0, 8)) {
      lines.push(`• ${esc(d.clubName)}`);
    }
  }
  if (overdue.length === 0 && atRisk.length === 0 && supplierUnpaid.length === 0) {
    lines.push(`✅ All clear today.`);
  }

  return {
    date: todayIso,
    overdue,
    atRisk,
    supplierUnpaid,
    dropsClosing,
    narrative,
    text: lines.join("\n"),
  };
}

export default router;
