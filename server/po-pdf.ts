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
  const { order, items, sizeBreakdowns } = orderData as any;

  const date = new Date(order.createdAt);
  const dateStr = `${date.getDate().toString().padStart(2, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getFullYear()}`;
  const contact = [order.customerFirstName, order.customerLastName].filter(Boolean).join(" ") || order.customerName || "";
  const milestones = order.dueDate ? computeMilestones(order.dueDate) : null;
  const siteUrl = process.env.VITE_SITE_URL || process.env.BASE_URL || "https://sidelinenz.com";
  const logoUrl = `${siteUrl}/sideline-logo-vertical.png`;

  // Group size breakdowns by item
  const bdByItem = new Map<string, Array<{ size: string; quantity: number }>>();
  for (const b of sizeBreakdowns ?? []) {
    const list = bdByItem.get(b.orderItemId) || [];
    list.push({ size: b.size, quantity: b.quantity });
    bdByItem.set(b.orderItemId, list);
  }

  // ─── Per-item HTML (TABLE layout only — no flexbox/grid) ───
  const itemsHtml = items.map((item: any) => {
    const colors = (item.productColors || []) as Array<{ hex: string; name?: string }>;
    const elements = (item.elementUrls || []) as Array<{ name: string; url: string }>;
    const bds = bdByItem.get(item.id) || [];
    const totalQty = bds.length ? bds.reduce((s, b) => s + b.quantity, 0) : item.quantity;

    const colorRows = colors.map((c) =>
      `<tr><td style="padding:2px 0"><table cellpadding="0" cellspacing="0"><tr>` +
      `<td style="width:24px;height:14px;background:${c.hex};border:1px solid #999"></td>` +
      `<td style="padding-left:8px;font-size:11px">${escHtml(c.name || "Unnamed")} <span style="color:#888">${c.hex}</span></td>` +
      `</tr></table></td></tr>`
    ).join("");

    const sizeRows = bds.map((b) =>
      `<tr><td style="padding:3px 12px 3px 0;font-size:12px">${escHtml(b.size)}</td><td style="padding:3px 0;font-size:12px;text-align:right">${b.quantity}</td></tr>`
    ).join("");

    return `
<!-- Product header bar -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:0"><tr>
  <td style="background:#000;color:#fff;padding:8px 16px;font-size:13px;font-weight:700;text-align:center">${escHtml(item.productName)}</td>
</tr></table>

<!-- Product info: LEFT specs | CENTER mockups | RIGHT sizes -->
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ddd;border-top:none">
<tr valign="top">
  <!-- Specs -->
  <td width="220" style="padding:14px 16px;font-size:12px;border-right:1px solid #eee">
    <table cellpadding="0" cellspacing="0" style="font-size:12px">
      <tr><td style="font-weight:700;padding:2px 8px 2px 0">Product</td><td>${escHtml(item.productName)}</td></tr>
      ${item.material ? `<tr><td style="font-weight:700;padding:2px 8px 2px 0">Material</td><td>${escHtml(item.material)}</td></tr>` : ""}
      ${item.brandingMethod ? `<tr><td style="font-weight:700;padding:2px 8px 2px 0">Branding</td><td style="color:#0ea5e9">${escHtml(item.brandingMethod)}</td></tr>` : ""}
      <tr><td style="font-weight:700;padding:2px 8px 2px 0">Qty</td><td>${totalQty}</td></tr>
    </table>
    ${colors.length ? `<p style="font-weight:700;margin:10px 0 4px;font-size:12px">Colour Palette</p><table cellpadding="0" cellspacing="0">${colorRows}</table>` : ""}
    ${item.designNotes ? `<p style="margin:10px 0 2px;font-weight:700;font-size:12px">Notes</p><p style="font-size:11px;color:#555">${escHtml(item.designNotes)}</p>` : ""}
  </td>

  <!-- Mockups (centre) -->
  <td style="padding:16px;text-align:center">
    <table cellpadding="0" cellspacing="0" align="center"><tr valign="top">
      ${item.frontDesignUrl ? `<td style="padding:0 8px;text-align:center"><p style="font-size:10px;font-weight:700;margin:0 0 4px">FRONT</p><img src="${item.frontDesignUrl}" width="220" style="max-width:220px" /></td>` : ""}
      ${item.backDesignUrl ? `<td style="padding:0 8px;text-align:center"><p style="font-size:10px;font-weight:700;margin:0 0 4px">BACK</p><img src="${item.backDesignUrl}" width="220" style="max-width:220px" /></td>` : ""}
    </tr></table>
  </td>

  <!-- Size breakdown -->
  <td width="160" style="padding:14px 16px;border-left:1px solid #eee">
    <table cellpadding="0" cellspacing="0" width="100%">
      <tr><td style="font-weight:700;font-size:12px;padding-bottom:6px">Size</td><td style="font-weight:700;font-size:12px;text-align:right;padding-bottom:6px">Count</td></tr>
      ${sizeRows || `<tr><td colspan="2" style="font-size:11px;color:#999">—</td></tr>`}
      ${bds.length ? `<tr><td style="font-weight:700;font-size:12px;padding-top:8px;border-top:1px solid #ddd">Total</td><td style="font-weight:700;font-size:12px;text-align:right;padding-top:8px;border-top:1px solid #ddd">${totalQty}</td></tr>` : ""}
    </table>
  </td>
</tr>
</table>

${(item.frontDesignUrl || item.backDesignUrl) ? `
<!-- Design Specifications (larger) -->
<table width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700;text-align:center">Design Specifications</td>
</tr></table>
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ddd;border-top:none">
<tr valign="top">
  ${item.frontDesignUrl ? `<td style="padding:16px;text-align:center"><p style="font-size:11px;font-weight:700;margin:0 0 8px">Front Design</p><img src="${item.frontDesignUrl}" width="300" style="max-width:300px" /></td>` : ""}
  ${item.backDesignUrl ? `<td style="padding:16px;text-align:center"><p style="font-size:11px;font-weight:700;margin:0 0 8px">Back Design</p><img src="${item.backDesignUrl}" width="300" style="max-width:300px" /></td>` : ""}
  ${elements.length ? `<td width="200" style="padding:12px;text-align:center;border-left:1px solid #eee"><p style="font-size:11px;font-weight:700;margin:0 0 8px">Elements</p>${elements.map((el: any) => `<img src="${el.url}" width="150" style="max-width:150px;margin-bottom:8px" /><br/>`).join("")}</td>` : ""}
</tr>
</table>` : ""}

${item.designBrief ? `
<!-- AI Design Brief -->
<table width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="background:#f5f5f5;padding:12px 16px;font-size:11px;border:1px solid #ddd;border-top:none">
    <strong>Design Brief</strong> <span style="color:#888;font-size:9px">powered by AI</span><br/><br/>
    ${escHtml(item.designBrief).replace(/\n/g, "<br/>")}
  </td>
</tr></table>` : ""}
<br/>`;
  }).join("\n");

  // ─── Milestones table ───
  const milestonesHtml = milestones
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #ddd">
        <tr>${milestones.map((m: any) =>
          `<td style="text-align:center;padding:10px 4px;border-right:1px solid #ddd;font-size:11px">` +
          `<strong>Day ${m.dayNumber}</strong><br/>${escHtml(m.label)}<br/><span style="font-size:10px;color:#555;font-family:monospace">${m.date}</span></td>`
        ).join("")}</tr>
       </table>`
    : "";

  // ─── Full document (TABLE layout throughout) ───
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>PO ${escHtml(order.poReference || order.orderNumber)}</title></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;color:#000;margin:0;padding:32px 40px;max-width:900px">

<!-- HEADER: Logo + Company | PO Details -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
<tr valign="top">
  <td width="320">
    <img src="${logoUrl}" width="80" style="max-width:80px;margin-bottom:8px" /><br/>
    <span style="font-size:11px;color:#333;line-height:1.6">
      Sideline NZ (Sideline Custom Goods Ltd)<br/>
      Unit 2, 66 Cavendish Drive Manukau<br/>
      Auckland, 2104<br/>
      022 412 7205<br/>
      info@sidelinenz.com<br/>
      <span style="color:#0ea5e9">www.sidelinenz.com</span>
    </span>
  </td>
  <td style="text-align:right">
    <h2 style="font-size:15px;font-weight:800;margin:0 0 16px;letter-spacing:0.5px">PURCHASE ORDER</h2>
    <table cellpadding="0" cellspacing="0" style="margin-left:auto;font-size:12px">
      <tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">DATE</td><td style="background:#f2f2f2;padding:4px 10px;min-width:200px">${dateStr}</td></tr>
      <tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">PO Reference</td><td style="background:#f2f2f2;padding:4px 10px">${escHtml(order.poReference || order.orderNumber)}</td></tr>
      <tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">Account</td><td style="background:#f2f2f2;padding:4px 10px">${escHtml(order.accountName || "")}</td></tr>
      <tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">Contact</td><td style="background:#f2f2f2;padding:4px 10px">${escHtml(contact)}</td></tr>
      ${order.dueDate ? `<tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">Due Date</td><td style="background:#f2f2f2;padding:4px 10px">${order.dueDate}</td></tr>` : ""}
      <tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">New / Repeat</td><td style="background:#f2f2f2;padding:4px 10px">${order.isRepeatOrder ? "Repeat" : "New"}</td></tr>
      ${order.poComments ? `<tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">Comments</td><td style="background:#f2f2f2;padding:4px 10px">${escHtml(order.poComments)}</td></tr>` : ""}
    </table>
  </td>
</tr>
</table>

<!-- CUSTOMER / DELIVERY -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
<tr>
  <td width="50%" style="background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700">Customer</td>
  <td width="50%" style="background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700">Delivery Address</td>
</tr>
<tr valign="top">
  <td style="padding:10px 16px;font-size:12px;border:1px solid #ddd;border-top:none">
    ${escHtml(contact)}<br/>
    ${order.customerEmail ? `<span style="color:#0ea5e9">${escHtml(order.customerEmail)}</span><br/>` : ""}
    ${order.customerPhone ? escHtml(order.customerPhone) : ""}
  </td>
  <td style="padding:10px 16px;font-size:12px;border:1px solid #ddd;border-top:none;border-left:none">
    ${order.deliveryAttention ? `Attention: ${escHtml(order.deliveryAttention)}<br/>` : ""}
    ${escHtml(order.deliveryAddress || "Sideline NZ, 41 Oakland Rd Karaka, Auckland 2580")}<br/>
    ${order.deliveryPhone ? escHtml(order.deliveryPhone) + "<br/>" : ""}
    ${order.deliveryEmail ? `<span style="color:#0ea5e9">${escHtml(order.deliveryEmail)}</span>` : ""}
  </td>
</tr>
</table>

${milestonesHtml}

<!-- GARMENT LINES -->
${itemsHtml}

<!-- DISCLAIMER -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;border-top:3px solid #1a1a1a">
<tr><td style="padding:16px 0;font-size:10px;color:#555;text-align:center">
  <p style="font-weight:700;margin:0 0 8px">Disclaimer: Final Design Proof Approval</p>
  <p style="margin:0 0 6px">This design proof is the intellectual property of Sideline NZ (Sideline Custom Goods Ltd) and is provided solely for the purpose of final client approval. By approving this proof, the customer confirms that all design elements — including colors, logos, placement, spelling, and sizing — are correct.</p>
  <p style="margin:0 0 6px">The customer is fully responsible for the approved design. Sideline NZ will not be liable for any errors after approval, nor for delays caused by external factors.</p>
  <p style="margin:0;font-weight:600">&copy; ${new Date().getFullYear()} Sideline NZ (Sideline Custom Goods Ltd). All rights reserved.</p>
</td></tr>
</table>

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
