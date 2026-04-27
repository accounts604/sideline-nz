// Weekly digest of the supplier follow-up cron's activity.
//
// Parses /Users/kigagent/.openclaw/logs/sideline-followups.log over the last
// 7 days, builds a summary, and emails it to admin@kig.co.nz so Romero gets
// a Monday-morning view of:
//   - How many days the cron fired (vs how many it should have — weekdays only)
//   - Crashes / error lines
//   - POs scanned, replies logged, drafts created
//   - Triggers that fired (ack_chase / production_chase / delivery_escalation)
//   - Any "Gmail thread not found" / "no dispatch activity row" skips
//
// Runs locally — no remote agent, no MCP. Sends via the same Gmail plumbing
// the dispatch flow uses.
//
// Usage (cron — Monday 9 AM NZST):
//   0 9 * * 1 cd /Users/kigagent/Projects/sideline-nz && /opt/homebrew/bin/node node_modules/.bin/tsx scripts/po-followups-digest.ts >> /Users/kigagent/.openclaw/logs/sideline-followups-digest.log 2>&1
//
// Manual run / preview without sending:
//   npx tsx scripts/po-followups-digest.ts --dry-run

import "dotenv/config";
import * as fs from "fs";
import { sendGmail, isGmailConfigured } from "../server/gmail";

const LOG_PATH = process.env.SIDELINE_FOLLOWUPS_LOG || "/Users/kigagent/.openclaw/logs/sideline-followups.log";
const DIGEST_TO = process.env.DIGEST_TO || "admin@kig.co.nz";
const DRY_RUN = process.argv.includes("--dry-run");
const LOOKBACK_DAYS = 7;

interface RunSummary {
  startedAt: Date;
  posScanned: number;
  repliesLogged: number;
  draftsCreated: number;
  errorsCount: number;
  triggersFired: Record<string, number>;       // ack_chase / production_chase / delivery_escalation
  classifications: Record<string, number>;     // ack / samples_ready / shipped / issue / unknown
  poRefs: Set<string>;
  skips: { gmailThreadNotFound: number; noDispatchActivity: number; noSupplierEmail: number };
  crashed: boolean;
  rawErrorLines: string[];
}

function newRun(startedAt: Date): RunSummary {
  return {
    startedAt, posScanned: 0, repliesLogged: 0, draftsCreated: 0, errorsCount: 0,
    triggersFired: {}, classifications: {}, poRefs: new Set(),
    skips: { gmailThreadNotFound: 0, noDispatchActivity: 0, noSupplierEmail: 0 },
    crashed: false, rawErrorLines: [],
  };
}

function parseLog(content: string): RunSummary[] {
  const runs: RunSummary[] = [];
  let current: RunSummary | null = null;
  const lines = content.split("\n");

  for (const line of lines) {
    // Run header: "=== Sideline supplier follow-up cron @ 2026-04-28T20:30:01.123Z ==="
    const headerMatch = line.match(/^=== Sideline supplier follow-up cron @ (\S+)/);
    if (headerMatch) {
      const startedAt = new Date(headerMatch[1]);
      if (!Number.isNaN(startedAt.getTime())) {
        current = newRun(startedAt);
        runs.push(current);
      }
      continue;
    }
    if (!current) continue;

    // Per-PO header: "── PO-2026-0005 ──"
    const poMatch = line.match(/^── (PO-\S+|\S+) ──$/);
    if (poMatch) { current.poRefs.add(poMatch[1]); continue; }

    // Reply detection: "  ↳ reply from x@y.com on 2026-04-28 → ack"
    const replyMatch = line.match(/↳ reply from .+ → (\w+)$/);
    if (replyMatch) {
      current.repliesLogged++;
      const cls = replyMatch[1];
      current.classifications[cls] = (current.classifications[cls] || 0) + 1;
      continue;
    }

    // Trigger drafted: "  ack_chase: drafting → ..."
    const trigMatch = line.match(/^\s+(ack_chase|production_chase|delivery_escalation): drafting/);
    if (trigMatch) {
      current.draftsCreated++;
      const t = trigMatch[1];
      current.triggersFired[t] = (current.triggersFired[t] || 0) + 1;
      continue;
    }

    // Skip messages
    if (line.includes("Gmail thread not found")) current.skips.gmailThreadNotFound++;
    else if (line.includes("no dispatch activity row")) current.skips.noDispatchActivity++;
    else if (line.includes("no supplier email")) current.skips.noSupplierEmail++;

    // Final summary lines: "POs scanned: 3"
    const scannedMatch = line.match(/^POs scanned: (\d+)/);
    if (scannedMatch) current.posScanned = parseInt(scannedMatch[1], 10);

    // Errors
    if (line.includes("crashed:") || line.includes("[followups] crashed")) current.crashed = true;
    if (/error|fail|✗|Error:|TypeError|exception/i.test(line) && !line.includes("Found ")) {
      current.errorsCount++;
      if (current.rawErrorLines.length < 5) current.rawErrorLines.push(line.trim().slice(0, 200));
    }
  }

  return runs;
}

function expectedRuns(now: Date, lookbackDays: number): number {
  // Cron runs weekdays only — count Mon–Fri days in the lookback window
  let count = 0;
  for (let i = 0; i < lookbackDays; i++) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function buildHtml(runs: RunSummary[], expected: number, now: Date): string {
  const totalPos = runs.reduce((s, r) => s + r.posScanned, 0);
  const totalReplies = runs.reduce((s, r) => s + r.repliesLogged, 0);
  const totalDrafts = runs.reduce((s, r) => s + r.draftsCreated, 0);
  const totalErrors = runs.reduce((s, r) => s + r.errorsCount, 0);
  const crashes = runs.filter((r) => r.crashed).length;
  const allClassifications: Record<string, number> = {};
  const allTriggers: Record<string, number> = {};
  const allSkips = { gmailThreadNotFound: 0, noDispatchActivity: 0, noSupplierEmail: 0 };
  for (const r of runs) {
    for (const [k, v] of Object.entries(r.classifications)) allClassifications[k] = (allClassifications[k] || 0) + v;
    for (const [k, v] of Object.entries(r.triggersFired)) allTriggers[k] = (allTriggers[k] || 0) + v;
    allSkips.gmailThreadNotFound += r.skips.gmailThreadNotFound;
    allSkips.noDispatchActivity += r.skips.noDispatchActivity;
    allSkips.noSupplierEmail += r.skips.noSupplierEmail;
  }

  const healthLabel = crashes > 0 ? "🔴 CRASHED" : runs.length < expected ? "🟡 MISSED RUNS" : totalErrors > 0 ? "🟡 ERRORS" : "🟢 HEALTHY";

  const recentList = runs.length === 0
    ? `<p style="color:#666">No runs found in the last ${LOOKBACK_DAYS} days.</p>`
    : `<table style="border-collapse:collapse;font-size:13px;width:100%">
        <thead><tr style="background:#f5f5f5">
          <th style="text-align:left;padding:6px 10px;border:1px solid #ddd">Run</th>
          <th style="text-align:right;padding:6px 10px;border:1px solid #ddd">POs</th>
          <th style="text-align:right;padding:6px 10px;border:1px solid #ddd">Replies</th>
          <th style="text-align:right;padding:6px 10px;border:1px solid #ddd">Drafts</th>
          <th style="text-align:right;padding:6px 10px;border:1px solid #ddd">Errors</th>
        </tr></thead>
        <tbody>
          ${runs.slice().reverse().map((r) => `
            <tr${r.crashed ? ' style="background:#fee2e2"' : r.errorsCount > 0 ? ' style="background:#fef3c7"' : ""}>
              <td style="padding:6px 10px;border:1px solid #ddd;font-family:ui-monospace,monospace">${r.startedAt.toISOString().replace("T", " ").slice(0, 16)}Z</td>
              <td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${r.posScanned}</td>
              <td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${r.repliesLogged}</td>
              <td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${r.draftsCreated}</td>
              <td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${r.errorsCount}${r.crashed ? " (crashed)" : ""}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`;

  const errorSamples = runs.flatMap((r) => r.rawErrorLines).slice(0, 8);
  const errorBlock = errorSamples.length === 0 ? "" :
    `<h3 style="margin:18px 0 6px;font-size:14px">Recent error lines</h3>
     <pre style="background:#0a1628;color:#eab308;padding:10px;border-radius:6px;font-size:12px;overflow-x:auto">${errorSamples.map((l) => l.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))).join("\n")}</pre>`;

  const skipsBlock = (allSkips.gmailThreadNotFound + allSkips.noDispatchActivity + allSkips.noSupplierEmail) === 0 ? "" :
    `<h3 style="margin:18px 0 6px;font-size:14px">Skipped POs</h3>
     <ul style="color:#444;font-size:13px">
       ${allSkips.gmailThreadNotFound ? `<li><strong>${allSkips.gmailThreadNotFound}</strong> × Gmail thread not found — original dispatch email may have been deleted or PO reference missing from subject</li>` : ""}
       ${allSkips.noDispatchActivity ? `<li><strong>${allSkips.noDispatchActivity}</strong> × no dispatch activity row — PO is in "PO Raised" stage but was never dispatched via the button</li>` : ""}
       ${allSkips.noSupplierEmail ? `<li><strong>${allSkips.noSupplierEmail}</strong> × supplier user has no email set</li>` : ""}
     </ul>`;

  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;max-width:680px">
    <h2 style="margin:0 0 4px">Sideline PO follow-up cron — weekly digest</h2>
    <p style="color:#666;margin:0 0 18px;font-size:13px">${runs.length} run(s) in the last ${LOOKBACK_DAYS} days · ${expected} expected (weekdays only)</p>
    <p style="font-size:18px;font-weight:600;margin:0 0 14px">${healthLabel}</p>
    <table style="border-collapse:collapse;margin-bottom:14px;font-size:14px">
      <tr><td style="padding:4px 12px 4px 0;color:#666">POs scanned (sum)</td><td style="padding:4px 0;font-weight:600">${totalPos}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Replies logged</td><td style="padding:4px 0;font-weight:600">${totalReplies}${Object.keys(allClassifications).length ? ` &nbsp;<span style="color:#666;font-weight:400">(${Object.entries(allClassifications).map(([k, v]) => `${k}=${v}`).join(", ")})</span>` : ""}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Drafts created</td><td style="padding:4px 0;font-weight:600">${totalDrafts}${Object.keys(allTriggers).length ? ` &nbsp;<span style="color:#666;font-weight:400">(${Object.entries(allTriggers).map(([k, v]) => `${k}=${v}`).join(", ")})</span>` : ""}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Errors / crashes</td><td style="padding:4px 0;font-weight:600;${totalErrors > 0 || crashes > 0 ? "color:#dc2626" : ""}">${totalErrors} errors${crashes > 0 ? `, <strong>${crashes} crashes</strong>` : ""}</td></tr>
    </table>
    <h3 style="margin:18px 0 6px;font-size:14px">Per-run breakdown</h3>
    ${recentList}
    ${skipsBlock}
    ${errorBlock}
    <p style="color:#666;font-size:11px;margin-top:24px">Source: <code>${LOG_PATH}</code><br/>Cron: <code>30 8 * * 1-5</code> (weekdays 8:30 AM NZST)<br/>Generated ${now.toISOString()}</p>
  </div>`;
}

async function main() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - LOOKBACK_DAYS * 86400000);

  let allRuns: RunSummary[] = [];
  if (fs.existsSync(LOG_PATH)) {
    const content = fs.readFileSync(LOG_PATH, "utf-8");
    allRuns = parseLog(content).filter((r) => r.startedAt >= cutoff);
  } else {
    console.log(`Log file not found at ${LOG_PATH} — sending empty digest`);
  }

  const expected = expectedRuns(now, LOOKBACK_DAYS);
  const html = buildHtml(allRuns, expected, now);

  const subject = (() => {
    const crashes = allRuns.filter((r) => r.crashed).length;
    if (crashes > 0) return `[Sideline] PO follow-up cron — ${crashes} CRASHES this week`;
    if (allRuns.length < expected) return `[Sideline] PO follow-up cron — only ${allRuns.length}/${expected} runs this week`;
    const totalErr = allRuns.reduce((s, r) => s + r.errorsCount, 0);
    if (totalErr > 0) return `[Sideline] PO follow-up cron — ${totalErr} errors this week`;
    return `[Sideline] PO follow-up cron — healthy (${allRuns.length}/${expected} runs)`;
  })();

  if (DRY_RUN) {
    console.log(`Subject: ${subject}\n`);
    console.log(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 800));
    console.log("\n(dry run — no email sent)");
    return;
  }

  if (!isGmailConfigured()) {
    console.error("Gmail not configured — aborting");
    process.exit(1);
  }

  const id = await sendGmail({
    from: "Sideline NZ Ops <orders@sidelinenz.com>",
    to: DIGEST_TO,
    subject,
    html,
  });
  console.log(`Digest emailed to ${DIGEST_TO} — Gmail message id: ${id || "<none>"}`);
}

main().catch((err) => { console.error("[digest] crashed:", err); process.exit(1); });
