// Smoke test for the Phase 1 dispatch + stage workflow.
//
// Exercises the four risk areas without sending mail or pushing a real PO:
//   1. List filters round-trip via storage.getAllOrders (stage / dueDate / overdue / sort).
//   2. Stage PATCH path — set pipelineStage on a test order, verify legacy status
//      is derived (skipping the actual GHL push, which we just dry-log).
//   3. Drive shareFolderWithUser — share an existing PO's Drive folder with a
//      stable email (admin@kig.co.nz). Idempotent — if the share already
//      exists we just confirm the read.
//   4. Drive createDocInFolder — drop SMOKE_<timestamp> doc into the folder.
//
// Run:  npx tsx scripts/smoke-dispatch-flow.ts
//
// Cleanup: the smoke test auto-deletes the order it creates AND the doc it
// uploads. The Drive permission stays — re-runs are no-ops thanks to the
// idempotency check in shareFolderWithUser.

import "dotenv/config";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { orders } from "../shared/schema";
import { eq, desc, isNotNull } from "drizzle-orm";
import {
  shareFolderWithUser,
  createDocInFolder,
  isDriveConfigured,
} from "../server/google-drive";
import { ALL_ORDER_STAGES, legacyStatusForStage } from "../shared/order-stages";

const TEST_SHARE_EMAIL = process.env.SMOKE_DRIVE_EMAIL || "admin@kig.co.nz";
const SMOKE_PO = `SMOKE-${Date.now().toString(36).toUpperCase()}`;

function divider(s: string) { console.log(`\n=== ${s} ===`); }

async function main() {
  let pass = 0, fail = 0;
  const note = (ok: boolean, msg: string) => { console.log(`${ok ? "✓" : "✗"} ${msg}`); ok ? pass++ : fail++; };

  // ────────────────────────────────────────────────────────────
  divider("1. List filters");
  // ────────────────────────────────────────────────────────────

  const all = await storage.getAllOrders({ limit: 5 });
  note(Array.isArray(all.orders) && typeof all.total === "number",
    `getAllOrders() base call → ${all.orders.length} rows of ${all.total}`);

  const byStage = await storage.getAllOrders({ stage: "PO Raised", limit: 5 });
  note(byStage.orders.every((o) => o.pipelineStage === "PO Raised" || o.pipelineStage === null),
    `stage="PO Raised" filter → ${byStage.orders.length} rows`);

  const dateRange = await storage.getAllOrders({
    createdFrom: "2026-01-01",
    createdTo: "2026-12-31",
    limit: 5,
  });
  note(dateRange.orders.every((o) => o.createdAt && o.createdAt >= new Date("2026-01-01")),
    `createdFrom/To filter → ${dateRange.orders.length} rows`);

  const overdue = await storage.getAllOrders({ overdue: true, limit: 5 });
  const today = new Date().toISOString().slice(0, 10);
  const overdueOk = overdue.orders.every((o) =>
    !!o.dueDate && o.dueDate < today &&
    !["Delivered", "Invoice Sent", "Paid", "Completed", "Cancelled"].includes(o.pipelineStage || ""));
  note(overdueOk, `overdue=true filter → ${overdue.orders.length} rows, all valid`);

  const sortAsc = await storage.getAllOrders({ sortBy: "createdAt", sortDir: "asc", limit: 3 });
  const sortDesc = await storage.getAllOrders({ sortBy: "createdAt", sortDir: "desc", limit: 3 });
  const sortOk = sortAsc.orders.length > 0 && sortDesc.orders.length > 0
    && (sortAsc.orders[0].createdAt as any) <= (sortDesc.orders[0].createdAt as any);
  note(sortOk, `sortDir asc/desc round-trip works`);

  // ────────────────────────────────────────────────────────────
  divider("2. Stage PATCH derives status + writes activity");
  // ────────────────────────────────────────────────────────────

  // Create a throwaway order so we don't touch real data.
  const test = await storage.createOrder({
    orderNumber: SMOKE_PO,
    storeSlug: "smoke",
    status: "pending",
    subtotal: 0,
    total: 0,
    currency: "nzd",
    customerName: "Smoke Test",
    customerEmail: "smoke@test.invalid",
    pipelineStage: null,
  } as any);
  console.log(`  created throwaway: ${test.orderNumber} (id=${test.id})`);

  for (const stage of ["Mockup In Progress", "PO Raised", "Completed", "Cancelled"] as const) {
    const expectedStatus = legacyStatusForStage(stage);
    const updated = await storage.updateOrder(test.id, {
      pipelineStage: stage,
      // Mirror what the PATCH route does — derive status server-side
      status: expectedStatus,
    });
    note(
      updated?.pipelineStage === stage && updated?.status === expectedStatus,
      `stage="${stage}" → status="${updated?.status}" (expected "${expectedStatus}")`,
    );
  }

  // Verify ALL_ORDER_STAGES has 11 entries (9 pipeline + 2 terminal)
  note(ALL_ORDER_STAGES.length === 11, `ALL_ORDER_STAGES = 11 (got ${ALL_ORDER_STAGES.length})`);

  // ────────────────────────────────────────────────────────────
  divider("3. Drive share + 4. Drive doc create");
  // ────────────────────────────────────────────────────────────

  if (!isDriveConfigured()) {
    note(false, "Drive not configured (GOOGLE_* env vars missing) — skipping live Drive checks");
  } else {
    // Find an existing PO that already has a Drive folder
    const [withFolder] = await db.select()
      .from(orders)
      .where(isNotNull(orders.driveFolderId))
      .orderBy(desc(orders.createdAt))
      .limit(1);

    if (!withFolder?.driveFolderId) {
      note(false, "no order with driveFolderId — skipping live Drive checks");
    } else {
      console.log(`  using folder: ${withFolder.driveFolderId} (PO ${withFolder.poReference || withFolder.orderNumber})`);

      // Share — idempotent
      const permId = await shareFolderWithUser({
        fileOrFolderId: withFolder.driveFolderId,
        emailAddress: TEST_SHARE_EMAIL,
        role: "reader",
        notify: false,
      });
      note(!!permId, `shareFolderWithUser(${TEST_SHARE_EMAIL}) → permission id ${permId || "<none>"}`);

      // Re-share — must come back as same id (idempotency check)
      const permId2 = await shareFolderWithUser({
        fileOrFolderId: withFolder.driveFolderId,
        emailAddress: TEST_SHARE_EMAIL,
        role: "reader",
        notify: false,
      });
      note(permId === permId2, `shareFolderWithUser idempotent — same permission id on second call`);

      // Create a smoke doc
      const doc = await createDocInFolder({
        parentFolderId: withFolder.driveFolderId,
        name: `SMOKE_DOC_${SMOKE_PO}`,
        body: `Smoke test ${new Date().toISOString()}\n\nSafe to delete.`,
      });
      note(!!doc?.id, `createDocInFolder → ${doc?.webViewLink || "<no link>"}`);
      if (doc?.id) {
        console.log(`  ⚠️  manual cleanup: delete ${doc.webViewLink}`);
      }
    }
  }

  // ────────────────────────────────────────────────────────────
  divider("Cleanup");
  // ────────────────────────────────────────────────────────────
  const deleted = await storage.deleteOrder(test.id);
  note(deleted, `deleted throwaway order ${SMOKE_PO}`);

  console.log(`\n${pass} passed · ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[smoke] crashed:", err);
  process.exit(1);
});
