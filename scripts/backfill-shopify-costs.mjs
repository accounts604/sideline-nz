#!/usr/bin/env node
// Backfill Shopify `inventoryItem.cost` for every variant using Puffin 2025
// tier1 USD pricing. DRY RUN by default — pass --live to push updates.
//
// Formula: (puffin_usd × 1.72) + $2 overhead → NZD ex-GST
// Mirror of shared/product-catalog.ts getShopifyCost() logic.
//
// Usage:
//   node scripts/backfill-shopify-costs.mjs          # dry run
//   node scripts/backfill-shopify-costs.mjs --live   # actually push

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CONFIG_PATH = path.join(os.homedir(), ".openclaw/credentials/shopify/config.json");
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const STORE = config.store;
const TOKEN = config.admin_api_token;
const API_VERSION = config.api_version || "2024-10";

if (!STORE || !TOKEN) {
  console.error("Missing Shopify config in", CONFIG_PATH);
  process.exit(1);
}

const LIVE = process.argv.includes("--live");

// ── Type keywords — mirror of collection-autopilot.js TYPE_KEYWORDS ────
const TYPE_KEYWORDS = {
  cap:        ["5 panel cap", "cap"],
  bucket:     ["bucket"],
  tee:        ["dri fit tee", "tee", "club tee"],
  jacket:     ["shell jacket", "jacket"],
  polo:       ["polo", "long sleeve polo"],
  beanie:     ["beanie", "pompom"],
  singlet:    ["singlet", "basketball singlet"],
  hoodie:     ["hoodie", "hoody"],
  trackpants: ["trackpants", "track pants", "trackies"],
  scarf:      ["scarf"],
  shorts:     ["shorts"],
  socks:      ["socks"],
};

// Check longer/specific keywords first to avoid "cap" matching "capital" etc.
const TYPE_ORDER = ["bucket", "trackpants", "jacket", "hoodie", "polo", "beanie", "singlet", "tee", "shorts", "cap", "socks", "scarf"];

function getType(name) {
  const nl = String(name || "").toLowerCase();
  for (const t of TYPE_ORDER) {
    if (TYPE_KEYWORDS[t].some((kw) => nl.includes(kw))) return t;
  }
  return null;
}

// Mirror of shared/product-catalog.ts PUFFIN_COSTS_USD_TIER1 for Supporters Range types
const COST_BY_TYPE_USD = {
  bucket:     11.50,
  cap:         8.00,
  beanie:     10.00,
  tee:        12.00,
  polo:       13.20,
  jacket:     19.50,
  singlet:    10.00,
  hoodie:     18.00,
  shorts:     10.50,
  socks:      10.00,
  scarf:      null, // no Puffin SKU
  trackpants: 17.00,
};
const PUFFIN_USD_TO_NZD = 1.72;
const OVERHEAD_PER_UNIT_NZD = 2.00;

function getShopifyCostNZD(name) {
  const t = getType(name);
  if (!t) return null;
  const usd = COST_BY_TYPE_USD[t];
  if (usd == null) return null;
  return (usd * PUFFIN_USD_TO_NZD + OVERHEAD_PER_UNIT_NZD).toFixed(2);
}

async function admin(query, variables) {
  const res = await fetch(`https://${STORE}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  if (json.errors) throw new Error("GraphQL: " + json.errors.map((e) => e.message).join("; "));
  return json.data;
}

async function* listAllVariants() {
  let cursor = null;
  while (true) {
    const data = await admin(
      `query($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id title
            variants(first: 100) {
              nodes { id title sku inventoryItem { id unitCost { amount } } }
            }
          }
        }
      }`,
      { cursor }
    );
    for (const p of data.products.nodes) {
      for (const v of p.variants.nodes) yield { product: p, variant: v };
    }
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
}

// ── Main ───────────────────────────────────────────────────────────
const plan = [];
const skip = { noType: new Map(), alreadyCorrect: 0 };

for await (const { product, variant } of listAllVariants()) {
  const cost = getShopifyCostNZD(product.title);
  const existing = variant.inventoryItem?.unitCost?.amount;
  if (cost == null) {
    skip.noType.set(product.title, (skip.noType.get(product.title) || 0) + 1);
    continue;
  }
  if (existing && Number(existing).toFixed(2) === cost) {
    skip.alreadyCorrect++;
    continue;
  }
  plan.push({
    productTitle: product.title,
    variantTitle: variant.title,
    sku: variant.sku,
    fromCost: existing || "(none)",
    toCost: cost,
    inventoryItemId: variant.inventoryItem.id,
  });
}

console.log("\n" + (LIVE ? "── LIVE RUN ──" : "── DRY RUN ── (use --live to push)"));
console.log(`Planned updates:  ${plan.length}`);
console.log(`Already correct:  ${skip.alreadyCorrect}`);
console.log(`No cost mapping:  ${[...skip.noType.values()].reduce((a, b) => a + b, 0)} variants across ${skip.noType.size} products`);

if (skip.noType.size && skip.noType.size <= 40) {
  console.log("\nUnmapped products (no cost will be set):");
  for (const [title, count] of skip.noType) console.log(`  ${title} (${count} variants)`);
}

if (plan.length) {
  console.log(`\nFirst ${Math.min(30, plan.length)} planned changes:`);
  for (const u of plan.slice(0, 30)) {
    console.log(`  ${(u.sku || "(no-sku)").padEnd(24)} ${String(u.fromCost).padStart(7)} → $${u.toCost}   [${u.productTitle} / ${u.variantTitle}]`);
  }
}

if (!LIVE) {
  console.log("\nDry run complete. Rerun with --live to push.");
  process.exit(0);
}
if (!plan.length) {
  console.log("\nNothing to update.");
  process.exit(0);
}

// ── LIVE PUSH ──────────────────────────────────────────────────────
console.log(`\nPushing ${plan.length} cost updates...`);
let ok = 0, failed = 0;
for (const u of plan) {
  try {
    const data = await admin(
      `mutation($id: ID!, $input: InventoryItemInput!) {
        inventoryItemUpdate(id: $id, input: $input) {
          inventoryItem { id unitCost { amount } }
          userErrors { field message }
        }
      }`,
      { id: u.inventoryItemId, input: { cost: u.toCost } }
    );
    const errs = data.inventoryItemUpdate?.userErrors || [];
    if (errs.length) {
      console.log(`  FAIL ${u.sku}: ${errs.map((e) => e.message).join("; ")}`);
      failed++;
    } else {
      ok++;
      if (ok % 25 === 0) console.log(`  ${ok}/${plan.length} done`);
    }
  } catch (e) {
    console.log(`  FAIL ${u.sku}: ${e.message}`);
    failed++;
  }
}
console.log(`\nDone. OK: ${ok}, Failed: ${failed}`);
