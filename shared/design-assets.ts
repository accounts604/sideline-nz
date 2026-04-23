// Design asset helpers — single rule for reading 2D prints and 3D mockups
// off an order_items row. The row has two parallel jsonb arrays
// (designPrints, mockupImages) plus two legacy columns (frontDesignUrl,
// backDesignUrl). This file owns the fallback precedence so no renderer
// has to think about it:
//
//   getDesignPrints(item) → always the new array (pure new data, no legacy)
//   getMockups(item)      → mockupImages if non-empty, else synthesized
//                           from the legacy front/back columns
//
// When an admin re-saves an order through the multi-image manager UI, the
// write goes to mockupImages and the legacy fallback stops firing for that
// row — natural per-order migration with no batch backfill.

export type DesignAsset = {
  label: string;  // e.g. "Front", "Back", "Sleeve Detail", "Cuff"
  url: string;
};

// Minimal shape we read from — any object with these optional fields works,
// so both OrderItem (from Drizzle) and the admin UI's local types pass.
type AssetSource = {
  designPrints?: unknown;
  mockupImages?: unknown;
  frontDesignUrl?: string | null;
  backDesignUrl?: string | null;
};

function asArray(v: unknown): DesignAsset[] {
  if (!Array.isArray(v)) return [];
  return (v as any[])
    .filter((x) => x && typeof x === "object" && typeof x.url === "string" && x.url)
    .map((x) => ({ label: String(x.label ?? ""), url: String(x.url) }));
}

export function getDesignPrints(item: AssetSource | null | undefined): DesignAsset[] {
  if (!item) return [];
  return asArray(item.designPrints);
}

export function getMockups(item: AssetSource | null | undefined): DesignAsset[] {
  if (!item) return [];
  const fresh = asArray(item.mockupImages);
  if (fresh.length > 0) return fresh;
  // Legacy fallback — synthesize from front/back columns.
  const legacy: DesignAsset[] = [];
  if (item.frontDesignUrl) legacy.push({ label: "Front", url: item.frontDesignUrl });
  if (item.backDesignUrl) legacy.push({ label: "Back", url: item.backDesignUrl });
  return legacy;
}
