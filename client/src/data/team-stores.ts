import manurewaImg from "@assets/Manurewa_Womens_Rugby_June_2025_1767430285397.png";
import maristImg from "@assets/Marist_Samoa_NZ_RFC_November_2025_1767430285399.png";
import americanSamoaImg from "@assets/American_Samoa_Tag_December_2025_1767430285402.png";
import mangereImg from "@assets/Mangere_East_Queenz_July_2025_1767430285404.png";

export interface TeamStore {
  slug: string;
  name: string;
  location: string;
  sport: string;
  tagline: string;
  coverImage: string;
  accentColor: string;
  accentBg: string;
  featuredProducts: { name: string; price: string }[];
}

export const TEAM_STORES: TeamStore[] = [
  {
    slug: "manurewa-womens-rugby",
    name: "Manurewa Women's Rugby",
    location: "Auckland",
    sport: "Rugby",
    tagline: "Official club merchandise",
    coverImage: manurewaImg,
    accentColor: "text-teal-600",
    accentBg: "bg-teal-600",
    featuredProducts: [
      { name: "Home Jersey 2025", price: "$89.00" },
      { name: "Training Tee", price: "$45.00" },
      { name: "Club Hoodie", price: "$75.00" },
      { name: "Match Shorts", price: "$55.00" },
    ],
  },
  {
    slug: "marist-samoa-nz-rfc",
    name: "Marist Samoa NZ RFC",
    location: "Auckland",
    sport: "Rugby",
    tagline: "Proud rugby heritage",
    coverImage: maristImg,
    accentColor: "text-green-600",
    accentBg: "bg-green-600",
    featuredProducts: [
      { name: "Match Jersey", price: "$95.00" },
      { name: "Supporters Tee", price: "$40.00" },
      { name: "Training Singlet", price: "$35.00" },
      { name: "Club Cap", price: "$29.00" },
    ],
  },
  {
    slug: "american-samoa-tag",
    name: "American Samoa Tag",
    location: "Auckland",
    sport: "Tag Rugby",
    tagline: "Tag team excellence",
    coverImage: americanSamoaImg,
    accentColor: "text-red-600",
    accentBg: "bg-red-600",
    featuredProducts: [
      { name: "Tag Jersey", price: "$75.00" },
      { name: "Training Tee", price: "$40.00" },
      { name: "Team Shorts", price: "$45.00" },
      { name: "Sports Bag", price: "$55.00" },
    ],
  },
  {
    slug: "mangere-east-queenz",
    name: "Mangere East Queenz",
    location: "Auckland",
    sport: "Rugby League",
    tagline: "Queens of the field",
    coverImage: mangereImg,
    accentColor: "text-emerald-600",
    accentBg: "bg-emerald-600",
    featuredProducts: [
      { name: "Game Day Jersey", price: "$95.00" },
      { name: "Training Singlet", price: "$45.00" },
      { name: "Supporters Hoodie", price: "$85.00" },
      { name: "Team Shorts", price: "$50.00" },
    ],
  },
];

export function getTeamStoreBySlug(slug: string): TeamStore | undefined {
  return TEAM_STORES.find((store) => store.slug === slug);
}
