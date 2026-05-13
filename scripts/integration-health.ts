// Integration last-exercised probe. For each external system, finds the
// most recent DB artifact that proves the integration ran. "Last touched"
// doesn't mean "healthy" but it cheaply separates "dormant" from "live".

import "dotenv/config";
import { db } from "../server/db";
import { orders, orderItems, designFiles, ghlProducts, users, quotes } from "../shared/schema";
import { sql, desc, isNotNull, eq } from "drizzle-orm";

async function ageDays(d: Date | string | null | undefined): Promise<string> {
  if (!d) return "never";
  const t = typeof d === "string" ? new Date(d) : d;
  const days = (Date.now() - t.getTime()) / 86400000;
  if (days < 1) return `${Math.floor(days * 24)}h ago`;
  return `${Math.floor(days)}d ago`;
}

async function main() {
  const rows: Array<[string, string, string]> = [];

  // Stripe — checkout session + paidAt on orders
  const [stripeHit] = await db.select({ t: orders.paidAt }).from(orders)
    .where(isNotNull(orders.paidAt)).orderBy(desc(orders.paidAt)).limit(1);
  rows.push(["Stripe", "order.paidAt", await ageDays(stripeHit?.t)]);

  // GHL — orders with ghlOpportunityId
  const [ghlHit] = await db.select({ t: orders.updatedAt }).from(orders)
    .where(isNotNull(orders.ghlOpportunityId)).orderBy(desc(orders.updatedAt)).limit(1);
  const [ghlProdHit] = await db.select({ t: ghlProducts.updatedAt }).from(ghlProducts)
    .orderBy(desc(ghlProducts.updatedAt)).limit(1);
  rows.push(["GHL (opportunity)", "order.ghlOpportunityId set", await ageDays(ghlHit?.t)]);
  rows.push(["GHL (product sync)", "ghl_products.updatedAt", await ageDays(ghlProdHit?.t)]);

  // Google Drive — driveFolderId on orders
  const [driveHit] = await db.select({ t: orders.updatedAt }).from(orders)
    .where(isNotNull(orders.driveFolderId)).orderBy(desc(orders.updatedAt)).limit(1);
  rows.push(["Google Drive", "order.driveFolderId set", await ageDays(driveHit?.t)]);

  // Vercel Blob — designFiles.fileUrl (stores blob URLs)
  const [blobHit] = await db.select({ t: designFiles.createdAt }).from(designFiles)
    .orderBy(desc(designFiles.createdAt)).limit(1);
  rows.push(["Vercel Blob", "design_files.createdAt", await ageDays(blobHit?.t)]);

  // Shopify Admin — only club_accounts have shopifyOrderTag; approximated
  // via clubAccounts updatedAt. Not a perfect signal.
  const clubAccounts = await db.execute(sql`
    SELECT MAX(updated_at) AS t FROM club_accounts WHERE shopify_order_tag IS NOT NULL
  `);
  rows.push(["Shopify Admin", "club_accounts.updated_at (proxy)", await ageDays(((clubAccounts as any)[0])?.t)]);

  // Xero — quotes table (if exists)
  try {
    const [xeroHit] = await db.select({ t: quotes.updatedAt }).from(quotes)
      .orderBy(desc(quotes.updatedAt)).limit(1);
    rows.push(["Xero / quotes", "quotes.updatedAt", await ageDays(xeroHit?.t)]);
  } catch {
    rows.push(["Xero / quotes", "quotes table", "table not present"]);
  }

  // Gmail — orders where a PO was raised (poReference set + supplier email sent).
  // No direct marker; approximate by orders with assignedSupplierId.
  const [supplierHit] = await db.select({ t: orders.updatedAt }).from(orders)
    .where(isNotNull(orders.assignedSupplierId)).orderBy(desc(orders.updatedAt)).limit(1);
  rows.push(["Gmail API (supplier PO)", "order.assignedSupplierId set (proxy)", await ageDays(supplierHit?.t)]);

  // Neon — trivial; just confirms DB reachable
  const now = await db.execute(sql`SELECT NOW() AS t`);
  rows.push(["Neon Postgres", "SELECT NOW()", await ageDays(((now as any)[0])?.t)]);

  // Auth — users.createdAt (last account created)
  const [userHit] = await db.select({ t: users.createdAt }).from(users)
    .orderBy(desc(users.createdAt)).limit(1);
  rows.push(["Auth (bcrypt+JWT)", "users.createdAt (last signup)", await ageDays(userHit?.t)]);

  // Orders themselves — most recent
  const [orderHit] = await db.select({ t: orders.createdAt }).from(orders)
    .orderBy(desc(orders.createdAt)).limit(1);
  rows.push(["Orders pipeline", "orders.createdAt", await ageDays(orderHit?.t)]);

  console.log("System                        | Last exercised (signal)                      | Age");
  console.log("------------------------------|----------------------------------------------|---------");
  for (const [sys, signal, age] of rows) {
    console.log(`${sys.padEnd(30)}| ${signal.padEnd(45)}| ${age}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
