// One-shot runner for migrations/teams-layer.sql (teams table + orders.team_id).
// Additive + idempotent. Strips -- comments before splitting on ';'.
//   npx tsx scripts/apply-teams-layer-migration.ts
import "dotenv/config";
import { readFileSync } from "fs";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

const file = readFileSync("migrations/teams-layer.sql", "utf8");
const clean = file.split("\n").map((l) => { const i = l.indexOf("--"); return i >= 0 ? l.slice(0, i) : l; }).join("\n");
const stmts = clean.split(";").map((s) => s.trim()).filter(Boolean);

(async () => {
  for (const stmt of stmts) {
    await db.execute(sql.raw(stmt));
    console.log("✓ " + stmt.replace(/\s+/g, " ").slice(0, 70));
  }
  const hasTeams = (await db.execute(sql`SELECT 1 FROM information_schema.tables WHERE table_name='teams'`) as any).rows.length > 0;
  const hasTeamId = (await db.execute(sql`SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='team_id'`) as any).rows.length > 0;
  console.log("\nteams table present:", hasTeams, "· orders.team_id present:", hasTeamId);
  console.log("Migration applied.");
})().then(() => process.exit(0)).catch((e) => { console.error("ERR:", e.message || e); process.exit(1); });
