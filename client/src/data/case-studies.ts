import manurewaImg from "@assets/Manurewa_Womens_Rugby_June_2025_1767430285397.png";
import maristImg from "@assets/Marist_Samoa_NZ_RFC_November_2025_1767430285399.png";
import americanSamoaImg from "@assets/American_Samoa_Tag_December_2025_1767430285402.png";
import mangereImg from "@assets/Mangere_East_Queenz_July_2025_1767430285404.png";

export interface CaseStudy {
  slug: string;
  name: string;
  location: string;
  sport: string;
  tagline: string;
  coverImage: string;
  accentColor: string;
  accentBg: string;
  description: string;
  services: string[];
  challenge: string;
  solution: string;
  outcome: string;
}

export const CASE_STUDIES: CaseStudy[] = [
  {
    slug: "manurewa-womens-rugby",
    name: "Manurewa Women's Rugby",
    location: "Auckland",
    sport: "Rugby",
    tagline: "Rewa Hard - Custom jerseys for a championship team",
    coverImage: manurewaImg,
    accentColor: "text-teal-600",
    accentBg: "bg-teal-600",
    description: "We partnered with Manurewa Women's Rugby to create a striking custom jersey that celebrates their heritage and team spirit.",
    services: ["Custom Jersey Design", "Sublimation Printing", "Team Apparel"],
    challenge: "The team needed jerseys that honoured their Polynesian heritage while standing out on the field and lasting through a tough season.",
    solution: "We designed a custom sublimated jersey featuring traditional patterns integrated with modern performance fabric. The teal and white colorway with custom numbering made each player feel proud to wear their colours.",
    outcome: "Delivered 30+ jerseys in 3 weeks. The team went on to have their best season, with players commenting on how the quality gear boosted their confidence.",
  },
  {
    slug: "marist-samoa-nz-rfc",
    name: "Marist Samoa NZ RFC",
    location: "Auckland",
    sport: "Rugby",
    tagline: "Old Pupils Association - Heritage meets performance",
    coverImage: maristImg,
    accentColor: "text-green-600",
    accentBg: "bg-green-600",
    description: "Creating a complete kit for Marist Brothers Old Pupils that honours their Samoan heritage and school traditions.",
    services: ["Full Kit Design", "Singlets", "Training Gear", "Personalisation"],
    challenge: "Marist Samoa NZ RFC needed a complete kit refresh that incorporated their school crest, Samoan cultural elements, and personalised player names and numbers.",
    solution: "We created a full range including match singlets, training gear, and supporter apparel. The green striped design with gold crest placement became instantly recognizable at tournaments.",
    outcome: "Supplied 50+ players with full kits including personalised numbering. The club received numerous compliments on their professional appearance.",
  },
  {
    slug: "american-samoa-tag",
    name: "American Samoa Tag",
    location: "Auckland",
    sport: "Tag",
    tagline: "National representative team - World-class quality",
    coverImage: americanSamoaImg,
    accentColor: "text-red-600",
    accentBg: "bg-red-600",
    description: "Outfitting the American Samoa Tag team for international competition with performance-focused apparel.",
    services: ["Rep Team Jerseys", "Competition Shorts", "Warm-up Gear"],
    challenge: "As a national representative team, they needed world-class apparel that would perform under competitive conditions while showcasing their national pride.",
    solution: "We designed a bold red, white and navy kit inspired by the American Samoa flag. Lightweight performance fabric keeps players cool during intense tag matches.",
    outcome: "The team competed with confidence knowing they looked and felt professional. Quick turnaround meant they were ready well before competition day.",
  },
  {
    slug: "mangere-east-queenz",
    name: "Mangere East Queenz",
    location: "Auckland",
    sport: "Rugby League",
    tagline: "Queens of the field - Team jackets and training gear",
    coverImage: mangereImg,
    accentColor: "text-emerald-600",
    accentBg: "bg-emerald-600",
    description: "Designing coordinated team jackets and training apparel for this proud South Auckland league team.",
    services: ["Team Jackets", "Training Tops", "Coordinated Sets"],
    challenge: "The Queenz wanted matching team apparel that would unify their squad and look professional at trainings and game days.",
    solution: "We created custom sublimated jackets with a bold camo-style design in their signature green and black. The coordinated look brought the whole team together.",
    outcome: "The full team of 20+ players received matching jackets and training gear. The distinctive style has become their trademark at local competitions.",
  },
];

export function getCaseStudyBySlug(slug: string): CaseStudy | undefined {
  return CASE_STUDIES.find((study) => study.slug === slug);
}
