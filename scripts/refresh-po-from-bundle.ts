/**
 * Refresh an existing PO's line item costs (and image/description) from the
 * latest Shopify variant data captured in /tmp/<slug>-bundle.json.
 *
 * Use after the Shopify-side cost backfill so the PO totals reflect the
 * updated supplier-cost values without deleting + re-importing the PO.
 *
 * Run:
 *   npx tsx scripts/refresh-po-from-bundle.ts <po-reference> <slug> [--commit]
 *   npx tsx scripts/refresh-po-from-bundle.ts PO-2026-0011 kbhs-rugby --commit
 */
import "dotenv/config";
import * as fs from "node:fs";
import { db } from "../server/db";
import { orders, orderItems } from "../shared/schema";
import { eq } from "drizzle-orm";

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const positional = args.filter(a => !a.startsWith("--"));
if (positional.length < 2) {
  console.error("usage: npx tsx scripts/refresh-po-from-bundle.ts <po-reference> <slug> [--commit]");
  process.exit(1);
}
const [PO_REF, SLUG] = positional;
const BUNDLE_PATH = `/tmp/${SLUG}-bundle.json`;

if (!fs.existsSync(BUNDLE_PATH)) {
  console.error(`[refresh] bundle missing: ${BUNDLE_PATH}`);
  console.error(`           run: node ~/.openclaw/workspace/scripts/pull-club-bundle.js ${SLUG} <handle>`);
  process.exit(1);
}
const bundle = JSON.parse(fs.readFileSync(BUNDLE_PATH, "utf-8"));
type Variant = { productId: string; productTitle: string; size: string; cost: number | null; productImageUrl: string | null; productType: string | null; productDescription: string | null; sku: string | null };
const variants: Variant[] = bundle.variants;

const [order] = await db.select().from(orders).where(eq(orders.poReference, PO_REF));
if (!order) { console.error(`[refresh] PO ${PO_REF} not found`); process.exit(1); }
const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
console.log(`[refresh] PO ${order.poReference} (${order.orderNumber}) "${order.accountName}" — ${items.length} line items`);

let willChange = 0;
let unchanged = 0;
let unmatched = 0;
const plan: Array<{ id: string; line: string; oldCents: number; newCents: number; image?: string | null; type?: string | null; material?: string | null }> = [];

for (const it of items) {
  const v = variants.find(x => x.productId === it.productId && (x.size||"").toLowerCase() === (it.size||"").toLowerCase());
  const lineDesc = `${String(it.quantity).padStart(2)}× ${(it.productName||"").padEnd(28)} / ${(it.size||"").padEnd(10)}`;
  if (!v) {
    unmatched++;
    console.log(`  ❓ ${lineDesc} — no variant match in bundle (productId mismatch?)`);
    continue;
  }
  const newCents = v.cost !== null ? Math.round(v.cost * 100) : it.unitAmount; // keep existing if Shopify still has no cost
  if (newCents === it.unitAmount) {
    unchanged++;
  } else {
    willChange++;
    console.log(`  ${lineDesc}  $${(it.unitAmount/100).toFixed(2)} → $${(newCents/100).toFixed(2)}`);
  }
  plan.push({
    id: it.id, line: lineDesc,
    oldCents: it.unitAmount, newCents,
    image: v.productImageUrl,
    type: v.productType,
    material: v.productDescription,
  });
}

const newSubtotal = plan.reduce((s, p) => {
  const it = items.find(i => i.id === p.id)!;
  return s + p.newCents * it.quantity;
}, 0);

console.log(`\n[refresh] cost changes: ${willChange}, unchanged: ${unchanged}, unmatched: ${unmatched}`);
console.log(`[refresh] subtotal: $${(order.subtotal/100).toFixed(2)} → $${(newSubtotal/100).toFixed(2)}`);

if (!COMMIT) { console.log("\n[refresh] DRY RUN — pass --commit to write\n"); process.exit(0); }

for (const p of plan) {
  const update: Record<string, unknown> = {
    unitAmount: p.newCents,
  };
  if (p.image) update.productImage = p.image;
  if (p.type) update.productType = p.type;
  if (p.material) update.material = p.material;
  await db.update(orderItems).set(update).where(eq(orderItems.id, p.id));
}
await db.update(orders).set({ subtotal: newSubtotal, total: newSubtotal }).where(eq(orders.id, order.id));
console.log(`\n[refresh] ✅ updated ${plan.length} item(s) + order totals`);
process.exit(0);
