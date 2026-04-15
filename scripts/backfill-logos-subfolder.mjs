// One-off: add "03. Logos" sub-folder to every existing PO Drive folder
// that doesn't have one. Idempotent — skips folders that already have it.
import dotenv from "dotenv";
import pg from "pg";
dotenv.config({ path: "./.env" });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const r = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  }).toString(),
});
const token = (await r.json()).access_token;

const rows = (await pool.query(`SELECT id, order_number, drive_folder_id, drive_folder_name FROM orders WHERE drive_folder_id IS NOT NULL`)).rows;
console.log(`Checking ${rows.length} PO folders for "03. Logos"…\n`);

for (const o of rows) {
  // Check if a Logos sub-folder already exists (tolerant of numbering)
  const listQ = `'${o.drive_folder_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(listQ)}&fields=files(id,name)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: "Bearer " + token } },
  );
  const subs = (await listRes.json()).files || [];
  const hasLogos = subs.some((f) => /logos?$/i.test(f.name.replace(/^\d+[\.\s]+/, "").trim()));
  if (hasLogos) {
    console.log(`  ·  ${o.order_number || o.id.slice(0,8)}  already has Logos`);
    continue;
  }

  const create = await fetch("https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "03. Logos", mimeType: "application/vnd.google-apps.folder", parents: [o.drive_folder_id] }),
  });
  if (create.ok) {
    console.log(`  ✓  ${o.order_number || o.id.slice(0,8)}  created 03. Logos`);
  } else {
    console.error(`  ✗  ${o.order_number || o.id.slice(0,8)}  ${create.status}: ${await create.text()}`);
  }
}
await pool.end();
