// One-shot runner for migrations/clubs-teams.sql (clubs + club_accounts.club_id).
// Additive + idempotent. Loads .env via dotenv.
//   npx tsx scripts/apply-clubs-teams-migration.ts
import "dotenv/config";
import { readFileSync } from "fs";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

const file = readFileSync("migrations/clubs-teams.sql", "utf8");
// Strip -- comments to end-of-line FIRST (so a ';' inside a comment can't split a
// statement), then split on ';'.
const clean = file.split("\n").map((l) => { const i = l.indexOf("--"); return i >= 0 ? l.slice(0, i) : l; }).join("\n");
const stmts = clean.split(";").map((s) => s.trim()).filter(Boolean);

(async () => {
  for (const stmt of stmts) {
    await db.execute(sql.raw(stmt));
    console.log("✓ " + stmt.replace(/\s+/g, " ").slice(0, 70));
  }
  const cols = (await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='clubs' ORDER BY ordinal_position`) as any).rows.map((r: any) => r.column_name);
  console.log("\nclubs columns:", cols.join(", "));
  const hasClubId = (await db.execute(sql`SELECT 1 FROM information_schema.columns WHERE table_name='club_accounts' AND column_name='club_id'`) as any).rows.length > 0;
  console.log("club_accounts.club_id present:", hasClubId);
  console.log("\nMigration applied.");
})().then(() => process.exit(0)).catch((e) => { console.error("ERR:", e.message || e); process.exit(1); });
