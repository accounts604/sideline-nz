import manurewaImg from "@assets/Manurewa_Womens_Rugby_June_2025_1767430285397.png";
import maristImg from "@assets/Marist_Samoa_NZ_RFC_November_2025_1767430285399.png";
import americanSamoaImg from "@assets/American_Samoa_Tag_December_2025_1767430285402.png";
import mangereImg from "@assets/Mangere_East_Queenz_July_2025_1767430285404.png";
import asrfuCase from "@assets/asrfu-village-league-case.jpg";
import metroCase from "@assets/metro-lions-raiders-case.png";

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
  {
    slug: "auckland-samoa-rfu-village-league",
    name: "Auckland Samoa RFU Village League",
    location: "Auckland",
    sport: "Rugby",
    tagline: "A store for every village - a whole competition, kitted out",
    coverImage: asrfuCase,
    accentColor: "text-green-600",
    accentBg: "bg-green-600",
    description: "Rolling out custom supporter stores for every village club in the Auckland Samoa RFU village league.",
    services: ["Custom Kit Design", "Online Team Stores", "Supporter Range", "Competition Directory"],
    challenge: "The Auckland Samoa RFU village league brings village clubs together each season, each wanting their own kit and merch, but with no easy way for supporters and aiga to order.",
    solution: "We built a store engine that turns each club's design into a full online supporter store - jerseys, tees, hoodies, caps and scarves in their village colours - all grouped under one competition directory.",
    outcome: "Village stores like Vaimoso, Pineula Salani and Malisi Samoa NZ went live in days, made to order with no cost or stock for the clubs. Supporters order direct and back their village.",
  },
  {
    slug: "metro-lions-raiders",
    name: "Metro Lions",
    location: "Auckland",
    sport: "American Football",
    tagline: "Raiders black - NZ's oldest gridiron club gets a club store",
    coverImage: metroCase,
    accentColor: "text-neutral-700",
    accentBg: "bg-neutral-800",
    description: "A personalised Raiders jersey and club store for Metro Lions, New Zealand's biggest and oldest American football club.",
    services: ["Custom Gridiron Jersey", "Name & Number Personalisation", "Online Club Store"],
    challenge: "Metro Lions wanted a sharp, personalised gridiron jersey their players and supporters could order themselves, ready for the tournament season.",
    solution: "We designed a black and silver Raiders jersey with the club crest front and back, then set up an online store where each player adds their own name and number at checkout.",
    outcome: "The club store went live with sizes from kids to 3XL, made to order, so the whole club can kit up without the committee handling a single order.",
  },
];

export function getCaseStudyBySlug(slug: string): CaseStudy | undefined {
  return CASE_STUDIES.find((s) => s.slug === slug);
}
