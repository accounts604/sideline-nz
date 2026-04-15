// Canonical branding application options.
// Covers the full industry set for NZ teamwear — keep this as the single
// dropdown source across the admin portal so POs, quotes, and mockups all
// use the same strings.

export const BRANDING_METHODS = [
  "Full Sublimation",
  "Screen Print",
  "Embroidery",
  "Patch Embroidery",        // embroidered patch sewn or heat-pressed on
  "Woven Badge",             // woven label / badge
  "Heat Transfer Vinyl",     // HTV
  "Heat Transfer Print",     // plastisol transfer
  "DTF Print",               // Direct-to-Film
  "DTG Print",               // Direct-to-Garment
  "3D Silicone / Puff Print",
  "Silicone Patch",
  "Tackle Twill / Appliqué",
  "Laser Etched",
  "Reflective Print",
] as const;

export type BrandingMethod = (typeof BRANDING_METHODS)[number];
