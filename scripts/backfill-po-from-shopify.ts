/**
 * Backfill PO line items with Shopify-sourced data.
 *
 * Pulls inventoryItem.unitCost + retail price from the Shopify variant that
 * matches each order_item (productName + size), then updates:
 *   - order_items.unitAmount  → cost in cents (what Sideline pays Puffin)
 *   - order_items.productImage → variant's product featuredImage url
 *   - orders.subtotal/total    → recomputed
 *
 * Variant-cost JSON is staged at scripts/_<slug>-variant-costs.json by the
 * workspace pinned-tab bridge fetcher (/tmp/pull-<slug>-costs.js).
 *
 * Run:
 *   npx tsx scripts/backfill-po-from-shopify.ts <po-reference> <slug>
 *   npx tsx scripts/backfill-po-from-shopify.ts PO-2026-0007 spc --commit
 *
 * Without --commit it's a dry run.
 */
import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { db } from "../server/db";
import { orders, orderItems } from "../shared/schema";
import { eq } from "drizzle-orm";

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const positional = args.filter((a) => !a.startsWith("--"));
if (positional.length < 2) {
  console.error("usage: npx tsx scripts/backfill-po-from-shopify.ts <po-reference> <slug> [--commit]");
  process.exit(1);
}
const [PO_REFERENCE, SLUG] = positional;
const COSTS_PATH = path.join(__dirname, `_${SLUG}-variant-costs.json`);

type VariantRow = {
  productId: string; productTitle: string; productHandle: string;
  productUrl?: string;
  productImageUrl?: string | null;
  productImageAlt?: string | null;
  productType?: string | null;
  vendor?: string | null;
  productDescription?: string | null;
  variantId: string; sku: string | null; size: string;
  cost: number | null; currency: string | null; price: number;
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(s: string): Set<string> {
  return new Set(norm(s).split(/\s+/).filter((t) => t.length > 1));
}

function matchScore(itemName: string, variantProductTitle: string): number {
  // Prefix-strip: remove leading year + club name from variant title before matching.
  const cleanedVariant = variantProductTitle.replace(/^\d{4}\s+/, "").replace(/^St\s+Peter['']?s\s+(College\s+)?1st\s+XV\s+/i, "").trim();
  const a = tokens(itemName);
  const b = tokens(cleanedVariant);
  let overlap = 0;
  for (const t of a) if (b.has(t)) overlap++;
  return overlap;
}

function findVariant(variants: VariantRow[], productName: string, size: string): VariantRow | null {
  // 1. Filter to variants with matching size (case-insensitive)
  const sized = variants.filter((v) => v.size?.toLowerCase() === size?.toLowerCase());
  if (sized.length === 0) return null;
  // 2. Score each by token overlap with productName
  const scored = sized
    .map((v) => ({ v, score: matchScore(productName, v.productTitle) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.v ?? null;
}

async function main() {
  if (!fs.existsSync(COSTS_PATH)) {
    console.error(`[backfill] missing variant-cost JSON: ${COSTS_PATH}`);
    console.error(`           run /tmp/pull-${SLUG}-costs.js first to generate it`);
    process.exit(1);
  }
  const variants: VariantRow[] = JSON.parse(fs.readFileSync(COSTS_PATH, "utf-8"));
  console.log(`[backfill] loaded ${variants.length} Shopify variants from ${path.basename(COSTS_PATH)}`);

  // Pull product images per product (use first variant of each product as the source)
  const productImageByTitle = new Map<string, string | null>();
  // Note: variants don't carry product image in our payload — leave for future enhancement.

  // Find the PO
  const [order] = await db.select().from(orders).where(eq(orders.poReference, PO_REFERENCE));
  if (!order) { console.error(`[backfill] PO ${PO_REFERENCE} not found`); process.exit(1); }
  console.log(`[backfill] PO: ${order.poReference} (${order.orderNumber}) — ${order.accountName}`);

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  console.log(`[backfill] ${items.length} line items to process\n`);

  type Plan = { itemId: string; line: string; cost: number | null; cents: number; matched: VariantRow | null };
  const plan: Plan[] = [];
  let unmatched = 0;

  for (const it of items) {
    const matched = findVariant(variants, it.productName, it.size || "One Size");
    const line = `${String(it.quantity).padStart(2)}× ${it.productName.padEnd(18)} / ${(it.size || "—").padEnd(10)}`;
    if (!matched) {
      console.log(`  ❓ ${line} → NO MATCH`);
      plan.push({ itemId: it.id, line, cost: null, cents: 0, matched: null });
      unmatched++;
      continue;
    }
    if (matched.cost === null) {
      console.log(`  ⚠️  ${line} → matched ${matched.productTitle}/${matched.size} but cost is NULL → skip`);
      plan.push({ itemId: it.id, line, cost: null, cents: 0, matched });
      unmatched++;
      continue;
    }
    const cents = Math.round(matched.cost * 100);
    console.log(`  ✓ ${line} → cost=$${matched.cost.toFixed(2)} (${cents}c)`);
    plan.push({ itemId: it.id, line, cost: matched.cost, cents, matched });
  }

  const lineSubtotal = plan.reduce((sum, p) => {
    const it = items.find((x) => x.id === p.itemId)!;
    return sum + (p.cents * it.quantity);
  }, 0);

  console.log(`\n[backfill] matched: ${plan.length - unmatched}/${plan.length}`);
  console.log(`[backfill] new subtotal: $${(lineSubtotal / 100).toFixed(2)} (${lineSubtotal}c)`);

  if (!COMMIT) {
    console.log("\n[backfill] DRY RUN — pass --commit to write");
    process.exit(0);
  }
  if (unmatched > 0) {
    console.log(`\n[backfill] ⚠️  ${unmatched} unmatched lines will be left at unitAmount=0`);
  }

  // Apply — cost + product details + image
  for (const p of plan) {
    if (!p.matched) continue;
    const v = p.matched;
    const update: Record<string, unknown> = {};
    if (v.cost !== null) update.unitAmount = p.cents;
    if (v.productImageUrl) update.productImage = v.productImageUrl;
    if (v.productType) update.productType = v.productType;
    if (v.productDescription) update.material = v.productDescription;
    if (v.sku) update.priceId = v.sku; // store SKU as priceId so PO PDF can render it
    if (v.productId) update.productId = v.productId;
    await db.update(orderItems).set(update).where(eq(orderItems.id, p.itemId));
  }
  await db.update(orders).set({ subtotal: lineSubtotal, total: lineSubtotal }).where(eq(orders.id, order.id));

  console.log(`\n[backfill] ✅ updated ${plan.length - unmatched} line items + order totals`);
  console.log(`           fields written: unitAmount, productImage, productType, material (= product description), productId, priceId (= SKU)`);
  process.exit(0);
}

main().catch((e) => { console.error("[backfill] FATAL", e); process.exit(1); });
