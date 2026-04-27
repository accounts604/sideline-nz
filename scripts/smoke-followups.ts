// Smoke for the supplier follow-up cron.
//
// Stages a realistic "PO Raised" scenario against a real PO that already has
// a Drive folder + Gmail dispatch thread, runs the follow-up cron in dry-run
// mode AGAINST live Gmail (so we exercise the thread lookup + reply parsing),
// and then restores the snapshot.
//
// Run:  npx tsx scripts/smoke-followups.ts

import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../server/db";
import { orders, orderActivity, users } from "../shared/schema";
import { and, eq, desc, sql, isNotNull } from "drizzle-orm";
import { spawn } from "child_process";

const TEST_SUPPLIER_EMAIL = process.env.SMOKE_SUPPLIER_EMAIL || "admin@kig.co.nz";

async function main() {
  console.log("=== Phase 2 follow-up smoke ===\n");

  // Pick the same PO the dry-fire used (most recent with Drive folder)
  const [po] = await db.select().from(orders)
    .where(isNotNull(orders.driveFolderId))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  if (!po) { console.error("no PO with drive folder"); process.exit(1); }

  console.log(`Target PO: ${po.poReference || po.orderNumber} (${po.id})`);

  // Snapshot
  const snap = {
    pipelineStage: po.pipelineStage,
    status: po.status,
    assignedSupplierId: po.assignedSupplierId,
    dueDate: po.dueDate,
  };

  // Ensure test supplier
  let [supplier] = await db.select().from(users).where(eq(users.email, TEST_SUPPLIER_EMAIL));
  let createdSupplier = false;
  if (!supplier) {
    const hashed = await bcrypt.hash("smoke-noop", 10);
    [supplier] = await db.insert(users).values({
      username: TEST_SUPPLIER_EMAIL, email: TEST_SUPPLIER_EMAIL, password: hashed,
      role: "supplier", teamName: "Smoke Followup Supplier", emailVerified: true,
    }).returning();
    createdSupplier = true;
    console.log(`✓ Created test supplier ${supplier.id}`);
  } else {
    console.log(`✓ Reusing supplier ${supplier.id}`);
  }

  // Stage as "PO Raised", supplier assigned, dueDate in 6 weeks (so production_chase
  // doesn't fire — only ack_chase from the back-dated activity row should fire).
  const dueDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 42);
    return d.toISOString().slice(0, 10);
  })();

  await db.update(orders).set({
    pipelineStage: "PO Raised",
    status: "processing",
    assignedSupplierId: supplier.id,
    dueDate,
    updatedAt: new Date(),
  }).where(eq(orders.id, po.id));
  console.log(`✓ Staged PO as "PO Raised", supplier=${supplier.id}, dueDate=${dueDate}`);

  // Insert a back-dated po_raised_to_supplier activity (3 business days ago)
  // so the ack_chase trigger fires.
  const backdated = new Date();
  backdated.setDate(backdated.getDate() - 5); // 5 calendar days = at least 2 business days
  const [activityRow] = await db.insert(orderActivity).values({
    orderId: po.id,
    userId: null,
    action: "po_raised_to_supplier",
    details: { supplierId: supplier.id, supplierEmail: supplier.email, gmailMessageId: null, _smoke: true },
  }).returning();
  // Override the timestamp manually since defaultNow always wins on insert
  await db.execute(sql`UPDATE order_activity SET created_at = ${backdated.toISOString()} WHERE id = ${activityRow.id}`);
  console.log(`✓ Inserted back-dated dispatch activity (${backdated.toISOString().slice(0,10)})`);

  console.log(`\n--- Running cron in dry-run mode ---\n`);

  const exitCode: number = await new Promise((resolve) => {
    const child = spawn("npx", ["tsx", "scripts/po-supplier-followups.ts", "--dry-run"], { stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
  });

  console.log(`\n--- Cron exited with code ${exitCode} ---`);

  // ─── Cleanup ───
  console.log(`\n--- Cleanup ---`);
  await db.delete(orderActivity).where(eq(orderActivity.id, activityRow.id));
  console.log(`✓ Removed back-dated activity row`);

  await db.update(orders).set({
    pipelineStage: snap.pipelineStage,
    status: snap.status,
    assignedSupplierId: snap.assignedSupplierId,
    dueDate: snap.dueDate,
    updatedAt: new Date(),
  }).where(eq(orders.id, po.id));
  console.log(`✓ Restored PO to original state (stage=${snap.pipelineStage}, supplier=${snap.assignedSupplierId || "<none>"})`);

  if (createdSupplier) {
    await db.delete(users).where(eq(users.id, supplier.id));
    console.log(`✓ Deleted test supplier`);
  }

  console.log(`\n=== Phase 2 smoke complete ===\n`);
  process.exit(exitCode);
}

main().catch((err) => { console.error("[smoke-followups] crashed:", err); process.exit(1); });
