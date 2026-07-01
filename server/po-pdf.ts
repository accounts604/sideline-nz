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
import { getSizeChartTables, suggestSizeChart, SIZE_CHART_LABELS, SIZE_CHART_DIAGRAMS, chartSizes, type SizeChartType } from "@shared/size-charts";
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

// Accepts anything: element data comes from untyped jsonb, so a field the type
// says is a string (e.g. sizeMm) can be a number at runtime. Coerce before
// escaping so a stray non-string can never throw and take down the whole proof.
function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
    <div class="snz-2col" style="display:flex;border:1px solid #eee;border-top:none;min-height:240px">
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

// Pull a sensible filename out of a Vercel-Blob URL (matches the React
// renderer's helper). Empty string if URL malformed.
function filenameFromBlobUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    const seg = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
    if (!seg) return "";
    const m = seg.match(/^(.+)-[A-Za-z0-9]{10,}(\.[a-zA-Z0-9]+)$/);
    return m ? `${m[1]}${m[2]}` : seg;
  } catch {
    return "";
  }
}

function renderLogoGrid(elements: LogoElement[], audience: "supplier" | "customer" = "supplier"): string {
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

  // ARTWORK FILE row exposes internal filenames + blob links — supplier only.
  const artworkRow = audience === "customer" ? "" : `
        <tr>
          ${lblCell("ARTWORK FILE")}
          ${LOGO_POSITIONS.map(p => {
            const specs = byPosition.get(p) || [];
            if (!specs.length) return td("");
            return td(specs.map(s => {
              const label = s.artworkFile || filenameFromBlobUrl(s.url) || "";
              if (!label && !s.url) return "—";
              return s.url
                ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" style="font-family:monospace;font-size:9px;color:#0ea5e9;text-decoration:underline;word-break:break-all">${esc(label || "View file ↗")}</a>`
                : `<span style="font-family:monospace;font-size:9px">${esc(label)}</span>`;
            }).join("<br/>"));
          }).join("")}
        </tr>`;

  // Checkerboard background — keeps white/light logos visible against the
  // white paper. Same pattern as the React renderer.
  const checkerStyle =
    "display:inline-flex;align-items:center;justify-content:center;padding:2px 3px;border-radius:3px;" +
    "background-color:#e5e5e5;" +
    "background-image:linear-gradient(45deg,#d4d4d4 25%,transparent 25%),linear-gradient(-45deg,#d4d4d4 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d4d4d4 75%),linear-gradient(-45deg,transparent 75%,#d4d4d4 75%);" +
    "background-size:8px 8px;background-position:0 0,0 4px,4px -4px,-4px 0px";

  // Unassigned strip — logos that have been uploaded but don't have a
  // position picked yet. Shown above the grid so they're never invisible.
  const unassignedStrip = unassigned.length ? `
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-bottom:none;padding:8px 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:9px;font-weight:700;color:#c2410c;text-transform:uppercase;letter-spacing:0.4px;margin-right:4px">Unassigned (${unassigned.length}) — set position in admin</span>
      ${unassigned.map(el => `
        <div style="display:inline-flex;align-items:center;gap:6px;padding:3px 8px 3px 3px;background:#fff;border:1px solid #fdba74;border-radius:4px">
          <span style="${checkerStyle}"><img src="${el.url}" style="height:22px;max-width:40px;object-fit:contain;display:block" /></span>
          <span style="font-size:10px;color:#555">${esc(el.name || "Logo")}</span>
        </div>`).join("")}
    </div>` : "";

  return `
  <div style="margin-top:0">
    <div style="background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700;text-align:center;letter-spacing:0.3px">Logo Placement Grid</div>
    ${unassignedStrip}
    <div class="snz-scroll"><table style="width:100%;border-collapse:collapse;table-layout:fixed">
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
            const maxH = specs.length === 1 ? 70 : 32;
            const stacked = specs.map(s => `
              <div style="display:flex;flex-direction:column;align-items:center;gap:2px;margin:1px 0">
                <span style="${checkerStyle};padding:3px 4px"><img src="${s.url}" style="max-width:88%;max-height:${maxH}px;object-fit:contain;display:block" /></span>
                ${s.name ? `<span style="font-size:8px;color:#555;text-align:center;line-height:1.2;font-weight:600">${esc(s.name)}</span>` : ""}
              </div>`).join("");
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
              ? s.threadColours.map(c => `<span style="display:inline-block;font-size:8.5px;font-weight:700;color:#b8932f;background:#fdf6e3;border:1px solid #e6d59a;border-radius:2px;padding:0 4px;margin:1px 1px;line-height:1.4">${esc(c)}</span>`).join("")
              : "—").join('<div style="height:4px"></div>'));
          }).join("")}
        </tr>
        ${artworkRow}
      </tbody>
    </table></div>
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
                <td style="padding:5px 6px;text-align:center;border:1px solid #bfdbfe">${s.threadColours?.length
                  ? s.threadColours.map(c => `<span style="display:inline-block;font-size:8.5px;font-weight:700;color:#b8932f;background:#fdf6e3;border:1px solid #e6d59a;border-radius:2px;padding:0 4px;margin:1px 2px">${esc(c)}</span>`).join("")
                  : "—"}</td>
                <td style="padding:5px 6px;text-align:center;border:1px solid #bfdbfe">${(() => {
                  if (audience === "customer") return "—";
                  const label = s.artworkFile || filenameFromBlobUrl(s.url) || "";
                  if (!label && !s.url) return "—";
                  return s.url
                    ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" style="font-family:monospace;font-size:9px;color:#0ea5e9;text-decoration:underline;word-break:break-all">${esc(label || "View file ↗")}</a>`
                    : `<span style="font-family:monospace;font-size:9px">${esc(label)}</span>`;
                })()}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : ""}
  </div>`;
}

// ─── Generate HTML (Production Sheet v2) ─────────────────────────
// Exported so smoke-test scripts can render the prod HTML into a PDF without
// going through the Drive upload path. Not part of the public HTTP surface.

export async function generatePoHtml(orderId: string, opts: { audience?: "supplier" | "customer"; interactive?: boolean; submitUrl?: string } = {}): Promise<string | null> {
  const audience = opts.audience ?? "supplier";
  const isCust = audience === "customer";
  const isInteractive = isCust && (opts.interactive ?? false);
  // When set (public token proof page), the action bar really submits the
  // collected form state to this URL instead of firing the alert() stubs.
  const submitUrl = isInteractive ? (opts.submitUrl || "") : "";
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

  const bdByItem = new Map<string, Array<{ size: string; quantity: number; playerName: string | null; playerNumber: string | null; namePlacement: string | null }>>();
  for (const b of sizeBreakdowns ?? []) {
    const list = bdByItem.get(b.orderItemId) || [];
    list.push({
      size: b.size,
      quantity: b.quantity,
      playerName: b.playerName ?? null,
      playerNumber: b.playerNumber ?? null,
      namePlacement: b.namePlacement ?? null,
    });
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

    const specHtml = `
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
          ${!isCust && item.designBrief ? `<div style="margin-bottom:8px"><div style="font-weight:700;margin-bottom:2px">Design Brief</div><div style="font-size:10px;color:#666;line-height:1.4">${esc(item.designBrief)}</div></div>` : ""}
          ${!isCust && item.designNotes ? `<div><div style="font-weight:700;margin-bottom:2px">Notes</div><div style="font-size:11px;color:#555">${esc(item.designNotes)}</div></div>` : ""}
        </div>`;

    // Supplier keeps the narrow Size/Count sidebar (unchanged).
    const sidebarHtml = `
        <div style="width:220px;padding:14px 16px;border-left:1px solid #eee">
          <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-bottom:6px"><span>Size</span><span>Count</span></div>
          ${bds.map((b: any) => {
            const sub = [
              b.playerName ? `${esc(b.playerName)}${b.playerNumber ? " #" + esc(b.playerNumber) : ""}` : (b.playerNumber ? "#" + esc(b.playerNumber) : ""),
              b.namePlacement ? esc(b.namePlacement) : "",
            ].filter(Boolean).join(" · ");
            return `<div style="padding:3px 0">
              <div style="display:flex;justify-content:space-between;font-size:12px">${esc(b.size)}<span>${b.quantity}</span></div>
              ${sub ? `<div style="font-size:10px;color:#666;padding-left:8px;margin-top:1px">${sub}</div>` : ""}
            </div>`;
          }).join("")}
          ${bds.length ? `<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-top:10px"><span>Total</span><span>${totalQty}</span></div>` : `<div style="font-size:12px;color:#999">Qty: ${totalQty}</div>`}
        </div>`;

    // Customer view renders the roster full-width; editable when interactive.
    const SZOPTS = ["12", "14", "16", "S", "M", "L", "XL", "2XL", "3XL"];
    const thS = "padding:7px 10px;background:#f3f3f3;font-size:10px;letter-spacing:0.4px;text-transform:uppercase;text-align:left;border:1px solid #eee";
    const tdS = "padding:6px 10px;border:1px solid #eee;font-size:12px;vertical-align:middle";
    const inpS = "font:inherit;font-size:12px;padding:6px 7px;border:1px solid #ccc;border-radius:5px;width:100%;box-sizing:border-box";
    const selOpts = (sel: string) => `<option value="">Select size</option>` + SZOPTS.map(s => `<option${s === sel ? " selected" : ""}>${s}</option>`).join("");
    const rowHtml = (b: any, i: number) => isInteractive
      ? `<tr data-row style="${!b.size ? "background:#fff8ee" : ""}">
          <td style="${tdS};text-align:center;color:#888" data-idx>${i + 1}</td>
          <td style="${tdS}"><input data-cell="playerName" style="${inpS}" value="${esc(b.playerName || "")}" /></td>
          <td style="${tdS}"><select data-cell="size" style="${inpS}" onchange="snzRecount()">${selOpts(b.size || "")}</select></td>
          <td style="${tdS};text-align:center"><input data-cell="quantity" type="number" min="0" value="${b.quantity ?? 1}" style="${inpS};text-align:center" oninput="snzRecount()" /></td>
          <td style="${tdS}"><input data-cell="nameOnBack" style="${inpS}" placeholder="(no name)" value="${esc(b.namePlacement || "")}" /></td>
          <td class="no-print" style="${tdS};text-align:center"><button type="button" onclick="this.closest('tr').remove();snzRenumber();snzRecount()" style="border:none;background:none;color:#b34;font-size:16px;cursor:pointer;line-height:1">&times;</button></td>
        </tr>`
      : `<tr><td style="${tdS};text-align:center;color:#888">${i + 1}</td><td style="${tdS}">${esc(b.playerName || "")}</td><td style="${tdS}">${esc(b.size || "")}</td><td style="${tdS};text-align:center">${b.quantity ?? ""}</td><td style="${tdS}">${esc(b.namePlacement || "")}</td></tr>`;
    // Aggregate any existing per-size quantities (for prefilling the grid).
    const sizeMap: Record<string, number> = {};
    for (const b of bds as any[]) { if (b.size) sizeMap[b.size] = (sizeMap[b.size] || 0) + (b.quantity || 0); }
    const hasRoster = (bds as any[]).some((b) => b.playerName);   // named per-player run (e.g. Richmond)
    const gridSizes = chartSizes(chartType);                       // this garment's assigned chart sizes

    const sectionHead = `<div style="background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700;text-align:center">Sizes &amp; Quantities</div>`;
    const totBar = `<div style="display:flex;justify-content:space-between;background:#2b2622;color:#fff;padding:8px 16px;font-size:12px;font-weight:700;margin-top:8px"><span>Total</span><span data-tot data-item-id="${esc(item.id)}" data-ord="${item.quantity}">${totalQty} of ${item.quantity} ordered</span></div>`;

    let control: string;
    if (hasRoster) {
      // Named per-player roster (kept editable; static for non-interactive).
      control = `${isInteractive ? `<div class="no-print" style="font-size:11px;color:#7a5f3f;background:#fff8ee;border:1px solid #f0d8b6;border-top:none;padding:8px 12px">Tap any field to change it. Set each player's size and quantity, add a name for the back if you want one, and use Add person for anyone missing.</div>` : ""}
        <div class="snz-scroll"><table${isInteractive ? ` data-roster data-item-id="${esc(item.id)}"` : ""} style="width:100%;border-collapse:collapse;border:1px solid #eee;border-top:none">
          <thead><tr><th style="${thS};text-align:center;width:30px">#</th><th style="${thS}">Player</th><th style="${thS};width:120px">Size</th><th style="${thS};width:64px;text-align:center">Qty</th><th style="${thS}">Name on back</th>${isInteractive ? `<th class="no-print" style="${thS};width:30px"></th>` : ""}</tr></thead>
          <tbody data-body>${(bds as any[]).map(rowHtml).join("")}</tbody>
        </table></div>
        ${isInteractive ? `<button type="button" class="no-print" onclick="snzAddRow()" style="margin:8px 0 0;border:1.4px dashed #cdbfae;background:#fff;color:#5b1a2e;font-weight:700;font-size:12px;padding:8px 12px;border-radius:7px;cursor:pointer">+ Add person</button>` : ""}`;
    } else if (gridSizes.length) {
      // Size-quantity grid built from the garment's assigned size chart.
      const cell = (sz: string) => {
        const q = sizeMap[sz] || 0;
        return isInteractive
          ? `<div style="display:flex;align-items:center;gap:3px;border:1px solid #e3dcd5;border-radius:8px;padding:4px 5px">
               <span style="font-size:11px;font-weight:700;min-width:30px;text-align:center">${esc(sz)}</span>
               <button type="button" class="no-print" onclick="snzStep(this,-1)" style="border:1px solid #ddd;background:#fff;border-radius:5px;width:22px;height:24px;font-size:14px;line-height:1;cursor:pointer">&minus;</button>
               <input data-size="${esc(sz)}" type="number" min="0" value="${q}" oninput="snzRecount()" style="width:42px;text-align:center;font:inherit;font-size:12px;padding:4px;border:1px solid #ccc;border-radius:5px" />
               <button type="button" class="no-print" onclick="snzStep(this,1)" style="border:1px solid #ddd;background:#fff;border-radius:5px;width:22px;height:24px;font-size:14px;line-height:1;cursor:pointer">+</button>
             </div>`
          : `<div style="border:1px solid #eee;border-radius:8px;padding:5px 9px;font-size:12px"><b>${esc(sz)}</b> ${q}</div>`;
      };
      control = `${isInteractive ? `<div class="no-print" style="font-size:11px;color:#7a5f3f;background:#fff6ec;border:1px solid #f0d8b6;border-top:none;padding:8px 12px">Set how many of each size you need. These are this garment's size chart. Use the − / + buttons or type a number.</div>` : ""}
        <div ${isInteractive ? `data-sizegrid data-item-id="${esc(item.id)}"` : ""} style="display:flex;flex-wrap:wrap;gap:7px;padding:12px 16px;border:1px solid #eee;border-top:none">${gridSizes.map(cell).join("")}</div>`;
    } else {
      // True one-size item (e.g. OSFA cap).
      control = `<div style="border:1px solid #eee;border-top:none;padding:12px 16px;font-size:12px">One size. Quantity: ${isInteractive ? `<input data-onesize data-item-id="${esc(item.id)}" type="number" min="0" value="${totalQty}" style="${inpS};width:80px;display:inline-block" />` : `<strong>${totalQty}</strong>`}</div>`;
    }
    const custSizeHtml = `${sectionHead}${control}${totBar}`;

    return `
    <div style="page-break-inside:avoid;margin-bottom:20px">
      <div style="background:#000;color:#fff;padding:8px 16px;font-size:13px;font-weight:700;text-align:center;letter-spacing:0.3px">
        ${esc(item.productName)}
      </div>

      ${isCust
        ? `<div style="display:flex;border:1px solid #eee;border-top:none">${specHtml}</div>${custSizeHtml}`
        : `<div style="display:flex;border:1px solid #eee;border-top:none">${specHtml}${sidebarHtml}</div>`}

      ${isCust ? "" : renderAssetStrip("2D Design Print — Factory Artwork (true colours)", designPrints, "#0a0a0a")}
      ${renderAssetStrip(isCust ? "Your Design — Preview" : "3D Mockup — Vendor Render", mockups, "#0a0a0a")}
      ${elements.length ? renderLogoGrid(elements, audience) : ""}

      ${sizeTables.length ? `
        <div style="background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700;text-align:center">
          Sizing Guide — ${esc(SIZE_CHART_LABELS[chartType] || String(chartType))}
        </div>
        <div class="snz-2col" style="display:flex;align-items:flex-start;gap:16px;padding:12px 16px;border:1px solid #eee;border-top:none">
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
      <div class="snz-scroll"><div style="display:flex;border:1px solid #eee;border-top:none;min-width:600px">
        ${milestones.map((m: any) => `<div style="flex:1;text-align:center;padding:10px 6px;border-right:1px solid #eee;font-size:10px"><div style="font-weight:700">Day ${m.dayNumber}</div><div style="font-weight:600;font-size:9px;margin:2px 0">${esc(m.label)}</div><div style="font-family:monospace;color:#555">${m.date}</div></div>`).join("")}
      </div></div>
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
      <div class="snz-2col" style="display:flex;border:1px solid #eee;border-top:none;font-size:11px">
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
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #000; margin: 0; padding: 28px 36px; max-width: 900px; margin: 0 auto; ${isInteractive ? "padding-bottom: 100px;" : ""} }
  img { max-width: 100%; }
  @page { size: A4; margin: 8mm; }
  @media print { body { padding: 0; } .no-print { display: none !important; } }
  input, select, textarea { font-family: inherit; }
  .snz-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  @media (max-width: 680px) {
    html, body { overflow-x: hidden !important; }
    body { padding: 16px 12px !important; }
    .snz-scroll { max-width: 100% !important; }
    .snz-hdr { flex-direction: column !important; gap: 14px !important; }
    .snz-meta { min-width: 0 !important; width: 100% !important; text-align: left !important; justify-content: flex-start !important; }
    .snz-meta h2 { text-align: left !important; }
    .snz-meta table { margin-left: 0 !important; }
    .snz-2col { flex-direction: column !important; }
    .snz-2col > div { border-left: none !important; border-right: none !important; }
    .snz-actbar { flex-wrap: wrap !important; }
    .snz-actbar > button { flex: 1 1 auto !important; }
  }
</style></head><body>

<!-- Header -->
<div class="snz-hdr" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
  <div>
    <div style="margin-bottom:10px"><img src="${siteUrl}/sideline-logo-vertical.png" style="height:56px;object-fit:contain" /></div>
    <div style="font-size:11px;color:#333;line-height:1.6">
      Sideline NZ (Sideline Custom Goods Ltd)<br/>Unit 2, 66 Cavendish Drive Manukau<br/>Auckland, 2104<br/>022 412 7205<br/>info@sidelinenz.com<br/><span style="color:#0ea5e9">www.sidelinenz.com</span>
    </div>
  </div>
  <div class="snz-meta" style="text-align:right;min-width:420px;display:flex;gap:14px;align-items:flex-start;justify-content:flex-end">
    <div>
      <h2 style="font-size:15px;font-weight:800;margin:0 0 12px;letter-spacing:0.5px">${isCust ? "DESIGN PROOF" : "PRODUCTION SHEET"}</h2>
      <table style="font-size:12px;margin-left:auto;border-collapse:collapse">
        <tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">DATE</td><td style="background:#f2f2f2;padding:4px 10px;min-width:180px">${dateStr}</td></tr>
        <tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">ORDER REF</td><td style="background:#f2f2f2;padding:4px 10px">${esc(order.poReference || order.orderNumber)}</td></tr>
        <tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">ACCOUNT</td><td style="background:#f2f2f2;padding:4px 10px">${esc(order.accountName || "")}</td></tr>
        <tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">TYPE</td><td style="background:#f2f2f2;padding:4px 10px">${order.isRepeatOrder ? "Repeat" : "New"}</td></tr>
        ${order.dueDate ? `<tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">DUE</td><td style="background:#f2f2f2;padding:4px 10px">${esc(order.dueDate)}</td></tr>` : ""}
        ${!isCust && order.poComments ? `<tr><td style="font-weight:700;padding:4px 12px 4px 0;text-align:right">COMMENTS</td><td style="background:#f2f2f2;padding:4px 10px">${esc(order.poComments)}</td></tr>` : ""}
      </table>
    </div>
    ${isCust ? "" : `<div style="text-align:center">
      <img src="${qrSrc}" style="width:88px;height:88px;border:1px solid #ddd;padding:4px;background:#fff" />
      <div style="font-size:8px;color:#888;margin-top:4px;letter-spacing:0.3px">SCAN FOR LIVE ORDER</div>
    </div>`}
  </div>
</div>

<!-- Customer / Delivery -->
<div style="margin-bottom:18px">
  <div class="snz-2col" style="display:flex">
    <div style="flex:1;background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700">${isCust ? "Prepared For" : "Customer"}</div>
    <div style="flex:1;background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700">${isCust ? "Deliver To (your address)" : "Delivery Address"}</div>
  </div>
  <div class="snz-2col" style="display:flex;border:1px solid #eee;border-top:none">
    <div style="flex:1;padding:10px 16px;font-size:12px">
      <div class="snz-2col" style="display:flex;justify-content:space-between;gap:12px">
        <span>${esc(contact)}</span>
        <span style="color:#0ea5e9;word-break:break-all">${esc(order.customerEmail || "")}</span>
      </div>
    </div>
    <div style="flex:1;padding:10px 16px;font-size:12px">
      ${isCust
        ? (isInteractive
            ? `<input data-field="deliveryAddress" style="font:inherit;font-size:12px;padding:7px 9px;border:1px solid #ccc;border-radius:5px;width:100%;box-sizing:border-box" placeholder="Enter the address to deliver your kit to" value="${esc(order.deliveryAddress || "")}" /><div style="font-size:10px;color:#888;margin-top:4px">Where should we send the finished gear?</div>`
            : `<div>${esc(order.deliveryAddress || "To be confirmed by customer")}</div>`)
        : `${order.deliveryAttention ? `<div>Attention: ${esc(order.deliveryAttention)}</div>` : ""}<div>${esc(order.deliveryAddress || "Sideline NZ, 41 Oakland Rd Karaka, Auckland 2580")}</div>${order.deliveryPhone ? `<div>${esc(order.deliveryPhone)}</div>` : ""}`}
    </div>
  </div>
</div>

${approvalBand}
${milestonesHtml}
${isCust ? `<div style="margin-bottom:18px">
  <div style="background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700;text-align:center">What We Need From You</div>
  <div style="border:1px solid #eee;border-top:none;padding:12px 16px;font-size:12.5px;line-height:1.8">
    <div><strong>1.</strong> Check the design below: colours, logos, placement and spelling.</div>
    <div><strong>2.</strong> Confirm or adjust each player's size and quantity in the table.</div>
    <div><strong>3.</strong> Add a name for the back of any tee if you want one (leave blank for none).</div>
    <div><strong>4.</strong> Send us anything still outstanding: an updated club logo as a clear PNG, and your final player list.</div>
    <div><strong>5.</strong> Confirm your delivery address above, then approve below. Production starts once approved.</div>
  </div>
</div>` : ""}
${itemsHtml}
${isInteractive ? `<div style="margin-bottom:18px">
  <div style="background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700;text-align:center">Your Notes for Sideline</div>
  <div style="border:1px solid #eee;border-top:none;padding:12px 16px">
    <textarea data-field="notes" style="width:100%;min-height:70px;box-sizing:border-box;font:inherit;font-size:12.5px;padding:10px;border:1px solid #ccc;border-radius:6px" placeholder="Anything you'd like changed or added: colours, logo, placement, spelling, a size swap, who's still to confirm, and so on."></textarea>
  </div>
</div>` : ""}

<!-- Disclaimer -->
<div style="margin-top:28px;border-top:3px solid #1a1a1a;padding-top:14px">
  <p style="font-size:11px;font-weight:700;text-align:center;margin-bottom:10px">Disclaimer: Final Design Proof Approval</p>
  <div style="font-size:10px;color:#555;line-height:1.6;text-align:center">
    <p>This ${isCust ? "design proof" : "production sheet"} is the intellectual property of Sideline NZ (Sideline Custom Goods Ltd). By approving, the customer confirms all design elements — colours, logos, placement, spelling, sizing — are correct. Once approved, this version is final.</p>
    <p style="margin-top:8px">The customer is fully responsible for the approved design. Sideline NZ will not be liable for any errors after approval, nor for delays caused by external factors.</p>
    <p style="margin-top:10px;font-weight:600">&copy; ${new Date().getFullYear()} Sideline NZ (Sideline Custom Goods Ltd). All rights reserved.</p>
  </div>
</div>
${isInteractive ? `
<div class="no-print" style="position:fixed;left:0;right:0;bottom:0;background:rgba(255,255,255,0.97);border-top:1px solid #e6e6e6;box-shadow:0 -6px 20px rgba(0,0,0,0.08);padding:10px 16px">
  <div class="snz-actbar" style="max-width:900px;margin:0 auto;display:flex;gap:10px;align-items:center">
    <div style="font-size:11px;color:#666;line-height:1.25;flex:0 0 auto"><span data-left>sizes</span><br/><b style="color:#5b1a2e">${esc(order.poReference || order.orderNumber || "")}</b></div>
    <button type="button" onclick="window.print()" style="background:#fff;border:1.4px solid #e6e6e6;border-radius:9px;padding:13px 14px;font-weight:700;font-size:13px;cursor:pointer">Export PDF</button>
    <button type="button" onclick="${submitUrl ? "snzSubmit('changes')" : "alert('Preview: this would save your changes and flag a change request.')"}" style="background:#fff;border:1.4px solid #e6e6e6;border-radius:9px;padding:13px 14px;font-weight:700;font-size:13px;cursor:pointer">Request changes</button>
    <button type="button" onclick="${submitUrl ? "snzSubmit('approved')" : "alert('Preview: this would save your sizes, names, quantities and delivery address, then approve the proof.')"}" style="flex:1 1 auto;background:#5b1a2e;color:#fff;border:none;border-radius:9px;padding:13px 16px;font-weight:800;font-size:14px;cursor:pointer">Approve &amp; confirm</button>
  </div>
</div>
<script>
function snzRenumber(){var i=0;document.querySelectorAll('[data-body] tr').forEach(function(tr){var c=tr.querySelector('[data-idx]');if(c)c.textContent=(++i);});}
function snzStep(b,d){var i=b.parentNode.querySelector('input[data-size]');if(!i)return;var v=(parseInt(i.value||'0',10)||0)+d;if(v<0)v=0;i.value=v;snzRecount();}
function snzRecount(){var left=0;document.querySelectorAll('[data-cell="size"]').forEach(function(s){if(!s.value)left++;});document.querySelectorAll('[data-tot]').forEach(function(t){var id=t.getAttribute('data-item-id');var tot=0;document.querySelectorAll('[data-roster][data-item-id="'+id+'"] tbody tr input[type=number],[data-sizegrid][data-item-id="'+id+'"] input[type=number],input[data-onesize][data-item-id="'+id+'"]').forEach(function(q){tot+=parseInt(q.value||'0',10)||0;});t.textContent=tot+' of '+(t.getAttribute('data-ord')||'')+' ordered';});var lm=document.querySelector('[data-left]');if(lm)lm.textContent=(left?left+' size'+(left>1?'s':'')+' to pick':'all sizes in');}
function snzAddRow(){var b=document.querySelector('[data-body]');if(!b||!b.rows.length)return;var tr=b.rows[0].cloneNode(true);tr.querySelectorAll('input').forEach(function(i){i.value='';});tr.querySelectorAll('select').forEach(function(s){s.selectedIndex=0;});tr.style.background='#fff8ee';b.appendChild(tr);snzRenumber();snzRecount();}
document.addEventListener('DOMContentLoaded',snzRecount);
${submitUrl ? `var SNZ_SUBMIT_URL=${JSON.stringify(submitUrl)};
function snzVal(el){return el?(el.value||''):'';}
function snzCollect(decision){
  var rosters=[];
  document.querySelectorAll('table[data-roster]').forEach(function(t){
    var rows=[];
    t.querySelectorAll('tbody tr').forEach(function(tr){
      var pn=tr.querySelector('[data-cell="playerName"]');var sz=tr.querySelector('[data-cell="size"]');
      var qt=tr.querySelector('[data-cell="quantity"]');var nb=tr.querySelector('[data-cell="nameOnBack"]');
      rows.push({playerName:snzVal(pn),size:snzVal(sz),quantity:parseInt(snzVal(qt)||'0',10)||0,nameOnBack:snzVal(nb)});
    });
    rosters.push({itemId:t.getAttribute('data-item-id'),rows:rows});
  });
  document.querySelectorAll('[data-sizegrid]').forEach(function(g){
    var rows=[];
    g.querySelectorAll('input[data-size]').forEach(function(i){var q=parseInt(i.value||'0',10)||0;if(q>0)rows.push({size:i.getAttribute('data-size'),quantity:q});});
    rosters.push({itemId:g.getAttribute('data-item-id'),rows:rows});
  });
  var oneSizes=[];
  document.querySelectorAll('input[data-onesize]').forEach(function(i){
    oneSizes.push({itemId:i.getAttribute('data-item-id'),quantity:parseInt(snzVal(i)||'0',10)||0});
  });
  var firstRows=rosters.length?rosters[0].rows:[];
  return {decision:decision,deliveryAddress:snzVal(document.querySelector('[data-field="deliveryAddress"]')),notes:snzVal(document.querySelector('[data-field="notes"]')),rows:firstRows,rosters:rosters,oneSizes:oneSizes};
}
function snzDone(decision){
  var ok=decision==='approved';
  document.body.innerHTML='<div style="max-width:560px;margin:90px auto;text-align:center;font-family:Segoe UI,Arial,sans-serif;padding:0 22px">'
    +'<div style="font-size:42px;margin-bottom:10px">'+(ok?'\\u2713':'\\u2709')+'</div>'
    +'<h1 style="color:#5b1a2e;font-size:22px;margin:0 0 12px">'+(ok?'Design approved \\u2014 thank you!':'Change request received')+'</h1>'
    +'<p style="font-size:15px;color:#444;line-height:1.6">'+(ok?'Your sizes, names and delivery address are locked in and your order has been sent through to production. We\\u2019ll be in touch with updates.':'Thanks \\u2014 we\\u2019ve logged your requested changes and our team will follow up shortly.')+'</p>'
    +'</div>';
}
function snzSubmit(decision){
  if(decision==='approved'&&!confirm('Approve this design proof? Once approved this version is final and we start production.'))return;
  var btns=document.querySelectorAll('.snz-actbar button');btns.forEach(function(b){b.disabled=true;b.style.opacity='0.6';});
  fetch(SNZ_SUBMIT_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snzCollect(decision))})
    .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};}).catch(function(){return {ok:r.ok,j:{}};});})
    .then(function(res){
      if(!res.ok){alert((res.j&&res.j.error)||'Something went wrong. Please try again or contact orders@sidelinenz.com.');btns.forEach(function(b){b.disabled=false;b.style.opacity='1';});return;}
      snzDone(decision);
    })
    .catch(function(){alert('Network error. Please check your connection and try again.');btns.forEach(function(b){b.disabled=false;b.style.opacity='1';});});
}
` : ""}</script>` : ""}
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
