// Supporter Range — Shopify product title → canonical product mapping.
//
// Each club's supporter drop on Shopify is one collection of up to 7 products
// from the locked Sideline Supporters Range (2026-04-15): Bucket Hat, Cap,
// Tee, Polo, Beanie, Shell, Singlet. Shopify product titles vary per club
// ("Onewhero RFC Cotton Tee", "Cap — Black/Red", etc.), but they all reduce
// to one of the 7 SKUs.
//
// This map is the bridge from a Shopify product title → the canonical product
// id in shared/product-catalog.ts, which gives us defaultMaterial + sizing +
// the right size chart.
//
// Order matters: more specific patterns first ("polo" before "tee" so a
// "Polo Tee" doesn't get classified as a tee).

import { SIDELINE_PRODUCTS, type SidelineProduct } from "./product-catalog";

// Each canonical id → list of substring/regex patterns. Match is
// case-insensitive against the product title. The first pattern wins.
// Order matters: more specific patterns first ("zip hoodie" before "hoodie",
// "polo" before "tee" so a "Polo Tee" doesn't get classified as a tee).
const CANONICAL_PATTERNS: Array<{ id: string; patterns: RegExp[] }> = [
  { id: "bucket-hat",      patterns: [/bucket\s*hat/i] },
  { id: "cap-structured",  patterns: [/\bcap\b/i, /trucker/i, /snapback/i] },
  { id: "beanie",          patterns: [/beanie/i] },
  { id: "rugby-shell-jacket", patterns: [/shell\s*jacket/i, /\bshell\b/i, /rain\s*jacket/i] },
  { id: "zip-hoodie",      patterns: [/zip\s*hoodie/i, /zip\s*up\s*hoodie/i] },
  { id: "hoodie",          patterns: [/hoodie/i, /hood\s*pullover/i] },
  { id: "crew-neck",       patterns: [/crew\s*neck/i, /crewneck/i] },
  { id: "training-singlet", patterns: [/singlet/i, /tank\s*top/i] },
  { id: "dri-fit-polo",    patterns: [/\bpolo\b/i] },
  { id: "dri-fit-shirt",   patterns: [/dri[\-\s]?fit/i] },
  { id: "cotton-tee",      patterns: [/\btee\b/i, /t[\-\s]?shirt/i] },
];

const PRODUCT_BY_ID = new Map<string, SidelineProduct>(
  SIDELINE_PRODUCTS.map((p) => [p.id, p]),
);

export interface CanonicalMatch {
  productId: string;
  product: SidelineProduct;
  matchedPattern: string;
}

// Default logo placement per canonical product. Used when the closed-drop
// importer attaches the club logo (pulled from Shopify Files) — every line
// item gets one elementUrls entry with these defaults so the PO PDF renders
// the placement grid populated. Romero overrides per item in admin if needed.
//
// Position semantics:
//   - "Left Chest", "Right Chest", "Center Chest" etc. match LOGO_POSITIONS
//     in shared/schema.ts and render in the dedicated grid columns on the PO.
//   - "Front" (for headwear) isn't in LOGO_POSITIONS — it renders in the
//     PO's "Custom Placements" strip below the grid, which is the right
//     visual treatment for caps/beanies/bucket hats anyway.
//   - Application: "Embroidery" | "Screen Print" | "Heat Transfer" | "Sublimation"
export interface DefaultPlacement {
  position: string;
  application: string;
  sizeMm: string;
}

export const DEFAULT_LOGO_PLACEMENTS: Record<string, DefaultPlacement> = {
  "cap-structured":     { position: "Front",        application: "Embroidery",    sizeMm: "70 × 50 mm" },
  "bucket-hat":         { position: "Front",        application: "Embroidery",    sizeMm: "70 × 50 mm" },
  "beanie":             { position: "Front",        application: "Embroidery",    sizeMm: "70 × 50 mm" },
  "cotton-tee":         { position: "Left Chest",   application: "Screen Print",  sizeMm: "85 × 60 mm" },
  "dri-fit-shirt":      { position: "Left Chest",   application: "Heat Transfer", sizeMm: "85 × 60 mm" },
  "dri-fit-polo":       { position: "Left Chest",   application: "Embroidery",    sizeMm: "85 × 60 mm" },
  "training-singlet":   { position: "Center Chest", application: "Screen Print",  sizeMm: "100 × 80 mm" },
  "rugby-shell-jacket": { position: "Left Chest",   application: "Embroidery",    sizeMm: "80 × 60 mm" },
  "hoodie":             { position: "Left Chest",   application: "Screen Print",  sizeMm: "85 × 60 mm" },
  "zip-hoodie":         { position: "Left Chest",   application: "Embroidery",    sizeMm: "85 × 60 mm" },
  "crew-neck":          { position: "Left Chest",   application: "Screen Print",  sizeMm: "85 × 60 mm" },
};

/**
 * Map a Shopify product title to a canonical Supporters Range product.
 * Returns null if the title doesn't match any of the 7-SKU patterns —
 * caller should skip the line item (e.g. shipping fees, gift cards).
 */
export function matchSupporterProduct(title: string): CanonicalMatch | null {
  if (!title) return null;
  const cleaned = title.trim();
  for (const { id, patterns } of CANONICAL_PATTERNS) {
    for (const pat of patterns) {
      if (pat.test(cleaned)) {
        const product = PRODUCT_BY_ID.get(id);
        if (product) return { productId: id, product, matchedPattern: pat.source };
      }
    }
  }
  return null;
}

/**
 * Normalise a Shopify variant title (e.g. "Black / L", "L", "Size: M") to
 * the size token used in the PO size breakdown. Strips colour, "Size:" prefix,
 * and trims. Returns "One Size" for headwear and uppercase otherwise.
 */
export function extractSizeFromVariant(variantTitle: string | null | undefined, productId: string): string {
  const product = PRODUCT_BY_ID.get(productId);
  const headwear = product?.category === "Headwear";
  if (!variantTitle || variantTitle.trim() === "" || /default\s*title/i.test(variantTitle)) {
    return headwear ? "One Size" : "M";
  }
  // Shopify joins option values with " / ". For supporter drops the size is
  // usually the LAST option (Colour / Size). Take the last segment, strip
  // common prefixes, uppercase.
  const last = variantTitle.split("/").map((s) => s.trim()).filter(Boolean).pop() || variantTitle;
  const stripped = last.replace(/^size\s*[:\-]\s*/i, "").trim();
  return stripped.toUpperCase();
}
