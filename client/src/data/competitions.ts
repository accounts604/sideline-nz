// Competition directory — a dedicated page per competition that features tiles of every
// team store in it. Team tiles render LIVE from Shopify (matched by collection handle), so
// images/titles stay current. To add a team: append its collection handle to `teamHandles`.
// (The club-drop factory appends here automatically at go-live.)

import asrfuLogo from "@assets/asrfu-village-league-logo.png";

export interface Competition {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  /** Optional competition wordmark/logo (transparent PNG) shown in the banner. */
  logo?: string;
  /** Shopify collection handles of the member team stores, in display order. */
  teamHandles: string[];
}

export const COMPETITIONS: Competition[] = [
  {
    slug: "auckland-samoa-rfu",
    name: "Auckland Samoa RFU",
    tagline: "Village League · 2026 Season",
    logo: asrfuLogo,
    description:
      "Back your village. Every Auckland Samoa RFU club has its own supporter store: custom jerseys, tees, hats and more in your colours, made to order and delivered for the season.",
    teamHandles: [
      "2026-vaimoso-tama-ole-mau-team-kit",
      "2026-pineula-salani-supporters-range",
      "2026-malisi-samoa-nz-supporters-range",
    ],
  },
];

export function getCompetition(slug: string): Competition | undefined {
  return COMPETITIONS.find((c) => c.slug === slug);
}
