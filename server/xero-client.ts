// Xero API client — OAuth2 token management + invoice / PDF fetch.
//
// Token lifecycle:
//   - access_token expires in ~30 minutes
//   - refresh_token rotates on every refresh (Xero invalidates the old one)
//   - refresh_token has a ~60 day lifetime; if it expires, user must re-auth
//
// We refresh lazily: getAccessToken() returns the current token if it has
// more than 60s left, otherwise refreshes first. All Xero API callers go
// through getAccessToken() — never read xero_connections.accessToken directly.
//
// Env vars required:
//   XERO_CLIENT_ID
//   XERO_CLIENT_SECRET
//   XERO_REDIRECT_URI — must match what's registered at developer.xero.com.
//                       Defaults to {SITE_URL}/api/admin/xero/callback.

import { db } from "./db";
import { xeroConnections } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

const TOKEN_URL = "https://identity.xero.com/connect/token";
const AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const API_BASE = "https://api.xero.com/api.xro/2.0";
const CONNECTIONS_URL = "https://api.xero.com/connections";

// Scopes we ask for. accounting.attachments is what lets us pull invoice PDFs.
export const XERO_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.transactions",      // read invoices
  "accounting.attachments",       // read invoice attachments (PDFs)
  "accounting.contacts.read",
].join(" ");

export function isXeroEnvConfigured(): boolean {
  return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
}

export function getRedirectUri(): string {
  if (process.env.XERO_REDIRECT_URI) return process.env.XERO_REDIRECT_URI;
  const base = (process.env.SITE_URL || "https://sidelinenz.com").replace(/\/$/, "");
  return `${base}/api/admin/xero/callback`;
}

// Build the consent URL the admin gets redirected to.
export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.XERO_CLIENT_ID!,
    redirect_uri: getRedirectUri(),
    scope: XERO_SCOPES,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// Basic-auth header for token endpoint
function basicAuth(): string {
  const encoded = Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64");
  return `Basic ${encoded}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

// Exchange the authorization code for the first access + refresh tokens.
// Also looks up the connected tenants so we know which org's data we're
// touching, then stores everything in xero_connections.
export async function exchangeAuthCode(code: string, opts: { userId?: string } = {}): Promise<{ tenantId: string; tenantName: string | null }> {
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
    }),
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "");
    throw new Error(`Xero token exchange failed: ${tokenRes.status} ${body.slice(0, 200)}`);
  }
  const tokens = (await tokenRes.json()) as TokenResponse;

  // Look up the tenant_id (Xero org id) we now have access to.
  const conRes = await fetch(CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!conRes.ok) {
    throw new Error(`Xero connections lookup failed: ${conRes.status}`);
  }
  const conns = (await conRes.json()) as Array<{ id: string; tenantId: string; tenantName: string }>;
  if (conns.length === 0) {
    throw new Error("Xero returned no connected tenants — user didn't grant access to any org.");
  }
  const first = conns[0]; // single-tenant assumption

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  // Upsert by tenant_id so re-connecting refreshes the row in place.
  const existing = await db.select().from(xeroConnections).where(eq(xeroConnections.tenantId, first.tenantId)).limit(1);
  if (existing[0]) {
    await db.update(xeroConnections).set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      scopes: tokens.scope || XERO_SCOPES,
      tenantName: first.tenantName,
      connectedBy: opts.userId,
      updatedAt: new Date(),
    }).where(eq(xeroConnections.id, existing[0].id));
  } else {
    await db.insert(xeroConnections).values({
      tenantId: first.tenantId,
      tenantName: first.tenantName,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      scopes: tokens.scope || XERO_SCOPES,
      connectedBy: opts.userId,
    });
  }

  return { tenantId: first.tenantId, tenantName: first.tenantName };
}

// Refresh the access token using the stored refresh token. Xero rotates the
// refresh token, so we save the new one too.
async function refreshAccessToken(connection: { id: string; refreshToken: string }): Promise<void> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Xero refresh failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const tokens = (await res.json()) as TokenResponse;
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await db.update(xeroConnections).set({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
    scopes: tokens.scope || undefined,
    updatedAt: new Date(),
  }).where(eq(xeroConnections.id, connection.id));
}

// Returns { accessToken, tenantId } ready to use. Throws if no connection
// exists or refresh fails.
export async function getActiveConnection(): Promise<{ accessToken: string; tenantId: string; tenantName: string | null }> {
  const [row] = await db.select().from(xeroConnections).orderBy(desc(xeroConnections.connectedAt)).limit(1);
  if (!row) throw new Error("Xero not connected. Visit /admin/settings and click Connect Xero.");
  // Refresh if expired or within 60s of expiry
  if (row.expiresAt.getTime() - Date.now() < 60_000) {
    await refreshAccessToken({ id: row.id, refreshToken: row.refreshToken });
    const [refreshed] = await db.select().from(xeroConnections).where(eq(xeroConnections.id, row.id)).limit(1);
    return { accessToken: refreshed.accessToken, tenantId: refreshed.tenantId, tenantName: refreshed.tenantName };
  }
  return { accessToken: row.accessToken, tenantId: row.tenantId, tenantName: row.tenantName };
}

// Fetch an invoice by number (e.g. "INV-12345"). Returns the raw Xero invoice
// object (parsed JSON) — caller picks fields it cares about.
export async function fetchInvoiceByNumber(invoiceNumber: string): Promise<any | null> {
  const { accessToken, tenantId } = await getActiveConnection();
  // Xero supports lookup by ID or InvoiceNumber via the path: /Invoices/{IDOrNumber}
  // Pass via query string to avoid URL-encoding edge cases on numbers with slashes.
  const url = `${API_BASE}/Invoices?InvoiceNumbers=${encodeURIComponent(invoiceNumber)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": tenantId,
      Accept: "application/json",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Xero invoice fetch failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const inv = data?.Invoices?.[0];
  return inv ?? null;
}

// Fetch the invoice PDF as a buffer. Xero serves PDFs when Accept: application/pdf
// is set on the single-invoice GET. We need the InvoiceID for this — fetch by
// number first if needed.
export async function fetchInvoicePdf(invoiceNumberOrId: string): Promise<{ buffer: Buffer; invoiceNumber: string; invoiceId: string } | null> {
  const { accessToken, tenantId } = await getActiveConnection();

  // Resolve to an InvoiceID first. Xero's PDF endpoint takes the GUID, not the number.
  let invoiceId = invoiceNumberOrId;
  let invoiceNumber = invoiceNumberOrId;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceNumberOrId)) {
    const inv = await fetchInvoiceByNumber(invoiceNumberOrId);
    if (!inv) return null;
    invoiceId = inv.InvoiceID;
    invoiceNumber = inv.InvoiceNumber || invoiceNumberOrId;
  }

  const res = await fetch(`${API_BASE}/Invoices/${invoiceId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": tenantId,
      Accept: "application/pdf",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Xero PDF fetch failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, invoiceNumber, invoiceId };
}

// Revoke the current connection (calls Xero's revoke endpoint with the
// refresh token + deletes the local row).
export async function disconnectXero(): Promise<void> {
  const [row] = await db.select().from(xeroConnections).limit(1);
  if (!row) return;
  // Best-effort revoke at Xero — proceed with local delete even if it fails.
  try {
    await fetch("https://identity.xero.com/connect/revocation", {
      method: "POST",
      headers: {
        Authorization: basicAuth(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token: row.refreshToken }),
    });
  } catch {
    /* ignore */
  }
  await db.delete(xeroConnections).where(eq(xeroConnections.id, row.id));
}
