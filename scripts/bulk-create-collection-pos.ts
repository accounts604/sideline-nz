/**
 * Bulk-create club_accounts + skeleton bulk POs for the 6 supporter collections
 * that currently have no PO. Designed to be safe and idempotent:
 *   - Creates a club_accounts row (with placeholder password — manager invite
 *     can come later).
 *   - For each product in the collection, creates an order_items row mapped to
 *     the canonical Sideline SKU (qty 1 placeholder — populate from real orders
 *     later via /admin/clubs/:id/build-po-from-closed-drop when drops close).
 *   - Status="pending", poKind="single" — these are PLACEHOLDER bulk POs.
 *   - Does NOT close drops, does NOT fire Telegram notifications, does NOT
 *     send any emails.
 *
 * Data source: scripts/_skeleton-data.json (staged from Shopify Admin MCP).
 * Doesn't require SHOPIFY_STORE_URL / SHOPIFY_ADMIN_TOKEN env vars.
 *
 * Run:
 *   npx tsx scripts/bulk-create-collection-pos.ts            # dry-run
 *   npx tsx scripts/bulk-create-collection-pos.ts --commit   # write
 */

import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import bcrypt from "bcryptjs";
import { db } from "../server/db";
import { orders, clubAccounts } from "../shared/schema";
import { eq } from "drizzle-orm";
import { matchSupporterProduct } from "../shared/supporter-range-mapping";
import { buildPoReference } from "../server/po-number";
import { storage } from "../server/storage";

const COMMIT = process.argv.includes("--commit");
const DATA_PATH = path.resolve(process.cwd(), "scripts", "_skeleton-data.json");

interface StagedCollection {
  handle: string;
  title: string;
  club: string;
  slug: string;
  products: Array<{ title: string; imageUrl: string | null }>;
}

function loadStagedData(): StagedCollection[] {
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(`Staged data not found at ${DATA_PATH}`);
  }
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  return raw.collections;
}

async function ensureClubAccount(target: StagedCollection): Promise<{ club: any; created: boolean }> {
  const tag = `club:${target.slug}`;
  const [byHandle] = await db.select().from(clubAccounts).where(eq(clubAccounts.supporterCollectionHandle, target.handle)).limit(1);
  if (byHandle) return { club: byHandle, created: false };
  const [byTag] = await db.select().from(clubAccounts).where(eq(clubAccounts.shopifyOrderTag, tag)).limit(1);
  if (byTag) {
    if (COMMIT && byTag.supporterCollectionHandle !== target.handle) {
      await db.update(clubAccounts).set({ supporterCollectionHandle: target.handle, updatedAt: new Date() }).where(eq(clubAccounts.id, byTag.id));
    }
    return { club: byTag, created: false };
  }
  if (!COMMIT) {
    return {
      club: { id: "(would-create)", clubName: target.club, shopifyOrderTag: tag, supporterCollectionHandle: target.handle, email: `manager+${target.slug}@sidelinenz.com` },
      created: true,
    };
  }
  const placeholderHash = await bcrypt.hash(`placeholder-${target.slug}-${Date.now()}`, 4);
  const [created] = await db.insert(clubAccounts).values({
    email: `manager+${target.slug}@sidelinenz.com`,
    passwordHash: placeholderHash,
    clubName: target.club,
    shopifyOrderTag: tag,
    supporterCollectionHandle: target.handle,
    supporterCollectionPublished: true,
    profitShareTierBps: 800,
  }).returning();
  return { club: created, created: true };
}

async function processCollection(target: StagedCollection) {
  console.log(`\n## ${target.club}`);
  console.log(`   collection: ${target.handle}`);
  console.log(`   tag:        club:${target.slug}`);
  console.log(`   products:   ${target.products.length}`);

  // Idempotency: skip if a PO already exists with this source_collection_handle.
  const existingByHandle = await db.select().from(orders).where(eq(orders.sourceCollectionHandle, target.handle)).limit(1);
  if (existingByHandle.length) {
    console.log(`   → SKIP: PO ${existingByHandle[0].poReference} already references this collection.`);
    return { skipped: true };
  }

  const { club, created: clubCreated } = await ensureClubAccount(target);
  console.log(`   club:       ${clubCreated ? "CREATED" : "reused"} → ${club.clubName} (${club.id})`);

  // Map each Shopify product → canonical Sideline SKU (so PO downstream tooling
  // — cost lookup, size charts, supplier briefing — knows what it's looking at).
  const lines = target.products.map(p => {
    const m = matchSupporterProduct(p.title);
    return {
      shopifyTitle: p.title,
      canonicalId: m?.productId || null,
      productName: m?.product.name || p.title,
      material: m?.product.defaultMaterial || null,
      imageUrl: p.imageUrl,
    };
  });

  if (!COMMIT) {
    console.log(`   would create PO with ${lines.length} line items:`);
    for (const li of lines) {
      const tag = li.canonicalId ? "" : "  ⚠ no canonical match";
      console.log(`     - ${(li.productName).padEnd(36)} qty=1${tag}`);
    }
    return { skipped: false, dryRun: true };
  }

  const poReference = await buildPoReference();
  const dueDate = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const order = await storage.createOrder({
    orderNumber: poReference,
    storeSlug: "sideline",
    orderType: "supporter-drop",
    status: "pending",
    subtotal: 0,
    total: 0,
    currency: "nzd",
    customerEmail: club.email,
    customerName: club.clubName,
    poReference,
    poKind: "single",
    accountName: club.clubName,
    isRepeatOrder: false,
    dueDate,
    sourceCollectionHandle: target.handle,
  } as any);

  let added = 0;
  for (const li of lines) {
    await storage.createOrderItem({
      orderId: order.id,
      productId: li.canonicalId || "supporter-drop",
      priceId: "supporter-drop",
      productName: li.productName,
      productImage: li.imageUrl,
      quantity: 1,
      unitAmount: 0,
      currency: "nzd",
      productType: li.canonicalId || "supporter-drop",
      material: li.material,
    } as any);
    added++;
  }

  console.log(`   ✓ Created ${poReference} (${order.id}) with ${added} line items.`);
  return { skipped: false, poReference, orderId: order.id, lineCount: added };
}

async function main() {
  console.log(COMMIT ? "MODE: COMMIT (writing to DB)" : "MODE: DRY-RUN (no writes)");
  const targets = loadStagedData();
  console.log(`Targets: ${targets.length} collections`);

  const summary: { club: string; outcome: string }[] = [];
  for (const t of targets) {
    try {
      const r = await processCollection(t);
      summary.push({ club: t.club, outcome: r.skipped ? "skipped (PO exists)" : r.dryRun ? "would-create" : `created ${r.poReference}` });
    } catch (e: any) {
      console.error(`! ${t.club} failed:`, e?.message || e);
      summary.push({ club: t.club, outcome: `FAILED: ${e?.message || e}` });
    }
  }

  console.log(`\n## Summary`);
  for (const s of summary) console.log(`  ${s.club.padEnd(28)} ${s.outcome}`);
  console.log();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
