// Server-side PO PDF — generates HTML matching purchase-order.tsx, then
// renders it via Puppeteer's page.setContent() + page.pdf(). No URL
// navigation, no auth cookies, no SPA bootstrap — just raw HTML → Chrome
// → PDF buffer → Drive upload.
//
// @sparticuz/chromium provides the Chromium binary for Railway/serverless.
// Falls back to system chromium if available.

import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { storage } from "./storage";
import { computeMilestones } from "@shared/po-milestones";
import { getSizeChartTables, suggestSizeChart, SIZE_CHART_LABELS, SIZE_CHART_DIAGRAMS, type SizeChartType } from "@shared/size-charts";

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }).toString(),
  });
  if (!res.ok) return null;
  return (await res.json()).access_token;
}

function esc(s: string | null | undefined): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Generate HTML matching purchase-order.tsx exactly ───────────

async function generatePoHtml(orderId: string): Promise<string | null> {
  const data = await storage.getOrderWithDetails(orderId);
  if (!data) return null;
  const { order, items, sizeBreakdowns } = data as any;
  const siteUrl = process.env.VITE_SITE_URL || process.env.BASE_URL || "https://sidelinenz.com";

  const date = new Date(order.createdAt);
  const dateStr = `${date.getDate().toString().padStart(2, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getFullYear().toString().slice(2)}`;
  const contact = [order.customerFirstName, order.customerLastName].filter(Boolean).join(" ") || order.customerName || "";
  const milestones = order.dueDate ? computeMilestones(order.dueDate) : null;

  // Group size breakdowns by item
  const bdByItem = new Map<string, Array<{ size: string; quantity: number }>>();
  for (const b of sizeBreakdowns ?? []) {
    const list = bdByItem.get(b.orderItemId) || [];
    list.push({ size: b.size, quantity: b.quantity });
    bdByItem.set(b.orderItemId, list);
  }

  const itemsHtml = items.map((item: any) => {
    const colors = (item.productColors || []) as Array<{ hex: string; name?: string }>;
    const elements = (item.elementUrls || []) as Array<{ name: string; url: string }>;
    const bds = bdByItem.get(item.id) || [];
    const totalQty = bds.length ? bds.reduce((s: number, b: any) => s + b.quantity, 0) : item.quantity;
    const chartType = (item.sizeChartType || suggestSizeChart(item.productType)) as SizeChartType;
    const sizeTables = getSizeChartTables(chartType);
    const diagramSrc = SIZE_CHART_DIAGRAMS[chartType];

    return `
    <div style="page-break-inside:avoid;margin-bottom:20px">
      <!-- Product header -->
      <div style="background:#000;color:#fff;padding:8px 16px;font-size:13px;font-weight:700;text-align:center;letter-spacing:0.3px">
        ${esc(item.productName)}
      </div>

      <!-- Product info row -->
      <div style="display:flex;border:1px solid #eee;border-top:none">
        <!-- Left: specs -->
        <div style="width:240px;padding:14px 16px;font-size:12px;color:#000">
          <div style="margin-bottom:10px"><div style="font-weight:700;margin-bottom:2px">Product</div><div>${esc(item.productName)}</div></div>
          ${item.material ? `<div style="margin-bottom:10px"><div style="font-weight:700;margin-bottom:2px">Material / Spec</div><div>${esc(item.material)}</div></div>` : ""}
          ${item.brandingMethod ? `<div style="margin-bottom:10px"><div style="font-weight:700;margin-bottom:2px">Branding Application</div><div style="color:#0ea5e9">${esc(item.brandingMethod)}</div></div>` : ""}
          ${colors.length ? `
            <div style="margin-bottom:10px">
              <div style="font-weight:700;margin-bottom:4px">Colour Palette</div>
              ${colors.map((c) => `
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  <span style="display:inline-block;width:28px;height:16px;background:${c.hex};border:1px solid #bbb;border-radius:2px"></span>
                  <span style="font-size:11px"><strong>${esc(c.name || "")}</strong> <span style="color:#888">${c.hex}</span></span>
                </div>`).join("")}
            </div>` : ""}
          ${item.designNotes ? `<div><div style="font-weight:700;margin-bottom:2px">Notes</div><div style="font-size:11px;color:#555">${esc(item.designNotes)}</div></div>` : ""}
        </div>

        <!-- Center: mockups -->
        <div style="flex:1;display:flex;justify-content:center;align-items:center;gap:20px;padding:16px 12px;min-height:260px">
          ${item.frontDesignUrl ? `<img src="${item.frontDesignUrl}" style="max-height:280px;flex:1;min-width:0;object-fit:contain" />` : ""}
          ${item.backDesignUrl ? `<img src="${item.backDesignUrl}" style="max-height:280px;flex:1;min-width:0;object-fit:contain" />` : ""}
        </div>

        <!-- Right: sizes -->
        <div style="width:200px;padding:14px 16px;border-left:1px solid #eee">
          <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-bottom:6px"><span>Size</span><span>Count</span></div>
          ${bds.map((b: any) => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">${esc(b.size)}<span>${b.quantity}</span></div>`).join("")}
          ${bds.length ? `<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-top:10px"><span>Total</span><span>${totalQty}</span></div>` : `<div style="font-size:12px;color:#999">Qty: ${totalQty}</div>`}
        </div>
      </div>

      <!-- Design Specifications -->
      ${(item.frontDesignUrl || item.backDesignUrl || elements.length) ? `
        <div style="background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700;text-align:center">Design Specifications</div>
        <div style="display:flex;min-height:300px;align-items:stretch;border:1px solid #eee;border-top:none">
          ${item.frontDesignUrl ? `<div style="flex:1;padding:16px 12px;text-align:center;display:flex;flex-direction:column"><p style="font-size:11px;font-weight:700;margin-bottom:8px">Front Design</p><img src="${item.frontDesignUrl}" style="flex:1;min-height:0;object-fit:contain;width:100%" /></div>` : ""}
          ${item.backDesignUrl ? `<div style="flex:1;padding:16px 12px;text-align:center;display:flex;flex-direction:column"><p style="font-size:11px;font-weight:700;margin-bottom:8px">Back Design</p><img src="${item.backDesignUrl}" style="flex:1;min-height:0;object-fit:contain;width:100%" /></div>` : ""}
          ${elements.length ? `<div style="width:200px;padding:12px 8px;text-align:center;border-left:1px solid #eee"><p style="font-size:11px;font-weight:700;margin-bottom:8px">Elements</p>${elements.map((el: any) => `<img src="${el.url}" title="${esc(el.name)}" style="max-height:55px;max-width:170px;object-fit:contain;margin-bottom:8px" /><br/>`).join("")}</div>` : ""}
        </div>` : ""}

      <!-- Design Brief -->
      ${item.designBrief ? `
        <div style="background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700;text-align:center">
          Design Brief <span style="font-weight:400;font-size:9px;opacity:0.6">powered by AI</span>
        </div>
        <div style="padding:12px 16px;font-size:11px;line-height:1.6;color:#333;white-space:pre-wrap;border:1px solid #eee;border-top:none">${esc(item.designBrief)}</div>` : ""}

      <!-- Sizing Guide -->
      <div style="background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700;text-align:center">
        Sizing Guide — ${esc(SIZE_CHART_LABELS[chartType] || String(chartType))}
      </div>
      <div style="display:flex;align-items:flex-start;gap:16px;padding:12px 16px;border:1px solid #eee;border-top:none">
        ${diagramSrc ? `<div style="width:220px;flex-shrink:0;text-align:center"><img src="${siteUrl}${diagramSrc}" style="width:100%;max-height:280px;object-fit:contain" /><p style="font-size:9px;color:#888;margin-top:4px">Measurement reference</p></div>` : ""}
        <div style="flex:1;overflow-x:auto">
          ${sizeTables.map((t) => `
            <p style="font-size:12px;font-weight:800;margin:6px 0 3px">${esc(t.title)}</p>
            <table style="width:100%;border-collapse:collapse;font-size:10px">
              <thead><tr>${t.headers.map((h, i) => `<th style="padding:4px;background:${i === 0 ? "#fff" : "#c9d9ea"};text-align:${i === 0 ? "left" : "center"};font-weight:700;border:1px solid #ddd">${esc(h)}</th>`).join("")}</tr></thead>
              <tbody>${t.rows.map((row) => `<tr><td style="padding:3px 8px;font-weight:600;white-space:nowrap;border:1px solid #ddd">${esc(row.label)}</td>${row.values.map((v) => `<td style="padding:3px 4px;text-align:center;border:1px solid #ddd">${v}</td>`).join("")}</tr>`).join("")}</tbody>
            </table>
            <div style="display:flex;justify-content:space-between;font-size:9px;color:#666;padding:3px 0"><span>Measurements in cm</span><span>Tolerance ${esc(t.tolerance)}</span></div>
          `).join("")}
        </div>
      </div>
    </div>`;
  }).join("\n");

  const milestonesHtml = milestones ? `
    <div style="margin-bottom:20px">
      <div style="background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700;text-align:center">Production Schedule — 35-Day Build</div>
      <div style="display:flex;border:1px solid #eee;border-top:none">
        ${milestones.map((m: any) => `<div style="flex:1;text-align:center;padding:10px 6px;border-right:1px solid #eee;font-size:10px"><div style="font-weight:700">Day ${m.dayNumber}</div><div style="font-weight:600;font-size:9px;margin:2px 0">${esc(m.label)}</div><div style="font-family:monospace;color:#555">${m.date}</div></div>`).join("")}
      </div>
    </div>` : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>PO ${esc(order.poReference || order.orderNumber)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #000; margin: 0; padding: 32px 40px; max-width: 900px; margin: 0 auto; }
  img { max-width: 100%; }
  @page { margin: 10mm; }
  @media print { body { padding: 0; } }
</style></head><body>

<!-- Header -->
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
  <div>
    <div style="margin-bottom:12px"><img src="${siteUrl}/sideline-logo-vertical.png" style="height:60px;object-fit:contain" /></div>
    <div style="font-size:11px;color:#333;line-height:1.6">
      Sideline NZ (Sideline Custom Goods Ltd)<br/>Unit 2, 66 Cavendish Drive Manukau<br/>Auckland, 2104<br/>022 412 7205<br/>info@sidelinenz.com<br/><span style="color:#0ea5e9">www.sidelinenz.com</span>
    </div>
  </div>
  <div style="text-align:right;min-width:360px">
    <h2 style="font-size:15px;font-weight:800;margin:0 0 16px;letter-spacing:0.5px">PURCHASE ORDER</h2>
    <table style="font-size:12px;margin-left:auto;border-collapse:collapse">
      <tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">DATE</td><td style="background:#f2f2f2;padding:4px 10px;min-width:200px">${dateStr}</td></tr>
      <tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">PO/Order Reference:</td><td style="background:#f2f2f2;padding:4px 10px">${esc(order.poReference || order.orderNumber)}</td></tr>
      <tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">Account</td><td style="background:#f2f2f2;padding:4px 10px">${esc(order.accountName || "")}</td></tr>
      <tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">New or Repeat Order:</td><td style="background:#f2f2f2;padding:4px 10px">${order.isRepeatOrder ? "Repeat" : "New"}</td></tr>
      ${order.poComments ? `<tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">Comments:</td><td style="background:#f2f2f2;padding:4px 10px">${esc(order.poComments)}</td></tr>` : ""}
    </table>
  </div>
</div>

<!-- Customer / Delivery -->
<div style="margin-bottom:20px">
  <div style="display:flex">
    <div style="flex:1;background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700">Customer</div>
    <div style="flex:1;background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700">Delivery Address</div>
  </div>
  <div style="display:flex;border:1px solid #eee;border-top:none">
    <div style="flex:1;padding:10px 16px;font-size:12px">
      <div style="display:flex;justify-content:space-between;gap:12px">
        <span>${esc(contact)}</span>
        <span style="color:#0ea5e9">${esc(order.customerEmail || "")}</span>
      </div>
    </div>
    <div style="flex:1;padding:10px 16px;font-size:12px">
      ${order.deliveryAttention ? `<div>Attention: ${esc(order.deliveryAttention)}</div>` : ""}
      <div>${esc(order.deliveryAddress || "Sideline NZ, 41 Oakland Rd Karaka, Auckland 2580")}</div>
      ${order.deliveryPhone ? `<div>${esc(order.deliveryPhone)}</div>` : ""}
    </div>
  </div>
</div>

${milestonesHtml}
${itemsHtml}

<!-- Disclaimer -->
<div style="margin-top:32px;border-top:3px solid #1a1a1a;padding-top:16px">
  <p style="font-size:11px;font-weight:700;text-align:center;margin-bottom:12px">Disclaimer: Final Design Proof Approval</p>
  <div style="font-size:10px;color:#555;line-height:1.6;text-align:center">
    <p>This design proof is the intellectual property of Sideline NZ (Sideline Custom Goods Ltd) and is provided solely for the purpose of final client approval. By approving this proof, the customer confirms that all design elements — including colors, logos, placement, spelling, and sizing — are correct. Once approved, this version is final.</p>
    <p style="margin-top:8px">The customer is fully responsible for the approved design. Sideline NZ will not be liable for any errors after approval, nor for delays caused by external factors.</p>
    <p style="margin-top:8px">All designs, mockups, and associated materials remain the exclusive property of Sideline NZ (Sideline Custom Goods Ltd). No part of this design may be copied, reproduced, distributed, or repurposed without prior written consent.</p>
    <p style="margin-top:12px;font-weight:600">&copy; ${new Date().getFullYear()} Sideline NZ (Sideline Custom Goods Ltd). All rights reserved.</p>
  </div>
</div>

</body></html>`;
}

// ─── Render HTML → PDF via Puppeteer ────────────────────────────

async function renderPoPdf(orderId: string): Promise<Buffer | null> {
  const html = await generatePoHtml(orderId);
  if (!html) {
    console.error("[po-pdf] Failed to generate HTML for", orderId);
    return null;
  }

  let executablePath: string;
  try {
    const { execSync } = await import("child_process");
    const found = execSync("which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome-stable 2>/dev/null", { encoding: "utf-8" }).trim();
    executablePath = found || await chromium.executablePath();
  } catch {
    executablePath = await chromium.executablePath();
  }

  console.log(`[po-pdf] Chromium at: ${executablePath}`);
  if (!executablePath) {
    console.error("[po-pdf] No Chromium binary found");
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
    await page.setViewport({ width: 900, height: 1200 });

    // Load HTML directly — no URL navigation, no auth, no SPA bootstrap
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });

    // Extra wait for external images (Vercel Blob URLs)
    await page.evaluate(() => {
      return Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map((img) => new Promise((r) => { img.onload = r; img.onerror = r; }))
      );
    });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 1000)));

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    });

    console.log(`[po-pdf] PDF rendered: ${pdfBuffer.length} bytes`);
    return Buffer.from(pdfBuffer);
  } catch (err) {
    console.error("[po-pdf] Puppeteer error:", err);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ─── Upload PDF to Drive ─────────────────────────────────────────

export async function uploadPoPdfToDrive(
  orderId: string,
  poFolderId: string,
): Promise<{ pdfId: string; pdfUrl: string } | null> {
  const token = await getAccessToken();
  if (!token) { console.log("[po-pdf] Google creds missing"); return null; }

  const pdfBuf = await renderPoPdf(orderId);
  if (!pdfBuf) { console.error("[po-pdf] Render failed for", orderId); return null; }

  const order = await storage.getOrder(orderId);
  const fileName = `PO ${order?.poReference || order?.orderNumber || orderId}.pdf`;

  try {
    let targetFolder = poFolderId;
    const foldersQ = `'${poFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const fRes = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(foldersQ)}&fields=files(id,name)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
    if (fRes.ok) {
      const brief = ((await fRes.json()).files || []).find((f: any) => /brief/i.test(f.name));
      if (brief) targetFolder = brief.id;
    }

    const boundary = `--po-pdf-${Date.now().toString(36)}`;
    const meta = JSON.stringify({ name: fileName, parents: [targetFolder] });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`, "utf-8"),
      pdfBuf,
      Buffer.from(`\r\n--${boundary}--`, "utf-8"),
    ]);

    const upRes = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}`, "Content-Length": String(body.length) },
      body,
    });
    if (!upRes.ok) { console.error("[po-pdf] Upload failed:", upRes.status); return null; }
    const f = await upRes.json();
    console.log(`[po-pdf] Uploaded: ${f.id}`);
    return { pdfId: f.id, pdfUrl: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view` };
  } catch (err) { console.error("[po-pdf] error:", err); return null; }
}
