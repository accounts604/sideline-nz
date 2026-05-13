/**
 * Smoke + security test for the supporter-orders pipeline.
 *
 * Verifies the parts you can't safely defer to a live Shopify call:
 *   1. Tag isolation — orders with a different tag are rejected even if
 *      Shopify returns them. This is the security boundary.
 *   2. Summary math — units, revenue, profit share basis points.
 *   3. Date range filter inclusivity.
 *   4. Cache TTL — repeated calls within 5 min hit the cache, not Shopify.
 *
 * After this passes, do the manual live test:
 *   $ npx tsx scripts/seed-club-manager.ts --email me@test.local --club "Test FC" --tag club:test-fc
 *   $ open http://localhost:5001/club-portal/login   # login with the printed password
 *   $ open http://localhost:5001/club-portal/supporter-dashboard
 *   $ curl -X POST http://localhost:5001/api/admin/reports/club-drop-summary \
 *       -H "Content-Type: application/json" \
 *       -b "snz_token=<admin-jwt>" \
 *       -d '{"clubAccountId":"<id>","previewOnly":true}'
 *
 * Run:
 *   node scripts/test-supporter-flow.mjs
 */
import { strict as assert } from "node:assert";

// ESM dynamic import after we patch global fetch.
let fetchCalls = 0;
const fakeOrdersByTag = new Map();

globalThis.fetch = async (url, init) => {
  fetchCalls++;
  if (!String(url).includes("/admin/api/")) {
    throw new Error(`Unexpected fetch URL in test: ${url}`);
  }
  const body = JSON.parse(init.body);
  // body.query.query is the Shopify search string e.g. `tag:"club:test-fc"`
  const m = /tag:"([^"]+)"/.exec(body.variables.query);
  const tag = m?.[1] || "";

  // Mixed bag — return orders for the requested tag PLUS one with a different tag,
  // so we can verify the client-side belt-and-braces filter actually drops it.
  const ours = (fakeOrdersByTag.get(tag) || []).map((o, i) => ({
    id: `gid://shopify/Order/${tag}-${i}`,
    name: `#${1000 + i}`,
    createdAt: o.createdAt,
    displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "FULFILLED",
    tags: [tag],
    currentTotalPriceSet: { shopMoney: { amount: o.total.toFixed(2), currencyCode: "NZD" } },
    customer: { firstName: o.first, lastName: o.last, email: o.email },
    lineItems: { nodes: o.lines.map((l) => ({
      title: l.title,
      quantity: l.qty,
      originalUnitPriceSet: { shopMoney: { amount: l.unit.toFixed(2) } },
    })) },
  }));
  // Poisoned order — different tag, should be filtered out.
  const poison = {
    id: "gid://shopify/Order/poison-1",
    name: "#9999",
    createdAt: "2026-04-01T00:00:00Z",
    displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "FULFILLED",
    tags: ["club:other-club"],
    currentTotalPriceSet: { shopMoney: { amount: "99999.00", currencyCode: "NZD" } },
    customer: { firstName: "Mal", lastName: "Icious", email: "leak@evil.test" },
    lineItems: { nodes: [{ title: "leak", quantity: 1, originalUnitPriceSet: { shopMoney: { amount: "99999.00" } } }] },
  };
  return new Response(JSON.stringify({
    data: { orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [...ours, poison] } },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};

// Required env so isShopifyAdminConfigured() returns true.
process.env.SHOPIFY_STORE_URL = "test-shop.myshopify.com";
process.env.SHOPIFY_ADMIN_TOKEN = "test-token";

const {
  fetchSupporterOrdersByTag,
  filterByDateRange,
  summarizeSupporterOrders,
  invalidateSupporterOrdersCache,
} = await import("../server/shopify-admin.ts");

// --- Setup fixture data ---
fakeOrdersByTag.set("club:test-fc", [
  { createdAt: "2026-04-10T10:00:00Z", total: 49.95, first: "Alice", last: "A", email: "alice@test.local",
    lines: [{ title: "Supporter Tee — Navy", qty: 1, unit: 49.95 }] },
  { createdAt: "2026-04-12T10:00:00Z", total: 119.90, first: "Bob", last: "B", email: "bob@test.local",
    lines: [{ title: "Supporter Polo", qty: 2, unit: 59.95 }] },
  { createdAt: "2026-04-20T10:00:00Z", total: 199.90, first: "Alice", last: "A", email: "alice@test.local",
    lines: [{ title: "Supporter Hat", qty: 5, unit: 39.98 }] },
]);

// --- 1: tag isolation ---
const orders = await fetchSupporterOrdersByTag("club:test-fc");
assert.equal(orders.length, 3, "expected exactly the 3 fixture orders, poison filtered");
assert.ok(orders.every((o) => o.tags.includes("club:test-fc")), "every returned order must carry the requested tag");
assert.ok(!orders.some((o) => o.id.includes("poison")), "poison order must not leak through");
console.log("✓ tag isolation");

// --- 2: summary math (8% tier) ---
const summary = summarizeSupporterOrders(orders, 800);
assert.equal(summary.orderCount, 3);
assert.equal(summary.unitsSold, 1 + 2 + 5);
assert.equal(summary.revenueCents, Math.round((49.95 + 119.90 + 199.90) * 100));
assert.equal(summary.profitShareCents, Math.round(summary.revenueCents * 800 / 10000));
assert.equal(summary.currency, "NZD");
assert.equal(summary.topSupporters[0].name, "Alice A", "Alice spent more, should be #1");
assert.equal(summary.topSupporters[0].spendCents, Math.round((49.95 + 199.90) * 100));
console.log("✓ summary math");

// --- 3: date range filter (inclusive) ---
const onlyMid = filterByDateRange(orders, "2026-04-12", "2026-04-12");
assert.equal(onlyMid.length, 1, "single-day range should match the one order on that date");
const fromOnly = filterByDateRange(orders, "2026-04-15");
assert.equal(fromOnly.length, 1);
const toOnly = filterByDateRange(orders, undefined, "2026-04-11");
assert.equal(toOnly.length, 1);
console.log("✓ date range filter");

// --- 4: cache TTL ---
const fetchesBefore = fetchCalls;
await fetchSupporterOrdersByTag("club:test-fc");
await fetchSupporterOrdersByTag("club:test-fc");
assert.equal(fetchCalls, fetchesBefore, "repeated calls within TTL must not re-fetch");
invalidateSupporterOrdersCache("club:test-fc");
await fetchSupporterOrdersByTag("club:test-fc");
assert.ok(fetchCalls > fetchesBefore, "after invalidation, next call must re-fetch");
console.log("✓ cache + invalidation");

console.log("\nAll supporter-flow tests passed.");
