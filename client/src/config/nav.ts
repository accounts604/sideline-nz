import { SPORTS } from "@/data/sports";

// Single source of truth for the marketing-site nav.
// Consumed by layout.tsx (desktop header + footer) and mobile-menu.tsx.

export interface NavLink {
  href: string;
  label: string;
  external?: boolean;
  children?: NavLink[];
}

export const NAV_LINKS: NavLink[] = [
  {
    href: "/sports",
    label: "Sports",
    children: SPORTS.filter((s) => s.id !== "other").map((s) => ({
      href: `/sports/${s.id}`,
      label: s.name,
    })),
  },
  { href: "/clubs", label: "Clubs" },
  { href: "/schools", label: "Schools" },
  { href: "/sponsor-placement", label: "Sponsors" },
  {
    href: "/team-stores",
    label: "Team Stores",
    children: [
      { href: "/team-stores", label: "All Team Stores" },
      { href: "/competitions/auckland-samoa-rfu", label: "Auckland Samoa RFU" },
    ],
  },
  { href: "/our-work", label: "Our Work" },
  { href: "https://teamstore.sidelinenz.com", label: "Shop", external: true },
  { href: "/contact", label: "Contact" },
];

export const FOOTER_COLUMNS: { title: string; links: NavLink[] }[] = [
  {
    title: "For Teams",
    links: [
      { href: "/sports", label: "Sports" },
      { href: "/clubs", label: "Clubs" },
      { href: "/schools", label: "Schools" },
      { href: "/sponsor-placement", label: "Sponsors" },
    ],
  },
  {
    title: "Shop",
    links: [
      { href: "/team-stores", label: "Team Stores" },
      { href: "https://teamstore.sidelinenz.com", label: "Supporters Shop", external: true },
      { href: "https://teamstore.sidelinenz.com/pages/open-pre-orders", label: "Open Pre-Orders", external: true },
      { href: "/size-chart", label: "Size Chart" },
    ],
  },
  {
    title: "Get Started",
    links: [
      { href: "/free-mockup", label: "Get a Free Mockup" },
      { href: "/quote", label: "Get a Quote" },
      { href: "/our-work", label: "Our Work" },
      { href: "/contact", label: "Contact" },
    ],
  },
];
