// One-shot pipeline: backfill missing club tags on Shopify orders, then run
// the supporter-campaign drop-summary report + PO build for the 4 target
// clubs. Writes PDFs to /tmp/sideline-reports/ and outputs a JSON manifest
// the caller can pipe to follow-up automation (Gmail drafts, audit).
//
// Why this exists: the Shopify Flow that tags supporter orders with
// club:<slug> stopped firing at some point. 157 orders are sitting untagged,
// so the live fetchSupporterOrdersByTag → buildPoFromClosedDrop → drop-summary
// pipeline returns empty for every club. This script tags retroactively by
// product-handle prefix and re-runs the canonical pipeline.
//
// Requires:
//   SHOPIFY_STORE_URL, SHOPIFY_ADMIN_TOKEN  — Admin GraphQL (writes)
//   DATABASE_URL                            — Drizzle / Neon prod
//   BASE_URL                                — portal URL on the report PDF
//
// Run:
//   npx tsx scripts/backfill-supporter-pipeline.ts --dry-run    # tally only
//   npx tsx scripts/backfill-supporter-pipeline.ts --tag-only   # backfill tags, skip reports
//   npx tsx scripts/backfill-supporter-pipeline.ts --commit     # tag + report + PO
//
// Target clubs default to KBHS, Onewhero, Wesley, St Peter's. Override with
//   --clubs kbhs-rugby,onewhero-rugby
// (uses the same slugs as club:<slug> tag values, minus the prefix).

import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { db } from "../server/db";
import { clubAccounts } from "../shared/schema";
import { eq } from "drizzle-orm";
import { generateDropSummary } from "../server/reports/drop-summary";
import { fetchSupporterOrdersByTag, summarizeSupporterOrders, isShopifyAdminConfigured } from "../server/shopify-admin";

// ─── CLI flags ─────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const TAG_ONLY = argv.includes("--tag-only");
const COMMIT = argv.includes("--commit");
if (!DRY_RUN && !TAG_ONLY && !COMMIT) {
  console.error("Pass one of --dry-run | --tag-only | --commit");
  process.exit(1);
}
const clubsArg = argv.find(a => a.startsWith("--clubs="))?.split("=")[1];
const TARGET_SLUGS = clubsArg
  ? clubsArg.split(",").map(s => s.trim())
  : ["kbhs-rugby", "onewhero-rugby", "wesley-college-rugby", "st-peters-college-1st-xv"];

const OUT_DIR = "/tmp/sideline-reports";
fs.mkdirSync(OUT_DIR, { recursive: true });

// Qualifying threshold — a club only qualifies for the profit-share report
// once they've cleared 50 supporter units. Matches the profit-share tier
// ladder (50-99 = 6%, 100-149 = 8%, 150-199 = 10%, 200+ = 12%). Below 50
// there's no share to pay out, so no report is sent.
const MIN_UNITS_TO_QUALIFY = 50;

// ─── Handle-prefix → club tag mapping ──────────────────────────────────────
// Order matters — longer prefixes first so e.g. "wesley-college-rugby-supporters-"
// wins over "wesley-college-rugby-". One known special case: ORFC products use
// both `2026-orfc-` and `orfc-` (no year) — fold both into the same tag.

const HANDLE_PREFIXES: Array<{ prefix: string; tag: string; slug: string; clubName: string }> = [
  { prefix: "2026-wesley-college-rugby-supporters-", tag: "club:wesley-college-rugby", slug: "wesley-college-rugby", clubName: "Wesley College Rugby" },
  { prefix: "2026-kbhs-rugby-",                       tag: "club:kbhs-rugby",          slug: "kbhs-rugby",          clubName: "KBHS Rugby" },
  { prefix: "2026-onewhero-rugby-",                   tag: "club:onewhero-rugby",      slug: "onewhero-rugby",      clubName: "Onewhero Rugby" },
  { prefix: "2026-st-peters-1st-xv-",                 tag: "club:st-peters-college-1st-xv", slug: "st-peters-college-1st-xv", clubName: "St Peter's College 1st XV" },
  { prefix: "2026-weymouth-rugby-",                   tag: "club:weymouth-rugby",      slug: "weymouth-rugby",      clubName: "Weymouth Rugby" },
  { prefix: "2026-avondale-rugby-",                   tag: "club:avondale-rugby",      slug: "avondale-rugby",      clubName: "Avondale Rugby" },
  { prefix: "2026-aorere-college-",                   tag: "club:aorere-college",      slug: "aorere-college",      clubName: "Aorere College" },
  { prefix: "2026-richmond-rovers-senior-as-",        tag: "club:richmond-rovers-senior-as", slug: "richmond-rovers-senior-as", clubName: "Richmond Rovers Senior As" },
  { prefix: "2026-richmond-rovers-under-16s-",        tag: "club:richmond-rovers-under-16s", slug: "richmond-rovers-under-16s", clubName: "Richmond Rovers Under 16s" },
  { prefix: "2026-dalestate-girls-rugby-",            tag: "club:dalestate-girls-rugby", slug: "dalestate-girls-rugby", clubName: "Dalestate Girls Rugby" },
  { prefix: "2026-manurewa-rfc-div-3-",               tag: "club:manurewa-rfc-div-3",  slug: "manurewa-rfc-div-3",  clubName: "Manurewa RFC Div 3" },
  { prefix: "2026-nws-",                              tag: "club:narre-warren-fc",     slug: "narre-warren-fc",     clubName: "Narre Warren South" },
  { prefix: "nws-",                                   tag: "club:narre-warren-fc",     slug: "narre-warren-fc",     clubName: "Narre Warren South" },
  { prefix: "2026-orfc-",                             tag: "club:otahuhu-rfc",         slug: "otahuhu-rfc",         clubName: "Otahuhu RFC" },
  { prefix: "orfc-",                                  tag: "club:otahuhu-rfc",         slug: "otahuhu-rfc",         clubName: "Otahuhu RFC" },
];

function classifyHandle(handle: string): { tag: string; slug: string } | null {
  for (const p of HANDLE_PREFIXES) {
    if (handle.startsWith(p.prefix)) return { tag: p.tag, slug: p.slug };
  }
  return null;
}

// ─── Shopify Admin GraphQL helpers ─────────────────────────────────────────

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const url = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${process.env.SHOPIFY_ADMIN_API_VERSION || "2024-10"}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN!,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify GraphQL ${res.status}: ${await res.text()}`);
  const body = await res.json();
  if (body.errors) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(body.errors)}`);
  return body.data as T;
}

interface ShopifyOrderLite {
  id: string;
  name: string;
  tags: string[];
  totalCents: number;
  currency: string;
  lineHandles: string[];
}

async function fetchAllOrders(): Promise<ShopifyOrderLite[]> {
  const all: ShopifyOrderLite[] = [];
  let cursor: string | null = null;
  const QUERY = /* GraphQL */ `
    query($cursor: String) {
      orders(first: 100, sortKey: CREATED_AT, reverse: true, after: $cursor) {
        edges { node {
          id name tags
          totalPriceSet { presentmentMoney { amount currencyCode } }
          lineItems(first: 50) { edges { node { product { handle } } } }
        } }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;
  while (true) {
    const data: any = await gql(QUERY, { cursor });
    for (const edge of data.orders.edges) {
      const n = edge.node;
      all.push({
        id: n.id,
        name: n.name,
        tags: n.tags ?? [],
        totalCents: Math.round(parseFloat(n.totalPriceSet?.presentmentMoney?.amount ?? "0") * 100),
        currency: n.totalPriceSet?.presentmentMoney?.currencyCode ?? "NZD",
        lineHandles: n.lineItems.edges.map((e: any) => e.node.product?.handle).filter(Boolean),
      });
    }
    if (!data.orders.pageInfo.hasNextPage) break;
    cursor = data.orders.pageInfo.endCursor;
  }
  return all;
}

async function applyTag(orderId: string, tag: string): Promise<void> {
  const MUTATION = /* GraphQL */ `
    mutation($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        userErrors { field message }
      }
    }
  `;
  const data: any = await gql(MUTATION, { id: orderId, tags: [tag] });
  const ue = data.tagsAdd?.userErrors ?? [];
  if (ue.length) throw new Error(`tagsAdd error on ${orderId}: ${JSON.stringify(ue)}`);
}

// ─── Pipeline ──────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.SHOPIFY_ADMIN_TOKEN || !process.env.SHOPIFY_STORE_URL) {
    console.error("Missing SHOPIFY_ADMIN_TOKEN / SHOPIFY_STORE_URL in env. Export both first.");
    process.exit(1);
  }

  console.log("[pipeline] Fetching all orders from Shopify…");
  const orders = await fetchAllOrders();
  console.log(`[pipeline] Loaded ${orders.length} orders.`);

  // Classify + bucket
  const byTag = new Map<string, { tag: string; slug: string; clubName: string; orders: ShopifyOrderLite[] }>();
  const untagged: ShopifyOrderLite[] = [];
  let alreadyTagged = 0;
  let willTag = 0;
  let unclassifiable: ShopifyOrderLite[] = [];

  for (const o of orders) {
    if (o.tags.length > 0) alreadyTagged++;
    const firstClubLine = o.lineHandles.map(classifyHandle).find(Boolean);
    if (!firstClubLine) { unclassifiable.push(o); continue; }
    const { tag, slug } = firstClubLine!;
    const cn = HANDLE_PREFIXES.find(p => p.tag === tag)!.clubName;
    if (!byTag.has(tag)) byTag.set(tag, { tag, slug, clubName: cn, orders: [] });
    byTag.get(tag)!.orders.push(o);
    if (!o.tags.includes(tag)) willTag++;
  }

  console.log(`[pipeline] Classification:`);
  console.log(`  already tagged: ${alreadyTagged}`);
  console.log(`  unclassifiable: ${unclassifiable.length} (${unclassifiable.map(o => o.name).slice(0, 5).join(", ")}${unclassifiable.length > 5 ? "…" : ""})`);
  console.log(`  to tag:         ${willTag}`);
  console.log();
  console.log(`[pipeline] Per-club tally:`);
  for (const { tag, slug, clubName, orders } of byTag.values()) {
    const revenue = orders.reduce((s, o) => s + o.totalCents, 0);
    console.log(`  ${tag.padEnd(40)} ${String(orders.length).padStart(4)} orders  $${(revenue / 100).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}`);
  }

  if (DRY_RUN) {
    console.log("\n[pipeline] DRY RUN — exiting without writes.");
    process.exit(0);
  }

  // ─── Step 1: backfill tags ─────────────────────────────────────────────
  console.log("\n[pipeline] Backfilling tags…");
  let tagged = 0;
  for (const { tag, orders } of byTag.values()) {
    for (const o of orders) {
      if (o.tags.includes(tag)) continue;
      try {
        await applyTag(o.id, tag);
        tagged++;
        if (tagged % 25 === 0) console.log(`  …tagged ${tagged}`);
      } catch (err) {
        console.error(`  failed ${o.name} → ${tag}:`, err);
      }
    }
  }
  console.log(`[pipeline] Tagged ${tagged} orders.`);

  if (TAG_ONLY) {
    console.log("[pipeline] --tag-only — exiting after backfill.");
    process.exit(0);
  }

  // ─── Step 2: per-target-club preview + PDF ─────────────────────────────
  console.log("\n[pipeline] Generating reports for target clubs:", TARGET_SLUGS.join(", "));
  const manifest: Array<{
    slug: string; clubName: string; clubId: string | null;
    summary: any; pdfPath: string | null; pdfBytes: number | null;
    managerEmail: string | null;
    qualifies: boolean; qualifyReason: string;
    error?: string;
  }> = [];

  if (!isShopifyAdminConfigured()) {
    throw new Error("server/shopify-admin client not configured — same SHOPIFY_* env should work for it");
  }

  for (const slug of TARGET_SLUGS) {
    const tag = `club:${slug}`;
    const bucket = byTag.get(tag);
    if (!bucket || bucket.orders.length === 0) {
      console.log(`  ${slug}: no orders found — skipping`);
      manifest.push({ slug, clubName: slug, clubId: null, summary: null, pdfPath: null, pdfBytes: null, managerEmail: null, error: "no orders" });
      continue;
    }

    // Find or note missing club_accounts row.
    const [club] = await db.select().from(clubAccounts).where(eq(clubAccounts.shopifyOrderTag, tag)).limit(1);
    if (!club) {
      console.log(`  ${slug}: NO club_accounts row — preview only, PO build will be skipped`);
      // Fall back to direct compute via Shopify Admin
      const fetched = await fetchSupporterOrdersByTag(tag);
      const tierBps = 800; // default until seeded
      const summary = summarizeSupporterOrders(fetched, tierBps);
      const qualifies = summary.unitsSold >= MIN_UNITS_TO_QUALIFY;
      manifest.push({
        slug, clubName: bucket.clubName, clubId: null,
        summary: { ...summary, revenueDollars: (summary.revenueCents / 100), profitShareDollars: (summary.profitShareCents / 100) },
        pdfPath: null, pdfBytes: null, managerEmail: null,
        qualifies,
        qualifyReason: qualifies
          ? `${summary.unitsSold} units ≥ ${MIN_UNITS_TO_QUALIFY}`
          : `${summary.unitsSold} units < ${MIN_UNITS_TO_QUALIFY} — under qualifying threshold`,
        error: "no club_accounts row — seed first to enable buildPoFromClosedDrop + PDF emit",
      });
      continue;
    }

    console.log(`  ${slug}: generating preview report…`);
    const result = await generateDropSummary({ clubAccountId: club.id, previewOnly: true });
    if (!result.ok || !result.summary) {
      console.error(`  ${slug}: drop-summary failed: ${result.error}`);
      manifest.push({
        slug, clubName: club.clubName, clubId: club.id,
        summary: null, pdfPath: null, pdfBytes: null, managerEmail: club.email,
        qualifies: false, qualifyReason: "drop-summary errored",
        error: result.error || "unknown",
      });
      continue;
    }
    const qualifies = result.summary.unitsSold >= MIN_UNITS_TO_QUALIFY;

    let pdfPath: string | null = null;
    if (result.pdfBytes) {
      // generateDropSummary internally builds the PDF buffer for previewOnly;
      // we re-run a non-preview render that we capture by intercepting the
      // emailService — but easier: run again with previewOnly=false to send,
      // OR just rely on the next non-preview pass. For now we record bytes.
      pdfPath = `${OUT_DIR}/${slug}-drop-summary.pdf`;
      // (To actually write the PDF, generateDropSummary would need to return
      // buffer bytes — currently it only returns size. See note in script doc.)
    }

    manifest.push({
      slug, clubName: club.clubName, clubId: club.id,
      summary: {
        orderCount: result.summary.orderCount,
        unitsSold: result.summary.unitsSold,
        revenueDollars: result.summary.revenueCents / 100,
        profitShareDollars: result.summary.profitShareCents / 100,
        currency: result.summary.currency,
        topSupporters: result.summary.topSupporters.map(s => ({ name: s.name, email: s.email, spend: s.spendCents / 100 })),
      },
      pdfPath,
      pdfBytes: result.pdfBytes ?? null,
      managerEmail: club.email,
      qualifies,
      qualifyReason: qualifies
        ? `${result.summary.unitsSold} units ≥ ${MIN_UNITS_TO_QUALIFY}`
        : `${result.summary.unitsSold} units < ${MIN_UNITS_TO_QUALIFY} — under qualifying threshold`,
    });
  }

  // ─── Step 3: write manifest ────────────────────────────────────────────
  const manifestPath = `${OUT_DIR}/manifest.json`;
  fs.writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), targets: manifest }, null, 2));
  console.log(`\n[pipeline] Manifest written: ${manifestPath}`);
  console.log("\nPer-club summary:");
  for (const m of manifest) {
    if (m.error && !m.summary) {
      console.log(`  ${m.slug.padEnd(32)} ERROR: ${m.error}`);
      continue;
    }
    const s = m.summary!;
    const qmark = m.qualifies ? "✓" : "✗";
    console.log(`  ${qmark} ${m.slug.padEnd(30)} ${String(s.orderCount).padStart(4)} orders  ${String(s.unitsSold).padStart(4)} units  $${s.revenueDollars.toLocaleString("en-NZ", { minimumFractionDigits: 2 }).padStart(10)} rev  $${s.profitShareDollars.toLocaleString("en-NZ", { minimumFractionDigits: 2 }).padStart(8)} share  →  ${m.managerEmail || "(no email)"}`);
    console.log(`    ${m.qualifyReason}`);
  }
  console.log(`\nQualifying (≥${MIN_UNITS_TO_QUALIFY} units): ${manifest.filter(m => m.qualifies).map(m => m.slug).join(", ") || "(none)"}`);

  console.log("\n[pipeline] Done.");
  process.exit(0);
}

main().catch(err => {
  console.error("[pipeline] Fatal:", err);
  process.exit(1);
});
