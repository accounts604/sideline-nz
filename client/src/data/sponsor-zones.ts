export type SportId = "rugby" | "basketball" | "netball" | "football" | "league";
export type PricingTier = "premium" | "standard" | "value";

export interface SponsorZone {
  id: string;
  name: string;
  description: string;
  typicalSize: string;
  visibilityRating: 1 | 2 | 3 | 4 | 5;
  tier: PricingTier;
  suggestedPriceRange: string;
  notes?: string;
}

export interface SportConfig {
  id: SportId;
  label: string;
  garmentLabel: string;
  zones: SponsorZone[];
}

export interface PricingTierInfo {
  tier: PricingTier;
  label: string;
  color: string;
  description: string;
  priceGuidance: string;
}

export const PRICING_TIERS: PricingTierInfo[] = [
  {
    tier: "premium",
    label: "Premium",
    color: "#FFD700",
    description: "Highest visibility zones. Maximum exposure for major sponsors.",
    priceGuidance: "$800 - $2,000+ per season",
  },
  {
    tier: "standard",
    label: "Standard",
    color: "#C0C0C0",
    description: "Strong secondary placements. Great value for supporting sponsors.",
    priceGuidance: "$300 - $800 per season",
  },
  {
    tier: "value",
    label: "Value",
    color: "#CD7F32",
    description: "Entry-level placements perfect for local businesses and community supporters.",
    priceGuidance: "$100 - $300 per season",
  },
];

export function getTierInfo(tier: PricingTier): PricingTierInfo {
  return PRICING_TIERS.find((t) => t.tier === tier)!;
}

const rugbyZones: SponsorZone[] = [
  {
    id: "front-chest",
    name: "Front Chest Panel",
    description: "The most prominent placement on the jersey. Visible in all match footage, photos, and presentations.",
    typicalSize: "300mm x 200mm",
    visibilityRating: 5,
    tier: "premium",
    suggestedPriceRange: "$800 - $2,000+",
    notes: "Best suited for your principal sponsor or naming rights partner.",
  },
  {
    id: "upper-back",
    name: "Upper Back",
    description: "Highly visible on TV replays, team photos, and when players are running away from camera.",
    typicalSize: "300mm x 100mm",
    visibilityRating: 4,
    tier: "premium",
    suggestedPriceRange: "$600 - $1,500",
  },
  {
    id: "left-sleeve",
    name: "Left Sleeve",
    description: "Visible in side-on match footage and during handshakes or presentations.",
    typicalSize: "150mm x 100mm",
    visibilityRating: 3,
    tier: "standard",
    suggestedPriceRange: "$300 - $700",
  },
  {
    id: "right-sleeve",
    name: "Right Sleeve",
    description: "Matches the left sleeve for symmetry or a different supporting sponsor.",
    typicalSize: "150mm x 100mm",
    visibilityRating: 3,
    tier: "standard",
    suggestedPriceRange: "$300 - $700",
  },
  {
    id: "lower-back",
    name: "Lower Back",
    description: "Visible when the jersey is tucked or during scrums and rucks.",
    typicalSize: "300mm x 150mm",
    visibilityRating: 3,
    tier: "standard",
    suggestedPriceRange: "$300 - $600",
  },
  {
    id: "collar",
    name: "Collar / Neckline",
    description: "Subtle branding near the neckline. Great for apparel or lifestyle brands.",
    typicalSize: "80mm x 30mm",
    visibilityRating: 2,
    tier: "value",
    suggestedPriceRange: "$100 - $300",
  },
  {
    id: "shorts-front",
    name: "Shorts Front Thigh",
    description: "Visible during play and in full-body photos. Often paired with the jersey chest sponsor.",
    typicalSize: "120mm x 80mm",
    visibilityRating: 2,
    tier: "value",
    suggestedPriceRange: "$150 - $400",
  },
];

const basketballZones: SponsorZone[] = [
  {
    id: "front-chest",
    name: "Front Chest Panel",
    description: "Primary sponsor placement on the singlet front. Highly visible during gameplay and media.",
    typicalSize: "280mm x 180mm",
    visibilityRating: 5,
    tier: "premium",
    suggestedPriceRange: "$800 - $2,000+",
  },
  {
    id: "upper-back",
    name: "Upper Back",
    description: "Prominent on replays and when players move up-court.",
    typicalSize: "280mm x 100mm",
    visibilityRating: 4,
    tier: "premium",
    suggestedPriceRange: "$600 - $1,500",
  },
  {
    id: "lower-back",
    name: "Lower Back",
    description: "Visible below the player number during gameplay.",
    typicalSize: "250mm x 140mm",
    visibilityRating: 3,
    tier: "standard",
    suggestedPriceRange: "$300 - $700",
  },
  {
    id: "side-panel-left",
    name: "Left Side Panel",
    description: "Side panel placement visible during lateral movement and bench shots.",
    typicalSize: "100mm x 200mm",
    visibilityRating: 2,
    tier: "standard",
    suggestedPriceRange: "$200 - $500",
  },
  {
    id: "side-panel-right",
    name: "Right Side Panel",
    description: "Matching right-side placement for symmetry or a second supporting sponsor.",
    typicalSize: "100mm x 200mm",
    visibilityRating: 2,
    tier: "standard",
    suggestedPriceRange: "$200 - $500",
  },
  {
    id: "shorts-front",
    name: "Shorts Front",
    description: "Front thigh placement visible in full-body shots.",
    typicalSize: "120mm x 80mm",
    visibilityRating: 2,
    tier: "value",
    suggestedPriceRange: "$150 - $400",
  },
  {
    id: "shorts-waistband",
    name: "Shorts Waistband",
    description: "Waistband strip placement for subtle branding.",
    typicalSize: "200mm x 40mm",
    visibilityRating: 1,
    tier: "value",
    suggestedPriceRange: "$100 - $250",
  },
];

const netballZones: SponsorZone[] = [
  {
    id: "front-chest",
    name: "Front Chest Panel",
    description: "Primary sponsor spot on the dress or top. Maximum visibility during play and presentations.",
    typicalSize: "250mm x 160mm",
    visibilityRating: 5,
    tier: "premium",
    suggestedPriceRange: "$800 - $2,000+",
  },
  {
    id: "upper-back",
    name: "Upper Back",
    description: "Visible in all rear-facing footage and during attacking play.",
    typicalSize: "250mm x 100mm",
    visibilityRating: 4,
    tier: "premium",
    suggestedPriceRange: "$600 - $1,500",
  },
  {
    id: "left-sleeve",
    name: "Left Sleeve Cap",
    description: "Sleeve cap placement on the dress or top.",
    typicalSize: "100mm x 80mm",
    visibilityRating: 3,
    tier: "standard",
    suggestedPriceRange: "$250 - $600",
  },
  {
    id: "right-sleeve",
    name: "Right Sleeve Cap",
    description: "Matching right sleeve cap for symmetry.",
    typicalSize: "100mm x 80mm",
    visibilityRating: 3,
    tier: "standard",
    suggestedPriceRange: "$250 - $600",
  },
  {
    id: "lower-back",
    name: "Lower Back",
    description: "Below the position bib area. Visible during attacking transitions.",
    typicalSize: "250mm x 120mm",
    visibilityRating: 3,
    tier: "standard",
    suggestedPriceRange: "$300 - $600",
  },
  {
    id: "skirt-hem",
    name: "Skirt / Hem Panel",
    description: "Lower garment branding opportunity.",
    typicalSize: "200mm x 60mm",
    visibilityRating: 2,
    tier: "value",
    suggestedPriceRange: "$100 - $300",
  },
];

const footballZones: SponsorZone[] = [
  {
    id: "front-chest",
    name: "Front Chest Panel",
    description: "The centrepiece of any football kit. Massive visibility in match play and media.",
    typicalSize: "300mm x 200mm",
    visibilityRating: 5,
    tier: "premium",
    suggestedPriceRange: "$800 - $2,000+",
  },
  {
    id: "upper-back",
    name: "Upper Back",
    description: "Below the player name/number. Visible on all rear-facing coverage.",
    typicalSize: "280mm x 100mm",
    visibilityRating: 4,
    tier: "premium",
    suggestedPriceRange: "$600 - $1,500",
  },
  {
    id: "left-sleeve",
    name: "Left Sleeve",
    description: "Sleeve branding visible during throw-ins, celebrations, and lateral shots.",
    typicalSize: "130mm x 90mm",
    visibilityRating: 3,
    tier: "standard",
    suggestedPriceRange: "$300 - $700",
  },
  {
    id: "right-sleeve",
    name: "Right Sleeve",
    description: "Matching right sleeve sponsor for balance or a different partner.",
    typicalSize: "130mm x 90mm",
    visibilityRating: 3,
    tier: "standard",
    suggestedPriceRange: "$300 - $700",
  },
  {
    id: "lower-back",
    name: "Lower Back",
    description: "Above the jersey hem. Visible when the shirt is tucked in.",
    typicalSize: "280mm x 120mm",
    visibilityRating: 3,
    tier: "standard",
    suggestedPriceRange: "$300 - $600",
  },
  {
    id: "shorts-front",
    name: "Shorts Front Thigh",
    description: "Front of shorts placement for additional sponsor exposure.",
    typicalSize: "120mm x 80mm",
    visibilityRating: 2,
    tier: "value",
    suggestedPriceRange: "$150 - $400",
  },
  {
    id: "socks",
    name: "Sock Turnover",
    description: "Sock cuff branding. Subtle but visible in close-up footage.",
    typicalSize: "100mm x 40mm",
    visibilityRating: 1,
    tier: "value",
    suggestedPriceRange: "$100 - $200",
  },
];

const leagueZones: SponsorZone[] = [
  {
    id: "front-chest",
    name: "Front Chest Panel",
    description: "The hero placement. Maximum visibility across all broadcast and photography.",
    typicalSize: "300mm x 200mm",
    visibilityRating: 5,
    tier: "premium",
    suggestedPriceRange: "$800 - $2,000+",
  },
  {
    id: "upper-back",
    name: "Upper Back",
    description: "Highly visible in breakaway plays and team lineups.",
    typicalSize: "300mm x 100mm",
    visibilityRating: 4,
    tier: "premium",
    suggestedPriceRange: "$600 - $1,500",
  },
  {
    id: "left-sleeve",
    name: "Left Sleeve",
    description: "Sleeve placement prominent during tackles and ball-carrying.",
    typicalSize: "150mm x 100mm",
    visibilityRating: 3,
    tier: "standard",
    suggestedPriceRange: "$300 - $700",
  },
  {
    id: "right-sleeve",
    name: "Right Sleeve",
    description: "Matching right sleeve for a second sponsor or brand consistency.",
    typicalSize: "150mm x 100mm",
    visibilityRating: 3,
    tier: "standard",
    suggestedPriceRange: "$300 - $700",
  },
  {
    id: "lower-back",
    name: "Lower Back",
    description: "Visible below the player number during play and in team huddles.",
    typicalSize: "300mm x 150mm",
    visibilityRating: 3,
    tier: "standard",
    suggestedPriceRange: "$300 - $600",
  },
  {
    id: "collar",
    name: "Collar Panel",
    description: "Neckline branding for a premium, subtle look.",
    typicalSize: "80mm x 30mm",
    visibilityRating: 2,
    tier: "value",
    suggestedPriceRange: "$100 - $300",
  },
  {
    id: "shorts-front",
    name: "Shorts Front",
    description: "Front thigh placement for additional brand exposure.",
    typicalSize: "120mm x 80mm",
    visibilityRating: 2,
    tier: "value",
    suggestedPriceRange: "$150 - $400",
  },
];

export const SPORT_CONFIGS: SportConfig[] = [
  { id: "rugby", label: "Rugby", garmentLabel: "Jersey", zones: rugbyZones },
  { id: "basketball", label: "Basketball", garmentLabel: "Singlet", zones: basketballZones },
  { id: "netball", label: "Netball", garmentLabel: "Dress", zones: netballZones },
  { id: "football", label: "Football", garmentLabel: "Jersey", zones: footballZones },
  { id: "league", label: "League", garmentLabel: "Jersey", zones: leagueZones },
];

export function getSportConfig(id: SportId): SportConfig {
  return SPORT_CONFIGS.find((s) => s.id === id)!;
}
