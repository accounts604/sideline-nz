// Shopify Admin GraphQL client.
//
// Tag filtering: Admin GraphQL `orders(query: "tag:club:onewhero-rfc")` is more
// reliable than the REST `?tag=` param (REST does substring-ish matching that
// can leak between similarly-named tags — exactly what this portal must NOT do).
//
// Auth scope required on the Admin token: `read_orders` (and `read_all_orders`
// if you need orders older than 60 days — gated by Shopify, requires Plus or
// app review).

const STORE_DOMAIN = process.env.SHOPIFY_STORE_URL || process.env.VITE_SHOPIFY_STORE_URL || "";
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || "";
const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || "2024-10";

export function isShopifyAdminConfigured(): boolean {
  return Boolean(STORE_DOMAIN && ADMIN_TOKEN);
}

interface AdminGraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function adminFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (!isShopifyAdminConfigured()) {
    throw new Error("Shopify Admin API not configured. Set SHOPIFY_STORE_URL + SHOPIFY_ADMIN_TOKEN.");
  }
  const endpoint = `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Shopify Admin HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as AdminGraphQLResponse<T>;
  if (json.errors && json.errors.length) {
    throw new Error("Shopify Admin GraphQL: " + json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) throw new Error("Shopify Admin returned no data");
  return json.data;
}

export interface SupporterOrderLine {
  title: string;
  variantTitle: string | null;
  quantity: number;
  unitPriceCents: number;
}

export interface SupporterOrder {
  id: string; // gid://shopify/Order/123
  number: string; // "#1042"
  name: string; // "#1042" or store-prefixed
  customerName: string | null;
  customerEmail: string | null;
  totalCents: number;
  currency: string;
  financialStatus: string | null; // "PAID", "PENDING", etc.
  fulfillmentStatus: string | null; // "FULFILLED", "UNFULFILLED", etc.
  createdAt: string; // ISO
  lines: SupporterOrderLine[];
  tags: string[];
}

interface OrdersByTagGQL {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{
      id: string;
      name: string;
      createdAt: string;
      displayFinancialStatus: string | null;
      displayFulfillmentStatus: string | null;
      tags: string[];
      currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
      customer: { firstName: string | null; lastName: string | null; email: string | null } | null;
      lineItems: {
        nodes: Array<{
          title: string;
          variantTitle: string | null;
          quantity: number;
          originalUnitPriceSet: { shopMoney: { amount: string } };
        }>;
      };
    }>;
  };
}

const ORDERS_BY_TAG_QUERY = /* GraphQL */ `
  query OrdersByTag($query: String!, $first: Int!, $after: String) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        displayFinancialStatus
        displayFulfillmentStatus
        tags
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        customer { firstName lastName email }
        lineItems(first: 50) {
          nodes {
            title
            variantTitle
            quantity
            originalUnitPriceSet { shopMoney { amount } }
          }
        }
      }
    }
  }
`;

function moneyToCents(amount: string): number {
  // Shopify amounts are decimal strings, e.g. "49.95"
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

interface CacheEntry {
  expires: number;
  orders: SupporterOrder[];
}

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

export function invalidateSupporterOrdersCache(tag?: string) {
  if (tag) cache.delete(tag);
  else cache.clear();
}

/**
 * Fetch all orders carrying the given Shopify tag. Paginates through results.
 * Cached per-tag for 5 minutes to avoid burning the Admin API rate budget.
 *
 * IMPORTANT: callers must pass the tag from the trusted server-side club record.
 * Never accept a tag from the client.
 */
export async function fetchSupporterOrdersByTag(tag: string): Promise<SupporterOrder[]> {
  if (!tag) return [];
  const cached = cache.get(tag);
  if (cached && cached.expires > Date.now()) {
    return cached.orders;
  }

  // Quote the tag so colons/hyphens are treated literally.
  const queryString = `tag:"${tag.replace(/"/g, "")}"`;

  const orders: SupporterOrder[] = [];
  let after: string | null = null;
  // Hard cap on pages so a misconfigured tag can't loop forever.
  for (let page = 0; page < 20; page++) {
    const data: OrdersByTagGQL = await adminFetch<OrdersByTagGQL>(ORDERS_BY_TAG_QUERY, {
      query: queryString,
      first: 100,
      after,
    });
    for (const node of data.orders.nodes) {
      // Belt-and-braces: only keep orders that actually carry the tag we asked for.
      if (!node.tags.includes(tag)) continue;
      const customerName = node.customer
        ? [node.customer.firstName, node.customer.lastName].filter(Boolean).join(" ") || null
        : null;
      orders.push({
        id: node.id,
        number: node.name,
        name: node.name,
        customerName,
        customerEmail: node.customer?.email || null,
        totalCents: moneyToCents(node.currentTotalPriceSet.shopMoney.amount),
        currency: node.currentTotalPriceSet.shopMoney.currencyCode,
        financialStatus: node.displayFinancialStatus,
        fulfillmentStatus: node.displayFulfillmentStatus,
        createdAt: node.createdAt,
        tags: node.tags,
        lines: node.lineItems.nodes.map((l) => ({
          title: l.title,
          variantTitle: l.variantTitle,
          quantity: l.quantity,
          unitPriceCents: moneyToCents(l.originalUnitPriceSet.shopMoney.amount),
        })),
      });
    }
    if (!data.orders.pageInfo.hasNextPage) break;
    after = data.orders.pageInfo.endCursor;
  }

  cache.set(tag, { expires: Date.now() + TTL_MS, orders });
  return orders;
}

export interface SupporterOrderSummary {
  orderCount: number;
  unitsSold: number;
  revenueCents: number;
  currency: string;
  profitShareCents: number; // revenue * tierBps / 10000
  topSupporters: Array<{ name: string; email: string | null; spendCents: number }>;
}

export function summarizeSupporterOrders(
  orders: SupporterOrder[],
  profitShareTierBps: number,
): SupporterOrderSummary {
  let revenueCents = 0;
  let unitsSold = 0;
  const currency = orders[0]?.currency || "NZD";
  const bySupporter = new Map<string, { name: string; email: string | null; spendCents: number }>();

  for (const o of orders) {
    revenueCents += o.totalCents;
    for (const l of o.lines) unitsSold += l.quantity;
    const key = (o.customerEmail || o.customerName || o.id).toLowerCase();
    const prev = bySupporter.get(key);
    const name = o.customerName || o.customerEmail || "Anonymous";
    if (prev) {
      prev.spendCents += o.totalCents;
    } else {
      bySupporter.set(key, { name, email: o.customerEmail, spendCents: o.totalCents });
    }
  }

  const topSupporters = Array.from(bySupporter.values())
    .sort((a, b) => b.spendCents - a.spendCents)
    .slice(0, 5);

  return {
    orderCount: orders.length,
    unitsSold,
    revenueCents,
    currency,
    profitShareCents: Math.round((revenueCents * profitShareTierBps) / 10000),
    topSupporters,
  };
}

// ─── Collections ─────────────────────────────────────────────────
//
// Used by the closed-drop PO build pipeline. The poll-supporter-collections
// cron calls fetchCollectionStatus on every club's supporterCollectionHandle
// every 10 min — when we see a published→unpublished transition, it fires the
// build endpoint.
//
// Shopify model: "publishedOnCurrentPublication" reflects the Online Store
// publication. A collection unpublished from Online Store will report false.
// We deliberately don't use `status` (collections don't have one — that's
// products); publication is the right signal.

export interface CollectionStatus {
  id: string; // gid://shopify/Collection/123
  handle: string;
  title: string;
  publishedOnOnlineStore: boolean;
  productCount: number;
}

const COLLECTION_BY_HANDLE_QUERY = /* GraphQL */ `
  query CollectionByHandle($handle: String!) {
    collectionByHandle(handle: $handle) {
      id
      handle
      title
      publishedOnCurrentPublication
      productsCount { count }
    }
  }
`;

export async function fetchCollectionStatus(handle: string): Promise<CollectionStatus | null> {
  if (!handle) return null;
  const data = await adminFetch<{ collectionByHandle: any | null }>(
    COLLECTION_BY_HANDLE_QUERY,
    { handle },
  );
  const c = data.collectionByHandle;
  if (!c) return null;
  return {
    id: c.id,
    handle: c.handle,
    title: c.title,
    publishedOnOnlineStore: Boolean(c.publishedOnCurrentPublication),
    productCount: Number(c.productsCount?.count || 0),
  };
}

// ─── Products ────────────────────────────────────────────────────
//
// Used by the closed-drop builder to grab the product image (first image
// uploaded to the Shopify product — typically the branded mockup) so the PO
// shows the right artwork next to each line item.

export interface ShopifyProductLite {
  id: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  variantTitles: string[];
}

const PRODUCTS_IN_COLLECTION_QUERY = /* GraphQL */ `
  query ProductsInCollection($handle: String!, $first: Int!) {
    collectionByHandle(handle: $handle) {
      products(first: $first) {
        nodes {
          id
          title
          handle
          featuredImage { url }
          variants(first: 100) { nodes { title } }
        }
      }
    }
  }
`;

export async function fetchProductsInCollection(handle: string): Promise<ShopifyProductLite[]> {
  if (!handle) return [];
  const data = await adminFetch<{ collectionByHandle: { products: { nodes: any[] } } | null }>(
    PRODUCTS_IN_COLLECTION_QUERY,
    { handle, first: 50 },
  );
  const nodes = data.collectionByHandle?.products.nodes || [];
  return nodes.map((p) => ({
    id: p.id,
    title: p.title,
    handle: p.handle,
    imageUrl: p.featuredImage?.url || null,
    variantTitles: (p.variants?.nodes || []).map((v: any) => v.title),
  }));
}

export function filterByDateRange(orders: SupporterOrder[], from?: string, to?: string): SupporterOrder[] {
  if (!from && !to) return orders;
  const fromMs = from ? Date.parse(from) : -Infinity;
  // Treat `to` as inclusive end-of-day if no time component supplied.
  let toMs = to ? Date.parse(to) : Infinity;
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) toMs += 24 * 60 * 60 * 1000 - 1;
  return orders.filter((o) => {
    const t = Date.parse(o.createdAt);
    return t >= fromMs && t <= toMs;
  });
}
