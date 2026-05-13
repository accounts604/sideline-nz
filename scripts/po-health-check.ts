// PO Health Check — snapshot of current PO state across orders + open drops.
// Read-only. Outputs a structured report to stdout.

import "dotenv/config";
import { db } from "../server/db";
import { orders, clubAccounts } from "../shared/schema";
import { sql, isNotNull, or, eq, inArray, desc } from "drizzle-orm";

function ageDays(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const t = typeof d === "string" ? new Date(d) : d;
  const days = (Date.now() - t.getTime()) / 86400000;
  if (days < 1) return `${Math.floor(days * 24)}h`;
  return `${Math.floor(days)}d`;
}

function fmt(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const t = typeof d === "string" ? new Date(d) : d;
  return t.toISOString().slice(0, 10);
}

async function main() {
  const rows = await db.select({
    id: orders.id,
    poRef: orders.poReference,
    customer: orders.customerName,
    status: orders.status,
    poKind: orders.poKind,
    parent: orders.parentOrderId,
    dispatched: orders.poDispatchedAt,
    held: orders.poHeldAt,
    holdReason: orders.poHoldReason,
    sampleOk: orders.sampleApprovedByClientAt,
    depositIn: orders.depositPaidAt,
    createdAt: orders.createdAt,
    accountName: orders.accountName,
  }).from(orders)
    .where(or(
      inArray(orders.status, ["pending", "processing", "paid"]),
      inArray(orders.poKind, ["sample", "bulk"]),
      isNotNull(orders.poHeldAt),
    ))
    .orderBy(desc(orders.createdAt))
    .limit(200);

  // Probe which migrations are live (some columns may not be applied yet)
  const liveCols = await db.execute<{column_name: string}>(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name IN ('orders','club_accounts')`);
  const colSet = new Set((liveCols as any).map((r: any) => r.column_name));
  const hasClosedDropMig = colSet.has("supporter_collection_handle");
  const hasSampleBulkMig = colSet.has("po_kind");

  let drops: any[] = [];
  if (hasClosedDropMig) {
    drops = await db.select().from(clubAccounts)
      .where(isNotNull(clubAccounts.supporterCollectionHandle));
  }

  // Buckets
  const dispatched = rows.filter(r => r.dispatched);
  const held = rows.filter(r => r.held && !r.dispatched);
  const awaitingDeposit = rows.filter(r => r.poKind === "bulk" && !r.dispatched && !r.depositIn && !r.held);
  const awaitingSampleApproval = rows.filter(r => r.poKind === "sample" && r.dispatched && !r.sampleOk);
  const sampleNotYetDispatched = rows.filter(r => r.poKind === "sample" && !r.dispatched && !r.held);
  const processingNotPo = rows.filter(r => r.status === "processing" && r.poKind === "single" && !r.dispatched);

  const negotiationKeywords = /ponsonby|mt\s*albert|mount\s*albert/i;
  const negotiation = rows.filter(r =>
    negotiationKeywords.test(r.customer || "") ||
    negotiationKeywords.test(r.accountName || "")
  );

  const print = (title: string, list: typeof rows, cols: Array<keyof typeof rows[number]> = ["poRef","customer","status","poKind","createdAt"]) => {
    console.log(`\n## ${title} (${list.length})`);
    if (list.length === 0) { console.log("  (none)"); return; }
    for (const r of list.slice(0, 30)) {
      const c = cols.map(k => {
        const v = (r as any)[k];
        if (v instanceof Date) return fmt(v);
        if (typeof v === "boolean") return v ? "Y" : "N";
        return v ?? "—";
      }).join(" | ");
      console.log(`  ${c}  (age ${ageDays(r.createdAt)})`);
    }
    if (list.length > 30) console.log(`  …and ${list.length - 30} more`);
  };

  console.log(`# Sideline PO Health Check — ${new Date().toISOString().slice(0, 16).replace("T", " ")}Z`);
  console.log(`Source: ${rows.length} live orders matching active-pipeline filter, ${drops.length} clubs with supporter drops configured.`);
  console.log(`Migration state: closed-drop-po-fields=${hasClosedDropMig ? "applied" : "MISSING"}, po-sample-bulk-split=${hasSampleBulkMig ? "applied" : "MISSING"}`);

  // Open drops summary
  console.log(`\n## Open supporter drops (${drops.length})`);
  if (drops.length === 0) console.log("  (no clubs have supporter_collection_handle set)");
  for (const d of drops) {
    const state = d.supporterDropClosedAt
      ? `CLOSED ${fmt(d.supporterDropClosedAt)}`
      : d.supporterCollectionPublished
        ? "PUBLISHED (live)"
        : "UNPUBLISHED";
    console.log(`  ${d.clubName.padEnd(28)} ${d.shopifyOrderTag?.padEnd(30) || "—".padEnd(30)} ${d.supporterCollectionHandle?.padEnd(38) || "—"} ${state}`);
  }

  // Negotiation-on-hold highlight
  print("Negotiation hold candidates (Ponsonby / Mt Albert)", negotiation,
    ["poRef","customer","accountName","status","poKind"]);

  // Pipeline state buckets
  print("Dispatched POs (awaiting supplier reply)", dispatched, ["poRef","customer","poKind","dispatched"]);
  print("Held POs (po_held_at set, not dispatched)", held, ["poRef","customer","poKind","holdReason","createdAt"]);
  print("Bulk POs awaiting deposit (deposit_paid_at NULL)", awaitingDeposit, ["poRef","customer","parent","createdAt"]);
  print("Sample POs dispatched, awaiting client approval", awaitingSampleApproval, ["poRef","customer","dispatched","createdAt"]);
  print("Sample POs not yet dispatched", sampleNotYetDispatched, ["poRef","customer","createdAt"]);
  print("Processing single-PO orders not yet dispatched", processingNotPo, ["poRef","customer","accountName","createdAt"]);

  console.log("\n— end report —");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
