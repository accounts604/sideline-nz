import { Router } from "express";

const router = Router();

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL || "sideline-nz-2.myshopify.com";
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN || "53a3ae5ea0eeacac29d10e09646a7cac";
const shopifyEndpoint = `https://${SHOPIFY_STORE_URL}/api/2025-01/graphql.json`;

async function shopifyFetch(query: string, variables?: Record<string, unknown>) {
  const queryPreview = query.replace(/\s+/g, " ").substring(0, 60) + "...";
  
  try {
    const res = await fetch(shopifyEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": SHOPIFY_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "unknown error");
      throw new Error(`Shopify HTTP ${res.status}: ${errorText.substring(0, 200)}`);
    }

    const json = await res.json().catch((e: any) => {
      throw new Error(`Failed to parse JSON: ${e.message}`);
    });

    if (json.errors && Array.isArray(json.errors)) {
      const errorMsg = json.errors.map((e: any) => e.message).join("; ");
      throw new Error("Shopify GraphQL error: " + errorMsg);
    }

    return json.data;
  } catch (err: any) {
    throw err;
  }
}

router.get("/ping", (_req, res) => {
  res.json({ ok: true });
});

router.get("/status", async (_req, res) => {
  try {
    if (!SHOPIFY_STORE_URL || !SHOPIFY_TOKEN) {
      return res.status(503).json({ ok: false, error: "Config missing" });
    }
    const data = await shopifyFetch(`query { shop { name } }`);
    res.json({ ok: true, store: SHOPIFY_STORE_URL });
  } catch (e: any) {
    res.status(502).json({ ok: false, error: String(e.message).substring(0, 200) });
  }
});

router.get("/collections", async (_req, res) => {
  try {
    const data = await shopifyFetch(`query { collections(first: 50) { edges { node { handle title description image { url altText } } } } }`);
    const collections = (data?.collections?.edges || []).map((e: any) => e?.node).filter(Boolean);
    res.json(collections);
  } catch (e: any) {
    res.status(500).json({ error: String(e.message).substring(0, 300) });
  }
});

router.get("/collections/:handle", async (req, res) => {
  try {
    const data = await shopifyFetch(`query CollectionByHandle($handle: String!) { collection(handle: $handle) { handle title description image { url altText } products(first: 50) { edges { node { id handle title description tags featuredImage { url altText } priceRange { minVariantPrice { amount currencyCode } } variants(first: 20) { edges { node { id title availableForSale price { amount currencyCode } } } } } } } } }`, { handle: req.params.handle });
    const coll = data?.collection;
    if (!coll) return res.status(404).json({ error: "Not found" });
    res.json({ collection: coll, products: (coll.products?.edges || []).map((e: any) => e?.node).filter(Boolean) });
  } catch (e: any) {
    res.status(500).json({ error: String(e.message).substring(0, 300) });
  }
});

router.get("/products", async (_req, res) => {
  try {
    const f = `id handle title description tags featuredImage { url altText } priceRange { minVariantPrice { amount currencyCode } } variants(first: 20) { edges { node { id title availableForSale price { amount currencyCode } } } }`;
    const data = await shopifyFetch(`query { products(first: 10) { edges { node { ${f} } } } }`);
    const products = (data?.products?.edges || []).map((e: any) => e?.node).filter(Boolean);
    res.json(products.slice(0, 10));
  } catch (e: any) {
    res.status(500).json({ error: String(e.message).substring(0, 300) });
  }
});

router.post("/cart", async (req, res) => {
  try {
    const { lines } = req.body;
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: "lines required" });
    }
    const data = await shopifyFetch(`mutation cartCreate($input: CartInput!) { cartCreate(input: $input) { cart { id checkoutUrl } userErrors { field message } } }`, { input: { lines } });
    const cart = data?.cartCreate?.cart;
    const userErrors = data?.cartCreate?.userErrors;
    if (userErrors?.length) {
      return res.status(400).json({ error: userErrors[0].message });
    }
    res.json(cart);
  } catch (e: any) {
    res.status(500).json({ error: String(e.message).substring(0, 300) });
  }
});

export default router;
