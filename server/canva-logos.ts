// Pure helpers for working with Canva design URLs / IDs and assembling
// LogoElement entries from club_logo_assets rows. The server has no direct
// Canva API integration — it stores the design ID + a cached preview URL,
// and the admin UI / seeder do the actual Canva interaction out-of-band.

import type { ClubLogoAsset, LogoElement } from "@shared/schema";

// Canva design URLs come in a few shapes. Examples seen in the wild:
//   https://www.canva.com/d/DAHCpwD2ghs
//   https://www.canva.com/d/DAHCpwD2ghs/edit
//   https://www.canva.com/design/DAHCpwD2ghs/edit
//   https://www.canva.com/design/DAHCpwD2ghs/abc123/edit?utm=…
//
// Plus shortlinks like https://www.canva.com/d/IYbSDN_Zi4NUHr9 (view URL,
// different ID-shape — base62, no DA prefix). The server stores the canonical
// design ID (DA-prefixed when available) so we can reconstruct a stable URL.
const DESIGN_ID_RE = /\/(?:d|design)\/([A-Za-z0-9_-]{10,})/;

export function extractCanvaDesignId(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const m = url.match(DESIGN_ID_RE);
  return m ? m[1] : null;
}

export function buildCanvaEditUrl(designId: string, pageIndex?: number | null): string {
  const base = `https://www.canva.com/design/${designId}/edit`;
  return pageIndex && pageIndex > 1 ? `${base}?page=${pageIndex}` : base;
}

// Build a LogoElement suitable for orderItems.elementUrls from a stored asset.
// Position / application default to embroidery on the centre chest — operators
// adjust per garment in the admin UI after raise-PO. Choosing a default beats
// leaving the field unassigned because the placement grid then renders nothing
// until the operator touches it.
export function logoElementFromAsset(
  asset: ClubLogoAsset,
  opts?: { defaultPosition?: string; defaultApplication?: string },
): LogoElement {
  return {
    name: asset.displayLabel || "Club logo",
    url: asset.previewUrl || buildCanvaEditUrl(asset.canvaDesignId, asset.canvaPageIndex),
    position: opts?.defaultPosition ?? "Center Chest",
    application: opts?.defaultApplication ?? "Embroidery",
  };
}

// Where a club/primary logo sits on a given garment. HATS always take the logo
// CENTER FRONT, embroidered (Romero rule, 2026-06-29). Everything else uses the
// asset's stored placement (or Left Chest) + its application.
export function clubLogoPlacement(
  productType?: string | null,
  asset?: { defaultPosition?: string | null; defaultApplication?: string | null } | null,
): { position: string; application: string } {
  if (/cap|bucket|beanie|hat/i.test(productType || "")) return { position: "Center Front", application: "Embroidery" };
  return { position: asset?.defaultPosition || "Left Chest", application: asset?.defaultApplication || "Embroidery" };
}

// Check whether a LogoElement[] already contains this asset — used by the
// PO-raise hook to stay idempotent across re-raises and the manual "Resend
// PDF + Drive Share" flow.
export function logoListHasAsset(elements: LogoElement[] | null | undefined, asset: ClubLogoAsset): boolean {
  if (!elements || elements.length === 0) return false;
  const target = asset.previewUrl ?? buildCanvaEditUrl(asset.canvaDesignId, asset.canvaPageIndex);
  return elements.some((el) => el.url === target);
}
