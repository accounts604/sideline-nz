/**
 * Wire up cost, branding method, and assigned supplier on the 6 placeholder
 * POs created by bulk-create-collection-pos.ts.
 *
 *   - Sets orders.assignedSupplierId = Puffin Sports (the only supplier on file)
 *   - For each line item:
 *       - unitAmount  = Puffin Tier 1 USD * 1.72 + $2 OH, in cents (getShopifyCost)
 *       - brandingMethod = Embroidery (headwear) | DTF Print (tees) | Full Sublimation (everything else)
 *   - Recomputes orders.subtotal/total from line item totals
 *
 * Idempotent: skips fields that are already populated. Run repeatedly safely.
 *
 * Run:
 *   npx tsx scripts/populate-collection-po-details.ts            # dry-run
 *   npx tsx scripts/populate-collection-po-details.ts --commit
 */

import "dotenv/config";
import { db } from "../server/db";
import { orders, orderItems, users, orderSizeBreakdowns } from "../shared/schema";
import { eq, inArray, and } from "drizzle-orm";
import { SIDELINE_PRODUCTS, getShopifyCost } from "../shared/product-catalog";

const COMMIT = process.argv.includes("--commit");
const TARGET_POS = ["PO-2026-0012","PO-2026-0013","PO-2026-0014","PO-2026-0015","PO-2026-0016","PO-2026-0017"];

function deriveBranding(productName: string, canonicalId: string | null): string {
  const p = canonicalId ? SIDELINE_PRODUCTS.find(x => x.id === canonicalId) : null;
  const cat = p?.category?.toLowerCase() || "";
  const name = productName.toLowerCase();
  if (cat === "headwear" || /\b(beanie|cap|hat)\b/.test(name)) return "Embroidery";
  if (/\b(tee|t-?shirt|dri.?fit shirt|club tee|cotton t)\b/.test(name)) return "DTF Print";
  // Polos, hoodies, jackets, singlets, jerseys, shorts → sublimation
  return "Full Sublimation";
}

async function main() {
  console.log(COMMIT ? "MODE: COMMIT" : "MODE: DRY-RUN");

  // Find Puffin Sports
  const [puffin] = await db.select().from(users)
    .where(and(eq(users.role, "supplier"), eq(users.email, "usman@puffin-sports.com")))
    .limit(1);
  if (!puffin) { console.error("Puffin Sports supplier row not found — aborting."); process.exit(1); }
  console.log(`Supplier: ${puffin.teamName} (${puffin.id})`);

  const ordersToUpdate = await db.select().from(orders).where(inArray(orders.poReference, TARGET_POS));
  console.log(`Found ${ordersToUpdate.length} orders\n`);

  let supplierAssignments = 0;
  let costUpdates = 0;
  let brandingUpdates = 0;
  let totalsRecomputed = 0;

  for (const order of ordersToUpdate) {
    console.log(`## ${order.poReference} — ${order.accountName}`);
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));

    // Per-item updates
    let lineTotal = 0;
    for (const item of items) {
      const canonical = item.productId && item.productId !== "supporter-drop"
        ? SIDELINE_PRODUCTS.find(p => p.id === item.productId) || null
        : null;
      const costNzd = getShopifyCost(canonical);
      const costCents = costNzd != null ? Math.round(costNzd * 100) : null;
      const branding = deriveBranding(item.productName || "", canonical?.id || null);

      const newCost = (item.unitAmount === 0 || item.unitAmount == null) && costCents != null ? costCents : null;
      const newBranding = !item.brandingMethod && branding ? branding : null;

      // Use line qty for subtotal calc — but qtys are still placeholder 1.
      // Subtotal here represents cost basis if every size row had qty=1.
      // Real cost will recompute again after qtys are filled in.
      const qtyForTotal = item.quantity || 0;
      if (costCents != null) lineTotal += costCents * qtyForTotal;

      const updates: any = {};
      if (newCost != null) { updates.unitAmount = newCost; costUpdates++; }
      if (newBranding) { updates.brandingMethod = newBranding; brandingUpdates++; }

      const costLabel = costNzd != null ? `NZD $${costNzd.toFixed(2)}` : "no Puffin map";
      console.log(`  - ${(item.productName||"?").padEnd(30)} cost=${costLabel.padEnd(16)} branding=${branding}${Object.keys(updates).length === 0 ? "  (already set)" : ""}`);

      if (COMMIT && Object.keys(updates).length) {
        await db.update(orderItems).set({ ...updates, updatedAt: new Date() }).where(eq(orderItems.id, item.id));
      }
    }

    // Order-level supplier + total
    const orderUpdates: any = {};
    if (!order.assignedSupplierId) { orderUpdates.assignedSupplierId = puffin.id; supplierAssignments++; }
    if (lineTotal > 0 && (order.subtotal !== lineTotal || order.total !== lineTotal)) {
      orderUpdates.subtotal = lineTotal;
      orderUpdates.total = lineTotal;
      totalsRecomputed++;
    }
    if (Object.keys(orderUpdates).length) {
      console.log(`  → order updates: ${Object.keys(orderUpdates).join(", ")}${COMMIT ? "" : " (dry-run)"}`);
      if (COMMIT) {
        await db.update(orders).set({ ...orderUpdates, updatedAt: new Date() }).where(eq(orders.id, order.id));
      }
    }
    console.log();
  }

  console.log(`## Summary`);
  console.log(`  Supplier assignments: ${supplierAssignments}`);
  console.log(`  Cost updates: ${costUpdates}`);
  console.log(`  Branding updates: ${brandingUpdates}`);
  console.log(`  Order totals recomputed: ${totalsRecomputed}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
