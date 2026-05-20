// Gmail API sender — reuses the KIG admin Google OAuth refresh token
// that's already set on Railway (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// GOOGLE_REFRESH_TOKEN) with the gmail.send scope.
//
// "Send as" orders@sidelinenz.com: the alias must be added to the admin
// Gmail account under Settings → Accounts → "Send mail as". Once it's
// verified, Gmail API accepts From: orders@sidelinenz.com <...> on
// messages.send and routes the reply thread back to the orders@ inbox
// that forwards into the admin account.

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_SEND_URL = `${GMAIL_API_BASE}/messages/send`;
const GMAIL_DRAFTS_URL = `${GMAIL_API_BASE}/drafts`;
const GMAIL_THREADS_URL = `${GMAIL_API_BASE}/threads`;
const GMAIL_LABELS_URL = `${GMAIL_API_BASE}/labels`;

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function creds() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

export function isGmailConfigured(): boolean {
  return creds() !== null;
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
    console.error("[Gmail] token refresh failed:", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const expiresIn = (data.expires_in as number) || 3600;
  cachedAccessToken = { token: data.access_token, expiresAt: now + expiresIn * 1000 };
  return cachedAccessToken.token;
}

export interface GmailSendInput {
  from: string;        // "Sideline NZ Orders <orders@sidelinenz.com>"
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;    // default: same as from
  subject: string;
  html: string;
  text?: string;       // fallback plain text (Gmail will send multi-part)
}

function toList(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

// RFC2047 encode a subject line so non-ASCII (em-dashes, accents, etc.)
// survive the SMTP hop. Gmail handles UTF-8 natively but intermediate
// MXes and display clients can mangle raw UTF-8 in headers.
function encodeSubject(s: string): string {
  // If pure ASCII, pass through
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, "utf-8").toString("base64")}?=`;
}

function buildRfc2822(input: GmailSendInput): string {
  const to = toList(input.to).join(", ");
  const cc = toList(input.cc).join(", ");
  const bcc = toList(input.bcc).join(", ");
  const replyTo = input.replyTo || input.from;
  const boundary = `----=_Boundary_${Math.random().toString(36).slice(2)}`;

  const headers: string[] = [
    `From: ${input.from}`,
    `To: ${to}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${encodeSubject(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (cc) headers.push(`Cc: ${cc}`);
  if (bcc) headers.push(`Bcc: ${bcc}`);

  const textPart =
    `--${boundary}\r\n` +
    `Content-Type: text/plain; charset="UTF-8"\r\n` +
    `Content-Transfer-Encoding: 7bit\r\n\r\n` +
    (input.text || input.html.replace(/<[^>]+>/g, "")) + "\r\n";

  const htmlPart =
    `--${boundary}\r\n` +
    `Content-Type: text/html; charset="UTF-8"\r\n` +
    `Content-Transfer-Encoding: 7bit\r\n\r\n` +
    input.html + "\r\n";

  return headers.join("\r\n") + "\r\n\r\n" + textPart + htmlPart + `--${boundary}--`;
}

function base64UrlEncode(raw: string): string {
  return Buffer.from(raw, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Create a Gmail draft (does NOT send). Used by the supplier follow-up cron
 * so Romero can review + click Send in the orders@ inbox before anything
 * goes out — matches the memory rule that supplier follow-ups go through
 * Romero's approval, not auto-send.
 *
 * If `threadId` is provided, the draft attaches to that thread (i.e. it
 * shows up as a reply in the existing PO conversation). Otherwise it's a
 * fresh thread.
 */
export async function createGmailDraft(
  input: GmailSendInput,
  threadId?: string,
): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) {
    console.log("[Gmail] not configured — skipping draft to", input.to);
    return null;
  }

  const raw = base64UrlEncode(buildRfc2822(input));
  try {
    const res = await fetch(GMAIL_DRAFTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          raw,
          ...(threadId ? { threadId } : {}),
        },
      }),
    });
    if (!res.ok) {
      console.error("[Gmail] draft create failed:", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data.id || null;
  } catch (err) {
    console.error("[Gmail] draft request error:", err);
    return null;
  }
}

export interface GmailMessage {
  id: string;
  threadId: string;
  internalDate: number; // ms
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  snippet: string;
  body: string;            // text/plain decoded; falls back to a stripped HTML
  labelIds: string[];
}

function decodeBase64Url(s: string): string {
  // Gmail returns body data url-safe, no padding
  const norm = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + (4 - s.length % 4) % 4, "=");
  return Buffer.from(norm, "base64").toString("utf-8");
}

function extractTextFromPayload(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) {
    if (payload.mimeType?.startsWith("text/plain")) return decodeBase64Url(payload.body.data);
    if (payload.mimeType?.startsWith("text/html")) {
      // crude HTML→text — fine for keyword classification
      return decodeBase64Url(payload.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    }
  }
  // Multipart — prefer text/plain part, fall back to first text/* part
  if (Array.isArray(payload.parts)) {
    const plain = payload.parts.find((p: any) => p.mimeType?.startsWith("text/plain"));
    if (plain) return extractTextFromPayload(plain);
    const html = payload.parts.find((p: any) => p.mimeType?.startsWith("text/html"));
    if (html) return extractTextFromPayload(html);
    // recurse into nested multipart
    for (const p of payload.parts) {
      const t = extractTextFromPayload(p);
      if (t) return t;
    }
  }
  return "";
}

function parseFromHeader(from: string): { name: string; email: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].replace(/^"|"$/g, ""), email: m[2] };
  return { name: "", email: from.trim() };
}

/**
 * Search Gmail messages with the standard Gmail query syntax.
 * Returns lightweight refs (id + threadId); call `getGmailThread` to load bodies.
 */
export async function searchGmailMessages(query: string, maxResults = 25): Promise<Array<{ id: string; threadId: string }>> {
  const token = await getAccessToken();
  if (!token) return [];
  const url = `${GMAIL_API_BASE}/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error("[Gmail] search failed:", res.status, await res.text());
    return [];
  }
  const data = await res.json();
  return (data.messages || []).map((m: any) => ({ id: m.id, threadId: m.threadId }));
}

/**
 * Load a full Gmail thread — every message, parsed.
 * Used by the supplier follow-up cron to see whether the supplier has replied
 * since the original PO dispatch and what they said.
 */
export async function getGmailThread(threadId: string): Promise<GmailMessage[]> {
  const token = await getAccessToken();
  if (!token) return [];
  const res = await fetch(`${GMAIL_THREADS_URL}/${threadId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error("[Gmail] thread fetch failed:", res.status, await res.text());
    return [];
  }
  const data = await res.json();
  return (data.messages || []).map((m: any): GmailMessage => {
    const headers = (m.payload?.headers || []) as Array<{ name: string; value: string }>;
    const get = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value || "";
    const fromRaw = get("From");
    const { name, email } = parseFromHeader(fromRaw);
    return {
      id: m.id,
      threadId: m.threadId,
      internalDate: parseInt(m.internalDate || "0", 10),
      fromEmail: email,
      fromName: name,
      to: get("To"),
      subject: get("Subject"),
      snippet: m.snippet || "",
      body: extractTextFromPayload(m.payload),
      labelIds: m.labelIds || [],
    };
  });
}

// ─── Labels ──────────────────────────────────────────────────────
//
// The queue processor uses a label-based handshake:
//   - inbound customer threads land in label `sideline-auto-queue`
//     (applied by a Gmail filter or manually)
//   - processor reads `is:unread label:sideline-auto-queue`, takes action,
//     then removes the queue label and applies `sideline-auto-handled`
//
// Labels are user labels (visible in Gmail UI), not system labels.

let labelCache: Map<string, string> | null = null;

async function loadLabelCache(token: string): Promise<Map<string, string>> {
  if (labelCache) return labelCache;
  const res = await fetch(GMAIL_LABELS_URL, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error("[Gmail] label list failed:", res.status, await res.text());
    return new Map();
  }
  const data = await res.json();
  const m = new Map<string, string>();
  for (const lb of data.labels || []) {
    if (lb.id && lb.name) m.set(lb.name, lb.id);
  }
  labelCache = m;
  return m;
}

export async function getOrCreateGmailLabel(name: string): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const cache = await loadLabelCache(token);
  const existing = cache.get(name);
  if (existing) return existing;
  // Create the label (user-visible, expanded by default).
  const res = await fetch(GMAIL_LABELS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
  });
  if (!res.ok) {
    console.error(`[Gmail] label create failed for "${name}":`, res.status, await res.text());
    return null;
  }
  const data = await res.json();
  if (data.id && data.name) cache.set(data.name, data.id);
  return data.id || null;
}

export async function applyGmailLabels(threadId: string, opts: { add?: string[]; remove?: string[] }): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;
  const addIds: string[] = [];
  const removeIds: string[] = [];
  for (const name of opts.add || []) {
    const id = await getOrCreateGmailLabel(name);
    if (id) addIds.push(id);
  }
  if (opts.remove?.length) {
    const cache = await loadLabelCache(token);
    for (const name of opts.remove) {
      const id = cache.get(name);
      if (id) removeIds.push(id);
    }
  }
  if (addIds.length === 0 && removeIds.length === 0) return true; // nothing to do
  const res = await fetch(`${GMAIL_THREADS_URL}/${threadId}/modify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      addLabelIds: addIds,
      removeLabelIds: removeIds,
    }),
  });
  if (!res.ok) {
    console.error("[Gmail] label modify failed:", res.status, await res.text());
    return false;
  }
  return true;
}

/**
 * Send a Gmail message from the KIG admin account.
 * Returns the Gmail message id on success, null on failure.
 */
export async function sendGmail(input: GmailSendInput): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) {
    console.log("[Gmail] not configured — skipping send to", input.to);
    return null;
  }

  const raw = base64UrlEncode(buildRfc2822(input));

  try {
    const res = await fetch(GMAIL_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      console.error("[Gmail] send failed:", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data.id || null;
  } catch (err) {
    console.error("[Gmail] request error:", err);
    return null;
  }
}
