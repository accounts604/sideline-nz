// Cron endpoints — schedulable from Railway cron / GitHub Actions / external.
//
// All endpoints require either:
//   1. An admin session cookie (so the admin can hit "Run now" buttons from
//      the UI without exposing a secret to the browser), OR
//   2. An X-Cron-Secret header matching the CRON_SECRET env var (for
//      external schedulers that have no cookie).
//
// Endpoints:
//   POST /api/cron/daily-digest             — morning Telegram digest
//   POST /api/cron/process-customer-queue   — Gmail queue → Ezra
//   POST /api/cron/fundraising-tally        — refresh club fundraising tallies

import { Router } from "express";
import { runDesignerSla } from "../designer-sla";
import { db } from "../db";
import { orders, clubAccounts } from "@shared/schema";
import { sql, and, eq, isNotNull } from "drizzle-orm";
import { triageOrder } from "@shared/triage";
import { sendTelegramCard, isTelegramConfigured } from "../telegram";
import { syncAllTallies, CAMPAIGNS } from "../fundraising-tally";
import {
  findOrphanShipments,
  findPosDispatchedWithoutWaybill,
  findDeliveredNotAdvanced,
  findVerificationMismatches,
} from "../shipments";

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

// ─── Process customer queue ─────────────────────────────────────────────
//
// Runs the Gmail queue processor: pulls labelled threads, hydrates context,
// spawns one Ezra turn per thread, applies handled labels. Pass ?dryRun=true
// to scan + log without calling Ezra or modifying Gmail labels.

router.post("/process-customer-queue", async (req, res) => {
  try {
    const { processCustomerQueue } = await import("../ezra/queue-processor.js");
    const live = req.query.dryRun === "true" ? false : true;
    const limit = req.query.limit ? Math.max(1, Math.min(25, parseInt(String(req.query.limit), 10) || 5)) : 5;
    const threadId = req.query.threadId ? String(req.query.threadId) : undefined;
    const logs: string[] = [];
    const result = await processCustomerQueue({
      live,
      limit,
      threadId,
      log: (s) => logs.push(s),
    });
    res.json({ ok: true, live, ...result, logs });
  } catch (err: any) {
    console.error("[cron/queue] error:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

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
      console.warn("[cron/daily-digest] Telegram not configured — digest built but not posted. Set JARVESI_BOT_TOKEN + KIG_GROUP_CHAT_ID on the server.");
      return res.json({ ok: true, posted: false, reason: "telegram_not_configured", digest });
    }
    const result = await sendTelegramCard({ text: digest.text });
    res.json({ ok: true, posted: result.ok, telegramMessageId: result.messageId, digest });
  } catch (err: any) {
    console.error("[cron/digest] error:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// ─── DHL / Puffin email watcher ─────────────────────────────────────────
//
// The reliable backbone of the shipment watcher: scans recent DHL + Puffin
// emails, auto-ingests status events for known waybills, and posts a Telegram
// card for new/unlinked waybills or Puffin club-content mentions to confirm.
// Idempotent (dedup via shipment_events). Schedule every ~30 min.

router.post("/dhl-email-watch", async (req, res) => {
  try {
    const dryRun = req.query.dryRun === "true";
    const { runDhlEmailWatch, buildEmailWatchCard } = await import("../dhl-email-watch.js");
    const result = await runDhlEmailWatch();
    const card = buildEmailWatchCard(result);
    if (dryRun) return res.json({ ok: true, dryRun: true, result, card });
    let posted = false;
    if (card && isTelegramConfigured()) {
      const r = await sendTelegramCard({ text: card.text, buttons: card.buttons });
      posted = r.ok;
    }
    res.json({
      ok: true,
      posted,
      summary: {
        scanned: result.scanned,
        statusUpdates: result.statusUpdates.length,
        needsLink: result.needsLink.length,
        contentFlags: result.contentFlags.length,
      },
    });
  } catch (err: any) {
    console.error("[cron/dhl-email-watch] error:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// ─── Shipment exceptions ────────────────────────────────────────────────
//
// Posts a Telegram card flagging shipment-tracking gaps:
//   🟠 orphan waybills awaiting linking (DHL event arrived, no PO linked)
//   ⏳ POs dispatched >N days with no waybill captured (the anchor gap)
//   📦 shipments delivered but the PO hasn't been advanced
//   🔴 content/qty mismatches from verification
// Pass ?dryRun=true to get the payload without posting.

router.post("/shipment-exceptions", async (req, res) => {
  try {
    const dryRun = req.query.dryRun === "true";
    const days = req.query.days ? Math.max(1, parseInt(String(req.query.days), 10) || 3) : 3;
    const payload = await buildShipmentExceptions(days);
    if (dryRun) return res.json({ ok: true, dryRun: true, ...payload });
    if (payload.empty) return res.json({ ok: true, posted: false, reason: "no_exceptions", summary: payload.summary });
    if (!isTelegramConfigured()) {
      // Fail-soft: exceptions were computed but can't be posted. Don't 500 (that
      // turns the daily cron red for a config issue) — return them so the run
      // still succeeds. Real fix: set JARVESI_BOT_TOKEN + KIG_GROUP_CHAT_ID.
      console.warn("[cron/shipment-exceptions] Telegram not configured — exceptions computed but not posted. Set JARVESI_BOT_TOKEN + KIG_GROUP_CHAT_ID on the server.");
      return res.json({ ok: true, posted: false, reason: "telegram_not_configured", summary: payload.summary });
    }
    const result = await sendTelegramCard({ text: payload.text, buttons: payload.buttons });
    res.json({ ok: true, posted: result.ok, telegramMessageId: result.messageId, summary: payload.summary });
  } catch (err: any) {
    console.error("[cron/shipment-exceptions] error:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

async function buildShipmentExceptions(days: number) {
  const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const now = Date.now();

  const [orphans, dispatchedNoWaybill, deliveredNotAdvanced, mismatches] = await Promise.all([
    findOrphanShipments(),
    findPosDispatchedWithoutWaybill(days),
    findDeliveredNotAdvanced(),
    findVerificationMismatches(),
  ]);

  const summary = {
    orphans: orphans.length,
    dispatchedNoWaybill: dispatchedNoWaybill.length,
    deliveredNotAdvanced: deliveredNotAdvanced.length,
    mismatches: mismatches.length,
  };
  const empty = Object.values(summary).every((n) => n === 0);

  const lines: string[] = [`<b>📦 Sideline — Shipment Exceptions</b> · ${new Date(now).toISOString().slice(0, 10)}`, ``];
  const buttons: { text: string; callback_data?: string; url?: string }[][] = [];

  if (orphans.length) {
    lines.push(`<b>🟠 ${orphans.length} orphan waybill(s) awaiting linking</b>`);
    for (const s of orphans.slice(0, 8)) {
      const ageD = s.lastEventAt ? Math.floor((now - new Date(s.lastEventAt).getTime()) / 86_400_000) : null;
      lines.push(`• WB ${esc(s.waybill)} · ${esc(s.status)}${ageD !== null ? ` · ${ageD}d ago` : ""}`);
      buttons.push([{ text: `🔗 Link ${s.waybill.slice(-6)}`, callback_data: `wblink_${s.id}` }]);
    }
    lines.push(``);
  }

  if (dispatchedNoWaybill.length) {
    lines.push(`<b>⏳ ${dispatchedNoWaybill.length} PO(s) dispatched &gt;${days}d, no waybill</b>`);
    for (const o of dispatchedNoWaybill.slice(0, 8)) {
      const ageD = o.poDispatchedAt ? Math.floor((now - new Date(o.poDispatchedAt).getTime()) / 86_400_000) : 0;
      lines.push(`• ${esc(o.poReference || "—")} <i>${esc(o.accountName || "")}</i> · ${ageD}d since dispatch`);
    }
    lines.push(``);
  }

  if (deliveredNotAdvanced.length) {
    lines.push(`<b>📦 ${deliveredNotAdvanced.length} delivered but PO not advanced</b>`);
    for (const r of deliveredNotAdvanced.slice(0, 8)) {
      lines.push(`• ${esc(r.order.poReference || "—")} <i>${esc(r.order.accountName || "")}</i> · WB ${esc(r.shipment.waybill)}`);
      buttons.push([{ text: `✅ Mark delivered ${(r.order.poReference || "").slice(-4)}`, callback_data: `posetstatus_${r.order.id}_delivered` }]);
    }
    lines.push(``);
  }

  if (mismatches.length) {
    lines.push(`<b>🔴 ${mismatches.length} content/qty mismatch(es)</b>`);
    for (const m of mismatches.slice(0, 8)) {
      const rep: any = m.link.verificationReport;
      const detail = rep?.reason ? ` · ${esc(rep.reason)}` : "";
      lines.push(`• ${esc(m.order.poReference || "—")} <i>${esc(m.order.accountName || "")}</i> · WB ${esc(m.shipment.waybill)}${detail}`);
    }
    lines.push(``);
  }

  if (empty) lines.push(`<i>No shipment exceptions. All POs tracked and on course.</i>`);

  return { empty, summary, text: lines.join("\n").trim(), buttons };
}

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

// POST /designer-sla — nudge designers approaching a deadline, and hand back
// jobs that blew through it. Safe to run often: every action is recorded on the
// job so the same warning cannot fire twice.
//   ?dryRun=true  report what WOULD happen and change nothing
router.post("/designer-sla", async (req, res) => {
  try {
    const dryRun = String(req.query.dryRun || "") === "true";
    const result = await runDesignerSla({ dryRun });
    console.log(`[cron/designer-sla] checked=${result.checked} nudged=${result.nudged.length} released=${result.released.length}${dryRun ? " (dry run)" : ""}`);
    res.json({ ok: true, dryRun, ...result });
  } catch (e: any) {
    console.error("[cron/designer-sla] failed:", e?.message);
    res.status(500).json({ error: "designer SLA run failed", detail: e?.message });
  }
});

// ─── Fundraising tally ──────────────────────────────────────────────────
//
// Recomputes each live supporter campaign's club fundraising total and writes
// it into the collection + product descriptions. Safe to run often; it only
// issues a write when the rendered block actually changed.
//
// Pass ?dryRun=true to compute and report without writing to Shopify.

router.post("/fundraising-tally", async (req, res) => {
  const dryRun = req.query.dryRun === "true";
  try {
    const results = await syncAllTallies({ dryRun });
    const failed = results.filter((r) => r.error);
    res.json({
      ok: failed.length === 0,
      dryRun,
      campaigns: CAMPAIGNS.length,
      totalUnits: results.reduce((n, r) => n + r.units, 0),
      totalRaisedCents: results.reduce((n, r) => n + r.raisedCents, 0),
      results,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});


export default router;
