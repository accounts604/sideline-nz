/**
 * One-shot migration runner for migrations/club-supporter-fields.sql.
 * Idempotent: ADD COLUMN IF NOT EXISTS + guarded UNIQUE constraint.
 * Verifies by SELECTing the new columns afterwards.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

const sqlText = readFileSync(join(__dirname, "..", "migrations", "club-supporter-fields.sql"), "utf-8");

try {
  console.log("Applying migrations/club-supporter-fields.sql to Neon …");
  await sql.unsafe(sqlText);
  const cols = await sql`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'club_accounts'
      AND column_name IN ('shopify_order_tag', 'profit_share_tier_bps')
    ORDER BY column_name
  `;
  console.log("\nclub_accounts now has:");
  for (const c of cols) console.log(`  ${c.column_name.padEnd(24)} ${c.data_type}  default=${c.column_default}  null=${c.is_nullable}`);
  if (cols.length !== 2) {
    console.error("\n✗ Expected both columns to exist — got", cols.length);
    process.exit(1);
  }
  console.log("\n✓ Schema applied.");
  process.exit(0);
} catch (err) {
  console.error("✗ Failed:", err);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
