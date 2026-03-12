import { Router } from "express";

const router = Router();

const SHOPIFY_STORE_URL = process.env.VITE_SHOPIFY_STORE_URL || "";
const SHOPIFY_TOKEN = process.env.VITE_SHOPIFY_TOKEN || "";
const shopifyEndpoint = `https://${SHOPIFY_STORE_URL}/api/2025-01/graphql.json`;

async function shopifyFetch(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(shopifyEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": SHOPIFY_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error("Shopify API error: " + res.status);
  const json = await res.json();
  if (json.errors) throw new Error("Shopify GraphQL error: " + JSON.stringify(json.errors));
  return json.data;
}

router.get("/collections", async (_req, res) => {
  try {
    const data = await shopifyFetch(`
      query { collections(first: 50) { edges { node {
        handle title description image { url altText }
      } } } }
    `);
    res.json(data.collections.edges.map((e: any) => e.node));
  } catch (e: any) {
    console.error("Shopify collections error:", e.message);
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
