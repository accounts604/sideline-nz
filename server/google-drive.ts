// Google Drive v3 client — fetch-based (no googleapis npm dep).
// Used to auto-create a per-PO client folder under the Sideline client-vault
// parent, and to list files in those folders for the admin File Vault tab.
//
// Auth: service account OR user OAuth refresh token (either works).
// Env vars expected:
//   GOOGLE_CLIENT_ID             (OAuth client id — from Google Cloud Console)
//   GOOGLE_CLIENT_SECRET         (OAuth client secret)
//   GOOGLE_REFRESH_TOKEN         (user's refresh token with drive scope)
//   SIDELINE_DRIVE_PARENT_FOLDER_ID  (parent folder where client folders land)
//
// Scope required on the refresh token: https://www.googleapis.com/auth/drive
// (or drive.file if only creating/listing folders this app created).

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

// Shared-drive support — the Sideline client-vault parent lives on a Shared
// Drive, so every Drive call needs supportsAllDrives=true. Listings also need
// includeItemsFromAllDrives=true and corpora=allDrives. We append these on
// every URL via driveUrl() — missing either one silently returns zero results
// or "file not found", which is what caused the v1 to no-op in production.
function driveUrl(path: string, extra: Record<string, string> = {}): string {
  const url = new URL(`${DRIVE_API_BASE}${path}`);
  url.searchParams.set("supportsAllDrives", "true");
  if (path.startsWith("/files?") || path === "/files") {
    url.searchParams.set("includeItemsFromAllDrives", "true");
  }
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  // Move any original query params from the path into the URL obj (URL ctor
  // already handles that), nothing else to do.
  return url.toString();
}

// In-process access token cache. Drive access tokens expire after ~1 hour;
// we cache until 60s before expiry and refresh lazily on the next call.
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function creds() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const parentFolderId = process.env.SIDELINE_DRIVE_PARENT_FOLDER_ID;
  if (!clientId || !clientSecret || !refreshToken || !parentFolderId) return null;
  return { clientId, clientSecret, refreshToken, parentFolderId };
}

export function isDriveConfigured(): boolean {
  return creds() !== null;
}

export function getDriveParentFolderId(): string | null {
  return creds()?.parentFolderId || null;
}

async function getAccessToken(): Promise<string | null> {
  const c = creds();
  if (!c) return null;

  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60_000 > now) {
    return cachedAccessToken.token;
  }

  const body = new URLSearchParams({
    client_id: c.clientId,
    client_secret: c.clientSecret,
    refresh_token: c.refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    console.error("[Drive] token refresh failed:", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const expiresIn = (data.expires_in as number) || 3600;
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + expiresIn * 1000,
  };
  return cachedAccessToken.token;
}

async function driveFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  const token = await getAccessToken();
  if (!token) return null;
  return fetch(driveUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

// ====================================================================
// Folder operations
// ====================================================================

export interface ClientFolderInput {
  date: string;        // YYYY-MM-DD — the PO creation date
  companyName: string; // club / team / org
  contactName: string; // primary contact (first last)
}

export interface DriveFolder {
  id: string;
  name: string;
  webViewLink: string;
}

/** Format the folder name per Romero's convention: Date.Company.Contact */
export function buildClientFolderName(input: ClientFolderInput): string {
  const sanitize = (s: string) => s.replace(/[\\/]/g, "-").trim();
  const company = sanitize(input.companyName) || "Unknown Company";
  const contact = sanitize(input.contactName) || "Unknown Contact";
  return `${input.date}.${company}.${contact}`;
}

/**
 * Look up an existing folder by exact name under the parent, if any.
 * Prevents duplicate folders when a PO is recreated or a retry fires.
 */
export async function findClientFolderByName(name: string): Promise<DriveFolder | null> {
  const c = creds();
  if (!c) return null;
  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    `'${c.parentFolderId}' in parents`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
  ].join(" and ");

  const res = await driveFetch(`/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&pageSize=1`);
  if (!res || !res.ok) return null;
  const data = await res.json();
  const f = (data.files || [])[0];
  if (!f) return null;
  return { id: f.id, name: f.name, webViewLink: f.webViewLink || `https://drive.google.com/drive/folders/${f.id}` };
}

/**
 * Standard per-client sub-folder template.
 * Pipeline-aligned so each stage has a home: Brief → Mockups → Approvals →
 * Artwork → Production → Delivery → Invoicing.
 * Override via SIDELINE_DRIVE_SUBFOLDERS env (comma-separated).
 */
export function getSubfolderTemplate(): string[] {
  const env = process.env.SIDELINE_DRIVE_SUBFOLDERS;
  if (env) {
    return env.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [
    "01. Brief",
    "02. Mockups",
    "03. Logos",        // elements uploaded on garment lines land here
    "04. Approvals",
    "05. Artwork",
    "06. Production",
    "07. Delivery",
    "08. Invoicing",
  ];
}

// Upload-routing — match by name match (case-insensitive + tolerant of
// numbered prefixes). When the admin renames "02. Mockups" to "Mockups"
// or "02 Mockups" we still route correctly.
function normaliseFolderName(n: string): string {
  return n.toLowerCase().replace(/^\d+[\.\s]*/, "").trim();
}

/**
 * Pick the best-matching sub-folder under a PO folder for a given upload
 * slot. Returns the target folder id (sub-folder if found, otherwise the
 * PO root). Exported so the mirror call can route without re-implementing.
 */
export async function resolveUploadTarget(
  poFolderId: string,
  slot: "mockups" | "logos" | "artwork" | "approvals",
): Promise<string> {
  const targetWords: Record<typeof slot, string[]> = {
    mockups: ["mockups", "mockup"],
    logos: ["logos", "logo"],
    artwork: ["artwork", "art"],
    approvals: ["approvals", "approval"],
  } as any;

  const q = [
    `'${poFolderId}' in parents`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
  ].join(" and ");
  const res = await driveFetch(`/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=50`);
  if (!res?.ok) return poFolderId;
  const data = await res.json();
  const folders = (data.files || []) as Array<{ id: string; name: string }>;

  const words = targetWords[slot];
  for (const f of folders) {
    const n = normaliseFolderName(f.name);
    if (words.some((w) => n === w || n.startsWith(w))) return f.id;
  }
  return poFolderId;
}

async function createSubfolder(parentId: string, name: string): Promise<string | null> {
  const res = await driveFetch("/files?fields=id", {
    method: "POST",
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  if (!res || !res.ok) return null;
  const data = await res.json();
  return data.id || null;
}

/** Create (or return existing) client folder under the Sideline parent,
 *  and seed the standard sub-folder template inside when the folder is new. */
export async function createClientFolder(input: ClientFolderInput): Promise<DriveFolder | null> {
  const c = creds();
  if (!c) {
    console.log("[Drive] not configured — skipping folder create for", input);
    return null;
  }

  const name = buildClientFolderName(input);

  // Idempotency: reuse an existing folder with the same name if present.
  const existing = await findClientFolderByName(name);
  if (existing) return existing;

  const res = await driveFetch("/files?fields=id,name,webViewLink", {
    method: "POST",
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [c.parentFolderId],
    }),
  });

  if (!res || !res.ok) {
    console.error("[Drive] create folder failed:", res?.status, await res?.text());
    return null;
  }
  const data = await res.json();
  const folderId = data.id;

  // Seed the standard sub-folder set. Run in parallel — Drive handles it fine.
  const template = getSubfolderTemplate();
  await Promise.all(template.map((sub) => createSubfolder(folderId, sub).catch(() => null)));

  return {
    id: folderId,
    name: data.name,
    webViewLink: data.webViewLink || `https://drive.google.com/drive/folders/${folderId}`,
  };
}

// ====================================================================
// File listing for the File Vault
// ====================================================================

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  iconLink?: string;
  modifiedTime?: string;
  size?: string;
}

/**
 * Find a sub-folder by name inside a parent. Used to route garment-line
 * uploads into the canonical sub-folders (e.g. "02. Mockups", "04. Artwork").
 */
export async function findSubfolderByName(parentId: string, name: string): Promise<string | null> {
  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    `'${parentId}' in parents`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
  ].join(" and ");
  const res = await driveFetch(`/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
  if (!res || !res.ok) return null;
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

/**
 * Mirror a public blob URL into a PO's Drive folder. Used to keep every
 * asset uploaded on a garment line in the same place the team already
 * browses from the Vault. Idempotent: if a file with the same name already
 * exists in the target folder we skip (Vercel Blob suffix handles uniqueness
 * upstream, so same URL → same filename → skip the copy).
 *
 * Returns the Drive file id, or null if Drive isn't configured / upload failed.
 */
export async function mirrorBlobToPoFolder({
  poFolderId,
  slot,
  subFolderName,
  blobUrl,
  fileName,
  orderId,
}: {
  poFolderId: string;
  slot?: "mockups" | "logos" | "artwork" | "approvals";
  subFolderName?: string; // explicit name override (takes priority over slot)
  blobUrl: string;
  fileName?: string;
  orderId?: string; // passed through to integration_events for correlation
}): Promise<string | null> {
  // Lazy-load to avoid a circular import between google-drive ↔ integration-events.
  const { logIntegrationEvent } = await import("./integration-events");
  const start = Date.now();
  const logFail = (error: string, meta?: Record<string, any>) => {
    void logIntegrationEvent({
      system: "drive", action: "mirrorBlob", status: "failed",
      orderId: orderId ?? null, durationMs: Date.now() - start, error,
      meta: { poFolderId, slot, fileName: fileName ?? null, ...meta },
    });
  };
  const logOk = (fileId: string, meta?: Record<string, any>) => {
    void logIntegrationEvent({
      system: "drive", action: "mirrorBlob", status: "success",
      orderId: orderId ?? null, durationMs: Date.now() - start,
      meta: { poFolderId, slot, fileName: fileName ?? null, fileId, ...meta },
    });
  };

  const token = await getAccessToken();
  if (!token) { logFail("no-access-token"); return null; }

  // Resolve target folder: explicit name > slot resolver > PO root fallback.
  let targetFolderId = poFolderId;
  if (subFolderName) {
    const sub = await findSubfolderByName(poFolderId, subFolderName);
    if (sub) targetFolderId = sub;
  } else if (slot) {
    targetFolderId = await resolveUploadTarget(poFolderId, slot);
  }

  try {
    const blobRes = await fetch(blobUrl);
    if (!blobRes.ok) {
      console.error("[Drive] mirror: blob fetch failed:", blobRes.status);
      logFail(`blob-fetch-${blobRes.status}`);
      return null;
    }
    const contentType = blobRes.headers.get("content-type") || "application/octet-stream";
    const buf = Buffer.from(await blobRes.arrayBuffer());

    const name = fileName || blobUrl.split("/").pop()?.split("?")[0] || "file";

    // Deduplicate: if a file of the same name already lives in this folder
    // (because the admin pressed upload twice on the same URL), skip the copy.
    const existingQ = [
      `name = '${name.replace(/'/g, "\\'")}'`,
      `'${targetFolderId}' in parents`,
      `trashed = false`,
    ].join(" and ");
    const existingRes = await driveFetch(`/files?q=${encodeURIComponent(existingQ)}&fields=files(id)&pageSize=1`);
    if (existingRes?.ok) {
      const existingData = await existingRes.json();
      if (existingData.files?.[0]?.id) { logOk(existingData.files[0].id, { deduped: true }); return existingData.files[0].id; }
    }

    // Multipart upload: metadata part + media part
    const boundary = `--sideline-${Date.now().toString(36)}`;
    const metadata = { name, parents: [targetFolderId] };
    const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
    const mediaHeader = `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`;
    const closing = `\r\n--${boundary}--`;

    const body = Buffer.concat([
      Buffer.from(metadataPart, "utf-8"),
      Buffer.from(mediaHeader, "utf-8"),
      buf,
      Buffer.from(closing, "utf-8"),
    ]);

    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": String(body.length),
        },
        body,
      },
    );

    if (!uploadRes.ok) {
      const body = await uploadRes.text();
      console.error("[Drive] multipart upload failed:", uploadRes.status, body);
      logFail(`multipart-upload-${uploadRes.status}`, { bodySnippet: body.slice(0, 300) });
      return null;
    }
    const out = await uploadRes.json();
    if (out.id) logOk(out.id);
    return out.id || null;
  } catch (err: any) {
    console.error("[Drive] mirror error:", err);
    logFail(err?.message || String(err));
    return null;
  }
}

/**
 * Flat list of every file under a folder — root + one level of sub-folders.
 * Used by the inline PO vault so drops into "02. Mockups" / "03. Logos"
 * are visible without clicking into each sub-folder first. Each result
 * includes a synthesized `parentName` so the UI can label where it lives.
 */
export async function listFilesRecursive(rootFolderId: string): Promise<(DriveFile & { parentName?: string })[]> {
  // 1. Root-level non-folder files
  const rootFilesQ = [
    `'${rootFolderId}' in parents`,
    `mimeType != 'application/vnd.google-apps.folder'`,
    `trashed = false`,
  ].join(" and ");
  const rootRes = await driveFetch(
    `/files?q=${encodeURIComponent(rootFilesQ)}&fields=files(id,name,mimeType,webViewLink,iconLink,modifiedTime,size)&pageSize=200&orderBy=modifiedTime desc`,
  );
  const rootFiles: DriveFile[] = rootRes?.ok ? ((await rootRes.json()).files || []) : [];

  // 2. Sub-folders
  const foldersQ = [
    `'${rootFolderId}' in parents`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
  ].join(" and ");
  const foldersRes = await driveFetch(`/files?q=${encodeURIComponent(foldersQ)}&fields=files(id,name)&pageSize=50`);
  const subfolders: Array<{ id: string; name: string }> = foldersRes?.ok ? ((await foldersRes.json()).files || []) : [];

  // 3. Files inside each sub-folder
  const subFiles: (DriveFile & { parentName?: string })[] = [];
  for (const folder of subfolders) {
    const q = [
      `'${folder.id}' in parents`,
      `mimeType != 'application/vnd.google-apps.folder'`,
      `trashed = false`,
    ].join(" and ");
    const res = await driveFetch(
      `/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink,iconLink,modifiedTime,size)&pageSize=100&orderBy=modifiedTime desc`,
    );
    if (!res?.ok) continue;
    const files = (await res.json()).files || [];
    for (const f of files) subFiles.push({ ...f, parentName: folder.name });
  }

  return [...rootFiles, ...subFiles].sort((a, b) => {
    const at = a.modifiedTime || "";
    const bt = b.modifiedTime || "";
    return bt.localeCompare(at);
  });
}

/**
 * Grant a user reader (default) or writer access to a Drive folder/file.
 * Used at PO dispatch so the supplier can open the folder we email them.
 *
 * Idempotent: if the user already has the requested role, we skip and return
 * the existing permission id. Sends an email notification by default so the
 * supplier sees "Sideline NZ shared a folder with you" on top of our PO email.
 *
 * Returns the permission id, or null if Drive isn't configured / the call
 * failed (e.g. invalid email, no access). Callers log + continue.
 */
export async function shareFolderWithUser({
  fileOrFolderId,
  emailAddress,
  role = "reader",
  notify = true,
  notifyMessage,
}: {
  fileOrFolderId: string;
  emailAddress: string;
  role?: "reader" | "writer" | "commenter";
  notify?: boolean;
  notifyMessage?: string;
}): Promise<string | null> {
  if (!emailAddress) return null;
  const token = await getAccessToken();
  if (!token) return null;

  // Check existing permission so the same supplier doesn't get spammed every
  // time we re-dispatch a PO. Drive's GET /permissions returns all entries.
  const listUrl = driveUrl(`/files/${fileOrFolderId}/permissions`, {
    fields: "permissions(id,emailAddress,role,type)",
  });
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (listRes.ok) {
    const data = await listRes.json();
    const existing = (data.permissions || []).find(
      (p: any) => (p.emailAddress || "").toLowerCase() === emailAddress.toLowerCase()
    );
    if (existing && existing.role === role) return existing.id || null;
  }

  const url = driveUrl(`/files/${fileOrFolderId}/permissions`, {
    sendNotificationEmail: notify ? "true" : "false",
    ...(notify && notifyMessage ? { emailMessage: notifyMessage } : {}),
    fields: "id",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role, type: "user", emailAddress }),
  });
  if (!res.ok) {
    console.error("[Drive] shareFolderWithUser failed:", res.status, await res.text());
    return null;
  }
  const body = await res.json();
  return body.id || null;
}

/**
 * Create a Google Doc inside a Drive folder with the given plain-text body.
 * Used to drop a one-page Instructions doc next to artwork in the PO folder
 * so the supplier sees due dates + checklist alongside the files.
 *
 * Implementation: create the empty Doc, then PATCH its content via the Drive
 * media upload endpoint with mimeType=application/vnd.google-apps.document
 * (Drive auto-converts text/plain). Returns the file id + webViewLink.
 */
export async function createDocInFolder({
  parentFolderId,
  name,
  body,
}: {
  parentFolderId: string;
  name: string;
  body: string;
}): Promise<{ id: string; webViewLink: string } | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const boundary = `--sideline-doc-${Date.now().toString(36)}`;
  const metadata = {
    name,
    parents: [parentFolderId],
    mimeType: "application/vnd.google-apps.document",
  };
  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const mediaHeader = `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const payload = Buffer.concat([
    Buffer.from(metadataPart, "utf-8"),
    Buffer.from(mediaHeader, "utf-8"),
    Buffer.from(body, "utf-8"),
    Buffer.from(closing, "utf-8"),
  ]);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: payload,
    },
  );

  if (!res.ok) {
    console.error("[Drive] createDocInFolder failed:", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return { id: data.id, webViewLink: data.webViewLink };
}

export async function listFilesInFolder(folderId: string): Promise<DriveFile[]> {
  const q = [
    `'${folderId}' in parents`,
    `trashed = false`,
  ].join(" and ");

  const fields = "files(id,name,mimeType,webViewLink,iconLink,modifiedTime,size)";
  const res = await driveFetch(
    `/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=200&orderBy=modifiedTime desc`,
  );
  if (!res || !res.ok) {
    console.error("[Drive] list files failed:", res?.status, await res?.text());
    return [];
  }
  const data = await res.json();
  return (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    webViewLink: f.webViewLink,
    iconLink: f.iconLink,
    modifiedTime: f.modifiedTime,
    size: f.size,
  }));
}
