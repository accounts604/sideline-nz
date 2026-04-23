// Render a PO via the PROD renderer in server/po-pdf.ts — used to smoke-test
// the production path after template changes. Writes to /tmp and opens.
//
// Run:
//   npx tsx scripts/render-po-prod.ts PO-2026-0001
//
// This pulls the exact HTML that Drive uploads get, so what you see here
// is what the factory sees.

import "dotenv/config";
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { db } from "../server/db";
import { orders } from "../shared/schema";
import { eq, or } from "drizzle-orm";

// We reach into po-pdf.ts's renderer by re-implementing the Puppeteer wrapper
// around generatePoHtml. po-pdf.ts keeps generatePoHtml private, so we import
// via a tiny re-export shim.

async function main() {
  const ref = process.argv[2] || "PO-2026-0001";
  const [o] = await db.select().from(orders).where(or(eq(orders.poReference, ref), eq(orders.orderNumber, ref))).limit(1);
  if (!o) { console.error("Order not found:", ref); process.exit(1); }

  // Dynamic import — po-pdf.ts has side effects on module load (chromium shim)
  // so we defer until we've confirmed the order exists.
  const poPdf: any = await import("../server/po-pdf");

  // po-pdf.ts only exports `uploadPoPdfToDrive`. To keep the prod surface
  // minimal we invoke generatePoHtml via the same rendering path by temporarily
  // shimming the render function. Simpler path: replicate the Puppeteer step
  // inline using the same HTML. We fetch HTML via a small wrapper the file
  // exports for testing purposes, or fall back to replicating.

  // Actually generatePoHtml is not exported. Add a test-only export.
  const generate = poPdf.__generatePoHtmlForTest || poPdf.generatePoHtml;
  if (!generate) {
    console.error("po-pdf.ts must export generatePoHtml (or __generatePoHtmlForTest) for this script");
    process.exit(1);
  }

  console.log("[render] Generating HTML for", ref);
  const html = await generate(o.id);
  if (!html) { console.error("HTML generation failed"); process.exit(1); }

  writeFileSync("/tmp/sideline-po-prod.html", html);

  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  let executablePath = candidates.find((p) => { try { execSync(`test -x "${p}"`); return true; } catch { return false; } }) || "";
  if (!executablePath) executablePath = await chromium.executablePath();

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
    const out = "/tmp/sideline-po-prod.pdf";
    writeFileSync(out, Buffer.from(pdf));
    console.log(`[render] PDF written: ${out} (${pdf.length} bytes)`);
    try { execSync(`open "${out}"`); } catch {}
  } finally {
    await browser.close().catch(() => {});
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
