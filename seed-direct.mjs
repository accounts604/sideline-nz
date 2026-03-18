import pg from "pg";
const { Client } = pg;
import bcrypt from "bcryptjs";

const DATABASE_URL = "postgresql://neondb_owner:npg_b5uShtf4wPNJ@ep-gentle-water-anuldsy7-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

async function seed() {
  const client = new Client({
    connectionString: DATABASE_URL,
  });

  try {
    await client.connect();
    console.log("✓ Connected to database");

    // Check if admin exists
    const result = await client.query(
      "SELECT id FROM users WHERE email = $1",
      ["romero@sidelinenz.com"]
    );

    if (result.rows.length > 0) {
      console.log("✓ Admin account already exists");
      await client.end();
      process.exit(0);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash("changeme123", 10);

    // Insert admin
    const insertResult = await client.query(
      `INSERT INTO users (username, email, password, role, "emailVerified") 
       VALUES ($1, $2, $3, $4, $5) RETURNING id, email`,
      ["romero@sidelinenz.com", "romero@sidelinenz.com", hashedPassword, "admin", true]
    );

    console.log(`✓ Admin account created: ${insertResult.rows[0].email}`);
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error("✗ Seed failed:", err.message);
    await client.end();
    process.exit(1);
  }
}

seed();
