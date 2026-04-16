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

export interface SidelineProduct {
  id: string;
  name: string;
  category: string;
  sizes: string[];
  defaultMaterial: string;
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
  { id: "rugby-match-jersey",    name: "Rugby Match Jersey",         category: "Rugby",   sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Interlock Polyester (full sublimation)" },
  { id: "rugby-training-jersey", name: "Rugby Training Jersey",      category: "Rugby",   sizes: UNISEX_JERSEY, defaultMaterial: "150gsm Micro-Mesh Polyester" },
  { id: "rugby-shorts",          name: "Rugby Shorts",               category: "Rugby",   sizes: UNISEX_JERSEY, defaultMaterial: "240gsm Stretch Woven Polyester" },
  { id: "rugby-socks",           name: "Rugby Socks",                category: "Rugby",   sizes: SOCKS,         defaultMaterial: "Nylon/Elastane Knit" },

  // ─── League ───
  { id: "league-jersey",         name: "Rugby League Jersey",        category: "League",  sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Interlock Polyester (full sublimation)" },
  { id: "league-shorts",         name: "Rugby League Shorts",        category: "League",  sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Polyester Tricot" },

  // ─── Netball ───
  { id: "netball-dress",         name: "Netball Dress",              category: "Netball", sizes: WOMENS_DRESS,  defaultMaterial: "Performance Spandex / Polyester" },
  { id: "netball-singlet",       name: "Netball Singlet",            category: "Netball", sizes: WOMENS_DRESS,  defaultMaterial: "Performance Spandex / Polyester" },
  { id: "netball-skirt",         name: "Netball Skirt",              category: "Netball", sizes: WOMENS_DRESS,  defaultMaterial: "Performance Spandex / Polyester" },
  { id: "netball-bike-shorts",   name: "Netball Bike Shorts",        category: "Netball", sizes: WOMENS_DRESS,  defaultMaterial: "Performance Spandex" },

  // ─── Football / Soccer ───
  { id: "football-jersey",       name: "Football Jersey",            category: "Football",sizes: UNISEX_JERSEY, defaultMaterial: "150gsm Micro-Mesh Polyester" },
  { id: "football-shorts",       name: "Football Shorts",            category: "Football",sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Polyester Tricot" },
  { id: "football-socks",        name: "Football Socks",             category: "Football",sizes: SOCKS,         defaultMaterial: "Nylon/Elastane Knit" },

  // ─── Basketball ───
  { id: "basketball-singlet",    name: "Basketball Singlet",         category: "Basketball", sizes: UNISEX_JERSEY, defaultMaterial: "150gsm Interlock Polyester" },
  { id: "basketball-shorts",     name: "Basketball Shorts",          category: "Basketball", sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Polyester Tricot" },

  // ─── Cricket / Hockey ───
  { id: "cricket-polo",          name: "Cricket Polo",               category: "Cricket", sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Micro-Pique Polyester" },
  { id: "cricket-trousers",      name: "Cricket Trousers",           category: "Cricket", sizes: UNISEX_JERSEY, defaultMaterial: "Polycotton Twill" },
  { id: "hockey-jersey",         name: "Hockey Jersey",              category: "Hockey",  sizes: UNISEX_JERSEY, defaultMaterial: "150gsm Micro-Mesh Polyester" },
  { id: "hockey-skort",          name: "Hockey Skort",               category: "Hockey",  sizes: WOMENS_DRESS,  defaultMaterial: "Performance Spandex / Polyester" },

  // ─── Training / Streetwear ───
  { id: "training-tee",          name: "Training Tee",               category: "Training", sizes: UNISEX_JERSEY, defaultMaterial: "160gsm Performance Cotton/Poly" },
  { id: "training-polo",         name: "Training Polo",              category: "Training", sizes: UNISEX_JERSEY, defaultMaterial: "210gsm Cotton Pique" },
  { id: "training-singlet",      name: "Training Singlet",           category: "Training", sizes: UNISEX_JERSEY, defaultMaterial: "160gsm Performance Polyester" },
  { id: "training-shorts",       name: "Training Shorts",            category: "Training", sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Polyester Tricot" },
  { id: "track-pants",           name: "Track Pants",                category: "Training", sizes: UNISEX_JERSEY, defaultMaterial: "280gsm Polyfleece" },
  { id: "hoodie",                name: "Hoodie (Pullover)",          category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "320gsm Cotton/Poly Fleece" },
  { id: "zip-hoodie",            name: "Zip Hoodie",                 category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "320gsm Cotton/Poly Fleece" },
  { id: "quarter-zip",           name: "1/4 Zip Pullover",           category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "260gsm Performance Polyester" },
  { id: "crew-neck",             name: "Crew Neck Sweater",          category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "320gsm Cotton/Poly Fleece" },
  { id: "softshell-jacket",      name: "Softshell Jacket",           category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "3-Layer Softshell (WR/Breathable)" },
  { id: "puffer-jacket",         name: "Puffer Jacket",              category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "Ripstop Polyester / Down Fill" },
  { id: "wet-weather-jacket",    name: "Wet Weather Shell",          category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "Ripstop Polyester (waterproof)" },
  { id: "gameday-jacket",        name: "Gameday Jacket",             category: "Outerwear", sizes: UNISEX_JERSEY, defaultMaterial: "300gsm Technical Polyester" },

  // ─── Supporters / Headwear / Accessories ───
  { id: "supporters-tee",        name: "Supporters Tee",             category: "Supporters", sizes: UNISEX_JERSEY, defaultMaterial: "180gsm Combed Cotton" },
  { id: "supporters-polo",       name: "Supporters Polo",            category: "Supporters", sizes: UNISEX_JERSEY, defaultMaterial: "210gsm Cotton Pique" },
  { id: "supporters-singlet",    name: "Supporters Singlet",         category: "Supporters", sizes: UNISEX_JERSEY, defaultMaterial: "160gsm Cotton/Poly" },
  { id: "bucket-hat",            name: "Bucket Hat",                 category: "Headwear",  sizes: HEADWEAR_SM,   defaultMaterial: "Brushed Cotton Twill" },
  { id: "cap-structured",        name: "Cap (Structured)",           category: "Headwear",  sizes: HEADWEAR_ONE,  defaultMaterial: "Cotton Twill / Mesh Back" },
  { id: "cap-snapback",          name: "Snapback Cap",               category: "Headwear",  sizes: HEADWEAR_ONE,  defaultMaterial: "Cotton Twill" },
  { id: "beanie",                name: "Pom-Pom Beanie",             category: "Headwear",  sizes: HEADWEAR_ONE,  defaultMaterial: "100% Acrylic Knit (12\" / 30.5cm)" },
  { id: "kit-bag",               name: "Kit Bag / Duffle",           category: "Bags",      sizes: HEADWEAR_ONE,  defaultMaterial: "600D Polyester" },
  { id: "backpack",              name: "Backpack",                   category: "Bags",      sizes: HEADWEAR_ONE,  defaultMaterial: "600D Polyester" },
  { id: "drawstring-bag",        name: "Drawstring Bag",             category: "Bags",      sizes: HEADWEAR_ONE,  defaultMaterial: "210D Polyester" },
] as const as unknown as SidelineProduct[];

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
