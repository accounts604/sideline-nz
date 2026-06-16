// Sideline NZ product catalog — single source of truth for the admin
// dropdown on Create PO / order-detail and the size-guide display.
//
// Each entry declares:
//   id          — stable slug used as form value
//   name        — shown in dropdown + PO
//   category    — for grouping in the dropdown
//   sizes       — the full size guide for this product
//   defaultMaterial — pre-fill when selected; admin can override per line
//
// When Sideline adds a new garment, add one row here and it appears in every
// admin PO, quote, and mockup screen. Size lists follow Sideline's published
// size guides — adjust these if the spec sheet moves.

export interface PricingTier {
  minQty: number;
  maxQty: number;
  unitPrice: number; // NZD cents
}

export interface SidelineProduct {
  id: string;
  name: string;
  category: string;
  sizes: string[];
  defaultMaterial: string;
  pricing?: PricingTier[];  // tiered pricing from Sideline 2026 price list
  minOrder?: number;        // minimum order quantity
  puffinCostKey?: string;   // key into PUFFIN_COSTS_USD_TIER1 — drives Shopify cost-per-item
}

// ─── Supplier cost inputs (Puffin Sports 2025 price list, USD) ──────────────
// Tier 1 = smallest-qty tier = HIGHEST unit cost (conservative for margin reports).
// Source: kig-brain/archive/assets/puffin-sports-pricing-2025.md
// When a new Puffin sheet arrives, update values here — nothing else changes.
export const PUFFIN_COSTS_USD_TIER1: Record<string, number> = {
  // Sublimated wears
  "polo-shirt":              13.20,
  "polo-shirt-ls":           16.20,
  "t-shirt":                 12.00,
  "t-shirt-ls":              14.90,
  "hoodie-sublimated":       24.00,
  "hoodie-zip-sublimated":   25.00,
  "training-short":          10.50,
  "singlet":                 10.00,
  "sports-bra":               9.00,
  "gym-tights-short":        11.25,
  "gym-tights-34":           14.90,
  "gym-tights-full":         16.95,
  "winter-softshell":        40.00,
  "jacket-mesh-lining":      25.00,
  "jacket-half-zipper":      19.50,
  "tracksuit-top":           25.00,
  "tracksuit-pants":         24.00,
  // Team wears
  "rugby-jersey":            13.20,
  "rugby-short-lycra":       10.00,
  "basketball-jersey":       12.00,
  "basketball-short":        10.00,
  "netball-dress":           16.20,
  "soccer-jersey":           12.00,
  "soccer-short":             9.00,
  "cricket-shirt":           13.20,
  "cricket-pant":            19.50,
  "am-football-jersey":      25.00,
  // Accessories
  "beanie":                  10.00,
  "baseball-cap":             8.00,
  "sublimated-socks":        10.00,
  "backpack":                27.00,
  "duffle-large":            30.00,
  // Cut & Sew
  "hoodie-cotton-poly":      18.00,
  "hoodie-zip-cotton-poly":  19.50,
  "jumper-sweatshirt":       12.25,
  "jacket-softshell-cutsew": 33.00,
  "t-shirt-cotton-poly":      8.00,
};

export const PUFFIN_USD_TO_NZD = 1.72;       // historical rate; spot was 1.722 on 2026-03-13
export const OVERHEAD_PER_UNIT_NZD = 2.00;   // SaaS (Shopify/Canva/Gemini/Railway) ÷ ~100 units/mo

// ─── Alibaba alternate-supplier reference prices (USD) ─────────────────────
// Confirmed 2026-05-11 from Cathleen Gu (Suqian Abigail Trading / Suqian Dnice
// Apparel) — quoted USD $4 per unit on caps and pom-pom beanies. Used as
// the China-sourced reference price for Puffin negotiation leverage and
// for margin reports that want a "best-case cost" alongside Puffin Tier 1.
// Add other categories as quotes come in — keep keys identical to PUFFIN_COSTS_USD_TIER1.
export const ALIBABA_COSTS_USD: Record<string, number> = {
  "beanie":       4.00,
  "baseball-cap": 4.00,
  // hats / caps generally — assume $4 baseline until per-style quotes land
};

/** Shopify `cost per item` in NZD (ex-GST). Returns null if product has no Puffin mapping. */
export function getShopifyCost(product: SidelineProduct | null): number | null {
  if (!product?.puffinCostKey) return null;
  const usd = PUFFIN_COSTS_USD_TIER1[product.puffinCostKey];
  if (usd == null) return null;
  return Math.round((usd * PUFFIN_USD_TO_NZD + OVERHEAD_PER_UNIT_NZD) * 100) / 100;
}

/** Alibaba alternate-supplier landed NZD cost. Returns null if no quote on file. */
export function getAlibabaCost(product: SidelineProduct | null): number | null {
  if (!product?.puffinCostKey) return null;
  const usd = ALIBABA_COSTS_USD[product.puffinCostKey];
  if (usd == null) return null;
  return Math.round((usd * PUFFIN_USD_TO_NZD + OVERHEAD_PER_UNIT_NZD) * 100) / 100;
}

/** Side-by-side cost comparison for negotiation reports. */
export function getCostComparison(product: SidelineProduct | null): {
  puffinNzd: number | null;
  alibabaNzd: number | null;
  savingsNzd: number | null;
  savingsPct: number | null;
} {
  const puffinNzd = getShopifyCost(product);
  const alibabaNzd = getAlibabaCost(product);
  if (puffinNzd == null || alibabaNzd == null) return { puffinNzd, alibabaNzd, savingsNzd: null, savingsPct: null };
  const savingsNzd = Math.round((puffinNzd - alibabaNzd) * 100) / 100;
  const savingsPct = Math.round((savingsNzd / puffinNzd) * 1000) / 10;
  return { puffinNzd, alibabaNzd, savingsNzd, savingsPct };
}

// Standard 5-tier pricing (11-19, 20-29, 30-49, 50-99, 100-299 units).
// Prices in NZD dollars. Source: Sideline NZ / Puffin Sports 2026 price list.
function tiers(p11: number, p20: number, p30: number, p50: number, p100: number): PricingTier[] {
  return [
    { minQty: 11, maxQty: 19, unitPrice: p11 * 100 },
    { minQty: 20, maxQty: 29, unitPrice: p20 * 100 },
    { minQty: 30, maxQty: 49, unitPrice: p30 * 100 },
    { minQty: 50, maxQty: 99, unitPrice: p50 * 100 },
    { minQty: 100, maxQty: 299, unitPrice: p100 * 100 },
  ];
}

const ADULT_STANDARD = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
const YOUTH_STANDARD = ["4", "6", "8", "10", "12", "14", "16"];
const UNISEX_JERSEY = [...YOUTH_STANDARD, ...ADULT_STANDARD];
const WOMENS_DRESS = ["6", "8", "10", "12", "14", "16", "18", "20", "22"];
const HEADWEAR_SM = ["S/M", "L/XL"];
const HEADWEAR_ONE = ["One Size"];
const SOCKS = ["Youth", "S", "M", "L", "XL"];

export const SIDELINE_PRODUCTS: SidelineProduct[] = [
  // ─── Rugby ───
  { id: "rugby-match-jersey",    name: "Rugby Jersey",               category: "Rugby",   sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Interlock Polyester (full sublimation)", pricing: tiers(44,42,40,38,36), minOrder: 10, puffinCostKey: "rugby-jersey" },
  { id: "rugby-long-sleeve",     name: "Rugby Long Sleeve Jersey",   category: "Rugby",   sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Interlock Polyester", pricing: tiers(40,38,36,34,33), minOrder: 10, puffinCostKey: "rugby-jersey" }, // no LS SKU on Puffin — using jersey as proxy
  { id: "rugby-shorts",          name: "Rugby Shorts",               category: "Rugby",   sizes: UNISEX_JERSEY, defaultMaterial: "240gsm Stretch Woven Polyester", pricing: tiers(40,38,36,34,33), minOrder: 10, puffinCostKey: "rugby-short-lycra" },
  { id: "rugby-socks",           name: "Rugby Socks",                category: "Rugby",   sizes: SOCKS,         defaultMaterial: "Nylon/Elastane Knit", pricing: tiers(26,25,23,22,21), minOrder: 20, puffinCostKey: "sublimated-socks" },
  { id: "rugby-set",             name: "Rugby Full Set (Jersey + Shorts + Socks)", category: "Rugby", sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Interlock Polyester", pricing: tiers(112,106,101,96,91), minOrder: 10 }, // composite — cost computed as sum of components

  // ─── League ───
  { id: "league-jersey",         name: "Rugby League Jersey",        category: "League",  sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Interlock Polyester (full sublimation)", pricing: tiers(44,42,40,38,36), minOrder: 10, puffinCostKey: "rugby-jersey" },
  { id: "league-shorts",         name: "Rugby League Shorts",        category: "League",  sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Polyester Tricot", pricing: tiers(40,38,36,34,33), minOrder: 10, puffinCostKey: "rugby-short-lycra" },

  // ─── Netball ───
  { id: "netball-dress",         name: "Netball Dress",              category: "Netball", sizes: WOMENS_DRESS,  defaultMaterial: "Performance Spandex / Polyester", minOrder: 23, puffinCostKey: "netball-dress" },
  { id: "netball-singlet",       name: "Netball Singlet",            category: "Netball", sizes: WOMENS_DRESS,  defaultMaterial: "Performance Spandex / Polyester", puffinCostKey: "singlet" },
  { id: "netball-skirt",         name: "Netball Skirt",              category: "Netball", sizes: WOMENS_DRESS,  defaultMaterial: "Performance Spandex / Polyester" }, // no Puffin SKU — ask for quote
  { id: "netball-bike-shorts",   name: "Netball Bike Shorts",        category: "Netball", sizes: WOMENS_DRESS,  defaultMaterial: "Performance Spandex", puffinCostKey: "gym-tights-short" },
  { id: "netball-spanks",        name: "Netball Spanks (Briefs)",    category: "Netball", sizes: WOMENS_DRESS,  defaultMaterial: "Performance Spandex (modesty brief)", puffinCostKey: "gym-tights-short" }, // proxy

  // ─── Tag Rugby ───
  { id: "tag-reversible-singlet", name: "Tag Reversible Singlet",    category: "Tag",     sizes: UNISEX_JERSEY, defaultMaterial: "150gsm Interlock Polyester (double-layer reversible)", puffinCostKey: "singlet" }, // proxy — reversible construction typically 1.3-1.5x single
  { id: "tag-dri-fit-tee",       name: "Tag Dri-Fit Tee",            category: "Tag",     sizes: UNISEX_JERSEY, defaultMaterial: "150gsm Performance Polyester", puffinCostKey: "t-shirt" },
  { id: "tag-shorts",            name: "Tag Shorts",                 category: "Tag",     sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Polyester Tricot", puffinCostKey: "training-short" },

  // ─── Football / Soccer ───
  { id: "football-jersey",       name: "Football Jersey",            category: "Football",sizes: UNISEX_JERSEY, defaultMaterial: "150gsm Micro-Mesh Polyester", minOrder: 11, puffinCostKey: "soccer-jersey" },
  { id: "football-shorts",       name: "Football Shorts",            category: "Football",sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Polyester Tricot", puffinCostKey: "soccer-short" },
  { id: "football-socks",        name: "Football Socks",             category: "Football",sizes: SOCKS,         defaultMaterial: "Nylon/Elastane Knit", puffinCostKey: "sublimated-socks" },

  // ─── Basketball ───
  { id: "basketball-singlet",    name: "Basketball Singlet",         category: "Basketball", sizes: UNISEX_JERSEY, defaultMaterial: "150gsm Interlock Polyester", pricing: tiers(36,34,32,31,29), minOrder: 10, puffinCostKey: "basketball-jersey" },
  { id: "basketball-shorts",     name: "Basketball Shorts",          category: "Basketball", sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Polyester Tricot", pricing: tiers(40,38,36,34,33), minOrder: 10, puffinCostKey: "basketball-short" },
  { id: "basketball-socks",      name: "Basketball Socks",           category: "Basketball", sizes: SOCKS, defaultMaterial: "Nylon/Elastane Knit", pricing: tiers(20,19,18,17,16), minOrder: 20, puffinCostKey: "sublimated-socks" },

  // ─── Cricket / Hockey ───
  { id: "cricket-polo",          name: "Cricket Polo",               category: "Cricket", sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Micro-Pique Polyester", pricing: tiers(40,38,36,34,33), minOrder: 10, puffinCostKey: "cricket-shirt" },
  { id: "cricket-trousers",      name: "Cricket Trousers",           category: "Cricket", sizes: UNISEX_JERSEY, defaultMaterial: "Polycotton Twill", puffinCostKey: "cricket-pant" },
  { id: "hockey-jersey",         name: "Hockey Jersey",              category: "Hockey",  sizes: UNISEX_JERSEY, defaultMaterial: "150gsm Micro-Mesh Polyester", puffinCostKey: "soccer-jersey" }, // proxy — no hockey SKU on Puffin
  { id: "hockey-skort",          name: "Hockey Skort",               category: "Hockey",  sizes: WOMENS_DRESS,  defaultMaterial: "Performance Spandex / Polyester", puffinCostKey: "gym-tights-short" }, // proxy

  // ─── Training / Streetwear ───
  { id: "dri-fit-shirt",         name: "Dri-Fit Shirt",              category: "Training", sizes: UNISEX_JERSEY, defaultMaterial: "150gsm Performance Polyester", pricing: tiers(38,36,34,33,31), minOrder: 10, puffinCostKey: "t-shirt" },
  { id: "dri-fit-polo",          name: "Dri-Fit Polo",               category: "Training", sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Micro-Pique Polyester", pricing: tiers(40,38,36,34,33), minOrder: 10, puffinCostKey: "polo-shirt" },
  { id: "training-singlet",      name: "Training Singlet",           category: "Training", sizes: UNISEX_JERSEY, defaultMaterial: "160gsm Performance Polyester", pricing: tiers(33,31,30,28,27), minOrder: 10, puffinCostKey: "singlet" },
  { id: "cotton-tee",            name: "Cotton T-Shirt",             category: "Training", sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Combed Cotton", puffinCostKey: "t-shirt-cotton-poly" },
  { id: "gym-shorts",            name: "Gym Shorts",                 category: "Training", sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Polyester Tricot", pricing: tiers(40,38,36,34,33), minOrder: 20, puffinCostKey: "training-short" },
  { id: "track-pants",           name: "Track Pants",                category: "Training", sizes: UNISEX_JERSEY, defaultMaterial: "280gsm Polyfleece", pricing: tiers(56,53,50,48,46), minOrder: 20, puffinCostKey: "tracksuit-pants" },

  // ─── Outerwear ───
  { id: "hoodie",                name: "Hoodie (Pullover)",          category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "320gsm Cotton/Poly Fleece", pricing: tiers(60,57,54,51,49), minOrder: 10, puffinCostKey: "hoodie-cotton-poly" },
  { id: "zip-hoodie",            name: "Zip Hoodie",                 category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "320gsm Cotton/Poly Fleece", pricing: tiers(60,57,54,51,49), minOrder: 10, puffinCostKey: "hoodie-zip-cotton-poly" },
  { id: "crew-neck",             name: "Crew Neck Sweater",          category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "320gsm Cotton/Poly Fleece", puffinCostKey: "jumper-sweatshirt" },
  { id: "anthem-jacket",         name: "Anthem Jacket",              category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "300gsm Technical Polyester", pricing: tiers(60,57,54,51,49), minOrder: 20, puffinCostKey: "jacket-half-zipper" }, // proxy
  { id: "rugby-shell-jacket",    name: "Rugby Shell Jacket",         category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "Ripstop Polyester (waterproof)", pricing: tiers(84,80,76,72,68), minOrder: 20, puffinCostKey: "jacket-mesh-lining" },
  { id: "windbreaker-jacket",    name: "Windbreaker Jacket",         category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "Lightweight Polyester (WR)", pricing: tiers(112,106,101,96,91), minOrder: 10, puffinCostKey: "jacket-half-zipper" }, // proxy
  { id: "stadium-jacket",        name: "Stadium Jacket",             category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "Heavy Technical Polyester", pricing: tiers(160,152,144,137,130), minOrder: 30, puffinCostKey: "winter-softshell" }, // proxy — heaviest Puffin jacket
  { id: "softshell-jacket",      name: "Softshell Jacket",           category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "3-Layer Softshell (WR/Breathable)", puffinCostKey: "jacket-softshell-cutsew" },
  { id: "puffer-jacket",         name: "Puffer Jacket",              category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "Ripstop Polyester / Down Fill" }, // no Puffin SKU — ask for quote
  { id: "tracksuit",             name: "Tracksuit (Jacket + Pants)", category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "280gsm Polyfleece", pricing: tiers(120,114,108,103,98), minOrder: 20 }, // composite — top + pants

  // ─── Headwear ───
  { id: "beanie",                name: "Pom-Pom Beanie",             category: "Headwear",  sizes: HEADWEAR_ONE,  defaultMaterial: "100% Acrylic Knit (12\" / 30.5cm)", pricing: tiers(36,34,32,31,29), minOrder: 20, puffinCostKey: "beanie" },
  { id: "cap-structured",        name: "Cap",                        category: "Headwear",  sizes: HEADWEAR_ONE,  defaultMaterial: "Cotton Twill / Mesh Back", pricing: tiers(40,38,36,34,33), minOrder: 20, puffinCostKey: "baseball-cap" },
  { id: "bucket-hat",            name: "Bucket Hat",                 category: "Headwear",  sizes: HEADWEAR_ONE,  defaultMaterial: "100% Cotton Twill", pricing: tiers(36,34,32,31,29), minOrder: 20, puffinCostKey: "baseball-cap" }, // proxy — same construction class as cap
  { id: "scarf",                 name: "Scarf",                      category: "Headwear",  sizes: HEADWEAR_ONE,  defaultMaterial: "Acrylic Knit", pricing: tiers(40,38,36,34,33), minOrder: 20 }, // no Puffin SKU — ask for quote

  // ─── Bags ───
  { id: "backpack",              name: "Backpack",                   category: "Bags",      sizes: HEADWEAR_ONE,  defaultMaterial: "600D Polyester", pricing: tiers(120,114,108,103,98), minOrder: 30, puffinCostKey: "backpack" },
  { id: "shoe-bag",              name: "Shoe Bag",                   category: "Bags",      sizes: HEADWEAR_ONE,  defaultMaterial: "210D Polyester", pricing: tiers(48,45,43,41,39), minOrder: 20 }, // no matching Puffin SKU (smallest duffle is $27)
  { id: "kit-bag",               name: "Wheeled Kit Bag",            category: "Bags",      sizes: HEADWEAR_ONE,  defaultMaterial: "600D Polyester", pricing: tiers(180,171,162,154,146), minOrder: 30, puffinCostKey: "duffle-large" },
  { id: "drawstring-bag",        name: "Drawstring Bag",             category: "Bags",      sizes: HEADWEAR_ONE,  defaultMaterial: "210D Polyester" }, // no Puffin SKU

  // ─── American Football ───
  { id: "american-football-jersey", name: "American Football Jersey", category: "American Football", sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Interlock Polyester", puffinCostKey: "am-football-jersey" },

  // ─── Equipment (non-apparel gear — flat-priced, no sublimation, no Puffin SKU) ───
  { id: "rugby-ball",     name: "Rugby Ball",                 category: "Equipment", sizes: ["Size 3", "Size 4", "Size 5"], defaultMaterial: "Match/training grade, 3-ply rubber",                 pricing: [{ minQty: 1, maxQty: 9999, unitPrice: 2500 }],  minOrder: 1 }, // flat $25/ea — covers training + match
  { id: "training-cones", name: "Training Cones (100pc set)", category: "Equipment", sizes: ["100pc set"],                   defaultMaterial: "PVC marker cones, assorted colours, with carry bag", pricing: [{ minQty: 1, maxQty: 9999, unitPrice: 15000 }], minOrder: 1 }, // flat $150 per 100pc set
] as const as unknown as SidelineProduct[];

/** Get the unit price for a product at a given quantity. Returns NZD cents or null. */
export function getUnitPrice(product: SidelineProduct | null, qty: number): number | null {
  if (!product?.pricing?.length) return null;
  // Find the tier that matches the quantity (or the highest tier if qty exceeds all)
  const tier = product.pricing.find((t) => qty >= t.minQty && qty <= t.maxQty)
    || (qty > (product.pricing.at(-1)?.maxQty ?? 0) ? product.pricing.at(-1) : null);
  return tier?.unitPrice ?? null;
}

export function getProductById(id: string | null | undefined): SidelineProduct | null {
  if (!id) return null;
  return SIDELINE_PRODUCTS.find((p) => p.id === id) || null;
}

export function getProductByName(name: string | null | undefined): SidelineProduct | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  return SIDELINE_PRODUCTS.find((p) => p.name.toLowerCase() === n) || null;
}

// Grouped for <optgroup> rendering
export function productsGroupedByCategory(): Record<string, SidelineProduct[]> {
  const out: Record<string, SidelineProduct[]> = {};
  for (const p of SIDELINE_PRODUCTS) {
    (out[p.category] ||= []).push(p);
  }
  return out;
}
