import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcryptjs from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);
const db = drizzle(sql);

async function createTestAccount() {
  try {
    const email = "testclub@example.com";
    const plainPassword = "test123";
    const clubName = "Test RFC";
    const contactId = "test-contact-001";

    // Hash password with bcryptjs salt 10
    const passwordHash = await bcryptjs.hash(plainPassword, 10);

    console.log(`Creating test account...`);
    console.log(`Email: ${email}`);
    console.log(`Club: ${clubName}`);
    console.log(`Contact ID: ${contactId}`);

    // Insert into club_accounts table
    const result = await sql`
      INSERT INTO club_accounts (email, password_hash, club_name, contact_id)
      VALUES (${email}, ${passwordHash}, ${clubName}, ${contactId})
      RETURNING id, email, club_name, created_at
    `;

    console.log("\n✅ Test account created successfully!");
    console.log(JSON.stringify(result[0], null, 2));

    await sql.end();
  } catch (error) {
    console.error("❌ Error creating test account:", error.message);
    await sql.end();
    process.exit(1);
  }
}

createTestAccount();
