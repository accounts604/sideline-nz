/**
 * Generic supporter-campaign → bulk-order PO importer.
 *
 * Reads /tmp/<slug>-bundle.json (produced by workspace/scripts/pull-club-bundle.js)
 * and creates one PO with all aggregated SKU+size lines, populated with
 * Shopify product image, productType, description, and unit cost.
 *
 * Idempotent — refuses to insert if a PO with the import marker already exists.
 *
 * Run:
 *   npx tsx scripts/import-club-bulk-po.ts <slug>
 *   npx tsx scripts/import-club-bulk-po.ts kbhs-rugby --commit
 */
import "dotenv/config";
import * as fs from "node:fs";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { orders, orderItems, orderSizeBreakdowns } from "../shared/schema";
import { and, eq, like } from "drizzle-orm";
import { withPoNumberRetry, buildPoReference } from "../server/po-number";
import { matchSupporterProduct, DEFAULT_LOGO_PLACEMENTS } from "../shared/supporter-range-mapping";
import { suggestSizeChart } from "../shared/size-charts";

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
// --replace=<poRef> rebuilds the line items of an existing PO in place
// (keeps the order row, Drive folder, GHL opp, etc., but blows away items +
// size breakdowns and re-inserts using the patched logic). Use this to
// repair the first-cut buggy POs without losing the surrounding context.
const replaceArg = args.find(a => a.startsWith("--replace="));
const REPLACE_PO_REF = replaceArg ? replaceArg.split("=")[1] : null;
const positional = args.filter(a => !a.startsWith("--"));
if (positional.length < 1) {
  console.error("usage: npx tsx scripts/import-club-bulk-po.ts <slug> [--commit] [--replace=<poRef>]");
  process.exit(1);
}
const SLUG = positional[0];
const BUNDLE_PATH = `/tmp/${SLUG}-bundle.json`;
const IMPORT_MARKER = `supporter-campaign-import-${SLUG}-2026`;

// Per-slug metadata (storeSlug, accountName, customer info). Customer fields
// are best-effort — fill in via admin UI once known.
const CLUB_META: Record<string, {
  storeSlug: string;
  accountName: string;
  customerFirstName?: string;
  customerLastName?: string;
  customerEmail?: string;
  customerPhone?: string;
  productKeywordToStrip?: string;
}> = {
  "kbhs-rugby": {
    storeSlug: "kbhs-rugby",
    accountName: "Kelston Boys' High School Rugby",
    productKeywordToStrip: "KBHS Rugby",
  },
  "st-peters-1st-xv": {
    storeSlug: "st-peters",
    accountName: "St Peter's College 1st XV",
    customerFirstName: "Jeffrey",
    customerLastName: "Ierome",
    customerEmail: "jierome@st-peters.school.nz",
    customerPhone: "+64211516823",
    productKeywordToStrip: "St Peter's 1st XV",
  },
  "onewhero-rugby": {
    storeSlug: "onewhero-rugby",
    accountName: "Onewhero Rugby Club",
    customerFirstName: "Jared",
    customerEmail: "jaredvdv@gmail.com",
    productKeywordToStrip: "Onewhero Rugby",
  },
  "weymouth-rugby": {
    storeSlug: "weymouth-rugby",
    accountName: "Weymouth Rugby",
    productKeywordToStrip: "Weymouth Rugby",
  },
  "avondale-rugby": {
    storeSlug: "avondale-rugby",
    accountName: "Avondale Rugby",
    productKeywordToStrip: "Avondale Rugby",
  },
  "otahuhu-rfc": {
    storeSlug: "otahuhu-rfc",
    accountName: "Otahuhu RFC",
    customerFirstName: "Tommy",
    customerEmail: "otahuhurugbyadmn@gmail.com",
    productKeywordToStrip: "ORFC",
  },
  "richmond-rovers-senior": {
    storeSlug: "richmond-rovers",
    accountName: "Richmond Rovers Senior A's",
    // Gatt (gatt12@live.com) was the inbound enquiry contact — may not be the
    // confirmed Senior A's manager. Leaving customer blank until verified.
    productKeywordToStrip: "Richmond Rovers Senior As",
  },
  "narre-warren-fc": {
    storeSlug: "narre-warren-fc",
    accountName: "Narre Warren South FC",
    customerFirstName: "Peti",
    customerLastName: "Lauese",
    customerEmail: "peti.lauese@education.vic.gov.au",
    productKeywordToStrip: "NWS",
  },
};

function cleanProductName(title: string, stripKeyword?: string): string {
  let t = title.replace(/^\d{4}\s+/, "");
  if (stripKeyword) {
    t = t.replace(new RegExp("^" + stripKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+", "i"), "");
  }
  return t.trim();
}

async function main() {
  if (!fs.existsSync(BUNDLE_PATH)) {
    console.error(`[import] missing ${BUNDLE_PATH} — run scripts/pull-club-bundle.js ${SLUG} <handle> first`);
    process.exit(1);
  }
  const meta = CLUB_META[SLUG];
  if (!meta) { console.error(`[import] no metadata for slug "${SLUG}" — add to CLUB_META`); process.exit(1); }

  const bundle = JSON.parse(fs.readFileSync(BUNDLE_PATH, "utf-8"));
  const lines: Array<{ productId: string; productTitle: string; size: string; qty: number; variantId?: string }> = bundle.aggregatedLines;
  const variants: Array<any> = bundle.variants;
  console.log(`[import] ${SLUG}: ${lines.length} SKU+size lines, ${bundle.totals.units} units, ${bundle.totals.orders} orders`);

  // Pre-order cutoff guard — drops are built only AFTER cutoff. The bundle
  // already filters orders to pre-cutoff, but we also refuse to commit the
  // PO before the cutoff date so a stray run during the live drop doesn't
  // dispatch an incomplete PO. --force overrides for backfilling closed drops.
  const cutoffIso: string | null = bundle.cutoffIso || null;
  if (cutoffIso) {
    const cutoffMs = Date.parse(cutoffIso);
    const nowMs = Date.now();
    if (!isNaN(cutoffMs) && nowMs < cutoffMs && !args.includes("--force")) {
      const remainingHours = Math.round((cutoffMs - nowMs) / 3600000);
      console.error(`[import] cutoff ${cutoffIso} hasn't passed yet (${remainingHours}h remaining) — refusing to build. Pass --force to override.`);
      process.exit(1);
    }
    if (bundle.totals.lateDropped) console.log(`[import] dropped ${bundle.totals.lateDropped} late post-cutoff orders`);
  }

  // Idempotency check (skipped when --replace=<poRef> is in play — that's
  // the explicit rebuild path).
  let replaceTarget: { id: string; ref: string | null; num: string } | null = null;
  if (REPLACE_PO_REF) {
    const found = await db
      .select({ id: orders.id, ref: orders.poReference, num: orders.orderNumber, dispatched: orders.poDispatchedAt })
      .from(orders)
      .where(eq(orders.poReference, REPLACE_PO_REF))
      .limit(1);
    if (!found.length) { console.error(`[import] --replace target ${REPLACE_PO_REF} not found`); process.exit(1); }
    if (found[0].dispatched) {
      console.error(`[import] --replace target ${REPLACE_PO_REF} already dispatched (poDispatchedAt set) — refusing to rebuild a dispatched PO`);
      process.exit(1);
    }
    replaceTarget = { id: found[0].id, ref: found[0].ref, num: found[0].num };
    console.log(`[import] replace mode: rebuilding line items of ${replaceTarget.ref} (${replaceTarget.num})`);
  } else {
    const dupes = await db
      .select({ id: orders.id, ref: orders.poReference, num: orders.orderNumber, comments: orders.poComments })
      .from(orders)
      .where(and(
        eq(orders.storeSlug, meta.storeSlug),
        like(orders.poComments, `%${IMPORT_MARKER}%`),
      ));
    if (dupes.length) {
      console.log(`[import] ⚠️  already imported — found ${dupes.length} matching PO(s):`);
      for (const d of dupes) console.log("   ", d.ref, d.num);
      console.log(`[import] skip (pass --replace=${dupes[0].ref} to rebuild line items in place, or delete to re-import fresh)`);
      process.exit(0);
    }
  }

  // Group lines by Shopify productId so each canonical product becomes ONE
  // orderItem with N orderSizeBreakdowns. The PO PDF's per-product strip
  // reads the size table from orderSizeBreakdowns, not from one row per size
  // — that's why the previous approach showed bare "Qty: 12" with no sizes.
  type ProductGroup = {
    productId: string;
    displayTitle: string;
    productType: string | null;
    productImageUrl: string | null;
    productImageUrls: string[];
    sizes: Array<{ size: string; qty: number; unitCents: number; sku: string | null }>;
  };
  const grouped = new Map<string, ProductGroup>();
  let unmatched = 0;
  for (const line of lines) {
    const v = variants.find(x => x.productId === line.productId && x.size?.toLowerCase() === line.size?.toLowerCase());
    let group = grouped.get(line.productId);
    if (!group) {
      group = {
        productId: line.productId,
        displayTitle: cleanProductName(line.productTitle, meta.productKeywordToStrip),
        productType: v?.productType || null,
        productImageUrl: v?.productImageUrl || null,
        productImageUrls: (v?.productImageUrls as string[] | undefined) || (v?.productImageUrl ? [v.productImageUrl] : []),
        sizes: [],
      };
      grouped.set(line.productId, group);
    }
    if (!v) {
      unmatched++;
      console.log(`  ❓ ${line.qty}× ${line.productTitle} / ${line.size} — no variant match in bundle`);
      group.sizes.push({ size: line.size, qty: line.qty, unitCents: 0, sku: null });
      continue;
    }
    const cents = v.cost !== null ? Math.round(v.cost * 100) : 0;
    group.sizes.push({ size: line.size, qty: line.qty, unitCents: cents, sku: v.sku || null });
  }

  // Materialise per-product line items, picking material from the canonical
  // Sideline catalog (matched by display title) instead of the Shopify
  // product description (which was rendering as the "material" field).
  type LineItem = {
    productId: string;
    priceId: string;
    productName: string;
    productImage: string | null;
    mockupImages: Array<{ url: string; label: string }> | null;
    elementUrls: Array<{ name: string; url: string; position?: string; application?: string; sizeMm?: string }> | null;
    productType: string | null;
    material: string | null;
    sizeChartType: string | null;
    quantity: number; // sum across sizes
    unitAmount: number; // weighted-average cents
    currency: "nzd";
    sizeBreakdown: Array<{ size: string; qty: number }>;
  };
  // Logo from Shopify Files (bundle.logoUrl). One file per drop, attached
  // to every line item with default placement based on canonical product.
  // Romero overrides per-item in admin if needed before tapping Send.
  const logoUrl: string | null = bundle.logoUrl || null;
  if (logoUrl) console.log(`[import] logo: ${logoUrl.slice(0, 80)}`);
  else console.log(`[import] no logo URL in bundle — PO will have empty Logo Placement Grid (upload <slug>-logo.png to Shopify Files)`);

  const itemsToInsert: LineItem[] = [];
  for (const g of Array.from(grouped.values())) {
    const totalQty = g.sizes.reduce((s, x) => s + x.qty, 0);
    const totalCents = g.sizes.reduce((s, x) => s + x.qty * x.unitCents, 0);
    const unitAmount = totalQty > 0 ? Math.round(totalCents / totalQty) : 0;
    const canonical = matchSupporterProduct(g.displayTitle);
    const material = canonical?.product.defaultMaterial ?? null;
    const sizeChart = canonical ? suggestSizeChart(canonical.productId) : null;
    // Pull every Shopify product image into mockupImages so the PO PDF
    // shows all angles — getMockups() iterates this array and renders each.
    // Caps at 6 to keep the page tight; you can prune in admin before Send.
    const allImages = (g.productImageUrls || []).filter(Boolean).slice(0, 6);
    const mockupImages = allImages.length
      ? allImages.map((url, i) => ({ url, label: i === 0 ? "Front" : `Image ${i + 1}` }))
      : null;
    // Auto-attach the club logo with the canonical product's default
    // placement. Position/application/sizeMm filled in so the PO PDF
    // renders the Logo Placement Grid populated rather than as a row of
    // em-dashes. Romero overrides any of these per item in admin.
    const placement = canonical ? DEFAULT_LOGO_PLACEMENTS[canonical.productId] : undefined;
    const elementUrls = (logoUrl && placement)
      ? [{
          name: `${meta.accountName} logo`,
          url: logoUrl,
          position: placement.position,
          application: placement.application,
          sizeMm: placement.sizeMm,
        }]
      : (logoUrl
          ? [{ name: `${meta.accountName} logo`, url: logoUrl }] // unassigned position
          : null);

    itemsToInsert.push({
      productId: g.productId,
      priceId: g.sizes[0]?.sku || SLUG + "-import",
      productName: g.displayTitle,
      productImage: g.productImageUrl,
      mockupImages,
      elementUrls,
      productType: canonical?.productId || g.productType,
      material,
      sizeChartType: sizeChart,
      quantity: totalQty,
      unitAmount,
      currency: "nzd",
      sizeBreakdown: g.sizes.map(s => ({ size: s.size, qty: s.qty })),
    });
  }

  const subtotal = itemsToInsert.reduce((s, it) => s + it.unitAmount * it.quantity, 0);

  console.log(`\n[import] plan:`);
  for (const it of itemsToInsert) {
    const dollars = (it.unitAmount / 100).toFixed(2);
    const matMark = it.material ? "✓" : "✗";
    const imgCount = it.mockupImages?.length || 0;
    const logoMark = it.elementUrls?.length
      ? `✓${it.elementUrls[0].position ? ` (${it.elementUrls[0].position})` : " (unassigned)"}`
      : "✗";
    console.log(`   ${String(it.quantity).padStart(3)}× ${it.productName.padEnd(28)}  $${dollars}  mat${matMark} img×${imgCount} logo${logoMark}`);
    for (const b of it.sizeBreakdown) {
      console.log(`        ${String(b.qty).padStart(3)}× ${b.size}`);
    }
  }
  console.log(`\n[import] subtotal: $${(subtotal / 100).toFixed(2)} | unmatched variants: ${unmatched}`);

  if (!COMMIT) {
    console.log("\n[import] DRY RUN — pass --commit to write\n");
    process.exit(0);
  }

  let order: { id: string; poReference: string | null; orderNumber: string };
  if (replaceTarget) {
    // Wipe existing line items + size breakdowns, leave order row + side-context
    // (Drive folder, GHL opp, supplier link, telegram thread) intact.
    await db.delete(orderSizeBreakdowns).where(eq(orderSizeBreakdowns.orderId, replaceTarget.id));
    await db.delete(orderItems).where(eq(orderItems.orderId, replaceTarget.id));
    await db.update(orders)
      .set({ subtotal, total: subtotal, updatedAt: new Date() })
      .where(eq(orders.id, replaceTarget.id));
    order = { id: replaceTarget.id, poReference: replaceTarget.ref, orderNumber: replaceTarget.num };
    console.log(`\n[import] ♻️  rebuilt PO ${order.poReference} (orderNumber=${order.orderNumber}, id=${order.id})`);
  } else {
    const poReference = await buildPoReference();
    const created = await withPoNumberRetry(meta.accountName, async (orderNumber) =>
      storage.createOrder({
        orderNumber,
        storeSlug: meta.storeSlug,
        orderType: "bulk-order",
        status: "pending",
        subtotal,
        total: subtotal,
        currency: "nzd",
        customerEmail: meta.customerEmail ?? null,
        customerName: [meta.customerFirstName, meta.customerLastName].filter(Boolean).join(" ") || null,
        customerFirstName: meta.customerFirstName ?? null,
        customerLastName: meta.customerLastName ?? null,
        poReference,
        accountName: meta.accountName,
        isRepeatOrder: false,
        poComments: `Supporter campaign consolidation — ${IMPORT_MARKER}. ${bundle.totals.orders} supporter orders, ${bundle.totals.units} units across ${itemsToInsert.length} SKU+size lines. Costs from Shopify inventoryItem.unitCost — review before sending to supplier.`,
        productionStage: "order_received",
      } as any)
    );
    order = created;
    console.log(`\n[import] ✅ created PO ${order.poReference} (orderNumber=${order.orderNumber}, id=${order.id})`);
  }

  let breakdownRows = 0;
  for (const it of itemsToInsert) {
    const { sizeBreakdown, ...itemFields } = it;
    const created = await storage.createOrderItem({ ...itemFields, orderId: order.id } as any);
    for (const b of sizeBreakdown) {
      if (b.qty <= 0) continue;
      await db.insert(orderSizeBreakdowns).values({
        orderItemId: created.id,
        orderId: order.id,
        size: b.size,
        quantity: b.qty,
      });
      breakdownRows++;
    }
  }
  console.log(`[import] inserted ${itemsToInsert.length} line items + ${breakdownRows} size breakdowns`);

  // Verify
  const inserted = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  console.log(`[import] verified ${inserted.length} order_items rows`);
  console.log(`[import] open in admin: /admin/po/${order.id}`);
  process.exit(0);
}

main().catch(e => { console.error("[import] FATAL", e); process.exit(1); });
