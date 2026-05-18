// Quick read-only snapshot: pull supporter-order totals + estimated
// profit-share for every club with a configured collection. No PDF, no email.
// Run with: npx tsx scripts/preview-profit-share.ts

import "dotenv/config";
import { db } from "../server/db";
import { clubAccounts } from "../shared/schema";
import { fetchSupporterOrdersByTag, summarizeSupporterOrders } from "../server/shopify-admin";
import { isNotNull } from "drizzle-orm";

function money(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main() {
  const clubs = await db
    .select()
    .from(clubAccounts)
    .where(isNotNull(clubAccounts.supporterCollectionHandle));

  console.log(`\nProfit-share preview — ${clubs.length} clubs with active collections\n`);
  console.log("─".repeat(110));
  console.log(
    "CLUB".padEnd(28),
    "TAG".padEnd(30),
    "ORDERS".padStart(7),
    "UNITS".padStart(7),
    "REVENUE".padStart(14),
    "TIER".padStart(6),
    "PROFIT SHARE".padStart(14),
  );
  console.log("─".repeat(110));

  let totalRevenue = 0;
  let totalProfitShare = 0;
  let totalOrders = 0;
  let totalUnits = 0;

  for (const c of clubs) {
    try {
      const orders = await fetchSupporterOrdersByTag(c.shopifyOrderTag!);
      const s = summarizeSupporterOrders(orders, c.profitShareTierBps);
      const tierPct = (c.profitShareTierBps / 100).toFixed(c.profitShareTierBps % 100 === 0 ? 0 : 1) + "%";
      console.log(
        c.clubName.padEnd(28),
        (c.shopifyOrderTag || "").padEnd(30),
        String(s.orderCount).padStart(7),
        String(s.unitsSold).padStart(7),
        money(s.revenueCents).padStart(14),
        tierPct.padStart(6),
        money(s.profitShareCents).padStart(14),
      );
      totalRevenue += s.revenueCents;
      totalProfitShare += s.profitShareCents;
      totalOrders += s.orderCount;
      totalUnits += s.unitsSold;
    } catch (err: any) {
      console.log(c.clubName.padEnd(28), "ERROR:", err?.message || err);
    }
  }

  console.log("─".repeat(110));
  console.log(
    "TOTAL".padEnd(28),
    "".padEnd(30),
    String(totalOrders).padStart(7),
    String(totalUnits).padStart(7),
    money(totalRevenue).padStart(14),
    "".padStart(6),
    money(totalProfitShare).padStart(14),
  );
  console.log();

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
