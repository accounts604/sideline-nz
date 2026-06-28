// One-shot runner for migrations/club-parent-details.sql (parent org details on
// clubs). Additive + idempotent. Strips -- comments before splitting on ';'.
//   npx tsx scripts/apply-club-parent-details-migration.ts
import "dotenv/config";
import { readFileSync } from "fs";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

const file = readFileSync("migrations/club-parent-details.sql", "utf8");
const clean = file.split("\n").map((l) => { const i = l.indexOf("--"); return i >= 0 ? l.slice(0, i) : l; }).join("\n");
const stmts = clean.split(";").map((s) => s.trim()).filter(Boolean);

(async () => {
  for (const stmt of stmts) {
    await db.execute(sql.raw(stmt));
    console.log("✓ " + stmt.replace(/\s+/g, " ").slice(0, 70));
  }
  const cols = (await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='clubs' AND column_name IN ('website','delivery_address','contact_name','contact_email','contact_phone','ghl_business_id')`) as any).rows.map((r: any) => r.column_name);
  console.log("\nparent-detail columns present:", cols.join(", "));
  console.log("Migration applied.");
})().then(() => process.exit(0)).catch((e) => { console.error("ERR:", e.message || e); process.exit(1); });
