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
  { id: "rugby-match-jersey",    name: "Rugby Jersey",               category: "Rugby",   sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Interlock Polyester (full sublimation)", pricing: tiers(44,42,40,38,36), minOrder: 10 },
  { id: "rugby-long-sleeve",     name: "Rugby Long Sleeve Jersey",   category: "Rugby",   sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Interlock Polyester", pricing: tiers(40,38,36,34,33), minOrder: 10 },
  { id: "rugby-shorts",          name: "Rugby Shorts",               category: "Rugby",   sizes: UNISEX_JERSEY, defaultMaterial: "240gsm Stretch Woven Polyester", pricing: tiers(40,38,36,34,33), minOrder: 10 },
  { id: "rugby-socks",           name: "Rugby Socks",                category: "Rugby",   sizes: SOCKS,         defaultMaterial: "Nylon/Elastane Knit", pricing: tiers(26,25,23,22,21), minOrder: 20 },
  { id: "rugby-set",             name: "Rugby Full Set (Jersey + Shorts + Socks)", category: "Rugby", sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Interlock Polyester", pricing: tiers(112,106,101,96,91), minOrder: 10 },

  // ─── League ───
  { id: "league-jersey",         name: "Rugby League Jersey",        category: "League",  sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Interlock Polyester (full sublimation)", pricing: tiers(44,42,40,38,36), minOrder: 10 },
  { id: "league-shorts",         name: "Rugby League Shorts",        category: "League",  sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Polyester Tricot", pricing: tiers(40,38,36,34,33), minOrder: 10 },

  // ─── Netball ───
  { id: "netball-dress",         name: "Netball Dress",              category: "Netball", sizes: WOMENS_DRESS,  defaultMaterial: "Performance Spandex / Polyester", minOrder: 23 },
  { id: "netball-singlet",       name: "Netball Singlet",            category: "Netball", sizes: WOMENS_DRESS,  defaultMaterial: "Performance Spandex / Polyester" },
  { id: "netball-skirt",         name: "Netball Skirt",              category: "Netball", sizes: WOMENS_DRESS,  defaultMaterial: "Performance Spandex / Polyester" },
  { id: "netball-bike-shorts",   name: "Netball Bike Shorts",        category: "Netball", sizes: WOMENS_DRESS,  defaultMaterial: "Performance Spandex" },
  { id: "netball-spanks",        name: "Netball Spanks (Briefs)",    category: "Netball", sizes: WOMENS_DRESS,  defaultMaterial: "Performance Spandex (modesty brief)" },

  // ─── Tag Rugby ───
  { id: "tag-reversible-singlet", name: "Tag Reversible Singlet",    category: "Tag",     sizes: UNISEX_JERSEY, defaultMaterial: "150gsm Interlock Polyester (double-layer reversible)" },
  { id: "tag-dri-fit-tee",       name: "Tag Dri-Fit Tee",            category: "Tag",     sizes: UNISEX_JERSEY, defaultMaterial: "150gsm Performance Polyester" },
  { id: "tag-shorts",            name: "Tag Shorts",                 category: "Tag",     sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Polyester Tricot" },

  // ─── Football / Soccer ───
  { id: "football-jersey",       name: "Football Jersey",            category: "Football",sizes: UNISEX_JERSEY, defaultMaterial: "150gsm Micro-Mesh Polyester", minOrder: 11 },
  { id: "football-shorts",       name: "Football Shorts",            category: "Football",sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Polyester Tricot" },
  { id: "football-socks",        name: "Football Socks",             category: "Football",sizes: SOCKS,         defaultMaterial: "Nylon/Elastane Knit" },

  // ─── Basketball ───
  { id: "basketball-singlet",    name: "Basketball Singlet",         category: "Basketball", sizes: UNISEX_JERSEY, defaultMaterial: "150gsm Interlock Polyester", pricing: tiers(36,34,32,31,29), minOrder: 10 },
  { id: "basketball-shorts",     name: "Basketball Shorts",          category: "Basketball", sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Polyester Tricot", pricing: tiers(40,38,36,34,33), minOrder: 10 },
  { id: "basketball-socks",      name: "Basketball Socks",           category: "Basketball", sizes: SOCKS, defaultMaterial: "Nylon/Elastane Knit", pricing: tiers(20,19,18,17,16), minOrder: 20 },

  // ─── Cricket / Hockey ───
  { id: "cricket-polo",          name: "Cricket Polo",               category: "Cricket", sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Micro-Pique Polyester", pricing: tiers(40,38,36,34,33), minOrder: 10 },
  { id: "cricket-trousers",      name: "Cricket Trousers",           category: "Cricket", sizes: UNISEX_JERSEY, defaultMaterial: "Polycotton Twill" },
  { id: "hockey-jersey",         name: "Hockey Jersey",              category: "Hockey",  sizes: UNISEX_JERSEY, defaultMaterial: "150gsm Micro-Mesh Polyester" },
  { id: "hockey-skort",          name: "Hockey Skort",               category: "Hockey",  sizes: WOMENS_DRESS,  defaultMaterial: "Performance Spandex / Polyester" },

  // ─── Training / Streetwear ───
  { id: "dri-fit-shirt",         name: "Dri-Fit Shirt",              category: "Training", sizes: UNISEX_JERSEY, defaultMaterial: "150gsm Performance Polyester", pricing: tiers(38,36,34,33,31), minOrder: 10 },
  { id: "dri-fit-polo",          name: "Dri-Fit Polo",               category: "Training", sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Micro-Pique Polyester", pricing: tiers(40,38,36,34,33), minOrder: 10 },
  { id: "training-singlet",      name: "Training Singlet",           category: "Training", sizes: UNISEX_JERSEY, defaultMaterial: "160gsm Performance Polyester", pricing: tiers(33,31,30,28,27), minOrder: 10 },
  { id: "cotton-tee",            name: "Cotton T-Shirt",             category: "Training", sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Combed Cotton" },
  { id: "gym-shorts",            name: "Gym Shorts",                 category: "Training", sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Polyester Tricot", pricing: tiers(40,38,36,34,33), minOrder: 20 },
  { id: "track-pants",           name: "Track Pants",                category: "Training", sizes: UNISEX_JERSEY, defaultMaterial: "280gsm Polyfleece", pricing: tiers(56,53,50,48,46), minOrder: 20 },

  // ─── Outerwear ───
  { id: "hoodie",                name: "Hoodie (Pullover)",          category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "320gsm Cotton/Poly Fleece", pricing: tiers(60,57,54,51,49), minOrder: 10 },
  { id: "zip-hoodie",            name: "Zip Hoodie",                 category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "320gsm Cotton/Poly Fleece", pricing: tiers(60,57,54,51,49), minOrder: 10 },
  { id: "crew-neck",             name: "Crew Neck Sweater",          category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "320gsm Cotton/Poly Fleece" },
  { id: "anthem-jacket",         name: "Anthem Jacket",              category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "300gsm Technical Polyester", pricing: tiers(60,57,54,51,49), minOrder: 20 },
  { id: "rugby-shell-jacket",    name: "Rugby Shell Jacket",         category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "Ripstop Polyester (waterproof)", pricing: tiers(84,80,76,72,68), minOrder: 20 },
  { id: "windbreaker-jacket",    name: "Windbreaker Jacket",         category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "Lightweight Polyester (WR)", pricing: tiers(112,106,101,96,91), minOrder: 10 },
  { id: "stadium-jacket",        name: "Stadium Jacket",             category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "Heavy Technical Polyester", pricing: tiers(160,152,144,137,130), minOrder: 30 },
  { id: "softshell-jacket",      name: "Softshell Jacket",           category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "3-Layer Softshell (WR/Breathable)" },
  { id: "puffer-jacket",         name: "Puffer Jacket",              category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "Ripstop Polyester / Down Fill" },
  { id: "tracksuit",             name: "Tracksuit (Jacket + Pants)", category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "280gsm Polyfleece", pricing: tiers(120,114,108,103,98), minOrder: 20 },

  // ─── Headwear ───
  { id: "beanie",                name: "Pom-Pom Beanie",             category: "Headwear",  sizes: HEADWEAR_ONE,  defaultMaterial: "100% Acrylic Knit (12\" / 30.5cm)", pricing: tiers(36,34,32,31,29), minOrder: 20 },
  { id: "cap-structured",        name: "Cap",                        category: "Headwear",  sizes: HEADWEAR_ONE,  defaultMaterial: "Cotton Twill / Mesh Back", pricing: tiers(40,38,36,34,33), minOrder: 20 },
  { id: "scarf",                 name: "Scarf",                      category: "Headwear",  sizes: HEADWEAR_ONE,  defaultMaterial: "Acrylic Knit", pricing: tiers(40,38,36,34,33), minOrder: 20 },

  // ─── Bags ───
  { id: "backpack",              name: "Backpack",                   category: "Bags",      sizes: HEADWEAR_ONE,  defaultMaterial: "600D Polyester", pricing: tiers(120,114,108,103,98), minOrder: 30 },
  { id: "shoe-bag",              name: "Shoe Bag",                   category: "Bags",      sizes: HEADWEAR_ONE,  defaultMaterial: "210D Polyester", pricing: tiers(48,45,43,41,39), minOrder: 20 },
  { id: "kit-bag",               name: "Wheeled Kit Bag",            category: "Bags",      sizes: HEADWEAR_ONE,  defaultMaterial: "600D Polyester", pricing: tiers(180,171,162,154,146), minOrder: 30 },
  { id: "drawstring-bag",        name: "Drawstring Bag",             category: "Bags",      sizes: HEADWEAR_ONE,  defaultMaterial: "210D Polyester" },

  // ─── American Football ───
  { id: "american-football-jersey", name: "American Football Jersey", category: "American Football", sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Interlock Polyester" },
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
