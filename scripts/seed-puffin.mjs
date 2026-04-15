import pg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

dotenv.config({ path: "./.env" });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const email = "usman@puffin-sports.com";
const cc    = "info@puffin-sports.com";
const team  = "Puffin Sports";

try {
  const existing = await pool.query("SELECT id, role FROM users WHERE email = $1", [email]);
  if (existing.rows.length) {
    await pool.query(
      "UPDATE users SET role = 'supplier', team_name = $1, cc_email = $2, updated_at = now() WHERE email = $3",
      [team, cc, email],
    );
    console.log("Updated existing Puffin Sports user:", existing.rows[0].id);
  } else {
    const inviteToken = crypto.randomBytes(32).toString("hex");
    const inviteExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const r = await pool.query(
      `INSERT INTO users (username, email, password, role, team_name, cc_email, invite_token, invite_expires_at)
       VALUES ($1, $2, '', 'supplier', $3, $4, $5, $6)
       RETURNING id, email, role, team_name, cc_email, invite_token`,
      [email, email, team, cc, inviteToken, inviteExpiresAt],
    );
    console.log("Created Puffin Sports supplier:");
    console.log(JSON.stringify(r.rows[0], null, 2));
    console.log("Invite accept URL: https://sidelinenz.com/accept-invite?token=" + inviteToken);
  }
} catch (e) {
  console.error("Seed failed:", e.message);
  process.exit(1);
}
await pool.end();
