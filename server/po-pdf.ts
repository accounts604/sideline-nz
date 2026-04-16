// Server-side PO PDF generation — builds a standalone HTML document from
// order data, uploads it to Google Drive as a Google Doc (auto-convert from
// HTML), exports that Doc as a PDF, and saves the PDF into the PO's Drive
// folder under "01. Brief".
//
// No Puppeteer / Chrome binary needed — the conversion is done by Google
// Drive's built-in HTML→Docs→PDF pipeline, which handles images, tables,
// and basic CSS cleanly enough for a production PO document.

import { storage } from "./storage";
import { computeMilestones } from "@shared/po-milestones";
import { getSizeChartTables, suggestSizeChart, SIZE_CHART_LABELS, type SizeChartType } from "@shared/size-charts";

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

// ─── HTML generation ─────────────────────────────────────────────

function escHtml(s: string | null | undefined): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function generatePoHtml(orderId: string): Promise<string | null> {
  const orderData = await storage.getOrderWithDetails(orderId);
  if (!orderData) return null;
  const { order, items } = orderData as any;

  const date = new Date(order.createdAt);
  const dateStr = `${date.getDate().toString().padStart(2, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getFullYear()}`;
  const contact = [order.customerFirstName, order.customerLastName].filter(Boolean).join(" ") || order.customerName || "";

  const milestones = order.dueDate ? computeMilestones(order.dueDate) : null;

  const itemsHtml = items.map((item: any) => {
    const colors = (item.productColors || []) as Array<{ hex: string; name?: string }>;
    const elements = (item.elementUrls || []) as Array<{ name: string; url: string }>;

    const colorCells = colors.map((c: any) =>
      `<span style="display:inline-flex;align-items:center;gap:6px;margin-right:10px">
        <span style="display:inline-block;width:20px;height:14px;background:${c.hex};border:1px solid #bbb;border-radius:2px"></span>
        <span>${escHtml(c.name || "")} <small style="color:#888">${c.hex}</small></span>
      </span>`
    ).join("");

    return `
    <div style="page-break-inside:avoid;margin-bottom:20px;border:1px solid #ddd">
      <div style="background:#000;color:#fff;padding:8px 16px;font-size:13px;font-weight:700;text-align:center">${escHtml(item.productName)}</div>
      <div style="display:flex">
        <div style="width:240px;padding:14px 16px;font-size:12px">
          <p><strong>Product:</strong> ${escHtml(item.productName)}</p>
          ${item.material ? `<p><strong>Material:</strong> ${escHtml(item.material)}</p>` : ""}
          ${item.brandingMethod ? `<p><strong>Branding:</strong> ${escHtml(item.brandingMethod)}</p>` : ""}
          ${colorCells ? `<p><strong>Colours:</strong><br/>${colorCells}</p>` : ""}
          <p><strong>Quantity:</strong> ${item.quantity}</p>
          ${item.designNotes ? `<p><strong>Notes:</strong> ${escHtml(item.designNotes)}</p>` : ""}
        </div>
        <div style="flex:1;display:flex;justify-content:center;align-items:center;gap:16px;padding:16px;min-height:200px">
          ${item.frontDesignUrl ? `<img src="${item.frontDesignUrl}" style="max-height:240px;max-width:45%;object-fit:contain" />` : ""}
          ${item.backDesignUrl ? `<img src="${item.backDesignUrl}" style="max-height:240px;max-width:45%;object-fit:contain" />` : ""}
        </div>
      </div>
      ${item.designBrief ? `
        <div style="background:#f5f5f5;padding:12px 16px;font-size:11px;border-top:1px solid #ddd">
          <strong>Design Brief (AI):</strong><br/><span style="white-space:pre-wrap">${escHtml(item.designBrief)}</span>
        </div>` : ""}
      ${elements.length ? `
        <div style="padding:10px 16px;border-top:1px solid #eee;font-size:11px">
          <strong>Elements:</strong>
          <div style="display:flex;gap:12px;margin-top:6px;flex-wrap:wrap">
            ${elements.map((el: any) => `<img src="${el.url}" title="${escHtml(el.name)}" style="max-height:50px;max-width:120px;object-fit:contain" />`).join("")}
          </div>
        </div>` : ""}
    </div>`;
  }).join("\n");

  const milestonesHtml = milestones
    ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:11px">
        <tr>${milestones.map((m: any) => `<td style="text-align:center;padding:8px 4px;border:1px solid #ddd"><strong>Day ${m.dayNumber}</strong><br/>${escHtml(m.label)}<br/><small>${m.date}</small></td>`).join("")}</tr>
       </table>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>PO ${escHtml(order.poReference || order.orderNumber)}</title>
<style>body{font-family:'Segoe UI',Arial,sans-serif;color:#000;margin:0;padding:32px 40px;max-width:900px;margin:auto}
img{max-width:100%}table{border-collapse:collapse}td,th{padding:4px 8px}
@page{margin:10mm}</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
  <div>
    <h1 style="font-size:20px;margin:0 0 8px">SIDELINE NZ</h1>
    <div style="font-size:11px;color:#333;line-height:1.6">
      Sideline NZ (Sideline Custom Goods Ltd)<br/>
      Unit 2, 66 Cavendish Drive Manukau<br/>Auckland, 2104<br/>
      022 412 7205 · info@sidelinenz.com<br/>www.sidelinenz.com
    </div>
  </div>
  <div style="text-align:right">
    <h2 style="font-size:15px;margin:0 0 12px">PURCHASE ORDER</h2>
    <table style="margin-left:auto;font-size:12px">
      <tr><td style="font-weight:700;text-align:right;padding-right:10px">Date:</td><td style="background:#f2f2f2;padding:4px 10px;min-width:200px">${dateStr}</td></tr>
      <tr><td style="font-weight:700;text-align:right;padding-right:10px">PO Reference:</td><td style="background:#f2f2f2;padding:4px 10px">${escHtml(order.poReference || order.orderNumber)}</td></tr>
      <tr><td style="font-weight:700;text-align:right;padding-right:10px">Account:</td><td style="background:#f2f2f2;padding:4px 10px">${escHtml(order.accountName || "")}</td></tr>
      <tr><td style="font-weight:700;text-align:right;padding-right:10px">Contact:</td><td style="background:#f2f2f2;padding:4px 10px">${escHtml(contact)}</td></tr>
      ${order.dueDate ? `<tr><td style="font-weight:700;text-align:right;padding-right:10px">Due Date:</td><td style="background:#f2f2f2;padding:4px 10px">${order.dueDate}</td></tr>` : ""}
      <tr><td style="font-weight:700;text-align:right;padding-right:10px">Type:</td><td style="background:#f2f2f2;padding:4px 10px">${order.isRepeatOrder ? "Repeat" : "New"}</td></tr>
    </table>
  </div>
</div>

<div style="display:flex;margin-bottom:16px">
  <div style="flex:1"><div style="background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700">Customer</div>
    <div style="padding:10px 16px;font-size:12px">${escHtml(contact)} · ${escHtml(order.customerEmail || "")}</div>
  </div>
  <div style="flex:1"><div style="background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700">Delivery Address</div>
    <div style="padding:10px 16px;font-size:12px">${order.deliveryAttention ? `Attn: ${escHtml(order.deliveryAttention)}<br/>` : ""}${escHtml(order.deliveryAddress || "Sideline NZ, 41 Oakland Rd Karaka, Auckland 2580")}${order.deliveryPhone ? `<br/>${escHtml(order.deliveryPhone)}` : ""}</div>
  </div>
</div>

${milestonesHtml}
${itemsHtml}

<div style="margin-top:24px;border-top:2px solid #000;padding-top:12px;font-size:10px;color:#555;text-align:center">
  <p><strong>Disclaimer:</strong> This design proof is the intellectual property of Sideline NZ. By approving, the customer confirms all elements are correct. © ${new Date().getFullYear()} Sideline NZ (Sideline Custom Goods Ltd). All rights reserved.</p>
</div>
</body></html>`;
}

// ─── Upload to Drive as PDF ──────────────────────────────────────

/**
 * 1. Upload HTML → Google Doc (auto-convert)
 * 2. Export Google Doc as PDF
 * 3. Upload PDF into the PO's sub-folder "01. Brief"
 * 4. Delete the intermediate Google Doc
 * Returns the PDF file's Drive ID, or null on failure.
 */
export async function uploadPoPdfToDrive(
  orderId: string,
  poFolderId: string,
): Promise<{ pdfId: string; pdfUrl: string } | null> {
  const token = await getAccessToken();
  if (!token) {
    console.log("[po-pdf] Google creds not configured — skipping");
    return null;
  }

  const html = await generatePoHtml(orderId);
  if (!html) {
    console.error("[po-pdf] could not generate HTML for order", orderId);
    return null;
  }

  const order = await storage.getOrder(orderId);
  const fileName = `PO ${order?.poReference || order?.orderNumber || orderId}`;

  try {
    // Find "01. Brief" sub-folder (or fall back to root)
    let targetFolder = poFolderId;
    const foldersQ = `'${poFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const foldersRes = await fetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(foldersQ)}&fields=files(id,name)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (foldersRes.ok) {
      const subs = ((await foldersRes.json()).files || []) as Array<{ id: string; name: string }>;
      const brief = subs.find((f) => /brief/i.test(f.name));
      if (brief) targetFolder = brief.id;
    }

    // Step 1: Upload HTML → Google Doc (convert=true)
    const boundary = `--po-pdf-${Date.now().toString(36)}`;
    const docMeta = JSON.stringify({
      name: fileName,
      mimeType: "application/vnd.google-apps.document",
      parents: [targetFolder],
    });
    const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${docMeta}\r\n`;
    const htmlPart = `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n`;
    const closing = `--${boundary}--`;
    const body = Buffer.from(metaPart + htmlPart + closing, "utf-8");

    const docRes = await fetch(
      `${UPLOAD_API}/files?uploadType=multipart&fields=id&supportsAllDrives=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );
    if (!docRes.ok) {
      console.error("[po-pdf] doc upload failed:", docRes.status, await docRes.text());
      return null;
    }
    const docId = (await docRes.json()).id;

    // Step 2: Export Google Doc as PDF
    const pdfRes = await fetch(
      `${DRIVE_API}/files/${docId}/export?mimeType=application/pdf`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!pdfRes.ok) {
      console.error("[po-pdf] PDF export failed:", pdfRes.status);
      return null;
    }
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());

    // Step 3: Upload PDF as a real file
    const pdfBoundary = `--po-pdfup-${Date.now().toString(36)}`;
    const pdfMeta = JSON.stringify({
      name: `${fileName}.pdf`,
      parents: [targetFolder],
    });
    const pdfMetaPart = `--${pdfBoundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${pdfMeta}\r\n`;
    const pdfDataHeader = `--${pdfBoundary}\r\nContent-Type: application/pdf\r\n\r\n`;
    const pdfClosing = `\r\n--${pdfBoundary}--`;
    const pdfBody = Buffer.concat([
      Buffer.from(pdfMetaPart, "utf-8"),
      Buffer.from(pdfDataHeader, "utf-8"),
      pdfBuf,
      Buffer.from(pdfClosing, "utf-8"),
    ]);

    const pdfUpRes = await fetch(
      `${UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${pdfBoundary}`,
        },
        body: pdfBody,
      },
    );
    if (!pdfUpRes.ok) {
      console.error("[po-pdf] PDF file upload failed:", pdfUpRes.status, await pdfUpRes.text());
      return null;
    }
    const pdfFile = await pdfUpRes.json();

    // Step 4: Clean up intermediate Google Doc
    await fetch(`${DRIVE_API}/files/${docId}?supportsAllDrives=true`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});

    console.log(`[po-pdf] PDF uploaded: ${pdfFile.id} for order ${orderId}`);
    return {
      pdfId: pdfFile.id,
      pdfUrl: pdfFile.webViewLink || `https://drive.google.com/file/d/${pdfFile.id}/view`,
    };
  } catch (err) {
    console.error("[po-pdf] error:", err);
    return null;
  }
}
