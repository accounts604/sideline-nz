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
import { LOGO_POSITIONS, type LogoElement, type LogoPosition } from "@shared/schema";
import { getDesignPrints, getMockups, type DesignAsset } from "@shared/design-assets";
import { poBaseName, poFilename } from "@shared/po-filename";

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

// ─── Design asset strip ─────────────────────────────────────────
//
// Renders a labelled section with N images side-by-side, scaled to fit the
// page width. Used for both 2D Design Prints and 3D Mockups. If there are
// no assets the whole section is omitted (keeps the PO tight).

function renderAssetStrip(title: string, assets: DesignAsset[], headerBg = "#000"): string {
  if (!assets.length) return "";
  const col = `${100 / assets.length}%`;
  return `
  <div style="page-break-inside:avoid">
    <div style="background:${headerBg};color:#fff;padding:6px 16px;font-size:12px;font-weight:700;text-align:center;letter-spacing:0.3px">${esc(title)}</div>
    <div style="display:flex;border:1px solid #eee;border-top:none;min-height:240px">
      ${assets.map((a) => `
        <div style="width:${col};padding:14px 10px;text-align:center;display:flex;flex-direction:column;border-right:1px solid #eee">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px;color:#555">${esc(a.label || "—")}</div>
          <div style="flex:1;display:flex;align-items:center;justify-content:center;min-height:0">
            <img src="${a.url}" style="max-width:100%;max-height:260px;object-fit:contain" />
          </div>
        </div>`).join("")}
    </div>
  </div>`;
}

// ─── Logo Placement Grid (job-sheet-style) ──────────────────────
//
// Renders a 9-position grid per product (Left Chest → Bottom) with rows for
// logo image, application method, size (mm), thread/PMS codes, artwork file.
// Positions with no assigned logo render as em-dashes.

function renderLogoGrid(elements: LogoElement[]): string {
  // Multiple logos can share a position (e.g. two sponsors on Center Back).
  // A position that doesn't match one of the 9 presets is a "custom
  // placement" — rendered in its own strip under the grid.
  const presetSet = new Set<string>(LOGO_POSITIONS);
  const byPosition = new Map<LogoPosition, LogoElement[]>();
  const custom: LogoElement[] = [];
  const unassigned: LogoElement[] = [];
  for (const el of elements) {
    if (!el.position) {
      if (el.url) unassigned.push(el);
    } else if (presetSet.has(el.position)) {
      const key = el.position as LogoPosition;
      const list = byPosition.get(key) || [];
      list.push(el);
      byPosition.set(key, list);
    } else {
      custom.push(el);
    }
  }

  const th = (label: string, isFirst = false) => `<th style="padding:6px 4px;background:#000;color:#fff;font-size:8.5px;font-weight:700;text-align:${isFirst ? "left" : "center"};letter-spacing:0.2px;border:1px solid #000;line-height:1.2">${label}</th>`;
  const td = (content: string) => `<td style="padding:6px 4px;font-size:9.5px;text-align:center;border:1px solid #ccc;vertical-align:middle">${content}</td>`;
  const lblCell = (label: string) => `<td style="padding:6px 8px;font-size:9px;font-weight:700;background:#f3f3f3;text-align:left;letter-spacing:0.2px;border:1px solid #ccc">${label}</td>`;

  const colgroup = `<colgroup><col style="width:13%" />${LOGO_POSITIONS.map(() => `<col style="width:9.67%" />`).join("")}</colgroup>`;
  const empty = `<span style="color:#ccc;font-size:16px">—</span>`;

  // Unassigned strip — logos that have been uploaded but don't have a
  // position picked yet. Shown above the grid so they're never invisible.
  const unassignedStrip = unassigned.length ? `
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-bottom:none;padding:8px 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:9px;font-weight:700;color:#c2410c;text-transform:uppercase;letter-spacing:0.4px;margin-right:4px">Unassigned (${unassigned.length}) — set position in admin</span>
      ${unassigned.map(el => `
        <div style="display:inline-flex;align-items:center;gap:6px;padding:3px 8px 3px 3px;background:#fff;border:1px solid #fdba74;border-radius:4px">
          <img src="${el.url}" style="height:22px;max-width:40px;object-fit:contain" />
          <span style="font-size:10px;color:#555">${esc(el.name || "Logo")}</span>
        </div>`).join("")}
    </div>` : "";

  return `
  <div style="margin-top:0">
    <div style="background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700;text-align:center;letter-spacing:0.3px">Logo Placement Grid</div>
    ${unassignedStrip}
    <table style="width:100%;border-collapse:collapse;table-layout:fixed">
      ${colgroup}
      <thead>
        <tr>
          ${th("POSITION", true)}
          ${LOGO_POSITIONS.map(p => th(p.toUpperCase())).join("")}
        </tr>
      </thead>
      <tbody>
        <tr style="height:90px">
          ${lblCell("LOGO")}
          ${LOGO_POSITIONS.map(p => {
            const specs = byPosition.get(p) || [];
            if (!specs.length) return td(empty);
            // Stack multiple logos in the same cell — slightly smaller when > 1.
            const maxH = specs.length === 1 ? 76 : 36;
            const stacked = specs.map(s => `<img src="${s.url}" style="max-width:88%;max-height:${maxH}px;object-fit:contain;margin:1px 0" />`).join("<br/>");
            return td(stacked);
          }).join("")}
        </tr>
        <tr>
          ${lblCell("APPLICATION")}
          ${LOGO_POSITIONS.map(p => {
            const specs = byPosition.get(p) || [];
            if (!specs.length) return td("");
            return td(specs.map(s => s.application ? `<strong>${esc(s.application).toUpperCase()}</strong>` : "—").join("<br/>"));
          }).join("")}
        </tr>
        <tr>
          ${lblCell("SIZE")}
          ${LOGO_POSITIONS.map(p => {
            const specs = byPosition.get(p) || [];
            if (!specs.length) return td("");
            return td(specs.map(s => esc(s.sizeMm || "—")).join("<br/>"));
          }).join("")}
        </tr>
        <tr>
          ${lblCell("THREAD / PMS")}
          ${LOGO_POSITIONS.map(p => {
            const specs = byPosition.get(p) || [];
            if (!specs.length) return td("");
            return td(specs.map(s => s.threadColours?.length
              ? s.threadColours.map(c => `<div style="font-size:9px;line-height:1.4">${esc(c)}</div>`).join("")
              : "—").join('<div style="height:4px"></div>'));
          }).join("")}
        </tr>
        <tr>
          ${lblCell("ARTWORK FILE")}
          ${LOGO_POSITIONS.map(p => {
            const specs = byPosition.get(p) || [];
            if (!specs.length) return td("");
            return td(specs.map(s => s.artworkFile ? `<span style="font-family:monospace;font-size:9px">${esc(s.artworkFile)}</span>` : "—").join("<br/>"));
          }).join("")}
        </tr>
      </tbody>
    </table>
    ${custom.length ? `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-top:none;padding:10px 12px">
        <div style="font-size:9px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">Custom Placements (${custom.length})</div>
        <table style="width:100%;border-collapse:collapse;font-size:9.5px">
          <thead>
            <tr>
              ${["POSITION","LOGO","APPLICATION","SIZE","THREAD / PMS","ARTWORK"].map((h,i) => `<th style="padding:4px 6px;background:#dbeafe;text-align:${i<2?"left":"center"};font-size:8.5px;font-weight:700;letter-spacing:0.3px;border:1px solid #bfdbfe">${h}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${custom.map(s => `
              <tr>
                <td style="padding:5px 6px;font-weight:700;color:#1d4ed8;border:1px solid #bfdbfe">${esc(s.position || "")}</td>
                <td style="padding:5px 6px;border:1px solid #bfdbfe">${s.url ? `<img src="${s.url}" style="max-height:32px;max-width:56px;object-fit:contain" />` : ""}</td>
                <td style="padding:5px 6px;text-align:center;border:1px solid #bfdbfe"><strong>${esc((s.application || "—").toUpperCase())}</strong></td>
                <td style="padding:5px 6px;text-align:center;border:1px solid #bfdbfe">${esc(s.sizeMm || "—")}</td>
                <td style="padding:5px 6px;text-align:center;border:1px solid #bfdbfe">${s.threadColours?.length ? s.threadColours.map(c => esc(c)).join(", ") : "—"}</td>
                <td style="padding:5px 6px;text-align:center;border:1px solid #bfdbfe;font-family:monospace">${esc(s.artworkFile || "—")}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : ""}
  </div>`;
}

// ─── Generate HTML (Production Sheet v2) ─────────────────────────
// Exported so smoke-test scripts can render the prod HTML into a PDF without
// going through the Drive upload path. Not part of the public HTTP surface.

export async function generatePoHtml(orderId: string): Promise<string | null> {
  const data = await storage.getOrderWithDetails(orderId);
  if (!data) return null;
  const { order, items, sizeBreakdowns } = data as any;
  const siteUrl = process.env.VITE_SITE_URL || process.env.BASE_URL || "https://sidelinenz.com";
  const portalUrl = `${siteUrl}/admin/orders/${order.id}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&margin=2&data=${encodeURIComponent(portalUrl)}`;

  const date = new Date(order.createdAt);
  const dateStr = `${date.getDate().toString().padStart(2, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getFullYear().toString().slice(2)}`;
  const contact = [order.customerFirstName, order.customerLastName].filter(Boolean).join(" ") || order.customerName || "";
  const milestones = order.dueDate ? computeMilestones(order.dueDate) : null;

  const bdByItem = new Map<string, Array<{ size: string; quantity: number }>>();
  for (const b of sizeBreakdowns ?? []) {
    const list = bdByItem.get(b.orderItemId) || [];
    list.push({ size: b.size, quantity: b.quantity });
    bdByItem.set(b.orderItemId, list);
  }

  const itemsHtml = items.map((item: any) => {
    const colors = (item.productColors || []) as Array<{ hex: string; name?: string }>;
    const elements = (item.elementUrls || []) as LogoElement[];
    const designPrints = getDesignPrints(item);
    const mockups = getMockups(item);
    const bds = bdByItem.get(item.id) || [];
    const totalQty = bds.length ? bds.reduce((s: number, b: any) => s + b.quantity, 0) : item.quantity;
    const chartType = (item.sizeChartType || suggestSizeChart(item.productType)) as SizeChartType;
    const sizeTables = getSizeChartTables(chartType);
    const diagramSrc = SIZE_CHART_DIAGRAMS[chartType];

    return `
    <div style="page-break-inside:avoid;margin-bottom:20px">
      <div style="background:#000;color:#fff;padding:8px 16px;font-size:13px;font-weight:700;text-align:center;letter-spacing:0.3px">
        ${esc(item.productName)}
      </div>

      <div style="display:flex;border:1px solid #eee;border-top:none">
        <div style="flex:1;padding:14px 18px;font-size:12px;color:#000">
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

        <div style="width:220px;padding:14px 16px;border-left:1px solid #eee">
          <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-bottom:6px"><span>Size</span><span>Count</span></div>
          ${bds.map((b: any) => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">${esc(b.size)}<span>${b.quantity}</span></div>`).join("")}
          ${bds.length ? `<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-top:10px"><span>Total</span><span>${totalQty}</span></div>` : `<div style="font-size:12px;color:#999">Qty: ${totalQty}</div>`}
        </div>
      </div>

      ${renderAssetStrip("2D Design Print — Factory Artwork (true colours)", designPrints, "#0a0a0a")}
      ${renderAssetStrip("3D Mockup — Vendor Render", mockups, "#0a0a0a")}
      ${elements.length ? renderLogoGrid(elements) : ""}

      ${sizeTables.length ? `
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
        </div>` : ""}
    </div>`;
  }).join("\n");

  const milestonesHtml = milestones ? `
    <div style="margin-bottom:18px">
      <div style="background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700;text-align:center">Production Schedule — 35-Day Build</div>
      <div style="display:flex;border:1px solid #eee;border-top:none">
        ${milestones.map((m: any) => `<div style="flex:1;text-align:center;padding:10px 6px;border-right:1px solid #eee;font-size:10px"><div style="font-weight:700">Day ${m.dayNumber}</div><div style="font-weight:600;font-size:9px;margin:2px 0">${esc(m.label)}</div><div style="font-family:monospace;color:#555">${m.date}</div></div>`).join("")}
      </div>
    </div>` : "";

  // Artwork Approval band — STATUS / APPROVED BY / DATE / REFERENCE. Status
  // derives from order.artworkApproved flag if present, else falls back to a
  // "pending" state so the slot still renders.
  const approved = (order as any).artworkApproved === true;
  const approvedBy = (order as any).artworkApprovedBy || contact;
  const approvedDate = (order as any).artworkApprovedAt
    ? new Date((order as any).artworkApprovedAt).toISOString().slice(0, 10)
    : dateStr;
  const approvalBand = `
    <div style="margin-bottom:18px">
      <div style="background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700;text-align:center;letter-spacing:0.3px">Artwork Approval</div>
      <div style="display:flex;border:1px solid #eee;border-top:none;font-size:11px">
        <div style="flex:1;padding:10px 14px;border-right:1px solid #eee">
          <div style="font-weight:700;font-size:10px;color:#555;letter-spacing:0.4px;margin-bottom:3px">STATUS</div>
          <div><span style="display:inline-block;padding:3px 10px;background:${approved ? "#16a34a" : "#f59e0b"};color:#fff;border-radius:3px;font-weight:700;font-size:10px;letter-spacing:0.3px">${approved ? "APPROVED" : "PENDING"}</span></div>
        </div>
        <div style="flex:1;padding:10px 14px;border-right:1px solid #eee">
          <div style="font-weight:700;font-size:10px;color:#555;letter-spacing:0.4px;margin-bottom:3px">APPROVED BY</div>
          <div>${esc(approved ? approvedBy : "—")}</div>
        </div>
        <div style="flex:1;padding:10px 14px;border-right:1px solid #eee">
          <div style="font-weight:700;font-size:10px;color:#555;letter-spacing:0.4px;margin-bottom:3px">DATE</div>
          <div style="font-family:monospace">${approved ? approvedDate : "—"}</div>
        </div>
        <div style="flex:1.3;padding:10px 14px">
          <div style="font-weight:700;font-size:10px;color:#555;letter-spacing:0.4px;margin-bottom:3px">REFERENCE</div>
          <div style="font-family:monospace;font-size:10px">${esc(order.poReference || order.orderNumber || "")}</div>
        </div>
      </div>
    </div>`;

  const docTitle = poBaseName({
    poReference: order.poReference,
    orderNumber: order.orderNumber,
    accountName: order.accountName,
    customerName: order.customerName,
    createdAt: order.createdAt,
  });

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(docTitle)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #000; margin: 0; padding: 28px 36px; max-width: 900px; margin: 0 auto; }
  img { max-width: 100%; }
  @page { margin: 8mm; }
  @media print { body { padding: 0; } }
</style></head><body>

<!-- Header -->
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
  <div>
    <div style="margin-bottom:10px"><img src="${siteUrl}/sideline-logo-vertical.png" style="height:56px;object-fit:contain" /></div>
    <div style="font-size:11px;color:#333;line-height:1.6">
      Sideline NZ (Sideline Custom Goods Ltd)<br/>Unit 2, 66 Cavendish Drive Manukau<br/>Auckland, 2104<br/>022 412 7205<br/>info@sidelinenz.com<br/><span style="color:#0ea5e9">www.sidelinenz.com</span>
    </div>
  </div>
  <div style="text-align:right;min-width:420px;display:flex;gap:14px;align-items:flex-start;justify-content:flex-end">
    <div>
      <h2 style="font-size:15px;font-weight:800;margin:0 0 12px;letter-spacing:0.5px">PRODUCTION SHEET</h2>
      <table style="font-size:12px;margin-left:auto;border-collapse:collapse">
        <tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">DATE</td><td style="background:#f2f2f2;padding:4px 10px;min-width:180px">${dateStr}</td></tr>
        <tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">ORDER REF</td><td style="background:#f2f2f2;padding:4px 10px">${esc(order.poReference || order.orderNumber)}</td></tr>
        <tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">ACCOUNT</td><td style="background:#f2f2f2;padding:4px 10px">${esc(order.accountName || "")}</td></tr>
        <tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">TYPE</td><td style="background:#f2f2f2;padding:4px 10px">${order.isRepeatOrder ? "Repeat" : "New"}</td></tr>
        ${order.dueDate ? `<tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">DUE</td><td style="background:#f2f2f2;padding:4px 10px">${esc(order.dueDate)}</td></tr>` : ""}
        ${order.poComments ? `<tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">COMMENTS</td><td style="background:#f2f2f2;padding:4px 10px">${esc(order.poComments)}</td></tr>` : ""}
      </table>
    </div>
    <div style="text-align:center">
      <img src="${qrSrc}" style="width:88px;height:88px;border:1px solid #ddd;padding:4px;background:#fff" />
      <div style="font-size:8px;color:#888;margin-top:4px;letter-spacing:0.3px">SCAN FOR LIVE ORDER</div>
    </div>
  </div>
</div>

<!-- Customer / Delivery -->
<div style="margin-bottom:18px">
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

${approvalBand}
${milestonesHtml}
${itemsHtml}

<!-- Disclaimer -->
<div style="margin-top:28px;border-top:3px solid #1a1a1a;padding-top:14px">
  <p style="font-size:11px;font-weight:700;text-align:center;margin-bottom:10px">Disclaimer: Final Design Proof Approval</p>
  <div style="font-size:10px;color:#555;line-height:1.6;text-align:center">
    <p>This production sheet is the intellectual property of Sideline NZ (Sideline Custom Goods Ltd). By approving, the customer confirms all design elements — colours, logos, placement, spelling, sizing — are correct. Once approved, this version is final.</p>
    <p style="margin-top:8px">The customer is fully responsible for the approved design. Sideline NZ will not be liable for any errors after approval, nor for delays caused by external factors.</p>
    <p style="margin-top:10px;font-weight:600">&copy; ${new Date().getFullYear()} Sideline NZ (Sideline Custom Goods Ltd). All rights reserved.</p>
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
  const fileName = poFilename({
    poReference: order?.poReference,
    orderNumber: order?.orderNumber,
    accountName: order?.accountName,
    customerName: order?.customerName,
    createdAt: order?.createdAt,
  });

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
