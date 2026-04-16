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
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

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
