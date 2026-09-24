// Replace ALL size rows on one PO line with a confirmed breakdown. Validates the
// map sums to the line quantity. Dry-run by default; --apply writes.
//
// Usage:
//   npx tsx scripts/set-line-sizes.ts --po PO-2026-0018 --product zip-hoodie \
//     --sizes '{"Y14":11,"Y12":2,"Y8":1,"Y16":1,"L":1,"S":2}' [--apply]
import "dotenv/config";
import { db } from "../server/db";
import { orders, orderItems, orderSizeBreakdowns, orderActivity } from "../shared/schema";
import { eq, inArray, ilike } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");
const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const poRef = arg("--po"); const product = arg("--product"); const raw = arg("--sizes");
  if (!poRef || !product || !raw) throw new Error("need --po, --product, --sizes");
  const map: Record<string, number> = JSON.parse(raw);
  const sum = Object.values(map).reduce((a, b) => a + b, 0);

  const po = (await db.select().from(orders).where(ilike(orders.poReference, poRef)))[0] as any;
  if (!po) throw new Error(`PO ${poRef} not found`);
  const items = (await db.select().from(orderItems).where(eq(orderItems.orderId, po.id))) as any[];
  const item = items.find((i) => (i.productType || i.productId) === product);
  if (!item) throw new Error(`No line "${product}" on ${poRef}`);
  const rows = (await db.select().from(orderSizeBreakdowns).where(eq(orderSizeBreakdowns.orderItemId, item.id))) as any[];
  const before = rows.map((r) => `${r.size}:${r.quantity}`).sort().join(" ");
  const beforeSum = rows.reduce((a, b) => a + (b.quantity || 0), 0);

  console.log(`${poRef} · ${product}  (line qty ${item.quantity})`);
  console.log(`  before (${rows.length} rows, sum ${beforeSum}): ${before}`);
  console.log(`  after  (${Object.keys(map).length} rows, sum ${sum}): ${Object.entries(map).map(([s, q]) => `${s}:${q}`).sort().join(" ")}`);
  if (sum !== item.quantity) { console.log(`  ✗ map sums to ${sum} but line qty is ${item.quantity} — fix the map`); return; }
  if (!APPLY) { console.log("  DRY RUN — add --apply to write."); return; }

  await db.transaction(async (tx) => {
    await tx.delete(orderSizeBreakdowns).where(eq(orderSizeBreakdowns.orderItemId, item.id));
    for (const [sz, q] of Object.entries(map)) {
      await tx.insert(orderSizeBreakdowns).values({ orderId: po.id, orderItemId: item.id, size: sz.toUpperCase(), quantity: q } as any);
    }
    await tx.insert(orderActivity).values({
      orderId: po.id, action: "line_sizes_corrected",
      details: { product, sizes: map, source: "Onewhero Year 7s/U7s list", note: "Replaced contaminated size rows with confirmed breakdown from client list." },
    } as any);
  });
  console.log("  ✅ APPLIED. Regenerate PO PDF + send Puffin the corrected sizes.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
