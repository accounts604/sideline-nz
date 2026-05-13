/**
 * Populate order_size_breakdowns rows for the 6 placeholder POs that were
 * created from supporter collections. One row per (line item × size), qty=0.
 *
 * Uses the canonical product's `sizes` array from shared/product-catalog.ts —
 * no extra Shopify API calls needed. Unmatched line items default to the
 * UNISEX_JERSEY size range (K4-K16 + XS-5XL); user can prune unused sizes in
 * the admin UI later.
 *
 * Idempotent: skips line items that already have any size_breakdowns row.
 *
 * Run:
 *   npx tsx scripts/populate-collection-po-sizes.ts            # dry-run
 *   npx tsx scripts/populate-collection-po-sizes.ts --commit
 */

import "dotenv/config";
import { db } from "../server/db";
import { orders, orderItems, orderSizeBreakdowns } from "../shared/schema";
import { eq, inArray, and } from "drizzle-orm";
import { SIDELINE_PRODUCTS } from "../shared/product-catalog";

const COMMIT = process.argv.includes("--commit");

// The 6 PO references the bulk-create-collection-pos.ts script generated.
const TARGET_POS = ["PO-2026-0012", "PO-2026-0013", "PO-2026-0014", "PO-2026-0015", "PO-2026-0016", "PO-2026-0017"];

// Fallback for unmatched line items (e.g. Windbreaker Jacket — no canonical SKU yet).
const FALLBACK_SIZES = ["K4", "K6", "K8", "K10", "K12", "K14", "K16", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];

function sizesForLine(productId: string | null): string[] {
  if (!productId || productId === "supporter-drop") return FALLBACK_SIZES;
  const p = SIDELINE_PRODUCTS.find(x => x.id === productId);
  if (!p) return FALLBACK_SIZES;
  // Map canonical "4"/"6"/... youth labels to "K4"/"K6" for clarity in PO UI.
  return p.sizes.map(s => /^\d+$/.test(s) ? `K${s}` : s);
}

async function main() {
  console.log(COMMIT ? "MODE: COMMIT" : "MODE: DRY-RUN");

  const orderRows = await db.select().from(orders).where(inArray(orders.poReference, TARGET_POS));
  if (orderRows.length !== TARGET_POS.length) {
    console.warn(`! Expected ${TARGET_POS.length} orders, found ${orderRows.length}`);
  }

  let createdRows = 0;
  let skippedLines = 0;
  let processedLines = 0;

  for (const order of orderRows) {
    console.log(`\n## ${order.poReference} (${order.accountName})`);
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    for (const item of items) {
      processedLines++;
      // Skip if any breakdowns already exist for this item (idempotency)
      const existing = await db.select().from(orderSizeBreakdowns).where(eq(orderSizeBreakdowns.orderItemId, item.id)).limit(1);
      if (existing.length) {
        console.log(`  - ${item.productName?.padEnd(36)} skipped (already has breakdowns)`);
        skippedLines++;
        continue;
      }
      const sizes = sizesForLine(item.productId ?? null);
      console.log(`  - ${(item.productName||"?").padEnd(36)} → ${sizes.length} sizes [${sizes.join(", ")}]`);
      if (!COMMIT) continue;
      for (const size of sizes) {
        await db.insert(orderSizeBreakdowns).values({
          orderItemId: item.id,
          orderId: order.id,
          size,
          quantity: 0,
        });
        createdRows++;
      }
    }
  }

  console.log(`\n## Summary`);
  console.log(`  Lines processed: ${processedLines}`);
  console.log(`  Lines skipped (already had sizes): ${skippedLines}`);
  console.log(`  Size rows ${COMMIT ? "created" : "would create"}: ${COMMIT ? createdRows : "(dry-run)"}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
