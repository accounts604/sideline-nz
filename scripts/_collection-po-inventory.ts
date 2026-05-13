import "dotenv/config";
import { db } from "../server/db";
import { orders, clubAccounts } from "../shared/schema";
import { isNotNull } from "drizzle-orm";

const SHOPIFY_COLLECTIONS = [
  { handle: "2026-kbhs-rugby-supporters-merch-range",                  title: "2026 KBHS Rugby Supporters Merch Range",            products: 6 },
  { handle: "narre-warren-fc",                                          title: "Narre Warren South Supporters Range 2026",          products: 9 },
  { handle: "2026-wesley-college-rugby-supporters-merch-range",         title: "2026 Wesley College Rugby Supporters Merch Range", products: 7 },
  { handle: "2026-onewhero-rugby-supporters-merch-range",               title: "2026 Onewhero Rugby Supporters Merch Range",       products: 8 },
  { handle: "otahuhu-rfc-2026",                                         title: "Otahuhu RFC 2026",                                  products: 8 },
  { handle: "st-peters-college-1st-xv-2026",                            title: "St Peter's College 1st XV 2026",                    products: 7 },
  { handle: "2026-dalestate-girls-rugby-supporters-merch-range",        title: "2026 Dalestate Girls Rugby Supporters Merch Range", products: 3 },
  { handle: "2026-richmond-rovers-senior-as-supporters-merch-range",    title: "2026 Richmond Rovers Senior As Supporters Merch Range", products: 4 },
  { handle: "2026-aorere-college-supporters-merch-range",               title: "2026 Aorere College Supporters Merch Range",        products: 6 },
  { handle: "2026-avondale-rugby-supporters-merch-range",               title: "2026 Avondale Rugby Supporters Merch Range",        products: 7 },
  { handle: "2026-weymouth-rugby-supporters-merch-range",               title: "2026 Weymouth Rugby Supporters Merch Range",        products: 8 },
];

function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(t => t.length > 2));
}
function overlap(a: Set<string>, b: Set<string>): number { let n = 0; for (const t of a) if (b.has(t)) n++; return n; }

async function main() {
  // All club_accounts
  const clubs = await db.select().from(clubAccounts);
  console.log(`Clubs in DB: ${clubs.length}`);
  for (const c of clubs) {
    console.log(`  ${c.clubName.padEnd(28)} tag=${c.shopifyOrderTag?.padEnd(22) || "—".padEnd(22)} collection=${c.supporterCollectionHandle || "(unset)"}`);
  }

  // All orders (any status)
  const allOrders = await db.select({
    id: orders.id, poRef: orders.poReference, account: orders.accountName,
    customer: orders.customerName, status: orders.status, poKind: orders.poKind,
    createdAt: orders.createdAt,
  }).from(orders).where(isNotNull(orders.poReference));
  console.log(`\nOrders in DB: ${allOrders.length}`);

  // Match each Shopify collection to existing club + existing PO
  console.log(`\n## Shopify supporter collections → club → PO match\n`);
  console.log(`${"Collection (handle)".padEnd(60)} ${"Club row".padEnd(20)} ${"Existing PO".padEnd(18)}`);
  console.log("-".repeat(100));
  const missing: typeof SHOPIFY_COLLECTIONS = [];
  for (const col of SHOPIFY_COLLECTIONS) {
    const colTokens = tokens(col.title);
    // Find best matching club
    let bestClub: typeof clubs[number] | null = null; let bestClubScore = 0;
    for (const c of clubs) {
      const sc = overlap(colTokens, tokens(c.clubName));
      if (sc > bestClubScore) { bestClubScore = sc; bestClub = c; }
    }
    // Find best matching PO (any status)
    let bestPo: typeof allOrders[number] | null = null; let bestPoScore = 0;
    for (const o of allOrders) {
      const sc = overlap(colTokens, tokens(o.account || ""));
      if (sc > bestPoScore) { bestPoScore = sc; bestPo = o; }
    }
    const clubLabel = bestClub && bestClubScore >= 2 ? bestClub.clubName.slice(0, 18) : "—";
    const poLabel = bestPo && bestPoScore >= 2 ? `${bestPo.poRef} ${bestPo.status}` : "—";
    console.log(`${col.handle.padEnd(60)} ${clubLabel.padEnd(20)} ${poLabel.padEnd(18)}`);
    if (!bestPo || bestPoScore < 2) missing.push(col);
  }

  console.log(`\n## Summary\n`);
  console.log(`Collections without a matching PO: ${missing.length}`);
  for (const m of missing) console.log(`  - ${m.title}`);

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
