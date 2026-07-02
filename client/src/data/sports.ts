// Canonical sport-code taxonomy — single source of truth for the nav,
// /sports grid, /sports/:id landers, and the quote form prefill.
// `pillLabel` must match the MultiSelectPills option strings in quote.tsx
// exactly (they feed the GHL form-field mapping — do not rename).

export interface Sport {
  id: string;
  name: string;
  pillLabel: string;
  description: string;
  heroLine: string;
  gear: string[];
}

export const SPORTS: Sport[] = [
  {
    id: "rugby",
    name: "Rugby Union",
    pillLabel: "Rugby",
    description: "Custom jerseys, shorts, socks and training gear for rugby clubs and schools.",
    heroLine: "Match-day kit, supporters merch and training gear for rugby clubs, schools and rep teams.",
    gear: ["Match jerseys", "Shorts & socks", "Training tees & singlets", "Hoodies & jackets", "Supporters merch range"],
  },
  {
    id: "league",
    name: "Rugby League",
    pillLabel: "League",
    description: "Performance rugby league kits designed for durability and comfort.",
    heroLine: "Durable league kit and supporters gear built for clubs from juniors to premiers.",
    gear: ["Match jerseys", "Shorts & socks", "Training gear", "Hoodies & jackets", "Supporters merch range"],
  },
  {
    id: "touch",
    name: "Touch",
    pillLabel: "Touch",
    description: "Lightweight, breathable touch rugby apparel.",
    heroLine: "Lightweight, breathable kit for touch modules, socials and rep tournaments.",
    gear: ["Playing tees & singlets", "Shorts", "Caps & buckets", "Team polos"],
  },
  {
    id: "football",
    name: "Football",
    pillLabel: "Football",
    description: "Professional football kits from training to match day.",
    heroLine: "Full football kit from training to match day, plus supporters ranges for your club.",
    gear: ["Match strips", "Training gear", "Keeper kits", "Jackets & hoodies", "Supporters merch range"],
  },
  {
    id: "netball",
    name: "Netball",
    pillLabel: "Netball",
    description: "Custom netball dresses and training apparel for all ages.",
    heroLine: "Custom netball dresses and training apparel for clubs, schools and rep squads.",
    gear: ["Playing dresses", "Bibs", "Training tees", "Hoodies & jackets"],
  },
  {
    id: "basketball",
    name: "Basketball",
    pillLabel: "Basketball",
    description: "Reversible singlets, shorts and warm-ups for basketball teams.",
    heroLine: "Reversible singlets, shorts and warm-ups for school and club basketball.",
    gear: ["Playing singlets", "Reversible sets", "Shooting shirts", "Warm-up gear"],
  },
  {
    id: "hockey",
    name: "Hockey",
    pillLabel: "Hockey",
    description: "Custom hockey uniforms for turf and indoor teams.",
    heroLine: "Custom turf and indoor hockey uniforms for clubs and schools.",
    gear: ["Playing tops", "Skirts & shorts", "Socks", "Training gear"],
  },
  {
    id: "cricket",
    name: "Cricket",
    pillLabel: "Cricket",
    description: "Whites, polos and training gear for cricket clubs.",
    heroLine: "Whites, coloured kit and training gear for cricket clubs and school 1st XIs.",
    gear: ["Playing whites", "Coloured one-day kit", "Polos", "Caps & training gear"],
  },
  {
    id: "other",
    name: "Other Sports",
    pillLabel: "Other",
    description: "Can't find your sport? We cover athletics, volleyball, flag football, AFL and more.",
    heroLine: "Athletics, volleyball, flag football, AFL and anything else your community plays.",
    gear: ["Playing kit", "Training gear", "Supporters merch"],
  },
];

export function getSport(id: string): Sport | undefined {
  return SPORTS.find((s) => s.id === id);
}
