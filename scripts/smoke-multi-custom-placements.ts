// Smoke: seed three logos on PO-2026-0001's item —
//   1. Left Chest (preset)
//   2. Left Chest again (to prove multi-logo-per-cell stacks)
//   3. "Left Hip" (custom placement — not in LOGO_POSITIONS)
// Render via prod renderer, check the HTML contains both stacking and the
// custom strip. Restore original data afterward.

import "dotenv/config";
import { db } from "../server/db";
import { orders, orderItems } from "../shared/schema";
import { eq, or } from "drizzle-orm";
import type { LogoElement } from "../shared/schema";

async function main() {
  const ref = "PO-2026-0001";
  const [o] = await db.select().from(orders).where(or(eq(orders.poReference, ref), eq(orders.orderNumber, ref))).limit(1);
  if (!o) throw new Error("order missing");
  const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id)).limit(1);
  const original = item.elementUrls;
  const els = (original as LogoElement[] | null) || [];
  if (els.length < 2) throw new Error("need at least 2 logos");

  // Seed test placement: two on Left Chest, one custom "Left Hip"
  const seeded: LogoElement[] = [
    { ...els[0], position: "Left Chest", application: "Embroidery", sizeMm: "85 × 60 mm", threadColours: ["PMS Black"], artworkFile: "CLUB-v1.ai" },
    { ...els[1], position: "Left Chest", application: "Embroidery", sizeMm: "40 × 40 mm", threadColours: ["White"], artworkFile: "SPONSOR-v1.ai" },
    { name: els[0].name + " (hip)", url: els[0].url, position: "Left Hip", application: "Screen Print", sizeMm: "60 × 60 mm", threadColours: ["Black"], artworkFile: "CLUB-HIP-v1.ai" },
  ];
  await db.update(orderItems).set({ elementUrls: seeded as any }).where(eq(orderItems.id, item.id));
  console.log("[smoke] seeded 3 placements (2× Left Chest, 1× Left Hip custom)");

  // Render via prod
  const { generatePoHtml } = await import("../server/po-pdf");
  const html = await generatePoHtml(o.id);
  if (!html) throw new Error("render failed");

  // Assertions
  const checks = [
    { name: "Logo Placement Grid header", ok: html.includes("Logo Placement Grid") },
    { name: "LEFT CHEST column", ok: html.includes("LEFT CHEST") },
    { name: "Both Left Chest URLs present (stacked)", ok: html.indexOf(els[0].url) !== html.lastIndexOf(els[0].url) || (html.includes(els[0].url) && html.includes(els[1].url)) },
    { name: "Custom Placements strip", ok: html.includes("Custom Placements") },
    { name: "Custom position label 'Left Hip'", ok: html.includes("Left Hip") },
    { name: "Artwork file CLUB-HIP-v1.ai in custom strip", ok: html.includes("CLUB-HIP-v1.ai") },
  ];
  let allOk = true;
  for (const c of checks) {
    console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}`);
    if (!c.ok) allOk = false;
  }

  // Restore
  await db.update(orderItems).set({ elementUrls: original }).where(eq(orderItems.id, item.id));
  console.log("[smoke] restored original");

  if (!allOk) process.exit(1);
  console.log("[smoke] ✅ multi + custom placements work");
}

main().then(() => process.exit(0)).catch(e => { console.error("[smoke] ❌", e); process.exit(1); });
