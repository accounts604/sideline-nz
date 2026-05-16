/**
 * One-shot: create Suqian Dnice Apparel Co., Ltd as a supplier user.
 * Idempotent — reuses the row if email already exists.
 *
 * Usage:  npx tsx scripts/seed-supplier-suqian.ts
 *
 * Prints the generated password once. Save it to 1Password / KIG vault;
 * the supplier doesn't need it (POs are emailed) but you may want it for
 * portal access later.
 */
import "dotenv/config";
import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const EMAIL = "cathleen@wdnice.com";
const TEAM_NAME = "Suqian Dnice Apparel Co., Ltd";

async function main() {
  const [existing] = await db.select().from(users).where(eq(users.email, EMAIL));
  if (existing) {
    console.log(`Already exists: ${existing.id} (${existing.email}, role=${existing.role}, team=${existing.teamName})`);
    if (existing.role !== "supplier") {
      console.log(`  WARNING: role is "${existing.role}" — not "supplier". Fix manually if needed.`);
    }
    process.exit(0);
  }

  const password = randomBytes(12).toString("base64url");
  const hashed = await bcrypt.hash(password, 10);

  const [user] = await db.insert(users).values({
    username: EMAIL,
    email: EMAIL,
    password: hashed,
    role: "supplier",
    teamName: TEAM_NAME,
    emailVerified: true,
  }).returning();

  console.log(`Created supplier:`);
  console.log(`  id:        ${user.id}`);
  console.log(`  email:     ${user.email}`);
  console.log(`  team:      ${user.teamName}`);
  console.log(`  password:  ${password}     ← save this; not retrievable later`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
