/**
 * Backfill the new shipments tables from the legacy orders.tracking_number field.
 *
 * The DHL shipment-tracking feature makes the shipments/shipment_orders tables
 * the source of truth, with orders.tracking_number kept as a mirror. This script
 * walks every order that already has a tracking_number and creates the matching
 * shipment + shipment_orders link so the dashboard is populated from day one.
 *
 * Idempotent: linkOrdersToShipment upserts by waybill and the (shipment, order)
 * link is UNIQUE, so re-running is safe. Orders sharing a tracking number are
 * naturally consolidated onto one shipment.
 *
 * Run:
 *   npx tsx scripts/backfill-shipments-from-tracking.ts            # dry run
 *   npx tsx scripts/backfill-shipments-from-tracking.ts --commit
 */
import "dotenv/config";
import { db } from "../server/db";
import { orders } from "../shared/schema";
import { isNotNull } from "drizzle-orm";
import { linkOrdersToShipment } from "../server/shipments";
import { normalizeWaybill } from "../shared/shipment-status";

const COMMIT = process.argv.includes("--commit");

async function main() {
  const rows = await db
    .select({ id: orders.id, poReference: orders.poReference, trackingNumber: orders.trackingNumber, eta: orders.estimatedDeliveryDate })
    .from(orders)
    .where(isNotNull(orders.trackingNumber));

  // Group orders by normalised waybill (consolidation).
  const byWaybill = new Map<string, { ids: string[]; eta: Date | null }>();
  for (const r of rows) {
    const wb = normalizeWaybill(r.trackingNumber || "");
    if (!wb) continue;
    const cur = byWaybill.get(wb) ?? { ids: [], eta: r.eta ?? null };
    cur.ids.push(r.id);
    if (!cur.eta && r.eta) cur.eta = r.eta;
    byWaybill.set(wb, cur);
  }

  console.log(`Found ${rows.length} tracked orders → ${byWaybill.size} distinct waybills.`);
  if (!COMMIT) {
    for (const [wb, g] of Array.from(byWaybill.entries())) console.log(`  [dry] ${wb} → ${g.ids.length} PO(s)`);
    console.log("\nDry run — pass --commit to write.");
    process.exit(0);
  }

  let linked = 0;
  for (const [wb, g] of Array.from(byWaybill.entries())) {
    const result = await linkOrdersToShipment({
      waybill: wb,
      orderIds: g.ids,
      source: "supplier",
      linkSource: "admin",
      estimatedDeliveryDate: g.eta,
    });
    linked += result.linkedOrderIds.length;
    console.log(`  ${wb} → linked ${result.linkedOrderIds.length} PO(s)${result.claimedOrphan ? " (claimed orphan)" : ""}`);
  }
  console.log(`\nDone. Linked ${linked} PO(s) across ${byWaybill.size} waybills.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
