import { Router } from "express";

const router = Router();

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL || "sideline-nz-2.myshopify.com";
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN || "53a3ae5ea0eeacac29d10e09646a7cac";
const shopifyEndpoint = `https://${SHOPIFY_STORE_URL}/api/2025-01/graphql.json`;

const STORE_URL = "https://teamstore.sidelinenz.com";

async function shopifyFetch(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(shopifyEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": SHOPIFY_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map((e: any) => e.message).join("; "));
  return json.data;
}

// ── Product fields fragment ────────────────────────────────────────────────
const PRODUCT_FIELDS = `
  id handle title description tags
  featuredImage { url altText }
  priceRange { minVariantPrice { amount currencyCode } }
  variants(first: 20) {
    edges {
      node { id title availableForSale price { amount currencyCode } }
    }
  }
`;

// ── Format helpers ─────────────────────────────────────────────────────────
function formatProduct(p: any) {
  const variants = (p.variants?.edges || []).map((e: any) => e.node);
  const inStock = variants.filter((v: any) => v.availableForSale);
  const price = p.priceRange?.minVariantPrice?.amount;
  return {
    name: p.title,
    price: price ? `$${parseFloat(price).toFixed(2)} NZD` : "Price on request",
    in_stock: inStock.length > 0,
    available_sizes: inStock.map((v: any) => v.title),
    url: `${STORE_URL}/products/${p.handle}`,
    image: p.featuredImage?.url || null,
    tags: p.tags || [],
  };
}

function formatCollection(c: any) {
  const products = (c.products?.edges || []).map((e: any) => e.node);
  return {
    name: c.title,
    description: c.description || "",
    url: `${STORE_URL}/collections/${c.handle}`,
    product_count: products.length,
    products: products.map(formatProduct),
  };
}

/**
 * POST /api/chatbot/search
 *
 * GHL Conversational AI Custom Action endpoint.
 * Accepts a search query and returns matching products/collections.
 *
 * Body: { query: string, type?: "products" | "collections" | "all" }
 */
router.post("/search", async (req, res) => {
  try {
    const { query, type = "all" } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "query is required" });
    }

    const q = query.toLowerCase().trim();
    const results: any = {};

    // Search products by title
    if (type === "all" || type === "products") {
      const data = await shopifyFetch(`
        query SearchProducts($query: String!) {
          search(first: 10, query: $query, types: PRODUCT) {
            edges {
              node {
                ... on Product { ${PRODUCT_FIELDS} }
              }
            }
          }
        }
      `, { query: q });

      const products = (data?.search?.edges || [])
        .map((e: any) => e.node)
        .filter((n: any) => n?.title);
      results.products = products.map(formatProduct);
    }

    // Search collections
    if (type === "all" || type === "collections") {
      const data = await shopifyFetch(`
        query {
          collections(first: 50) {
            edges {
              node {
                handle title description
                image { url altText }
                products(first: 5) {
                  edges { node { ${PRODUCT_FIELDS} } }
                }
              }
            }
          }
        }
      `);
      const all = (data?.collections?.edges || []).map((e: any) => e.node);
      // Filter collections matching query
      results.collections = all
        .filter((c: any) => {
          const title = (c.title || "").toLowerCase();
          const desc = (c.description || "").toLowerCase();
          return title.includes(q) || desc.includes(q) || q.includes(title.split(" ")[0]);
        })
        .map(formatCollection);
    }

    const total = (results.products?.length || 0) + (results.collections?.length || 0);

    res.json({
      found: total,
      message: total > 0
        ? `Found ${total} result(s) for "${query}".`
        : `No results found for "${query}". Try searching for a team name, product type (e.g. polo, cap, hoodie), or sport.`,
      store_url: STORE_URL,
      ...results,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message?.substring(0, 300) });
  }
});

/**
 * POST /api/chatbot/collection
 *
 * Get full details for a specific team store / collection.
 * Body: { handle: string }
 */
router.post("/collection", async (req, res) => {
  try {
    const { handle } = req.body;
    if (!handle) return res.status(400).json({ error: "handle is required" });

    const data = await shopifyFetch(`
      query CollectionByHandle($handle: String!) {
        collection(handle: $handle) {
          handle title description
          image { url altText }
          products(first: 50) {
            edges { node { ${PRODUCT_FIELDS} } }
          }
        }
      }
    `, { handle });

    const coll = data?.collection;
    if (!coll) return res.status(404).json({ error: "Collection not found" });

    res.json(formatCollection(coll));
  } catch (e: any) {
    res.status(500).json({ error: e.message?.substring(0, 300) });
  }
});

/**
 * GET /api/chatbot/collections
 *
 * List all available team stores / collections.
 */
router.get("/collections", async (_req, res) => {
  try {
    const data = await shopifyFetch(`
      query {
        collections(first: 50) {
          edges {
            node {
              handle title description
              image { url altText }
              products(first: 1) { edges { node { id } } }
            }
          }
        }
      }
    `);
    const collections = (data?.collections?.edges || [])
      .map((e: any) => e.node)
      .filter((c: any) => (c.products?.edges?.length || 0) > 0)
      .map((c: any) => ({
        name: c.title,
        handle: c.handle,
        description: c.description || "",
        url: `${STORE_URL}/collections/${c.handle}`,
        image: c.image?.url || null,
      }));

    res.json({
      count: collections.length,
      message: `We have ${collections.length} active team stores.`,
      collections,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message?.substring(0, 300) });
  }
});

/**
 * GET /api/chatbot/info
 *
 * General business info for the bot to reference.
 */
router.get("/info", (_req, res) => {
  res.json({
    business: "Kingdom Investment Group (KIG)",
    brands: [
      {
        name: "Sideline Custom Goods",
        description: "Custom team uniforms, sportswear, and merch for NZ clubs, schools, and organisations.",
        website: "https://sidelinenz.com",
        team_store: STORE_URL,
        services: ["Custom uniforms", "Team stores", "Supporter ranges", "Sponsorship placement"],
      },
      {
        name: "RTS (Ready to Scale)",
        description: "Funding and finance consulting for NZ businesses. Government grants, R&D tax credits, and growth capital.",
        website: "https://kig.co.nz",
        services: ["Government grant applications", "R&D tax incentives", "Business funding strategy"],
      },
      {
        name: "Pop Up Play",
        description: "Community activation events — bouncy castles, games, and entertainment for families and organisations.",
        services: ["Community events", "Corporate activations", "School galas", "Birthday parties"],
      },
      {
        name: "KIG AI Systems",
        description: "AI-powered business automation — chatbots, CRM integration, and workflow systems.",
        services: ["AI agent setup", "CRM automation", "Business process automation"],
      },
    ],
    contact: {
      email: "admin@kig.co.nz",
      phone: "+64 22 412 7205",
      location: "Unit 2, 66 Cavendish Drive, Manukau, Auckland 2104, NZ",
    },
  });
});

export default router;
