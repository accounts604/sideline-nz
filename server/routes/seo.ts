import { Router } from "express";

const BASE = "https://sidelinenz.com";

// Static, always-present public routes.
const STATIC_PATHS = [
  "/", "/team-stores", "/clubs", "/schools", "/sports", "/our-work",
  "/sponsor-placement", "/quote", "/free-mockup", "/contact", "/size-chart", "/terms",
];

// Sports + case-study + competition slugs that back dynamic routes. Kept here (server-side)
// so the sitemap stays complete without importing the client bundle.
const SPORT_SLUGS = ["rugby-union", "rugby-league", "netball", "football", "basketball", "league", "touch", "american-football"];
const CASE_STUDY_SLUGS = ["manurewa-womens-rugby", "marist-samoa-nz-rfc", "american-samoa-tag", "mangere-east-queenz", "auckland-samoa-rfu-village-league", "metro-lions-raiders"];
const COMPETITION_SLUGS = ["auckland-samoa-rfu"];

async function shopifyCollectionHandles(): Promise<string[]> {
  try {
    const store = process.env.SHOPIFY_STORE_URL;
    const token = process.env.SHOPIFY_STOREFRONT_TOKEN || process.env.SHOPIFY_STOREFRONT_API_TOKEN;
    if (!store || !token) return [];
    const res = await fetch(`https://${store}/api/2024-10/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": token },
      body: JSON.stringify({ query: `query { collections(first: 100) { edges { node { handle } } } }` }),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    return (data?.data?.collections?.edges || []).map((e: any) => e?.node?.handle).filter(Boolean);
  } catch {
    return [];
  }
}

export function registerSeoRoutes(app: import("express").Express) {
  const router = Router();

  router.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(
      [
        "User-agent: *",
        "Allow: /",
        "Disallow: /admin",
        "Disallow: /portal",
        "Disallow: /club-portal",
        "Disallow: /supplier",
        "Disallow: /api/",
        "",
        `Sitemap: ${BASE}/sitemap.xml`,
        "",
      ].join("\n"),
    );
  });

  router.get("/sitemap.xml", async (_req, res) => {
    const handles = await shopifyCollectionHandles();
    const paths = [
      ...STATIC_PATHS,
      ...SPORT_SLUGS.map((s) => `/sports/${s}`),
      ...COMPETITION_SLUGS.map((s) => `/competitions/${s}`),
      ...CASE_STUDY_SLUGS.map((s) => `/our-work/${s}`),
      ...handles.map((h) => `/team-stores/${h}`),
    ];
    const urls = Array.from(new Set(paths))
      .map((p) => {
        const priority = p === "/" ? "1.0" : p.startsWith("/team-stores/") || p.startsWith("/competitions/") ? "0.8" : "0.7";
        return `  <url><loc>${BASE}${p}</loc><changefreq>weekly</changefreq><priority>${priority}</priority></url>`;
      })
      .join("\n");
    res
      .type("application/xml")
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  });

  app.use(router);
}
