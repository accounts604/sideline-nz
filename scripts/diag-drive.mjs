import pg from "pg";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const r = await pool.query(`
  SELECT order_number, po_reference, account_name, drive_folder_id, drive_folder_name, created_at
  FROM orders
  ORDER BY created_at DESC
  LIMIT 8
`);
console.log("Recent orders:");
for (const row of r.rows) {
  console.log(`  ${row.order_number || '(no-num)'}  po=${row.po_reference || '(none)'}  drive=${row.drive_folder_id ? 'YES' : 'no '}  acct=${row.account_name || '-'}`);
}
await pool.end();

// Also probe the parent folder for existing client folders
const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  }).toString(),
});
const token = (await tokenRes.json()).access_token;
const parent = process.env.SIDELINE_DRIVE_PARENT_FOLDER_ID;
const f = await fetch(
  "https://www.googleapis.com/drive/v3/files?q=" +
    encodeURIComponent(`'${parent}' in parents and trashed = false`) +
    "&fields=files(id,name,mimeType,modifiedTime)&pageSize=20&orderBy=modifiedTime desc",
  { headers: { Authorization: "Bearer " + token } },
);
const data = await f.json();
console.log(`\nDrive parent (${parent}) — ${data.files?.length || 0} items:`);
for (const x of data.files || []) console.log(`  ${x.mimeType === 'application/vnd.google-apps.folder' ? '[DIR]' : '[FILE]'} ${x.name}  (${x.modifiedTime})`);
