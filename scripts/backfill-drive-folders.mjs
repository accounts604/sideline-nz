// One-off: create Drive folders for any PO that doesn't have one.
// Uses the same shape as server/google-drive.ts — just inlined so we can
// run it without the tsx build step.
import dotenv from "dotenv";
import pg from "pg";
dotenv.config({ path: "./.env" });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const PARENT = process.env.SIDELINE_DRIVE_PARENT_FOLDER_ID;

const SUBFOLDERS = [
  "01. Brief", "02. Mockups", "03. Approvals", "04. Artwork",
  "05. Production", "06. Delivery", "07. Invoicing",
];

async function accessToken() {
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
  return (await r.json()).access_token;
}

function buildName({ date, company, contact }) {
  const clean = (s) => (s || "").replace(/[\\/]/g, "-").trim();
  return `${date}.${clean(company) || "Unknown Company"}.${clean(contact) || "Unknown Contact"}`;
}

async function findOrCreateFolder(token, name, parentId) {
  // Find
  const q = `name = '${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const findRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: "Bearer " + token } },
  );
  const findData = await findRes.json();
  if (findData.files?.[0]) return findData.files[0];

  // Create
  const createRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
    },
  );
  if (!createRes.ok) throw new Error(`create failed ${createRes.status}: ${await createRes.text()}`);
  return await createRes.json();
}

async function seedSubfolders(token, parentFolderId) {
  for (const sub of SUBFOLDERS) {
    await fetch("https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ name: sub, mimeType: "application/vnd.google-apps.folder", parents: [parentFolderId] }),
    });
  }
}

const token = await accessToken();

const rows = (await pool.query(`
  SELECT id, order_number, po_reference, account_name, customer_name, customer_first_name, customer_last_name, customer_email, created_at
  FROM orders
  WHERE drive_folder_id IS NULL
  ORDER BY created_at DESC
`)).rows;

console.log(`Backfilling ${rows.length} orders…\n`);

for (const o of rows) {
  const date = (o.created_at ? new Date(o.created_at) : new Date()).toISOString().slice(0, 10);
  const contact = [o.customer_first_name, o.customer_last_name].filter(Boolean).join(" ").trim()
    || o.customer_name
    || o.customer_email
    || "Unnamed Contact";
  const name = buildName({ date, company: o.account_name || "Sideline", contact });
  try {
    const folder = await findOrCreateFolder(token, name, PARENT);
    // Seed sub-folders only if we just created it (no existing children)
    const childQ = `'${folder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const children = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(childQ)}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { Authorization: "Bearer " + token } },
    );
    const hasKids = ((await children.json()).files || []).length > 0;
    if (!hasKids) await seedSubfolders(token, folder.id);

    await pool.query(
      `UPDATE orders SET drive_folder_id=$1, drive_folder_url=$2, drive_folder_name=$3, updated_at=now() WHERE id=$4`,
      [folder.id, folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`, folder.name, o.id],
    );
    console.log(`  ✓ ${o.order_number || o.id.slice(0,8)}  →  ${folder.name}${hasKids ? " (existing)" : " (+subs)"}`);
  } catch (e) {
    console.error(`  ✗ ${o.order_number || o.id.slice(0,8)}:`, e.message);
  }
}

await pool.end();
