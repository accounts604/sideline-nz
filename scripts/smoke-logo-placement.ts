// Smoke test: write placement metadata onto PO-2026-0001's elementUrls,
// re-render the prod PO, confirm logos land in their slots — then revert.
//
// Run:
//   npx tsx scripts/smoke-logo-placement.ts
//
// Verifies the end-to-end data flow: admin UI would write this same shape.

import "dotenv/config";
import { db } from "../server/db";
import { orders, orderItems } from "../shared/schema";
import { eq, or } from "drizzle-orm";
import type { LogoElement } from "../shared/schema";

async function main() {
  const ref = "PO-2026-0001";
  const [o] = await db.select().from(orders).where(or(eq(orders.poReference, ref), eq(orders.orderNumber, ref))).limit(1);
  if (!o) { console.error("order not found"); process.exit(1); }
  const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id)).limit(1);
  if (!item) { console.error("no items"); process.exit(1); }

  const original = item.elementUrls as any;
  const elements = (original || []) as LogoElement[];
  console.log(`[smoke] item ${item.productName}, ${elements.length} elements`);

  // Enrich with placement metadata
  const enriched: LogoElement[] = elements.map((el, i) => ({
    ...el,
    position: (["Left Chest", "Right Chest"] as const)[i] || "Center Back",
    application: "Embroidery",
    sizeMm: i === 0 ? "85 × 60 mm" : "50 × 50 mm",
    threadColours: i === 0 ? ["PMS Black", "PMS 130 C", "White"] : ["White"],
    artworkFile: `${(el.name || `logo-${i}`).toUpperCase().replace(/\s+/g, "-")}-v1.ai`,
  }));

  await db.update(orderItems).set({ elementUrls: enriched as any }).where(eq(orderItems.id, item.id));
  console.log("[smoke] placement data written");

  // Re-read
  const [updated] = await db.select().from(orderItems).where(eq(orderItems.id, item.id));
  const readBack = (updated.elementUrls as LogoElement[]) || [];
  console.log("[smoke] round-trip:");
  for (const el of readBack) {
    console.log(`  - ${el.name} → ${el.position} · ${el.application} · ${el.sizeMm} · [${(el.threadColours || []).join(", ")}]`);
  }

  // Re-generate PO HTML via prod path
  const { generatePoHtml } = await import("../server/po-pdf");
  const html = await generatePoHtml(o.id);
  if (!html) throw new Error("generatePoHtml returned null");

  // Quick sanity: does the HTML contain each logo URL AND the position labels?
  const hits = readBack.filter(el => el.url && html.includes(el.url));
  console.log(`[smoke] HTML contains ${hits.length}/${readBack.length} logo URLs`);
  const hasGrid = html.includes("Logo Placement Grid");
  const hasLeftChest = html.includes("LEFT CHEST");
  console.log(`[smoke] grid header present: ${hasGrid}, LEFT CHEST column present: ${hasLeftChest}`);

  // Optionally render PDF too so Romero can see the grid populated
  if (process.argv.includes("--render")) {
    const { execSync } = await import("child_process");
    const { writeFileSync } = await import("fs");
    const puppeteer = (await import("puppeteer-core")).default;
    const chromium = (await import("@sparticuz/chromium")).default;
    const candidates = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"];
    let exe = candidates.find(p => { try { execSync(`test -x "${p}"`); return true; } catch { return false; } }) || "";
    if (!exe) exe = await chromium.executablePath();
    const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1200 });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.evaluate(() => Promise.all(Array.from(document.images).filter(i => !i.complete).map(i => new Promise(r => { i.onload = r; i.onerror = r; }))));
    await new Promise(r => setTimeout(r, 1200));
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" } });
    await browser.close();
    writeFileSync("/tmp/sideline-po-populated.pdf", Buffer.from(pdf));
    console.log("[smoke] wrote /tmp/sideline-po-populated.pdf");
    try { execSync(`open /tmp/sideline-po-populated.pdf`); } catch {}
  }

  // Restore
  console.log("[smoke] restoring original (stripped placement data)…");
  await db.update(orderItems).set({ elementUrls: original }).where(eq(orderItems.id, item.id));
  console.log("[smoke] ✅ restored — item.elementUrls back to original shape");
}

main().then(() => process.exit(0)).catch(e => { console.error("[smoke] ❌", e); process.exit(1); });
