// 6-SKU template enforcer.
//
// Audit a Sideline NZ supporter collection against the 6-SKU template.
// Identifies missing tiers, especially the hoodie anchor (without which
// AOV collapses), and produces fill-the-gap recommendations + a
// manager-facing note.
//
// Safe: read-only.
//
// Usage:
//   npx tsx scripts/sku-template-check.ts --handle 2026-onewhero-rugby-supporters-merch-range
//   npx tsx scripts/sku-template-check.ts --handle <handle> --save ~/Desktop/audit.json

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getProvider } from "../server/ai/providers/select";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORE_DOMAIN = process.env.SHOPIFY_STORE_URL || "";
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || "";
const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || "2024-10";

function parseArgs() {
  const argv = process.argv.slice(2);
  let handle: string | undefined; let savePath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--handle") handle = argv[++i];
    else if (argv[i] === "--save") savePath = argv[++i];
  }
  if (!handle) { console.error("Usage: sku-template-check.ts --handle <collection-handle> [--save <path>]"); process.exit(1); }
  return { handle, savePath };
}

function loadSkill(name: string): string {
  const skillsDir = path.join(__dirname, "..", "server", "ai", "skills");
  const body = fs.readFileSync(path.join(skillsDir, `${name}.md`), "utf8");
  return body.replace(/^---\n[\s\S]*?\n---\n/, "");
}

async function adminFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (!STORE_DOMAIN || !ADMIN_TOKEN) throw new Error("Shopify Admin not configured.");
  const res = await fetch(`https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": ADMIN_TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify Admin HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json: any = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e: any) => e.message).join("; "));
  return json.data as T;
}

const Q = /* GraphQL */ `
  query Collection($handle: String!) {
    collections(first: 1, query: $handle) {
      nodes {
        id title handle productsCount { count }
        products(first: 30) {
          nodes {
            title handle productType
            priceRangeV2 { minVariantPrice { amount currencyCode } }
          }
        }
      }
    }
  }
`;

const SCHEMA = {
  type: "object",
  properties: {
    detected_tiers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tier: { type: "string" },
          product_title: { type: "string" },
          fit_confidence: { type: "string" },
        },
        required: ["tier", "product_title", "fit_confidence"],
      },
    },
    missing_tiers: { type: "array", items: { type: "string" } },
    severity: { type: "string" },
    recommended_actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          missing_tier: { type: "string" },
          suggested_product: { type: "string" },
          design_brief: { type: "string" },
        },
        required: ["missing_tier", "suggested_product", "design_brief"],
      },
    },
    manager_note: { type: "string" },
    reasoning: { type: "string" },
  },
  required: ["detected_tiers", "missing_tiers", "severity", "recommended_actions", "manager_note", "reasoning"],
} as const;

async function main() {
  const args = parseArgs();
  console.log(`[sku-template-check] Fetching collection ${args.handle}...`);
  const data: any = await adminFetch(Q, { handle: `handle:${args.handle}` });
  const node = data?.collections?.nodes?.[0];
  if (!node) throw new Error(`No collection found for handle=${args.handle}`);

  const productLines = node.products.nodes.map(
    (p: any) =>
      `  - ${p.title}${p.productType ? ` [${p.productType}]` : ""} — from $${Number(p.priceRangeV2?.minVariantPrice?.amount || 0).toFixed(0)} ${p.priceRangeV2?.minVariantPrice?.currencyCode || "NZD"}`,
  );

  const user = [
    `Collection: ${node.title}`,
    `Handle: ${node.handle}`,
    `Total products: ${node.productsCount?.count ?? node.products.nodes.length}`,
    "",
    "Products in this collection:",
    ...productLines,
    "",
    "Audit against the 6-SKU template. Return strict JSON only.",
  ].join("\n");

  const provider = getProvider();
  console.log(`[sku-template-check] ${node.products.nodes.length} products. Calling ${provider.name}...\n`);
  const res = await provider.complete({
    system: loadSkill("sku-template-check"),
    user,
    jsonSchema: SCHEMA as any,
    temperature: 0.2,
    maxOutputTokens: 1500,
  });

  let pack: any;
  try { pack = JSON.parse(res.text); } catch { console.error("[sku-template-check] ✕ Non-JSON:\n"); console.error(res.text); process.exit(1); }

  const hr = "━".repeat(72); const sub = "─".repeat(72);
  const sevColor = pack.severity === "anchor-missing" ? "🔴" : pack.severity === "thin" ? "🟡" : "🟢";
  console.log("\n" + hr);
  console.log(`6-SKU TEMPLATE CHECK — ${node.title}`);
  console.log(`Severity: ${sevColor} ${pack.severity.toUpperCase()}`);
  console.log(hr);

  console.log("\n[ DETECTED TIERS ]");
  for (const t of pack.detected_tiers) {
    console.log(`  ✓ ${t.tier.padEnd(14)} — ${t.product_title}  (${t.fit_confidence})`);
  }
  if (pack.missing_tiers.length) {
    console.log("\n[ MISSING TIERS ]");
    for (const m of pack.missing_tiers) console.log(`  ✕ ${m}`);
  }
  if (pack.recommended_actions.length) {
    console.log("\n[ RECOMMENDED ACTIONS ]");
    for (const a of pack.recommended_actions) {
      console.log(`  • Add ${a.suggested_product} (${a.missing_tier})`);
      console.log(`    Brief: ${a.design_brief}`);
    }
  }
  console.log("\n[ MANAGER NOTE ]");
  console.log(sub); console.log(pack.manager_note); console.log(sub);
  console.log("\nAI reasoning: " + pack.reasoning);
  console.log(hr + "\n");

  if (args.savePath) {
    const expanded = args.savePath.replace(/^~/, process.env.HOME || "~");
    fs.writeFileSync(expanded, JSON.stringify(pack, null, 2));
    console.log(`[sku-template-check] Saved JSON to ${expanded}`);
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error("[sku-template-check] fatal:", err?.message || err); process.exit(1); });
