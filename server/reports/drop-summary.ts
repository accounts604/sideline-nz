// Drop summary report — branded HTML + PDF attachment, emailed to a club manager.
//
// Two delivery modes (per club-portal product brief):
//   - Push: this report, scheduled or admin-triggered, drives engagement.
//   - Pull: the live supporter dashboard at /club-portal/supporter-dashboard.
// Don't drop the push — it's the asset that pulls people back into the portal.

import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { storage } from "../storage";
import { emailService } from "../email";
import {
  fetchSupporterOrdersByTag,
  filterByDateRange,
  summarizeSupporterOrders,
  isShopifyAdminConfigured,
  type SupporterOrder,
  type SupporterOrderSummary,
} from "../shopify-admin";

interface DropSummaryInput {
  clubAccountId: string;
  from?: string;
  to?: string;
  /** If true, render and return the report but don't send the email. */
  previewOnly?: boolean;
}

export interface DropSummaryResult {
  ok: boolean;
  error?: string;
  emailMessageId?: string;
  pdfBytes?: number;
  summary?: SupporterOrderSummary;
}

function esc(s: string | null | undefined): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtMoney(cents: number, currency: string): string {
  const symbol = currency === "NZD" ? "$" : currency + " ";
  return symbol + (cents / 100).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtRange(from?: string, to?: string): string {
  if (!from && !to) return "Campaign to date";
  if (from && to) return `${from} → ${to}`;
  if (from) return `From ${from}`;
  return `Up to ${to}`;
}

function buildHtml(opts: {
  clubName: string;
  range: string;
  summary: SupporterOrderSummary;
  portalUrl: string;
  tier: number; // bps
  generatedAt: string;
}): string {
  const { clubName, range, summary, portalUrl, tier, generatedAt } = opts;
  const tierPct = (tier / 100).toFixed(tier % 100 === 0 ? 0 : 1);

  const topRows = summary.topSupporters.length
    ? summary.topSupporters
        .map((s, i) => `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #1a1a1a;color:#666;font-size:12px;width:32px">${i + 1}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #1a1a1a;color:#fff;font-size:13px">${esc(s.name)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #1a1a1a;color:#999;font-size:12px">${esc(s.email || "")}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #1a1a1a;color:#fff;font-size:13px;text-align:right;font-weight:600">${fmtMoney(s.spendCents, summary.currency)}</td>
          </tr>`)
        .join("")
    : `<tr><td colspan="4" style="padding:24px;color:#666;font-size:12px;text-align:center">No supporter orders yet in this range.</td></tr>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Drop Summary — ${esc(clubName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, Segoe UI, Helvetica, Arial, sans-serif; color: #fff; margin: 0; padding: 0; background: #000; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 40px 32px; }
  .label { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 6px; }
  .number { font-size: 32px; font-weight: 700; color: #fff; line-height: 1; letter-spacing: -0.5px; }
  .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0 32px; }
  .stat { background: #0c0c0c; border: 1px solid #1f1f1f; border-radius: 6px; padding: 18px 16px; }
  table { width: 100%; border-collapse: collapse; background: #0c0c0c; border: 1px solid #1f1f1f; border-radius: 6px; overflow: hidden; }
  thead th { padding: 10px 12px; text-align: left; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,255,255,0.4); background: #111; border-bottom: 1px solid #1f1f1f; font-weight: 600; }
  thead th:last-child { text-align: right; }
  .cta { display: inline-block; background: #fff; color: #000; text-decoration: none; padding: 12px 24px; border-radius: 4px; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; }
  .footer { margin-top: 40px; font-size: 11px; color: rgba(255,255,255,0.4); text-align: center; line-height: 1.6; }
  @page { margin: 0; size: A4; }
</style></head><body>
<div class="wrap">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid #1f1f1f">
    <div>
      <div class="label" style="margin-bottom:4px">Sideline NZ — Drop Summary</div>
      <h1 style="font-size:28px;font-weight:700;margin:0;letter-spacing:-0.5px;text-transform:uppercase">${esc(clubName)}</h1>
      <div style="margin-top:6px;font-size:12px;color:#888">${esc(range)}</div>
    </div>
    <div style="text-align:right;font-size:10px;color:#666;letter-spacing:0.5px">
      Generated ${esc(generatedAt)}
    </div>
  </div>

  <!-- Headline numbers -->
  <div class="stat-grid">
    <div class="stat">
      <div class="label">Units Sold</div>
      <div class="number">${summary.unitsSold.toLocaleString("en-NZ")}</div>
      <div style="margin-top:6px;font-size:11px;color:#666">${summary.orderCount} order${summary.orderCount === 1 ? "" : "s"}</div>
    </div>
    <div class="stat">
      <div class="label">Revenue (incl. GST)</div>
      <div class="number">${fmtMoney(summary.revenueCents, summary.currency)}</div>
      <div style="margin-top:6px;font-size:11px;color:#666">${summary.currency}</div>
    </div>
    <div class="stat">
      <div class="label">Profit Share Owed</div>
      <div class="number" style="color:#22c55e">${fmtMoney(summary.profitShareCents, summary.currency)}</div>
      <div style="margin-top:6px;font-size:11px;color:#666">${tierPct}% of revenue</div>
    </div>
  </div>

  <!-- Top supporters -->
  <div class="label" style="margin-bottom:10px">Top Supporters by Spend</div>
  <table>
    <thead>
      <tr>
        <th style="width:32px">#</th>
        <th>Name</th>
        <th>Email</th>
        <th>Spend</th>
      </tr>
    </thead>
    <tbody>${topRows}</tbody>
  </table>

  <!-- CTA -->
  <div style="margin-top:36px;text-align:center">
    <a href="${esc(portalUrl)}" class="cta">View live in your portal →</a>
    <div style="margin-top:12px;font-size:11px;color:#666">Live orders, exports, and revisions update in real time.</div>
  </div>

  <div class="footer">
    Sideline NZ (Sideline Custom Goods Ltd) — Manukau, Auckland<br/>
    info@sidelinenz.com · sidelinenz.com
  </div>
</div>
</body></html>`;
}

function buildPlainText(opts: {
  clubName: string;
  range: string;
  summary: SupporterOrderSummary;
  portalUrl: string;
  tier: number;
}): string {
  const { clubName, range, summary, portalUrl, tier } = opts;
  const tierPct = (tier / 100).toFixed(tier % 100 === 0 ? 0 : 1);
  const lines = [
    `Drop Summary — ${clubName}`,
    range,
    "",
    `Units sold:        ${summary.unitsSold} (${summary.orderCount} orders)`,
    `Revenue:           ${fmtMoney(summary.revenueCents, summary.currency)} ${summary.currency}`,
    `Profit share:      ${fmtMoney(summary.profitShareCents, summary.currency)} (${tierPct}%)`,
    "",
    "Top supporters:",
    ...summary.topSupporters.map((s, i) => `  ${i + 1}. ${s.name} — ${fmtMoney(s.spendCents, summary.currency)}`),
    "",
    `View live in your portal: ${portalUrl}`,
    "",
    "— Sideline NZ",
  ];
  return lines.join("\n");
}

async function htmlToPdf(html: string): Promise<Buffer | null> {
  let executablePath: string;
  try {
    const { execSync } = await import("child_process");
    const found = execSync("which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome-stable 2>/dev/null", { encoding: "utf-8" }).trim();
    executablePath = found || (await chromium.executablePath());
  } catch {
    executablePath = await chromium.executablePath();
  }
  if (!executablePath) {
    console.error("[drop-summary] No Chromium binary found");
    return null;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1200 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 20000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });
    return Buffer.from(pdf);
  } catch (err) {
    console.error("[drop-summary] Puppeteer error:", err);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

export async function generateDropSummary(input: DropSummaryInput): Promise<DropSummaryResult> {
  const account = await storage.getClubAccount(input.clubAccountId);
  if (!account) return { ok: false, error: "Club account not found" };
  if (!account.shopifyOrderTag) return { ok: false, error: "Club has no shopifyOrderTag configured" };
  if (!isShopifyAdminConfigured()) return { ok: false, error: "Shopify Admin API not configured" };

  const all: SupporterOrder[] = await fetchSupporterOrdersByTag(account.shopifyOrderTag);
  const filtered = filterByDateRange(all, input.from, input.to);
  const summary = summarizeSupporterOrders(filtered, account.profitShareTierBps);

  const baseUrl = process.env.BASE_URL || process.env.VITE_SITE_URL || "https://sidelinenz.com";
  const portalUrl = `${baseUrl}/club-portal/supporter-dashboard`;
  const range = fmtRange(input.from, input.to);
  const generatedAt = new Date().toISOString().slice(0, 10);

  const html = buildHtml({
    clubName: account.clubName,
    range,
    summary,
    portalUrl,
    tier: account.profitShareTierBps,
    generatedAt,
  });

  const pdfBuffer = await htmlToPdf(html);

  if (input.previewOnly) {
    return { ok: true, summary, pdfBytes: pdfBuffer?.length };
  }

  const text = buildPlainText({
    clubName: account.clubName,
    range,
    summary,
    portalUrl,
    tier: account.profitShareTierBps,
  });

  const result = await emailService.send({
    to: account.email,
    subject: `Drop Summary — ${account.clubName} (${range})`,
    text,
    html,
    replyTo: "info@sidelinenz.com",
    attachments: pdfBuffer
      ? [
          {
            filename: `${account.clubName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-drop-summary.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ]
      : undefined,
  });

  return {
    ok: result.success,
    summary,
    pdfBytes: pdfBuffer?.length,
    emailMessageId: result.messageId,
  };
}
