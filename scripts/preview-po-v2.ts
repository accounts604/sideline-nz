// Preview the new PO template (v2) against an existing order — MOCKUP ONLY.
// Does NOT touch the prod renderer at server/po-pdf.ts. Writes a PDF to /tmp
// and opens it.
//
// Run:
//   npx tsx scripts/preview-po-v2.ts PO-2026-0001
//
// The v2 additions over the current PO:
//  - QR code in header linking to the portal order page
//  - Artwork approval band (status / approved by / date / file ref)
//  - Per-product "Logo Placement Grid" matching the job-sheet layout
//    (9 positions × rows for logo image, application, size, thread/PMS codes)
//  - Merged Job Sheet + PO into a single production sheet
//
// Logo placement data is SYNTHESIZED from existing elementUrls for this mock
// (first element → Left Chest, second → Right Chest). In production we'd
// extend the elementUrls schema with optional position/application/sizeMm/
// threadColours fields and the admin UI would collect these.

import "dotenv/config";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { db } from "../server/db";
import { orders, orderItems, orderSizeBreakdowns } from "../shared/schema";
import { eq, or } from "drizzle-orm";
import { computeMilestones } from "../shared/po-milestones";
import { getSizeChartTables, suggestSizeChart, SIZE_CHART_LABELS, SIZE_CHART_DIAGRAMS, type SizeChartType } from "../shared/size-charts";

function esc(s: string | null | undefined): string {
  return (s || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── 9 canonical logo positions (matches job-sheet layout) ───────────
const POSITIONS = [
  "Left Chest",
  "Right Chest",
  "Center Chest",
  "Front Pocket",
  "Left Sleeve",
  "Right Sleeve",
  "Center Back",
  "Top Back",
  "Bottom",
] as const;
type Position = typeof POSITIONS[number];

type LogoSpec = {
  name: string;
  url: string;
  position?: Position;
  application?: string;      // "Embroidery" | "Screen Print" | "Sublimation" | "Heat Transfer"
  sizeMm?: string;           // "85 × 60 mm"
  threadColours?: string[];  // ["PMS 123 C", "Madeira 1822", "White"]
  artworkFile?: string;      // "NWF-LOGO-v2.ai"
};

// For the mockup: synthesize placement data from raw elementUrls
function synthesizePlacements(elements: any[]): LogoSpec[] {
  if (!elements?.length) return [];
  return elements.map((el, i) => {
    const base: LogoSpec = { name: el.name || `Logo ${i + 1}`, url: el.url };
    // Preserve any real data already on the element
    Object.assign(base, {
      position: el.position,
      application: el.application,
      sizeMm: el.sizeMm,
      threadColours: el.threadColours,
      artworkFile: el.artworkFile,
    });
    // Fill blanks with sensible demo defaults so the grid reads well
    if (!base.position) base.position = (["Left Chest", "Right Chest", "Center Back", "Left Sleeve"] as Position[])[i] || "Left Sleeve";
    if (!base.application) base.application = "Embroidery";
    if (!base.sizeMm) base.sizeMm = i === 0 ? "85 × 60 mm" : i === 1 ? "50 × 50 mm" : "70 × 40 mm";
    if (!base.threadColours) base.threadColours = i === 0 ? ["PMS Black", "PMS 130 (Gold)", "White"] : ["White"];
    if (!base.artworkFile) base.artworkFile = `${(base.name || "logo").toUpperCase().replace(/\s+/g, "-")}-v1.ai`;
    return base;
  });
}

function renderLogoGrid(placements: LogoSpec[]): string {
  const byPosition = new Map<Position, LogoSpec>();
  for (const p of placements) if (p.position) byPosition.set(p.position, p);

  const th = (label: string, isFirst = false) => `<th style="padding:6px 4px;background:#000;color:#fff;font-size:8.5px;font-weight:700;text-align:${isFirst ? "left" : "center"};letter-spacing:0.2px;border:1px solid #000;line-height:1.2">${label}</th>`;
  const td = (content: string, extraStyle = "") => `<td style="padding:6px 4px;font-size:9.5px;text-align:center;border:1px solid #ccc;vertical-align:middle;${extraStyle}">${content}</td>`;
  const lblCell = (label: string) => `<td style="padding:6px 8px;font-size:9px;font-weight:700;background:#f3f3f3;text-align:left;letter-spacing:0.2px;border:1px solid #ccc">${label}</td>`;

  // 10 cols total: 1 label + 9 positions. Label ~13%, positions ~9.67% each.
  const colgroup = `<colgroup>
      <col style="width:13%" />
      ${POSITIONS.map(() => `<col style="width:9.67%" />`).join("")}
    </colgroup>`;

  return `
  <div style="margin-top:0">
    <div style="background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700;text-align:center;letter-spacing:0.3px">Logo Placement Grid</div>
    <table style="width:100%;border-collapse:collapse;table-layout:fixed">
      ${colgroup}
      <thead>
        <tr>
          ${th("POSITION", true)}
          ${POSITIONS.map(p => th(p.toUpperCase())).join("")}
        </tr>
      </thead>
      <tbody>
        <tr style="height:90px">
          ${lblCell("LOGO")}
          ${POSITIONS.map(p => {
            const spec = byPosition.get(p);
            return td(spec ? `<img src="${spec.url}" style="max-width:88%;max-height:76px;object-fit:contain" />` : `<span style="color:#ccc;font-size:16px">—</span>`);
          }).join("")}
        </tr>
        <tr>
          ${lblCell("APPLICATION")}
          ${POSITIONS.map(p => {
            const spec = byPosition.get(p);
            return td(spec?.application ? `<strong>${esc(spec.application).toUpperCase()}</strong>` : "");
          }).join("")}
        </tr>
        <tr>
          ${lblCell("SIZE")}
          ${POSITIONS.map(p => {
            const spec = byPosition.get(p);
            return td(spec?.sizeMm ? esc(spec.sizeMm) : "");
          }).join("")}
        </tr>
        <tr>
          ${lblCell("THREAD / PMS")}
          ${POSITIONS.map(p => {
            const spec = byPosition.get(p);
            return td(spec?.threadColours?.length ? spec.threadColours.map(c => `<div style="font-size:9px;line-height:1.4">${esc(c)}</div>`).join("") : "");
          }).join("")}
        </tr>
        <tr>
          ${lblCell("ARTWORK FILE")}
          ${POSITIONS.map(p => {
            const spec = byPosition.get(p);
            return td(spec?.artworkFile ? `<span style="font-family:monospace;font-size:9px">${esc(spec.artworkFile)}</span>` : "");
          }).join("")}
        </tr>
      </tbody>
    </table>
  </div>`;
}

async function generateHtml(orderId: string): Promise<string | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const sizeBreakdowns = await db.select().from(orderSizeBreakdowns).where(eq(orderSizeBreakdowns.orderId, orderId));

  const siteUrl = process.env.VITE_SITE_URL || process.env.BASE_URL || "https://sidelinenz.com";
  const portalUrl = `${siteUrl}/admin/orders/${order.id}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&margin=2&data=${encodeURIComponent(portalUrl)}`;

  const date = new Date(order.createdAt!);
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
    const rawElements = (item.elementUrls || []) as any[];
    const placements = synthesizePlacements(rawElements);
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

        <div style="flex:1;display:flex;justify-content:center;align-items:center;gap:20px;padding:16px 12px;min-height:260px">
          ${item.frontDesignUrl ? `<img src="${item.frontDesignUrl}" style="max-height:280px;flex:1;min-width:0;object-fit:contain" />` : ""}
          ${item.backDesignUrl ? `<img src="${item.backDesignUrl}" style="max-height:280px;flex:1;min-width:0;object-fit:contain" />` : ""}
        </div>

        <div style="width:200px;padding:14px 16px;border-left:1px solid #eee">
          <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-bottom:6px"><span>Size</span><span>Count</span></div>
          ${bds.map((b: any) => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">${esc(b.size)}<span>${b.quantity}</span></div>`).join("")}
          ${bds.length ? `<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-top:10px"><span>Total</span><span>${totalQty}</span></div>` : `<div style="font-size:12px;color:#999">Qty: ${totalQty}</div>`}
        </div>
      </div>

      ${renderLogoGrid(placements)}

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

  const approvalBand = `
    <div style="margin-bottom:18px">
      <div style="background:#000;color:#fff;padding:6px 16px;font-size:12px;font-weight:700;text-align:center;letter-spacing:0.3px">Artwork Approval</div>
      <div style="display:flex;border:1px solid #eee;border-top:none;font-size:11px">
        <div style="flex:1;padding:10px 14px;border-right:1px solid #eee">
          <div style="font-weight:700;font-size:10px;color:#555;letter-spacing:0.4px;margin-bottom:3px">STATUS</div>
          <div><span style="display:inline-block;padding:3px 10px;background:#16a34a;color:#fff;border-radius:3px;font-weight:700;font-size:10px;letter-spacing:0.3px">APPROVED</span></div>
        </div>
        <div style="flex:1;padding:10px 14px;border-right:1px solid #eee">
          <div style="font-weight:700;font-size:10px;color:#555;letter-spacing:0.4px;margin-bottom:3px">APPROVED BY</div>
          <div>${esc(contact)}</div>
        </div>
        <div style="flex:1;padding:10px 14px;border-right:1px solid #eee">
          <div style="font-weight:700;font-size:10px;color:#555;letter-spacing:0.4px;margin-bottom:3px">DATE</div>
          <div style="font-family:monospace">${dateStr}</div>
        </div>
        <div style="flex:1.3;padding:10px 14px">
          <div style="font-weight:700;font-size:10px;color:#555;letter-spacing:0.4px;margin-bottom:3px">REFERENCE</div>
          <div style="font-family:monospace;font-size:10px">${esc(order.poReference || order.orderNumber || "")}</div>
        </div>
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>PO ${esc(order.poReference || order.orderNumber)}</title>
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

async function render(html: string): Promise<Buffer | null> {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  ];
  let executablePath = candidates.find((p) => {
    try { execSync(`test -x "${p}"`); return true; } catch { return false; }
  }) || "";
  if (!executablePath) {
    try {
      executablePath = execSync("which chromium-browser 2>/dev/null || which google-chrome-stable 2>/dev/null", { encoding: "utf-8" }).trim();
    } catch {}
  }
  if (!executablePath) executablePath = await chromium.executablePath();
  console.log(`[preview] Chromium at: ${executablePath}`);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1200 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 45000 });
    await page.evaluate(() => Promise.all(
      Array.from(document.images).filter(i => !i.complete).map(i => new Promise(r => { i.onload = r; i.onerror = r; }))
    ));
    await new Promise(r => setTimeout(r, 1200));
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" } });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  const ref = process.argv[2] || "PO-2026-0001";
  const [o] = await db.select().from(orders).where(or(eq(orders.poReference, ref), eq(orders.orderNumber, ref))).limit(1);
  if (!o) { console.error("Order not found:", ref); process.exit(1); }

  console.log("[preview] Rendering", o.poReference || o.orderNumber, "→ /tmp/sideline-po-v2-preview.pdf");
  const html = await generateHtml(o.id);
  if (!html) { console.error("HTML generation failed"); process.exit(1); }
  writeFileSync("/tmp/sideline-po-v2-preview.html", html);
  console.log("[preview] HTML dumped to /tmp/sideline-po-v2-preview.html");

  const pdf = await render(html);
  if (!pdf) { console.error("PDF render failed"); process.exit(1); }

  const out = "/tmp/sideline-po-v2-preview.pdf";
  writeFileSync(out, pdf);
  console.log(`[preview] PDF written: ${out} (${pdf.length} bytes)`);

  try { execSync(`open "${out}"`); } catch {}
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
