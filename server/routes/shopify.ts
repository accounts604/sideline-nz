import { Router } from "express";

const router = Router();

// Storefront API config — never hard-code tokens. Set SHOPIFY_STORE_URL and
// SHOPIFY_TOKEN in env. Routes return 503 when missing rather than silently
// falling back to a leaked dev token.
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL || process.env.VITE_SHOPIFY_STORE_URL || "";
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN || process.env.VITE_SHOPIFY_TOKEN || "";
const shopifyEndpoint = SHOPIFY_STORE_URL ? `https://${SHOPIFY_STORE_URL}/api/2025-01/graphql.json` : "";

async function shopifyFetch(query: string, variables?: Record<string, unknown>) {
  if (!SHOPIFY_STORE_URL || !SHOPIFY_TOKEN) {
    throw new Error("Shopify Storefront API not configured. Set SHOPIFY_STORE_URL and SHOPIFY_TOKEN.");
  }
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
    const data = await shopifyFetch(`query { products(first: 12, sortKey: BEST_SELLING) { edges { node { ${f} } } } }`);
    const products = (data?.products?.edges || []).map((e: any) => e?.node).filter(Boolean);
    res.json(products.slice(0, 12));
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

// ====== APIEase Shopify Collection Creation ======

router.post("/create-collection", async (req, res) => {
  try {
    const { club_name, club_handle, description } = req.body;

    // Validate inputs
    if (!club_name || !club_handle) {
      return res.status(400).json({ error: "club_name and club_handle are required" });
    }

    const apiKey = process.env.APIEASE_API_KEY;
    const baseUrl = process.env.APIEASE_BASE_URL || "https://app-admin.apiease.com";
    const shopName = process.env.APIEASE_SHOP_NAME || "sideline-nz";

    if (!apiKey) {
      console.error("APIEASE_API_KEY not configured");
      return res.status(503).json({ error: "APIEase not configured" });
    }

    const proxyUrl = `${baseUrl}/api/proxy/${shopName}/create-collection`;
    
    console.log(`[Shopify] Creating collection via APIEase: club_name=${club_name}, club_handle=${club_handle}`);

    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        club_name,
        club_handle,
        description: description || `${club_name} Team Store`,
      }),
    });

    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = responseData.error || responseData.message || `HTTP ${response.status}`;
      console.error(`[Shopify] APIEase error: ${errorMsg}`, responseData);
      return res.status(response.status || 500).json({ error: errorMsg });
    }

    console.log(`[Shopify] Collection created successfully:`, responseData);
    
    const collectionUrl = `https://${SHOPIFY_STORE_URL}/collections/club-${club_handle}`;
    res.json({
      ok: true,
      collection: responseData.collection,
      collectionUrl,
    });
  } catch (e: any) {
    console.error(`[Shopify] Collection creation failed:`, e.message);
    // Log but don't crash — continue with normal flow
    res.status(500).json({ error: String(e.message).substring(0, 300) });
  }
});

export default router;
