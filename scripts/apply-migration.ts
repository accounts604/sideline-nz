// Apply a specific migration file from migrations/ to prod.
// Usage: npx tsx scripts/apply-migration.ts <filename.sql>
// All migration files here are intentionally additive + idempotent
// (IF NOT EXISTS), so re-running is safe.

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import postgres from "postgres";

async function main() {
  const file = process.argv[2];
  if (!file) { console.error("Usage: npx tsx scripts/apply-migration.ts <file.sql>"); process.exit(1); }
  const fullPath = path.resolve(process.cwd(), "migrations", file);
  if (!fs.existsSync(fullPath)) { console.error(`Not found: ${fullPath}`); process.exit(1); }
  const sql = fs.readFileSync(fullPath, "utf-8");

  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

  console.log(`Applying ${file} to ${url.replace(/:[^:@/]+@/, ":***@")} …`);
  const client = postgres(url, { max: 1 });
  try {
    await client.unsafe(sql);
    console.log(`✓ Applied ${file}`);
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
