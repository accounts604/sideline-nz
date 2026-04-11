/**
 * Seed script — creates a test supplier + wires it to the most recent order
 * so you can smoke-test the supplier portal end-to-end.
 *
 * What it does:
 *   1. Creates a supplier user with a known password (so you can log in
 *      at /supplier/login immediately — no invite-accept step needed for testing).
 *   2. Finds the most recent order and sets assignedSupplierId to this supplier.
 *   3. Stamps one existing design file on that order with folder = "tech-pack"
 *      so the supplier has something to download. If no design files exist,
 *      prints a note telling you to upload one via admin first.
 *
 * Usage:
 *   npx tsx scripts/seed-test-supplier.ts
 *
 * Env (optional):
 *   SUPPLIER_EMAIL      default: test-supplier@example.com
 *   SUPPLIER_PASSWORD   default: supplier123
 *   SUPPLIER_NAME       default: Test Factory Ltd
 *   TARGET_ORDER_ID     default: most recent order
 *
 * To undo:
 *   UPDATE orders SET assigned_supplier_id = NULL WHERE assigned_supplier_id = '<supplier id>';
 *   UPDATE design_files SET folder = NULL WHERE id = '<file id>';
 *   DELETE FROM users WHERE email = 'test-supplier@example.com';
 */
import "dotenv/config";
import { db } from "../server/db";
import { users, orders, designFiles } from "../shared/schema";
import { eq, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";

const EMAIL = process.env.SUPPLIER_EMAIL || "test-supplier@example.com";
const PASSWORD = process.env.SUPPLIER_PASSWORD || "supplier123";
const NAME = process.env.SUPPLIER_NAME || "Test Factory Ltd";
const TARGET_ORDER_ID = process.env.TARGET_ORDER_ID;

async function seed() {
  console.log(`\n== Sideline supplier portal — test seed ==\n`);

  // 1. Create supplier user (or reuse if exists)
  let [supplier] = await db.select().from(users).where(eq(users.email, EMAIL));

  if (supplier) {
    console.log(`Supplier user already exists: ${supplier.id} (${supplier.email})`);
    if (supplier.role !== "supplier") {
      console.log(`  WARNING: existing user has role="${supplier.role}", not supplier. Fix manually before testing.`);
    }
  } else {
    const hashed = await bcrypt.hash(PASSWORD, 10);
    [supplier] = await db.insert(users).values({
      username: EMAIL,
      email: EMAIL,
      password: hashed,
      role: "supplier",
      teamName: NAME,
      emailVerified: true,
    }).returning();
    console.log(`Created supplier user: ${supplier.id}`);
    console.log(`  Email:    ${EMAIL}`);
    console.log(`  Password: ${PASSWORD}`);
  }

  // 2. Find the target order
  let targetOrder;
  if (TARGET_ORDER_ID) {
    [targetOrder] = await db.select().from(orders).where(eq(orders.id, TARGET_ORDER_ID));
    if (!targetOrder) {
      console.error(`Order ${TARGET_ORDER_ID} not found. Aborting.`);
      process.exit(1);
    }
  } else {
    [targetOrder] = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(1);
    if (!targetOrder) {
      console.error("No orders in DB to assign. Create one via admin UI first, then re-run.");
      process.exit(1);
    }
  }
  console.log(`\nAssigning supplier to order: ${targetOrder.id} (${targetOrder.orderNumber || "no #"})`);

  // 3. Set assignedSupplierId
  await db.update(orders)
    .set({ assignedSupplierId: supplier.id, updatedAt: new Date() })
    .where(eq(orders.id, targetOrder.id));
  console.log(`  ✓ orders.assignedSupplierId = ${supplier.id}`);

  // 4. Stamp one design file as tech-pack
  const files = await db.select().from(designFiles).where(eq(designFiles.orderId, targetOrder.id));
  if (files.length === 0) {
    console.log(`\n  ⚠  No design files on this order. Supplier will see an empty files list.`);
    console.log(`     Upload a file via /admin then run this script again (it'll tag it).`);
  } else {
    const target = files[0];
    await db.update(designFiles)
      .set({ folder: "tech-pack" })
      .where(eq(designFiles.id, target.id));
    console.log(`  ✓ design_files[${target.id}].folder = "tech-pack" (${target.fileName})`);
  }

  console.log(`\n== Ready to test ==\n`);
  console.log(`  1. Visit /supplier/login`);
  console.log(`  2. Sign in with: ${EMAIL} / ${PASSWORD}`);
  console.log(`  3. You should see 1 assigned order. Click it.`);
  console.log(`  4. Tech-pack file should be downloadable.`);
  console.log(`  5. Try "Mark Files Received" and "Mark Dispatched" — both should succeed.`);
  console.log(`  6. Check the order's activity log via admin to see the logged events.\n`);
  console.log(`To test the admin raise-po flow via curl (with admin cookie):`);
  console.log(`  curl -X POST https://<host>/api/admin/orders/${targetOrder.id}/raise-po \\`);
  console.log(`       -H "Content-Type: application/json" \\`);
  console.log(`       -b "snz_token=<your admin jwt>" \\`);
  console.log(`       -d '{}'`);
  console.log(`  (order already has the supplier assigned from this script, so body can be empty)\n`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
