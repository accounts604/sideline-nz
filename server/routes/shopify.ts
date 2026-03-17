import { Router } from "express";

// Ensure fetch is available (Node.js 18+ should have it globally)
if (!globalThis.fetch) {
  console.error("[Shopify] WARNING: fetch not available! This should not happen on Node 18+");
}

const router = Router();

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL || "sideline-nz-2.myshopify.com";
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN || "53a3ae5ea0eeacac29d10e09646a7cac";
const shopifyEndpoint = `https://${SHOPIFY_STORE_URL}/api/2025-01/graphql.json`;

// Startup diagnostics
console.log("[Shopify] Config loaded:", {
  storeUrl: SHOPIFY_STORE_URL,
  tokenPrefix: SHOPIFY_TOKEN ? SHOPIFY_TOKEN.substring(0, 8) + "..." : "MISSING",
  endpoint: shopifyEndpoint,
  envSource: {
    url: process.env.SHOPIFY_STORE_URL ? "env" : "fallback",
    token: process.env.SHOPIFY_TOKEN ? "env" : "fallback",
  },
});

async function shopifyFetch(query: string, variables?: Record<string, unknown>) {
  const queryPreview = query.trim().substring(0, 80).replace(/\s+/g, " ");
  console.log("[Shopify] Fetching:", { endpoint: shopifyEndpoint, queryPreview, variables });

  try {
    const res = await fetch(shopifyEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": SHOPIFY_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });

    console.log("[Shopify] Response status:", res.status, res.statusText);

    if (!res.ok) {
      const errorBody = await res.text();
      console.error("[Shopify] HTTP error response body:", errorBody);
      throw new Error(`Shopify API error: ${res.status} ${res.statusText} - ${errorBody}`);
    }

    const json = await res.json();

    if (json.errors) {
      console.error("[Shopify] GraphQL errors:", JSON.stringify(json.errors, null, 2));
      throw new Error("Shopify GraphQL error: " + JSON.stringify(json.errors));
    }

    console.log("[Shopify] Success. Data keys:", Object.keys(json.data || {}));
    return json.data;
  } catch (err: any) {
    if (err.cause) {
      console.error("[Shopify] Fetch network error cause:", err.cause);
    }
    throw err;
  }
}

router.get("/ping", (_req, res) => {
  res.json({ status: "Shopify router is alive", timestamp: new Date().toISOString() });
});

router.get("/status", async (_req, res) => {
  console.log("[Shopify] /status endpoint hit");
  const configured = !!(SHOPIFY_STORE_URL && SHOPIFY_TOKEN);
  if (!configured) {
    return res.status(503).json({
      ok: false,
      error: "Shopify environment variables not set",
      vars: {
        SHOPIFY_STORE_URL: SHOPIFY_STORE_URL ? "set" : "missing",
        SHOPIFY_TOKEN: SHOPIFY_TOKEN ? "set" : "missing",
      },
    });
  }
  try {
    const data = await shopifyFetch(`query { shop { name } }`);
    res.json({ ok: true, store: SHOPIFY_STORE_URL, shopName: data?.shop?.name });
  } catch (e: any) {
    res.status(502).json({ ok: false, error: e.message, endpoint: shopifyEndpoint });
  }
});

router.get("/collections", async (_req, res) => {
  console.log("[Shopify] /collections endpoint hit");
  try {
    const data = await shopifyFetch(`
      query { collections(first: 50) { edges { node {
        handle title description image { url altText }
      } } } }
    `);
    const collections = data.collections.edges.map((e: any) => e.node);
    console.log("[Shopify] Collections found:", collections.length, collections.map((c: any) => c.handle));
    res.json(collections);
  } catch (e: any) {
    console.error("[Shopify] Collections error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get("/collections/:handle", async (req, res) => {
  try {
    const data = await shopifyFetch(
      `
      query CollectionByHandle($handle: String!) {
        collection(handle: $handle) {
          handle title description image { url altText }
          products(first: 50) { edges { node {
            id handle title description tags
            featuredImage { url altText }
            priceRange { minVariantPrice { amount currencyCode } }
            variants(first: 20) { edges { node { id title availableForSale price { amount currencyCode } } } }
          } } }
        }
      }
    `,
      { handle: req.params.handle }
    );
    if (!data.collection) return res.status(404).json({ error: "Collection not found" });
    res.json({
      collection: {
        handle: data.collection.handle,
        title: data.collection.title,
        description: data.collection.description,
        image: data.collection.image,
      },
      products: data.collection.products.edges.map((e: any) => e.node),
    });
  } catch (e: any) {
    console.error("Shopify collection error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get("/products", async (_req, res) => {
  try {
    const productFragment = `id handle title description tags featuredImage { url altText } priceRange { minVariantPrice { amount currencyCode } } variants(first: 20) { edges { node { id title availableForSale price { amount currencyCode } } } }`;

    const featuredData = await shopifyFetch(`
      query { products(first: 10, query: "tag:featured") { edges { node { ${productFragment} } } } }
    `);
    const featured = featuredData.products.edges.map((e: any) => e.node);
    if (featured.length > 0) return res.json(featured);

    const allData = await shopifyFetch(`
      query { products(first: 10) { edges { node { ${productFragment} } } } }
    `);
    res.json(allData.products.edges.map((e: any) => e.node));
  } catch (e: any) {
    console.error("Shopify products error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post("/cart", async (req, res) => {
  try {
    const { lines } = req.body;
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: "lines array required" });
    }
    const data = await shopifyFetch(
      `
      mutation cartCreate($input: CartInput!) {
        cartCreate(input: $input) {
          cart { id checkoutUrl }
          userErrors { field message }
        }
      }
    `,
      { input: { lines } }
    );
    const { cart, userErrors } = data.cartCreate;
    if (userErrors?.length) {
      return res.status(400).json({ error: userErrors[0].message });
    }
    res.json(cart);
  } catch (e: any) {
    console.error("Shopify cart error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
