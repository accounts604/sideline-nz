/**
 * Seed script — creates the initial admin account for Romero.
 *
 * Usage:
 *   npx tsx scripts/seed-admin.ts
 *
 * Requires DATABASE_URL in .env
 */
import "dotenv/config";
import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "romero@sidelinenz.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme123";

async function seed() {
  console.log(`Seeding admin account: ${ADMIN_EMAIL}`);

  // Check if admin already exists
  const [existing] = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL));
  if (existing) {
    console.log("Admin account already exists — skipping.");
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const [admin] = await db
    .insert(users)
    .values({
      username: ADMIN_EMAIL,
      email: ADMIN_EMAIL,
      password: hashedPassword,
      role: "admin",
      emailVerified: true,
    })
    .returning();

  console.log(`Admin account created: ${admin.id} (${admin.email})`);
  console.log("IMPORTANT: Change the default password immediately after first login.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
