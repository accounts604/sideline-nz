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

// ─── Customer-context lookup (single order by number or email) ────
//
// Used by Ezra's customer-reply context loop. A customer email arrives
// asking "where's order #1042" — Ezra needs the Shopify-side view (fulfillment
// status, tracking, lines, shipping address) to answer. The tag-based
// fetcher above is for bulk club-portal reads; this one targets a single
// order by name (`#1042`) or by customer email (returns most-recent first).

export interface ShopifyOrderDetail extends SupporterOrder {
  trackingNumbers: string[];
  trackingUrls: string[];
  fulfillments: Array<{
    status: string | null;
    trackingNumbers: string[];
    trackingUrls: string[];
    createdAt: string;
  }>;
  shippingAddress: {
    name: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    country: string | null;
  } | null;
  note: string | null;
}

const ORDER_DETAIL_QUERY = /* GraphQL */ `
  query OrderSearch($query: String!, $first: Int!) {
    orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id name createdAt tags note
        displayFinancialStatus displayFulfillmentStatus
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        customer { firstName lastName email }
        shippingAddress {
          name address1 address2 city province zip country
        }
        lineItems(first: 50) {
          nodes {
            title variantTitle quantity
            originalUnitPriceSet { shopMoney { amount } }
          }
        }
        fulfillments(first: 10) {
          status createdAt
          trackingInfo { number url }
        }
      }
    }
  }
`;

function nodeToOrderDetail(n: any): ShopifyOrderDetail {
  const customerName = n.customer
    ? [n.customer.firstName, n.customer.lastName].filter(Boolean).join(" ") || null
    : null;
  const fulfillments = (n.fulfillments || []).map((f: any) => ({
    status: f.status || null,
    trackingNumbers: (f.trackingInfo || []).map((t: any) => t.number).filter(Boolean),
    trackingUrls: (f.trackingInfo || []).map((t: any) => t.url).filter(Boolean),
    createdAt: f.createdAt,
  }));
  const trackingNumbers = Array.from(new Set(fulfillments.flatMap((f: any) => f.trackingNumbers))) as string[];
  const trackingUrls = Array.from(new Set(fulfillments.flatMap((f: any) => f.trackingUrls))) as string[];
  return {
    id: n.id,
    number: n.name,
    name: n.name,
    customerName,
    customerEmail: n.customer?.email || null,
    totalCents: moneyToCents(n.currentTotalPriceSet.shopMoney.amount),
    currency: n.currentTotalPriceSet.shopMoney.currencyCode,
    financialStatus: n.displayFinancialStatus,
    fulfillmentStatus: n.displayFulfillmentStatus,
    createdAt: n.createdAt,
    tags: n.tags || [],
    lines: (n.lineItems?.nodes || []).map((l: any) => ({
      title: l.title,
      variantTitle: l.variantTitle,
      quantity: l.quantity,
      unitPriceCents: moneyToCents(l.originalUnitPriceSet.shopMoney.amount),
    })),
    trackingNumbers,
    trackingUrls,
    fulfillments,
    shippingAddress: n.shippingAddress
      ? {
          name: n.shippingAddress.name || null,
          address1: n.shippingAddress.address1 || null,
          address2: n.shippingAddress.address2 || null,
          city: n.shippingAddress.city || null,
          province: n.shippingAddress.province || null,
          zip: n.shippingAddress.zip || null,
          country: n.shippingAddress.country || null,
        }
      : null,
    note: n.note || null,
  };
}

/**
 * Look up a Shopify order by its visible number (`#1042` or `1042`) or by
 * customer email. Returns the most recent match plus up to `extraMatches`
 * other recent orders for the same email so Ezra can disambiguate when a
 * customer has placed several.
 *
 * IMPORTANT: this is the customer-context lookup. It carries no tag filter —
 * callers must NOT use it to enforce club-portal isolation (that path stays
 * on `fetchSupporterOrdersByTag`).
 */
export async function fetchShopifyOrderByNumberOrEmail(
  needle: string,
  opts?: { extraMatches?: number },
): Promise<{ primary: ShopifyOrderDetail | null; others: ShopifyOrderDetail[] }> {
  const q = String(needle || "").trim();
  if (!q) return { primary: null, others: [] };

  let queryString: string;
  if (q.includes("@")) {
    queryString = `email:${q.replace(/"/g, "")}`;
  } else {
    const name = q.startsWith("#") ? q : `#${q.replace(/^SL[-_]?/i, "")}`;
    queryString = `name:${name}`;
  }

  const wantOthers = Math.max(0, Math.min(opts?.extraMatches ?? 5, 20));
  const data: any = await adminFetch(ORDER_DETAIL_QUERY, {
    query: queryString,
    first: 1 + wantOthers,
  });
  const nodes = data.orders?.nodes || [];
  if (nodes.length === 0) return { primary: null, others: [] };
  const [first, ...rest] = nodes;
  return {
    primary: nodeToOrderDetail(first),
    others: rest.map(nodeToOrderDetail),
  };
}

// ─── Collection-handle fallback for untagged orders ──────────────
//
// The supporter-campaign flow originally relied on Shopify Flow tagging each
// order with `club:<slug>` on creation. When that automation breaks (as we
// found on 2026-05-19: 0/157 orders tagged), `fetchSupporterOrdersByTag`
// returns empty and `buildPoFromClosedDrop` builds nothing.
//
// This helper recovers by matching orders via line-item product handles
// against the products in a given supporter collection. Slower than tag
// lookup (queries every order in a date window, then filters) but immune
// to broken Flows.

export async function fetchSupporterOrdersByCollection(
  collectionHandle: string,
  opts?: { sinceDays?: number; maxOrders?: number },
): Promise<SupporterOrder[]> {
  if (!collectionHandle) return [];

  const products = await fetchProductsInCollection(collectionHandle);
  const productHandles = new Set(products.map((p) => p.handle).filter(Boolean));
  if (productHandles.size === 0) return [];

  const sinceDays = opts?.sinceDays ?? 90;
  const maxOrders = opts?.maxOrders ?? 2000;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const QUERY = /* GraphQL */ `
    query OrdersSince($q: String!, $first: Int!, $after: String) {
      orders(first: $first, after: $after, query: $q, sortKey: CREATED_AT, reverse: true) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id name createdAt tags
          displayFinancialStatus displayFulfillmentStatus
          currentTotalPriceSet { shopMoney { amount currencyCode } }
          customer { firstName lastName email }
          lineItems(first: 50) {
            nodes {
              title variantTitle quantity
              originalUnitPriceSet { shopMoney { amount } }
              product { handle }
            }
          }
        }
      }
    }
  `;

  const matched: SupporterOrder[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20 && matched.length < maxOrders; page++) {
    const data: any = await adminFetch(QUERY, { q: `created_at:>=${since}`, first: 100, after });
    for (const n of data.orders.nodes) {
      // Only retain orders that contain ≥1 line item from this collection.
      const relevantLines = n.lineItems.nodes.filter((l: any) =>
        l.product?.handle && productHandles.has(l.product.handle),
      );
      if (relevantLines.length === 0) continue;
      const customerName = n.customer
        ? [n.customer.firstName, n.customer.lastName].filter(Boolean).join(" ") || null
        : null;
      matched.push({
        id: n.id,
        number: n.name,
        name: n.name,
        customerName,
        customerEmail: n.customer?.email || null,
        totalCents: moneyToCents(n.currentTotalPriceSet.shopMoney.amount),
        currency: n.currentTotalPriceSet.shopMoney.currencyCode,
        financialStatus: n.displayFinancialStatus,
        fulfillmentStatus: n.displayFulfillmentStatus,
        createdAt: n.createdAt,
        tags: n.tags,
        lines: relevantLines.map((l: any) => ({
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

  return matched;
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

// ─── Supporter-campaign status metafield ─────────────────────────
//
// One-source-of-truth for whether a supporter drop is live, closed, or
// upcoming. Drives the Shop by Club / Open Pre-Orders split on the
// teamstore (see spec: the storefront filters collections by this
// metafield rather than by Online Store publication, so closed drops
// stay browsable for SEO + "register interest" capture).
//
// Definitions live at namespace=supporter_campaign with keys:
//   status (single_line_text_field, choices: live|closed|upcoming)
//   closed_at (date, iso yyyy-mm-dd)
//   notify_signup_url (url, optional)

export type SupporterCampaignStatus = "live" | "closed" | "upcoming";

const SET_COLLECTION_STATUS_MUTATION = /* GraphQL */ `
  mutation SetCollectionStatus($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key value }
      userErrors { field message code }
    }
  }
`;

interface MetafieldsSetGQL {
  metafieldsSet: {
    metafields: Array<{ id: string; namespace: string; key: string; value: string }>;
    userErrors: Array<{ field: string[]; message: string; code: string | null }>;
  };
}

/**
 * Write supporter_campaign.{status,closed_at} on a collection. If status is
 * "closed" and no closedAtIso is supplied, today's date is used.
 *
 * Throws on userErrors from Shopify so callers can surface the failure.
 */
export async function setSupporterCampaignStatus(
  collectionGid: string,
  status: SupporterCampaignStatus,
  closedAtIso?: string | null,
): Promise<void> {
  if (!isShopifyAdminConfigured()) {
    throw new Error("Shopify Admin API not configured");
  }
  const metafields: Array<Record<string, string>> = [
    { ownerId: collectionGid, namespace: "supporter_campaign", key: "status", type: "single_line_text_field", value: status },
  ];
  if (status === "closed") {
    const date = closedAtIso || new Date().toISOString().slice(0, 10);
    metafields.push({ ownerId: collectionGid, namespace: "supporter_campaign", key: "closed_at", type: "date", value: date });
  }
  const data = await adminFetch<MetafieldsSetGQL>(SET_COLLECTION_STATUS_MUTATION, { metafields });
  if (data.metafieldsSet.userErrors.length) {
    throw new Error("Shopify metafieldsSet userErrors: " + JSON.stringify(data.metafieldsSet.userErrors));
  }
}

/**
 * Resolve a collection handle to its Shopify GID so callers that only know
 * the handle (e.g. from club_accounts.supporter_collection_handle) can write
 * the status without a separate lookup at the call site.
 */
export async function getCollectionGidByHandle(handle: string): Promise<string | null> {
  if (!isShopifyAdminConfigured()) return null;
  const data = await adminFetch<{ collectionByHandle: { id: string } | null }>(
    /* GraphQL */ `query($handle: String!){ collectionByHandle(handle: $handle){ id } }`,
    { handle },
  );
  return data.collectionByHandle?.id ?? null;
}

// ─── Description read/write ────────────────────────────────────────────────
//
// Used by the fundraising tally, which rewrites a sentinel-delimited block
// inside collection and product descriptions on a schedule. Read-modify-write
// is deliberate: we must preserve the surrounding marketing copy, so we never
// blind-write a description.

/** Current descriptionHtml for a collection, or null if it does not exist. */
export async function fetchCollectionDescription(collectionGid: string): Promise<string | null> {
  const data = await adminFetch<{ collection: { descriptionHtml: string } | null }>(
    /* GraphQL */ `query($id: ID!){ collection(id: $id){ descriptionHtml } }`,
    { id: collectionGid },
  );
  return data.collection?.descriptionHtml ?? null;
}

/** Current descriptionHtml for many products, by GID. */
export async function fetchProductDescriptions(
  productGids: string[],
): Promise<Array<{ id: string; descriptionHtml: string }>> {
  if (productGids.length === 0) return [];
  const data = await adminFetch<{ nodes: Array<{ id: string; descriptionHtml: string } | null> }>(
    /* GraphQL */ `query($ids: [ID!]!){ nodes(ids: $ids){ ... on Product { id descriptionHtml } } }`,
    { ids: productGids },
  );
  return (data.nodes || []).filter((n): n is { id: string; descriptionHtml: string } => Boolean(n?.id));
}

interface CollectionUpdateGQL {
  collectionUpdate: { userErrors: Array<{ field: string[] | null; message: string }> };
}

export async function updateCollectionDescription(collectionGid: string, descriptionHtml: string): Promise<void> {
  const data = await adminFetch<CollectionUpdateGQL>(
    /* GraphQL */ `
      mutation($input: CollectionInput!) {
        collectionUpdate(input: $input) { userErrors { field message } }
      }`,
    { input: { id: collectionGid, descriptionHtml } },
  );
  if (data.collectionUpdate.userErrors.length) {
    throw new Error("collectionUpdate userErrors: " + JSON.stringify(data.collectionUpdate.userErrors));
  }
}

interface ProductUpdateGQL {
  productUpdate: { userErrors: Array<{ field: string[] | null; message: string }> };
}

export async function updateProductDescription(productGid: string, descriptionHtml: string): Promise<void> {
  const data = await adminFetch<ProductUpdateGQL>(
    /* GraphQL */ `
      mutation($input: ProductInput!) {
        productUpdate(input: $input) { userErrors { field message } }
      }`,
    { input: { id: productGid, descriptionHtml } },
  );
  if (data.productUpdate.userErrors.length) {
    throw new Error("productUpdate userErrors: " + JSON.stringify(data.productUpdate.userErrors));
  }
}
