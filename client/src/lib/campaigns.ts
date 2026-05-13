/**
 * Store campaign configuration.
 * Each key is a Shopify collection handle (storeSlug).
 * When a campaign is active, the store shows a countdown.
 * After the cutoff, ordering is disabled.
 */

export interface StoreCampaign {
  /** Campaign display name */
  name: string;
  /** Order cutoff date/time (NZ time) — ISO-8601 string */
  cutoff: string;
  /** Estimated delivery description shown after cutoff */
  estimatedDelivery: string;
  /** Optional incentive text shown alongside the countdown */
  incentives?: string[];
}

/**
 * Map of storeSlug → campaign config.
 * Add new campaigns here as stores launch.
 */
export const STORE_CAMPAIGNS: Record<string, StoreCampaign> = {
  "st-peters": {
    name: "St Peters 2026",
    cutoff: "2026-05-03T17:00:00+12:00", // May 3rd 2026, 5:00 PM NZST
    estimatedDelivery: "4–5 weeks from campaign close (early June 2026)",
    incentives: [
      "Free shipping on all orders",
      "Club earns profit share on every order — the more you order, the more your club earns",
      "50–99 units: 6% · 100–149: 8% · 150–199: 10% · 200+: 12%",
    ],
  },
};

/** Returns campaign config for a store, or null if no active campaign */
export function getCampaign(storeSlug: string): StoreCampaign | null {
  return STORE_CAMPAIGNS[storeSlug] ?? null;
}

/** Returns true if the campaign cutoff has passed */
export function isCampaignClosed(campaign: StoreCampaign): boolean {
  return new Date() >= new Date(campaign.cutoff);
}

/** Returns { days, hours, minutes, seconds } until cutoff, or null if closed */
export function getTimeRemaining(campaign: StoreCampaign): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
} | null {
  const diff = new Date(campaign.cutoff).getTime() - Date.now();
  if (diff <= 0) return null;

  return {
    total: diff,
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}
