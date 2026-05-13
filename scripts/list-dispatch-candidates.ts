// Shortlist POs that are reasonable candidates for a real Dispatch test.
// Looks for orders in pre-dispatch stages with a Drive folder + due date set.

import "dotenv/config";
import { db } from "../server/db";
import { orders, users } from "../shared/schema";
import { isNotNull, desc, sql, and, inArray } from "drizzle-orm";

async function main() {
  const candidates = await db.select({
    id: orders.id,
    ref: orders.poReference,
    orderNumber: orders.orderNumber,
    accountName: orders.accountName,
    stage: orders.pipelineStage,
    dueDate: orders.dueDate,
    driveFolderId: orders.driveFolderId,
    assignedSupplierId: orders.assignedSupplierId,
    artworkApproved: orders.artworkApproved,
  }).from(orders)
    .where(and(
      isNotNull(orders.driveFolderId),
      sql`${orders.pipelineStage} IN ('Lead Received', 'Brief Sent', 'Mockup In Progress', 'Mockup Sent', 'Deposit Paid')`,
    ))
    .orderBy(desc(orders.createdAt))
    .limit(15);

  // Pull supplier names too
  const supplierIds = candidates.map((c) => c.assignedSupplierId).filter((x): x is string => !!x);
  const suppliers = supplierIds.length
    ? await db.select({ id: users.id, teamName: users.teamName, email: users.email })
        .from(users).where(inArray(users.id, supplierIds))
    : [];
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));

  console.log(`\n=== Dispatch candidates (pre-dispatch + has Drive folder) ===\n`);
  if (candidates.length === 0) { console.log("No candidates found."); return; }

  console.log(`${"PO".padEnd(16)} ${"Account".padEnd(28)} ${"Stage".padEnd(20)} ${"Due".padEnd(12)} ${"Artwork".padEnd(8)} Supplier`);
  console.log("-".repeat(110));
  for (const c of candidates) {
    const supplier = c.assignedSupplierId ? supplierMap.get(c.assignedSupplierId) : null;
    const supplierLabel = supplier?.teamName || (c.assignedSupplierId ? "(assigned)" : "—");
    console.log(
      `${(c.ref || c.orderNumber).padEnd(16)} ${(c.accountName || "—").slice(0, 28).padEnd(28)} ${(c.stage || "—").padEnd(20)} ${(c.dueDate || "—").padEnd(12)} ${(c.artworkApproved ? "✓" : "—").padEnd(8)} ${supplierLabel}`,
    );
  }
  console.log();
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
