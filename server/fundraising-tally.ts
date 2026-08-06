// Live fundraising tally for supporter campaign drops.
//
// Under the 2026 club funding model, a fixed amount from every item sold goes
// to the club. That is deliberately a PER-UNIT amount, not a percentage of
// profit: a club can verify it from their own receipts without ever seeing our
// cost base, and there is no threshold that pays a small club nothing.
//
// NOTE: `summarizeSupporterOrders()` in shopify-admin.ts still computes a
// profit share as revenue x basis-points. That is the OLD tiered model. Do not
// reuse it here — this module is the source of truth for the per-unit model.
//
// This renders a tally block into the collection description and each product
// description, between sentinel comments so it can be rewritten in place on
// every run. We patch static HTML rather than fetching live from the browser
// because:
//   - the storefront and the headless site are different origins, so a client
//     fetch would need CORS on a public money endpoint;
//   - Shopify full-page caching means a client fetch can be served stale
//     anyway, and baked HTML is cached consistently with the rest of the page.

import {
  fetchSupporterOrdersByCollection,
  fetchProductsInCollection,
  getCollectionGidByHandle,
  updateCollectionDescription,
  updateProductDescription,
  fetchCollectionDescription,
  fetchProductDescriptions,
  isShopifyAdminConfigured,
  type SupporterOrder,
} from "./shopify-admin";

/** Cents returned to the club per item sold. */
export const CLUB_SHARE_CENTS_PER_UNIT = 500;

/** Order financial states that must NOT count toward the tally. A refunded
 *  order takes its club contribution with it. */
const EXCLUDED_FINANCIAL_STATUS = new Set(["REFUNDED", "VOIDED", "EXPIRED"]);

export interface CampaignConfig {
  /** Shopify collection handle. */
  handle: string;
  /** Club name as supporters know it. */
  club: string;
  /** Item-count goal used for the progress bar. */
  goalUnits: number;
  /** Only count orders from this date onward (ISO yyyy-mm-dd). Protects the
   *  tally from crediting pre-model sales to the new scheme. */
  countFrom: string;
}

/**
 * Campaigns that display a tally. Handle-keyed rather than read from
 * club_accounts because not every collection is a fundraising drop — the
 * league hub and team-kit collections deliberately have no tally.
 *
 * TODO: move to club_accounts once every drop has a row there.
 */
export const CAMPAIGNS: CampaignConfig[] = [
  { handle: "2026-malisi-samoa-nz-supporters-range", club: "Malisi Samoa NZ", goalUnits: 100, countFrom: "2026-08-05" },
  { handle: "2026-pineula-salani-supporters-range", club: "Pineula Salani", goalUnits: 100, countFrom: "2026-08-05" },
  { handle: "2026-nations-rugby-supporters-range", club: "Nations Rugby", goalUnits: 100, countFrom: "2026-08-05" },
  { handle: "2026-apia-maroons-supporters-range", club: "Apia Maroons", goalUnits: 100, countFrom: "2026-08-06" },
];

export interface CampaignTally {
  handle: string;
  club: string;
  units: number;
  orderCount: number;
  supporters: number;
  raisedCents: number;
  goalUnits: number;
  pct: number;
}

const START = "<!--SPC-TALLY-->";
const END = "<!--/SPC-TALLY-->";

function money(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-NZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** Count units and distinct supporters across orders that actually stand. */
export function computeTally(cfg: CampaignConfig, orders: SupporterOrder[]): CampaignTally {
  const from = new Date(cfg.countFrom + "T00:00:00Z").getTime();
  const counted = orders.filter((o) => {
    if (EXCLUDED_FINANCIAL_STATUS.has((o.financialStatus || "").toUpperCase())) return false;
    return new Date(o.createdAt).getTime() >= from;
  });

  let units = 0;
  const supporters = new Set<string>();
  for (const o of counted) {
    for (const l of o.lines) units += l.quantity;
    supporters.add((o.customerEmail || o.customerName || o.id).toLowerCase());
  }

  const raisedCents = units * CLUB_SHARE_CENTS_PER_UNIT;
  const pct = cfg.goalUnits > 0 ? Math.min(100, Math.round((units / cfg.goalUnits) * 100)) : 0;

  return {
    handle: cfg.handle,
    club: cfg.club,
    units,
    orderCount: counted.length,
    supporters: supporters.size,
    raisedCents,
    goalUnits: cfg.goalUnits,
    pct,
  };
}

/** Full-width block for the collection page. */
export function renderCollectionTally(t: CampaignTally): string {
  const share = money(CLUB_SHARE_CENTS_PER_UNIT);
  // An empty campaign should invite the first order, not display a dead zero.
  const headline =
    t.units === 0
      ? `Be the first to back ${escapeHtml(t.club)}`
      : `${money(t.raisedCents)} raised for ${escapeHtml(t.club)}`;
  const meta =
    t.units === 0
      ? `${share} from every item goes straight to the club.`
      : `${t.units} item${t.units === 1 ? "" : "s"} from ${t.supporters} supporter${t.supporters === 1 ? "" : "s"} &middot; ${share} from every item goes straight to the club.`;

  return `${START}
<div style="max-width:1000px;margin:0 auto;padding:0 20px 8px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">
<div style="background:#f7f9f7;border:1px solid #e3e9e3;border-radius:12px;padding:20px 24px">
<p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#888;margin:0 0 6px">Club Fundraising</p>
<p style="font-size:26px;font-weight:800;color:#1c6b3a;margin:0 0 12px">${headline}</p>
<div style="background:#e3e9e3;border-radius:999px;height:10px;overflow:hidden;margin:0 0 10px" role="img" aria-label="${t.pct}% of goal">
<div style="background:#1c6b3a;height:100%;width:${t.pct}%;border-radius:999px"></div>
</div>
<p style="font-size:13px;color:#555;margin:0">${meta}</p>
<p style="font-size:12px;color:#999;margin:6px 0 0">${t.pct}% of the ${t.goalUnits}-item goal</p>
</div>
</div>
${END}`;
}

/** Compact one-liner for a product page. */
export function renderProductTally(t: CampaignTally): string {
  const share = money(CLUB_SHARE_CENTS_PER_UNIT);
  // Zero state deliberately has no club name in the tail: the bold sentence
  // already names the club, so repeating it reads badly.
  const tail =
    t.units === 0
      ? "Be the first to order."
      : `${money(t.raisedCents)} raised so far from ${t.units} item${t.units === 1 ? "" : "s"}.`;
  return `${START}
<p style="background:#f7f9f7;border-left:3px solid #1c6b3a;padding:12px 16px;margin:16px 0 0;font-size:14px;color:#333;border-radius:0 6px 6px 0">
<strong>${share} from this item goes to ${escapeHtml(t.club)}.</strong> ${tail}
</p>
${END}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Replace the tally block in `html`, or insert it if absent.
 *
 * Collection descriptions are split into a hero region and a details region by
 * a `<!-- SPLIT -->` marker; the tally belongs at the end of the hero so it
 * sits above the products. Anything without a SPLIT just gets it appended.
 */
export function patchDescription(html: string, block: string, mode: "collection" | "product"): string {
  const existing = new RegExp(`${START}[\\s\\S]*?${END}`);
  if (existing.test(html)) return html.replace(existing, block);

  if (mode === "collection") {
    const splitAt = html.indexOf("<!-- SPLIT -->");
    if (splitAt !== -1) {
      return html.slice(0, splitAt) + block + html.slice(splitAt);
    }
  }
  return html + "\n" + block;
}

export interface SyncResult {
  handle: string;
  club: string;
  units: number;
  raisedCents: number;
  collectionUpdated: boolean;
  productsUpdated: number;
  productsSkippedUnchanged: number;
  error?: string;
}

/** Recompute one campaign's tally and write it into the collection + products. */
export async function syncCampaignTally(cfg: CampaignConfig, opts?: { dryRun?: boolean }): Promise<SyncResult> {
  const dryRun = opts?.dryRun ?? false;
  const base: SyncResult = {
    handle: cfg.handle,
    club: cfg.club,
    units: 0,
    raisedCents: 0,
    collectionUpdated: false,
    productsUpdated: 0,
    productsSkippedUnchanged: 0,
  };

  try {
    const orders = await fetchSupporterOrdersByCollection(cfg.handle, { sinceDays: 365 });
    const tally = computeTally(cfg, orders);
    base.units = tally.units;
    base.raisedCents = tally.raisedCents;

    // ── Collection ──
    const gid = await getCollectionGidByHandle(cfg.handle);
    if (!gid) throw new Error(`Collection not found: ${cfg.handle}`);
    const currentDesc = await fetchCollectionDescription(gid);
    const nextDesc = patchDescription(currentDesc ?? "", renderCollectionTally(tally), "collection");
    if (nextDesc !== currentDesc) {
      if (!dryRun) await updateCollectionDescription(gid, nextDesc);
      base.collectionUpdated = true;
    }

    // ── Products ──
    const products = await fetchProductsInCollection(cfg.handle);
    const gids = products.map((p) => p.id).filter(Boolean);
    const descs = await fetchProductDescriptions(gids);
    const productBlock = renderProductTally(tally);
    for (const { id, descriptionHtml } of descs) {
      const next = patchDescription(descriptionHtml ?? "", productBlock, "product");
      if (next === descriptionHtml) {
        base.productsSkippedUnchanged += 1;
        continue;
      }
      if (!dryRun) await updateProductDescription(id, next);
      base.productsUpdated += 1;
    }

    return base;
  } catch (err: any) {
    base.error = err?.message ? String(err.message) : String(err);
    return base;
  }
}

/** Recompute every configured campaign. Never throws — one bad campaign must
 *  not stop the rest, since this runs unattended on a schedule. */
export async function syncAllTallies(opts?: { dryRun?: boolean }): Promise<SyncResult[]> {
  if (!isShopifyAdminConfigured()) {
    throw new Error("Shopify Admin API not configured. Set SHOPIFY_STORE_URL + SHOPIFY_ADMIN_TOKEN.");
  }
  const out: SyncResult[] = [];
  for (const cfg of CAMPAIGNS) {
    out.push(await syncCampaignTally(cfg, opts));
  }
  return out;
}
