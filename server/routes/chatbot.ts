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

/**
 * POST /api/chatbot/lead
 *
 * Capture lead data from Jarvesi chat and push to GHL as a contact
 * with custom fields — mirrors the Sideline website quote form.
 *
 * Body: {
 *   name, email, phone,
 *   user_type, organization, role, member_count, sports, needs,
 *   estimated_quantity, timing, budget_range, design_stage,
 *   team_store_interest, mockup_interest, notes, ...
 * }
 */
router.post("/lead", async (req, res) => {
  try {
    const { createGhlContact } = await import("./ghl");
    const data = req.body;

    if (!data.email && !data.phone) {
      return res.status(400).json({ error: "email or phone is required" });
    }

    // Determine tags based on context
    const tags: string[] = ["Website Lead", "Jarvesi Chat"];
    if (data.user_type === "club") tags.push("Club");
    if (data.user_type === "school") tags.push("School");
    if (data.team_store_interest === "yes") tags.push("Team Store Interest");
    if (data.mockup_interest === "yes") tags.push("Free Mockup Request");
    if (data.enquiry_type) tags.push(data.enquiry_type);

    const result = await createGhlContact(
      { ...data, source: "Jarvesi Web Chat" },
      tags,
    );

    res.json({
      success: true,
      message: "Thanks! We've got your details. Someone from the team will be in touch shortly.",
      ghl: result,
    });
  } catch (e: any) {
    console.error("[Chatbot] Lead capture error:", e.message);
    res.status(500).json({ error: e.message?.substring(0, 300) });
  }
});

/**
 * GET /api/chatbot/form-fields
 *
 * Returns the form structure so Jarvesi knows what questions to ask
 * and what values are valid for each field.
 */
router.get("/form-fields", (_req, res) => {
  res.json({
    description: "Sideline NZ enquiry form fields — Jarvesi should collect these conversationally",
    steps: [
      {
        step: 1,
        name: "Contact basics",
        fields: [
          { key: "name", label: "Full name", type: "text", required: true },
          { key: "email", label: "Email address", type: "email", required: true },
          { key: "phone", label: "Phone number", type: "phone", required: false },
        ],
      },
      {
        step: 2,
        name: "Organisation",
        fields: [
          { key: "user_type", label: "Are you a club, school, or other?", type: "select", options: ["club", "school", "other"], required: true },
          { key: "organization", label: "Organisation name", type: "text", required: true },
          { key: "role", label: "Your role", type: "text", required: false },
          { key: "member_count", label: "How many members?", type: "select", options: ["Under 20", "20–50", "51–100", "100–200", "200+"] },
        ],
      },
      {
        step: 3,
        name: "What they need",
        fields: [
          { key: "sports", label: "What sport(s)?", type: "multi_select", options: ["Rugby", "League", "Football", "Netball", "Basketball", "Hockey", "Cricket", "Touch", "Other"] },
          { key: "needs", label: "What do you need?", type: "multi_select", options: ["Full Playing Kit", "Training Gear", "Supporter Gear", "Off-Field Apparel", "Not Sure Yet"] },
          { key: "estimated_quantity", label: "Roughly how many items?", type: "select", options: ["Under 20", "20–50", "50–100", "100+"] },
        ],
      },
      {
        step: 4,
        name: "Timeline & design",
        fields: [
          { key: "timing", label: "When do you need it?", type: "select", options: ["ASAP (Rush)", "1–2 Months", "3–4 Months", "Next Season", "Just Exploring"] },
          { key: "design_stage", label: "Design status?", type: "select", options: ["No design yet", "Have ideas", "Updating existing kit", "Design ready"] },
          { key: "budget_range", label: "Budget range?", type: "select", options: ["Under $2K", "$2K–$5K", "$5K–$10K", "$10K–$20K", "$20K+", "Not sure"] },
        ],
      },
      {
        step: 5,
        name: "Extras",
        fields: [
          { key: "team_store_interest", label: "Interested in a team store?", type: "select", options: ["yes", "no", "maybe"] },
          { key: "mockup_interest", label: "Want a free mockup?", type: "select", options: ["yes", "no"] },
          { key: "notes", label: "Anything else?", type: "text", required: false },
        ],
      },
    ],
    submit_to: "/api/chatbot/lead",
  });
});

export default router;
