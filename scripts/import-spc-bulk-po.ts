/**
 * Import the closed St Peter's College 1st XV supporter campaign as a single
 * bulk-order PO in Sideline NZ — consolidates the 20 supporter Shopify orders
 * into one PO with 24 SKU+size lines, ready to push to Puffin Sports.
 *
 * Idempotent: refuses to insert if a PO already exists with the same
 * accountName + storeSlug + import marker.
 *
 * Run:
 *   npx tsx scripts/import-spc-bulk-po.ts
 *   npx tsx scripts/import-spc-bulk-po.ts --commit    # actually writes
 *
 * Without --commit it prints what it WOULD insert and exits.
 */
import "dotenv/config";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { orders, orderItems } from "../shared/schema";
import { and, eq, like } from "drizzle-orm";
import { withPoNumberRetry, buildPoReference } from "../server/po-number";

const COMMIT = process.argv.includes("--commit");
const IMPORT_MARKER = "supporter-campaign-2026-04-12-to-2026-05-03";

const SPC = {
  storeSlug: "st-peters",
  accountName: "St Peter's College 1st XV",
  customerFirstName: "Jeffrey",
  customerLastName: "Ierome",
  customerEmail: "jierome@st-peters.school.nz",
  customerPhone: "+64211516823",
};

// Aggregated 20 paid Shopify orders → SKU+size line items.
// Source: /tmp/club-orders.json + /tmp/club-stats.json (campaign 2026-04-12 → 2026-05-03).
type Line = { productName: string; productType: string; size: string; quantity: number };
const LINES: Line[] = [
  // Supporters Tee (20)
  { productName: "Supporters Tee", productType: "tee",            size: "S",       quantity: 2  },
  { productName: "Supporters Tee", productType: "tee",            size: "M",       quantity: 4  },
  { productName: "Supporters Tee", productType: "tee",            size: "L",       quantity: 3  },
  { productName: "Supporters Tee", productType: "tee",            size: "XL",      quantity: 3  },
  { productName: "Supporters Tee", productType: "tee",            size: "2XL",     quantity: 3  },
  { productName: "Supporters Tee", productType: "tee",            size: "3XL",     quantity: 1  },
  { productName: "Supporters Tee", productType: "tee",            size: "4XL",     quantity: 1  },
  { productName: "Supporters Tee", productType: "tee",            size: "K10",     quantity: 1  },
  { productName: "Supporters Tee", productType: "tee",            size: "K12",     quantity: 1  },
  { productName: "Supporters Tee", productType: "tee",            size: "K14",     quantity: 1  },
  // 5 Panel Cap (16)
  { productName: "5 Panel Cap",    productType: "cap",            size: "One Size", quantity: 16 },
  // Rugby Jersey (12)
  { productName: "Rugby Jersey",   productType: "rugby-jersey",   size: "L",       quantity: 2  },
  { productName: "Rugby Jersey",   productType: "rugby-jersey",   size: "XL",      quantity: 4  },
  { productName: "Rugby Jersey",   productType: "rugby-jersey",   size: "2XL",     quantity: 4  },
  { productName: "Rugby Jersey",   productType: "rugby-jersey",   size: "4XL",     quantity: 1  },
  { productName: "Rugby Jersey",   productType: "rugby-jersey",   size: "5XL",     quantity: 1  },
  // Scarf (11)
  { productName: "Scarf",          productType: "scarf",          size: "One Size", quantity: 11 },
  // Hoodie (9)
  { productName: "Hoodie",         productType: "hoodie",         size: "S",       quantity: 2  },
  { productName: "Hoodie",         productType: "hoodie",         size: "M",       quantity: 1  },
  { productName: "Hoodie",         productType: "hoodie",         size: "L",       quantity: 1  },
  { productName: "Hoodie",         productType: "hoodie",         size: "XL",      quantity: 2  },
  { productName: "Hoodie",         productType: "hoodie",         size: "2XL",     quantity: 1  },
  { productName: "Hoodie",         productType: "hoodie",         size: "3XL",     quantity: 1  },
  { productName: "Hoodie",         productType: "hoodie",         size: "5XL",     quantity: 1  },
];

async function main() {
  const totalUnits = LINES.reduce((s, l) => s + l.quantity, 0);
  console.log(`[spc-import] target: ${SPC.accountName}, ${LINES.length} lines, ${totalUnits} units`);
  if (totalUnits !== 68) {
    console.error(`[spc-import] ❌ unit total ${totalUnits} ≠ expected 68 — abort`);
    process.exit(1);
  }

  // Idempotency — bail if a PO with our import marker already exists.
  const dupes = await db
    .select({ id: orders.id, ref: orders.poReference, num: orders.orderNumber, comments: orders.poComments })
    .from(orders)
    .where(and(
      eq(orders.storeSlug, SPC.storeSlug),
      eq(orders.accountName, SPC.accountName),
      like(orders.poComments, `%${IMPORT_MARKER}%`),
    ));
  if (dupes.length) {
    console.log(`[spc-import] ⚠️  already imported — found ${dupes.length} matching PO(s):`);
    for (const d of dupes) console.log("   ", d.ref, d.num, "→", d.comments?.slice(0, 80));
    console.log("[spc-import] no-op (delete those rows first to re-import)");
    process.exit(0);
  }

  if (!COMMIT) {
    console.log("\n[spc-import] DRY RUN — pass --commit to actually write.");
    console.log("\nWould create one bulk-order PO with these lines:");
    for (const l of LINES) {
      console.log(`   ${String(l.quantity).padStart(2)}× ${l.productName.padEnd(18)} / ${l.size}`);
    }
    console.log("\nMeta:");
    console.log("  storeSlug:    ", SPC.storeSlug);
    console.log("  accountName:  ", SPC.accountName);
    console.log("  contact:      ", `${SPC.customerFirstName} ${SPC.customerLastName} <${SPC.customerEmail}>`);
    console.log("  phone:        ", SPC.customerPhone);
    console.log("  orderType:    ", "bulk-order");
    console.log("  status:       ", "pending");
    console.log("  unitAmount:   ", "0 cents (placeholder — fill supplier costs in admin UI)");
    process.exit(0);
  }

  // ── COMMIT ────────────────────────────────────────────────────────
  const poReference = await buildPoReference();
  const subtotal = 0; // unit costs filled in by admin UI later

  const order = await withPoNumberRetry(SPC.accountName, async (orderNumber) =>
    storage.createOrder({
      orderNumber,
      storeSlug: SPC.storeSlug,
      orderType: "bulk-order",
      status: "pending",
      subtotal,
      total: subtotal,
      currency: "nzd",
      customerEmail: SPC.customerEmail,
      customerName: `${SPC.customerFirstName} ${SPC.customerLastName}`,
      customerFirstName: SPC.customerFirstName,
      customerLastName: SPC.customerLastName,
      poReference,
      accountName: SPC.accountName,
      isRepeatOrder: false,
      poComments: `Supporter campaign consolidation — ${IMPORT_MARKER}. 20 supporter orders, 68 units across 5 product lines (24 SKU+size). Supplier costs to be filled in.`,
      productionStage: "order_received",
    } as any)
  );

  console.log(`[spc-import] ✅ created PO ${order.poReference} (orderNumber=${order.orderNumber}, id=${order.id})`);

  for (const line of LINES) {
    await storage.createOrderItem({
      orderId: order.id,
      productId: "spc-import",
      priceId: "spc-import",
      productName: line.productName,
      productType: line.productType,
      size: line.size,
      quantity: line.quantity,
      unitAmount: 0,
      currency: "nzd",
    } as any);
    console.log(`   line: ${line.quantity}× ${line.productName} / ${line.size}`);
  }

  // Verify
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  console.log(`\n[spc-import] verified ${items.length} order_items rows in DB`);
  console.log(`[spc-import] open in admin: /admin/po/${order.id}`);
  process.exit(0);
}

main().catch((e) => { console.error("[spc-import] FATAL", e); process.exit(1); });
