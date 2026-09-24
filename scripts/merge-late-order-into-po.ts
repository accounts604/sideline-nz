// Merge a late supporter order (placed after the PO was dispatched) into an
// existing PO that hasn't started bulk production. Increments the matching
// line's quantity + size breakdown, and writes an audit row. Dry-run by
// default; pass --apply to write.
//
// Usage:
//   npx tsx scripts/merge-late-order-into-po.ts --po PO-2026-0011 \
//     --order "#1159" \
//     --add '[{"product":"dri-fit-shirt","size":"L","qty":1}]' [--apply]
//
// `product` must be the canonical productType already on the PO (e.g. the
// value matchSupporterProduct() returns). Sizes are matched case-insensitively
// with OS/One Size collapsed; a size not already present is inserted.
import "dotenv/config";
import { db } from "../server/db";
import { orders, orderItems, orderSizeBreakdowns, orderActivity } from "../shared/schema";
import { eq, inArray, ilike } from "drizzle-orm";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const APPLY = process.argv.includes("--apply");
const normSize = (s: string) => {
  const u = (s || "").trim().toUpperCase();
  return /^(OS|OSFM|ONE\s*SIZE|O\/S|FREE\s*SIZE)$/.test(u) ? "OS" : u;
};

async function main() {
  const poRef = arg("--po");
  const orderName = arg("--order") || "(unspecified)";
  const addsRaw = arg("--add");
  if (!poRef || !addsRaw) throw new Error("need --po and --add");
  const adds: { product: string; size: string; qty: number }[] = JSON.parse(addsRaw);

  const po = (await db.select().from(orders).where(ilike(orders.poReference, poRef)))[0] as any;
  if (!po) throw new Error(`PO ${poRef} not found`);
  const items = (await db.select().from(orderItems).where(eq(orderItems.orderId, po.id))) as any[];
  const itemIds = items.map((i) => i.id);
  const sizes = (await db.select().from(orderSizeBreakdowns)
    .where(inArray(orderSizeBreakdowns.orderItemId, itemIds))) as any[];

  console.log(`PO ${po.poReference} (${po.customerName})  status=${po.status}  merging late order ${orderName}`);
  const plan: { itemId: string; product: string; size: string; from: number; to: number; sizeRowId?: string; insert?: boolean; newItemQty: number }[] = [];

  for (const a of adds) {
    const item = items.find((i) => (i.productType || i.productId) === a.product);
    if (!item) { console.log(`  ✗ NO matching line for product "${a.product}" — needs a new line, skipping (handle manually)`); continue; }
    const want = normSize(a.size);
    const row = sizes.find((s) => s.orderItemId === item.id && normSize(s.size) === want);
    const newItemQty = (item.quantity || 0) + a.qty;
    if (row) {
      plan.push({ itemId: item.id, product: a.product, size: row.size, from: row.quantity, to: row.quantity + a.qty, sizeRowId: row.id, newItemQty });
    } else {
      plan.push({ itemId: item.id, product: a.product, size: a.size, from: 0, to: a.qty, insert: true, newItemQty });
    }
    item.quantity = newItemQty; // so multiple adds to same line stack correctly in the plan
  }

  console.log("\nPlanned changes:");
  for (const p of plan) {
    console.log(`  ${p.product.padEnd(20)} size ${p.size.padEnd(6)} ${p.from} → ${p.to}${p.insert ? " (NEW size row)" : ""}  | line qty → ${p.newItemQty}`);
  }
  if (!plan.length) { console.log("Nothing to do."); return; }

  if (!APPLY) { console.log("\nDRY RUN — re-run with --apply to write."); return; }

  await db.transaction(async (tx) => {
    // group final line quantities
    const finalQty = new Map<string, number>();
    for (const p of plan) finalQty.set(p.itemId, p.newItemQty);
    for (const [itemId, q] of finalQty) {
      await tx.update(orderItems).set({ quantity: q }).where(eq(orderItems.id, itemId));
    }
    for (const p of plan) {
      if (p.insert) {
        await tx.insert(orderSizeBreakdowns).values({ orderId: po.id, orderItemId: p.itemId, size: p.size, quantity: p.to } as any);
      } else {
        await tx.update(orderSizeBreakdowns).set({ quantity: p.to }).where(eq(orderSizeBreakdowns.id, p.sizeRowId!));
      }
    }
    await tx.insert(orderActivity).values({
      orderId: po.id,
      action: "late_order_merged",
      details: { order: orderName, additions: adds, note: "Late supporter order placed after PO dispatch; merged before bulk start.", source: "reconcile-late-merge" },
    } as any);
  });
  console.log("\n✅ APPLIED. Remember: regenerate the PO PDF and send revised quantities to the supplier(s).");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
