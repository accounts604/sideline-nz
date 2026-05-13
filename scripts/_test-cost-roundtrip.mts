import "dotenv/config";
import { db } from "../server/db";
import { orderItems, orders } from "../shared/schema";
import { eq, and } from "drizzle-orm";

const ACTION = process.argv[2]; // "show" | "bump" | "revert"
const PO_REF = "PO-2026-0007";

const [order] = await db.select().from(orders).where(eq(orders.poReference, PO_REF));
if (!order) { console.error("PO not found"); process.exit(1); }

const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
// Target: Hoodie / S — single test candidate
const target = items.find(i => i.productName === "Hoodie" && i.size === "S");
if (!target) { console.error("Hoodie/S not found"); process.exit(1); }

if (ACTION === "show") {
  console.log(JSON.stringify({ id: target.id, name: target.productName, size: target.size, unitAmountCents: target.unitAmount, dollars: (target.unitAmount/100).toFixed(2) }));
} else if (ACTION === "bump") {
  await db.update(orderItems).set({ unitAmount: target.unitAmount + 1 }).where(eq(orderItems.id, target.id));
  console.log(`bumped ${target.unitAmount} → ${target.unitAmount + 1}c`);
} else if (ACTION === "revert") {
  await db.update(orderItems).set({ unitAmount: target.unitAmount - 1 }).where(eq(orderItems.id, target.id));
  console.log(`reverted ${target.unitAmount} → ${target.unitAmount - 1}c`);
} else if (ACTION === "set") {
  const cents = parseInt(process.argv[3], 10);
  await db.update(orderItems).set({ unitAmount: cents }).where(eq(orderItems.id, target.id));
  console.log(`set to ${cents}c`);
}

// Recompute order total
const fresh = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
const subtotal = fresh.reduce((s, x) => s + x.unitAmount * x.quantity, 0);
await db.update(orders).set({ subtotal, total: subtotal }).where(eq(orders.id, order.id));
console.log(`order total recomputed: $${(subtotal/100).toFixed(2)}`);
process.exit(0);
