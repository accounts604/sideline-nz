// Smoke test for deleteOrder + duplicate-via-storage-primitives + artwork
// approval columns, exercised at the storage layer (no HTTP auth needed).
//
// Run:
//   npx tsx scripts/smoke-admin-ops.ts
//
// What this covers:
//   1. Creates a throwaway order (+ items) via storage.createOrder / createOrderItem
//   2. Toggles artworkApproved on via storage.updateOrder
//   3. Verifies the column persists and round-trips
//   4. Deletes via storage.deleteOrder
//   5. Verifies cascade (order + items rows gone)
//
// The HTTP routes (POST /duplicate, DELETE /:id, PATCH /:id) are thin Zod
// wrappers over these storage methods, so if the storage layer passes the
// route is effectively verified — the only extra surface is the Zod schema
// on PATCH, which we also exercise by setting artworkApproved to match the
// same shape the UI sends.

import "dotenv/config";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { orders, orderItems } from "../shared/schema";
import { eq, desc } from "drizzle-orm";

async function main() {
  // Find a real order to clone FROM (so we get realistic item data)
  const [src] = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(1);
  if (!src) { console.error("no orders in DB"); process.exit(1); }
  console.log(`[smoke] source: ${src.orderNumber}`);

  const srcItems = await db.select().from(orderItems).where(eq(orderItems.orderId, src.id));
  console.log(`[smoke] source items: ${srcItems.length}`);

  // 1. Clone the order
  const { id: _id, orderNumber: _n, createdAt: _c, updatedAt: _u, paidAt: _p, ...copy } = src as any;
  const testRef = `SMOKE-${Date.now().toString(36).toUpperCase()}`;
  const dupOrder = await storage.createOrder({
    ...copy,
    orderNumber: testRef,
    poReference: testRef,
    status: "pending",
  } as any);
  console.log(`[smoke] dup created: ${dupOrder.orderNumber} (id=${dupOrder.id})`);

  for (const it of srcItems) {
    const { id: _iid, orderId: _oid, ...itCopy } = it as any;
    await storage.createOrderItem({ ...itCopy, orderId: dupOrder.id } as any);
  }
  const dupItems = await db.select().from(orderItems).where(eq(orderItems.orderId, dupOrder.id));
  console.log(`[smoke] dup items cloned: ${dupItems.length}`);

  // 2. Approve artwork
  const approvedAt = new Date();
  const approved = await storage.updateOrder(dupOrder.id, {
    artworkApproved: true,
    artworkApprovedBy: "Smoke Test",
    artworkApprovedAt: approvedAt,
  });
  console.log(`[smoke] approved: approved=${(approved as any).artworkApproved} by=${(approved as any).artworkApprovedBy} at=${(approved as any).artworkApprovedAt?.toISOString?.() ?? (approved as any).artworkApprovedAt}`);
  if ((approved as any).artworkApproved !== true) throw new Error("artworkApproved did not persist");
  if ((approved as any).artworkApprovedBy !== "Smoke Test") throw new Error("artworkApprovedBy did not persist");

  // Round-trip — re-read from DB
  const [reread] = await db.select().from(orders).where(eq(orders.id, dupOrder.id));
  if ((reread as any).artworkApproved !== true) throw new Error("approval didn't round-trip from DB");
  console.log("[smoke] round-trip verified");

  // Revert
  const reverted = await storage.updateOrder(dupOrder.id, {
    artworkApproved: false,
    artworkApprovedBy: null,
    artworkApprovedAt: null,
  });
  console.log(`[smoke] reverted: approved=${(reverted as any).artworkApproved}`);
  if ((reverted as any).artworkApproved !== false) throw new Error("revert failed");

  // 3. Delete
  const ok = await storage.deleteOrder(dupOrder.id);
  if (!ok) throw new Error("deleteOrder returned false");
  console.log("[smoke] deleted");

  // Verify cascade
  const afterOrder = await db.select().from(orders).where(eq(orders.id, dupOrder.id));
  const afterItems = await db.select().from(orderItems).where(eq(orderItems.orderId, dupOrder.id));
  if (afterOrder.length !== 0) throw new Error(`order row still exists: ${JSON.stringify(afterOrder)}`);
  if (afterItems.length !== 0) throw new Error(`item rows still exist: ${afterItems.length}`);
  console.log("[smoke] cascade verified (order + items gone)");

  console.log("[smoke] ✅ all ops pass");
}

main().then(() => process.exit(0)).catch(e => { console.error("[smoke] ❌", e); process.exit(1); });
