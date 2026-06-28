// One-shot runner for migrations/club-brand-identity.sql (Sideline Studio Phase 2).
// Additive + idempotent (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS) —
// safe to run more than once. Loads .env via dotenv so DATABASE_URL resolves.
//
//   npx tsx scripts/apply-brand-identity-migration.ts
import "dotenv/config";
import { readFileSync } from "fs";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

const file = readFileSync("migrations/club-brand-identity.sql", "utf8");
const stmts = file
  .split(";")
  .map((s) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim())
  .filter(Boolean);

(async () => {
  for (const stmt of stmts) {
    await db.execute(sql.raw(stmt));
    console.log("✓ " + stmt.replace(/\s+/g, " ").slice(0, 70));
  }
  const cols = (await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='club_brand_identity' ORDER BY ordinal_position`) as any).rows.map((r: any) => r.column_name);
  console.log("\nclub_brand_identity columns:", cols.join(", "));
  const lac = (await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='club_logo_assets' AND column_name IN ('default_position','default_application','default_size_mm','artwork_file_url','thread_colours')`) as any).rows.map((r: any) => r.column_name);
  console.log("club_logo_assets new columns:", lac.join(", "));
  console.log("\nMigration applied.");
})().then(() => process.exit(0)).catch((e) => { console.error("ERR:", e.message || e); process.exit(1); });
