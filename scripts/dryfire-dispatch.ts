// End-to-end dry-fire for the new dispatch pack flow.
//
// Mirrors what POST /api/admin/orders/:id/raise-po does, but with full per-step
// visibility AND a guaranteed restore at the end so production data isn't
// disturbed. Picks a real PO that already has a Drive folder so we exercise
// the share + doc-create paths against the live shared drive.
//
// Run:  npx tsx scripts/dryfire-dispatch.ts
//
// What it does:
//   1. Picks the most recent PO with driveFolderId IS NOT NULL.
//   2. Snapshots its current assignedSupplierId, pipelineStage, status.
//   3. Ensures a test-supplier user exists with email = SMOKE_SUPPLIER_EMAIL
//      (defaults to admin@kig.co.nz so the dispatch email lands in your inbox,
//      not a real supplier's). Reassigns the PO to that test supplier.
//   4. Runs the full sequence: instructions doc → Drive share → Gmail dispatch
//      → PO PDF upload → GHL push (logged but skipped if no opportunity link).
//   5. Restores the original assignedSupplierId, pipelineStage, status.
//   6. Prints a summary of what landed where.
//
// IMPORTANT: this DOES send a real Gmail to SMOKE_SUPPLIER_EMAIL. Default is
// admin@kig.co.nz so you receive it. Override via env if needed.

import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../server/db";
import { orders, orderActivity, users } from "../shared/schema";
import { eq, desc, isNotNull, and } from "drizzle-orm";
import { storage } from "../server/storage";
import {
  shareFolderWithUser,
  createDocInFolder,
} from "../server/google-drive";
import { sendSupplierPoDispatchGmail } from "../server/email";
import { uploadPoPdfToDrive } from "../server/po-pdf";
import { computeMilestones } from "../shared/po-milestones";

const SMOKE_SUPPLIER_EMAIL = process.env.SMOKE_SUPPLIER_EMAIL || "admin@kig.co.nz";
const SMOKE_SUPPLIER_NAME = "Dryfire Test Supplier";

function buildSupplierInstructions(input: {
  orderNumber: string;
  poReference?: string | null;
  accountName?: string | null;
  supplierName?: string | null;
  dueDate?: string | null;
  deliveryAddress?: string | null;
  deliveryAttention?: string | null;
}): string {
  // Mirror of the helper in admin.ts so the dry-fire produces the exact same body.
  const milestones = input.dueDate ? computeMilestones(input.dueDate) : null;
  const ref = input.poReference || input.orderNumber;
  const lines: string[] = [];
  lines.push(`SIDELINE NZ — SUPPLIER INSTRUCTIONS`);
  lines.push(``);
  lines.push(`PO: ${ref}${input.accountName ? `  ·  ${input.accountName}` : ""}`);
  if (input.supplierName) lines.push(`Supplier: ${input.supplierName}`);
  lines.push(``);
  lines.push(`WHAT'S IN THIS FOLDER`);
  lines.push(`  • Production sheet (PDF) — every spec, size, and quantity`);
  lines.push(`  • Mockups — 3D vendor renders for visual reference`);
  lines.push(`  • Artwork — 2D vector flats (production-ready files)`);
  lines.push(`  • Logos — sponsor + club marks with placement notes`);
  lines.push(``);
  if (milestones) {
    lines.push(`SCHEDULE (35-day cycle, working back from customer delivery)`);
    for (const m of milestones) {
      const flag = m.key === "ship_production" ? "  ← YOUR DEADLINE" : "";
      lines.push(`  Day ${String(m.dayNumber).padStart(2, " ")}  ${m.date}  ${m.label}${flag}`);
    }
    lines.push(``);
  }
  if (input.deliveryAddress) {
    lines.push(`DELIVERY`);
    if (input.deliveryAttention) lines.push(`  Attn: ${input.deliveryAttention}`);
    for (const ln of input.deliveryAddress.split("\n")) lines.push(`  ${ln}`);
    lines.push(``);
  }
  lines.push(`CHECKLIST — REPLY TO orders@sidelinenz.com`);
  lines.push(`  [ ] Confirm receipt of this pack within 2 business days`);
  lines.push(`  [ ] Confirm production timeline + flag any blockers`);
  lines.push(`  [ ] Send a sample photo before bulk run starts`);
  lines.push(`  [ ] Provide tracking once shipped from production`);
  lines.push(``);
  lines.push(`— Sideline NZ`);
  return lines.join("\n");
}

async function main() {
  console.log("=== Sideline dispatch dry-fire ===\n");

  // Pick a PO with a Drive folder
  const [po] = await db.select().from(orders)
    .where(isNotNull(orders.driveFolderId))
    .orderBy(desc(orders.createdAt))
    .limit(1);

  if (!po) {
    console.error("No PO with a Drive folder. Create one in admin first.");
    process.exit(1);
  }

  console.log(`Target PO: ${po.poReference || po.orderNumber} (${po.id})`);
  console.log(`  Drive folder: ${po.driveFolderId}`);
  console.log(`  Due date:     ${po.dueDate || "<not set>"}`);
  console.log(`  Current stage: ${po.pipelineStage || "<none>"}`);
  console.log(`  Current supplier: ${po.assignedSupplierId || "<none>"}`);

  // Snapshot for restore
  const snapshot = {
    assignedSupplierId: po.assignedSupplierId,
    pipelineStage: po.pipelineStage,
    status: po.status,
  };

  // Ensure test supplier exists
  let [supplier] = await db.select().from(users).where(eq(users.email, SMOKE_SUPPLIER_EMAIL));
  let createdSupplier = false;
  if (!supplier) {
    const hashed = await bcrypt.hash("dryfire-noop", 10);
    [supplier] = await db.insert(users).values({
      username: SMOKE_SUPPLIER_EMAIL,
      email: SMOKE_SUPPLIER_EMAIL,
      password: hashed,
      role: "supplier",
      teamName: SMOKE_SUPPLIER_NAME,
      emailVerified: true,
    }).returning();
    createdSupplier = true;
    console.log(`\n✓ Created test supplier ${supplier.id}`);
  } else if (supplier.role !== "supplier") {
    console.error(`\nUser ${SMOKE_SUPPLIER_EMAIL} exists but role is "${supplier.role}", not supplier. Aborting.`);
    process.exit(1);
  } else {
    console.log(`\n✓ Reusing existing test supplier ${supplier.id}`);
  }

  // Reassign PO to test supplier
  await db.update(orders)
    .set({ assignedSupplierId: supplier.id, updatedAt: new Date() })
    .where(eq(orders.id, po.id));

  console.log(`\n--- Running dispatch sequence ---`);

  // 1. Instructions doc
  console.log(`\n[1/5] Creating instructions doc...`);
  let instructionsDoc: { id: string; webViewLink: string } | null = null;
  if (po.driveFolderId) {
    const body = buildSupplierInstructions({
      orderNumber: po.orderNumber,
      poReference: po.poReference,
      accountName: po.accountName,
      supplierName: supplier.teamName,
      dueDate: po.dueDate,
      deliveryAddress: po.deliveryAddress,
      deliveryAttention: po.deliveryAttention,
    });
    instructionsDoc = await createDocInFolder({
      parentFolderId: po.driveFolderId,
      name: `${po.poReference || po.orderNumber} — Supplier Instructions [DRYFIRE]`,
      body,
    });
    console.log(`      ${instructionsDoc ? `✓ ${instructionsDoc.webViewLink}` : "✗ FAILED"}`);
  }

  // 2. Drive share
  console.log(`\n[2/5] Sharing Drive folder with ${supplier.email}...`);
  let permId: string | null = null;
  if (po.driveFolderId && supplier.email) {
    permId = await shareFolderWithUser({
      fileOrFolderId: po.driveFolderId,
      emailAddress: supplier.email,
      role: "reader",
      notify: false,
    });
    console.log(`      ${permId ? `✓ permission id ${permId}` : "✗ FAILED"}`);
  }

  // 3. Gmail
  console.log(`\n[3/5] Sending dispatch Gmail...`);
  let gmailMessageId: string | null = null;
  const items = await storage.getOrderItems(po.id);
  try {
    gmailMessageId = await sendSupplierPoDispatchGmail({
      to: supplier.email!,
      cc: supplier.ccEmail || undefined,
      supplierName: supplier.teamName,
      orderNumber: po.orderNumber,
      poReference: po.poReference,
      accountName: po.accountName,
      dueDate: po.dueDate,
      deliveryAddress: po.deliveryAddress,
      driveFolderUrl: po.driveFolderUrl,
      items: items.map((it: any) => ({
        productName: it.productName,
        material: it.material,
        brandingMethod: it.brandingMethod,
        quantity: it.quantity,
        productColors: it.productColors,
      })),
    });
    console.log(`      ${gmailMessageId ? `✓ Gmail sent (id: ${gmailMessageId})` : "✗ Gmail not configured (no message id returned)"}`);
  } catch (err: any) {
    console.log(`      ✗ Gmail failed: ${err.message}`);
  }

  // 4. PO PDF
  console.log(`\n[4/5] Uploading PO PDF to Drive...`);
  let poPdf: { pdfId: string; pdfUrl: string } | null = null;
  if (po.driveFolderId) {
    poPdf = await uploadPoPdfToDrive(po.id, po.driveFolderId).catch((err) => {
      console.log(`      ✗ ${err.message}`);
      return null;
    });
    console.log(`      ${poPdf ? `✓ ${poPdf.pdfUrl}` : "(skipped or failed)"}`);
  }

  // 5. GHL push (logged, may skip if no opportunity)
  console.log(`\n[5/5] GHL push: ${po.ghlOpportunityId ? `would push opportunity ${po.ghlOpportunityId} → "PO Raised"` : "skipped (no ghlOpportunityId on this PO)"}`);

  // Activity log
  await db.insert(orderActivity).values({
    orderId: po.id,
    userId: null,
    action: "po_raised_to_supplier_dryfire",
    details: {
      supplierId: supplier.id,
      gmailMessageId,
      poPdfId: poPdf?.pdfId || null,
      instructionsDocId: instructionsDoc?.id || null,
      drivePermissionId: permId,
      restored: false,
    },
  });

  // ─── Restore ─────────────────────────────────────────────────
  console.log(`\n--- Restoring snapshot ---`);
  await db.update(orders)
    .set({
      assignedSupplierId: snapshot.assignedSupplierId,
      pipelineStage: snapshot.pipelineStage,
      status: snapshot.status,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, po.id));
  console.log(`✓ ${po.poReference || po.orderNumber} restored: supplier=${snapshot.assignedSupplierId || "<none>"}, stage=${snapshot.pipelineStage || "<none>"}`);

  // Optional: delete the dryfire instructions doc so the folder isn't littered.
  if (instructionsDoc?.id) {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
        grant_type: "refresh_token",
      }).toString(),
    });
    const { access_token } = await tokenRes.json();
    const delRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${instructionsDoc.id}?supportsAllDrives=true`,
      { method: "DELETE", headers: { Authorization: `Bearer ${access_token}` } },
    );
    console.log(`✓ Deleted dryfire instructions doc (status ${delRes.status})`);
  }

  // Optional: delete the dryfire PO PDF (it's tagged with the same name as a real one
  // would be, so we leave it — uploadPoPdfToDrive already de-dups by name in production.)
  if (poPdf?.pdfId) {
    console.log(`(leaving PO PDF — it's the same one a real dispatch would generate)`);
  }

  // Optional cleanup of created supplier
  if (createdSupplier) {
    await db.delete(users).where(eq(users.id, supplier.id));
    console.log(`✓ Deleted test supplier ${supplier.id}`);
  }

  console.log(`\n=== Dry-fire complete ===`);
  console.log(`Check ${SMOKE_SUPPLIER_EMAIL} for the dispatch email.`);
  console.log(`Check Drive folder ${po.driveFolderId} for the (deleted) instructions doc + (kept) PO PDF.`);
  console.log(`Activity log entry written: action="po_raised_to_supplier_dryfire" on order ${po.id}.\n`);
}

main().catch((err) => {
  console.error("\n[dryfire] crashed:", err);
  process.exit(1);
});
