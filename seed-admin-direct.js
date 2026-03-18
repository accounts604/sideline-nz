import { db } from "./server/db.js";
import { users } from "./shared/schema.js";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const ADMIN_EMAIL = "info@sidelinenz.com";
const ADMIN_PASSWORD = "SidelineCustomGood$202!";

async function seed() {
  console.log(`Seeding admin account: ${ADMIN_EMAIL}`);

  try {
    // Check if admin already exists
    const existing = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL));
    if (existing.length > 0) {
      console.log("Admin account already exists — skipping.");
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const result = await db
      .insert(users)
      .values({
        username: ADMIN_EMAIL,
        email: ADMIN_EMAIL,
        password: hashedPassword,
        role: "admin",
        emailVerified: true,
      })
      .returning();

    console.log(`Admin account created: ${result[0].id} (${result[0].email})`);
    console.log("IMPORTANT: Change the default password immediately after first login.");
    process.exit(0);
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  }
}

seed();
