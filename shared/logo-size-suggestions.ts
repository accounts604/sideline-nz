// Industry-standard logo sizes per (application, position). Source: Romero's
// 2026-05-13 spec sheet — Sideline NZ Ltd Special Pricing. Returns a list of
// canonical size strings the admin can pick from in the LogoElementEditor's
// SIZE field (or just type their own). The order in the array drives the
// dropdown ranking.

type Application = string;
type Position = string;

// (application, position) → size suggestions, most-recommended first
const SIZE_TABLE: Record<string, string[]> = {
  // ── Embroidery ──────────────────────────────────────────────────
  "embroidery|left chest":        ["85 × 60 mm", "85 × 75 mm", "100 × 80 mm (max)"],
  "embroidery|right chest":       ["85 × 60 mm", "85 × 75 mm"],
  "embroidery|center chest":      ["150 × 80 mm", "180 × 100 mm"],
  "embroidery|centre chest":      ["150 × 80 mm", "180 × 100 mm"],
  "embroidery|center back":       ["280 × 80 mm (back yoke)", "300 × 270 mm (full back)"],
  "embroidery|centre back":       ["280 × 80 mm (back yoke)", "300 × 270 mm (full back)"],
  "embroidery|back upper":        ["280 × 80 mm (yoke)"],
  "embroidery|sleeve":            ["70 × 30 mm", "70 × 40 mm"],
  "embroidery|left sleeve":       ["70 × 30 mm", "70 × 40 mm"],
  "embroidery|right sleeve":      ["70 × 30 mm", "70 × 40 mm"],
  "embroidery|cuff":              ["70 × 25 mm"],

  // ── Supa Colour Print / heat-transfer ──────────────────────────
  // Codes: SQ (300×270 adults), A4 (234×210 fallback), A5 (167×150 kids)
  "supa colour print|center back": ["SQ — 300 × 270 mm (adults)", "A4 — 234 × 210 mm (fallback)", "A5 — 167 × 150 mm (kids)"],
  "supa colour print|centre back": ["SQ — 300 × 270 mm (adults)", "A4 — 234 × 210 mm (fallback)", "A5 — 167 × 150 mm (kids)"],
  "supa colour print|front center": ["SQ — 300 × 270 mm (adults)", "A4 — 234 × 210 mm", "A5 — 167 × 150 mm (kids)"],
  "supa colour print|front centre": ["SQ — 300 × 270 mm (adults)", "A4 — 234 × 210 mm", "A5 — 167 × 150 mm (kids)"],
  "heat transfer|center back":    ["SQ — 300 × 270 mm (adults)", "A4 — 234 × 210 mm", "A5 — 167 × 150 mm (kids)"],
  "heat transfer|centre back":    ["SQ — 300 × 270 mm (adults)", "A4 — 234 × 210 mm", "A5 — 167 × 150 mm (kids)"],
  "heat transfer|front center":   ["SQ — 300 × 270 mm (adults)", "A4 — 234 × 210 mm", "A5 — 167 × 150 mm (kids)"],
  "heat transfer|front centre":   ["SQ — 300 × 270 mm (adults)", "A4 — 234 × 210 mm", "A5 — 167 × 150 mm (kids)"],
  "heat transfer|left chest":     ["85 × 60 mm", "85 × 75 mm"],
  "heat transfer|right chest":    ["85 × 60 mm", "85 × 75 mm"],

  // ── Headwear (embroidery on headwear) ───────────────────────────
  "embroidery|front":             ["110 × 50 mm (cap front)", "70 × 35 mm (bucket hat panel)", "80 × 40 mm (beanie cuff)"],
  "embroidery|cap front":         ["110 × 50 mm"],
  "embroidery|cap side":          ["50 × 30 mm"],
  "embroidery|cap back":          ["80 × 30 mm"],
  "embroidery|beanie cuff":       ["80 × 40 mm"],
  "embroidery|bucket hat front":  ["70 × 35 mm"],

  // ── Screen print — same canonical sizes as embroidery for chest/back
  "screen print|left chest":      ["85 × 60 mm", "85 × 75 mm"],
  "screen print|right chest":     ["85 × 60 mm"],
  "screen print|center chest":    ["150 × 80 mm"],
  "screen print|centre chest":    ["150 × 80 mm"],
  "screen print|center back":     ["SQ — 300 × 270 mm", "A4 — 234 × 210 mm"],
  "screen print|centre back":     ["SQ — 300 × 270 mm", "A4 — 234 × 210 mm"],

  // ── Sublimation — sizes are part of the artwork, no per-position
  // recommendation; suggest the standard chest/back values for sanity.
  "sublimation|left chest":       ["85 × 60 mm"],
  "sublimation|right chest":      ["85 × 60 mm"],
  "sublimation|center back":      ["280 × 80 mm (yoke)", "300 × 270 mm (full back)"],
  "sublimation|centre back":      ["280 × 80 mm (yoke)", "300 × 270 mm (full back)"],
};

// Application-only fallback when position is missing/non-canonical.
const APPLICATION_FALLBACK: Record<string, string[]> = {
  "embroidery":         ["85 × 60 mm", "70 × 30 mm", "150 × 80 mm", "280 × 80 mm"],
  "screen print":       ["85 × 60 mm", "150 × 80 mm", "SQ — 300 × 270 mm"],
  "supa colour print":  ["SQ — 300 × 270 mm", "A4 — 234 × 210 mm", "A5 — 167 × 150 mm"],
  "heat transfer":      ["SQ — 300 × 270 mm", "A4 — 234 × 210 mm", "A5 — 167 × 150 mm"],
  "sublimation":        ["85 × 60 mm", "300 × 270 mm"],
};

/** Return ordered size suggestions for the given (application, position) pair.
 * Either may be null/empty. Returns the most-recommended canonical sizes first;
 * empty array if neither matches anything. */
export function suggestLogoSizes(application?: string | null, position?: string | null): string[] {
  const app = (application || "").trim().toLowerCase();
  const pos = (position || "").trim().toLowerCase();
  if (app && pos) {
    const hit = SIZE_TABLE[`${app}|${pos}`];
    if (hit) return hit;
  }
  if (app) return APPLICATION_FALLBACK[app] || [];
  return [];
}

/** All canonical sizes grouped by application category for a full <optgroup>
 * dropdown. Order within each group is the canonical order from the spec
 * sheet. Use this when you want the admin to be able to pick ANY size, not
 * just the (application, position)-matched recommendation. */
export const ALL_LOGO_SIZES: Array<{ label: string; options: string[] }> = [
  {
    label: "Supa Colour Print (heat-transfer)",
    options: [
      "SQ — 300 × 270 mm (adults full back/front)",
      "A4 — 234 × 210 mm (kids / fallback)",
      "A5 — 167 × 150 mm (kids)",
    ],
  },
  {
    label: "Embroidery — Chest & Body",
    options: [
      "85 × 60 mm (Left/Right chest)",
      "85 × 75 mm (Left/Right chest)",
      "100 × 80 mm (Left chest max)",
      "150 × 80 mm (Centre chest)",
      "180 × 100 mm (Centre chest max)",
    ],
  },
  {
    label: "Embroidery — Sleeve & Cuff",
    options: [
      "70 × 30 mm (Sleeve upper arm)",
      "70 × 40 mm (Sleeve upper arm)",
      "70 × 25 mm (Cuff)",
    ],
  },
  {
    label: "Embroidery — Back",
    options: [
      "280 × 80 mm (Back yoke)",
      "300 × 270 mm (Full back)",
    ],
  },
  {
    label: "Headwear",
    options: [
      "110 × 50 mm (Cap front)",
      "50 × 30 mm (Cap side)",
      "80 × 30 mm (Cap back, above strap)",
      "80 × 40 mm (Beanie cuff)",
      "70 × 35 mm (Bucket hat front panel)",
    ],
  },
];
