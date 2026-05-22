# Project: Sideline NZ

## Stack
- Node 22 · Express · React 19 + Vite + Wouter · Drizzle-ORM on Postgres (Neon)
- Deploys to both Railway (`railway.json` + nixpacks) and Vercel (`vercel.json`, serverless `api/index.ts`)
- Auth: bcryptjs + JWT (httpOnly `snz_token` cookie) via `server/auth.ts`
- Email: pluggable `emailService` in `server/email.ts` (Resend when `RESEND_API_KEY` set; falls back to console). Supplier PO emails go via Gmail API (`server/gmail.ts`).
- PDF: `puppeteer-core` + `@sparticuz/chromium`

## Club Manager Portal (supporter-campaign drops)

Club managers log in to a dashboard that shows live Shopify orders from their supporter campaign. Server-side tag isolation is the security boundary — a manager can never see another club's orders.

### Shopify tag convention
Every supporter-campaign order must carry a tag of the form `club:<slug>`, e.g. `club:onewhero-rfc`. Set this via Shopify Flow on order creation. The tag on each `club_accounts` row (`shopify_order_tag` column) is the sole filter used by the Admin GraphQL query — no client input feeds it.

### Create a club manager account
```bash
npx tsx scripts/seed-club-manager.ts \
  --email manager@onewhero.co.nz \
  --club "Onewhero RFC" \
  --tag club:onewhero-rfc \
  --store https://onewhero-rfc.myshopify.com \
  --tier 800           # basis points — 800 = 8% profit share (default)
```
The script prints the initial password once. Share it via WhatsApp/Telegram.

Admin alternative (requires admin session cookie):
```bash
curl -X POST https://sidelinenz.com/api/admin/club-managers \
  -H "Content-Type: application/json" \
  -b "snz_token=<admin-jwt>" \
  -d '{"email":"...","clubName":"...","shopifyOrderTag":"club:...","profitShareTierBps":800}'
```

### Trigger a drop summary report
```bash
curl -X POST https://sidelinenz.com/api/admin/reports/club-drop-summary \
  -H "Content-Type: application/json" \
  -b "snz_token=<admin-jwt>" \
  -d '{"clubAccountId":"<id>","from":"2026-04-01","to":"2026-04-30"}'
# pass "previewOnly": true to render without emailing
```
Branded HTML + PDF attachment; sent to the manager's email.

### Routes

| Path | Who | Purpose |
|---|---|---|
| `GET /club-portal/login` | public | login page |
| `GET /club-portal/dashboard` | manager | existing bulk-order mockup/tracking |
| `GET /club-portal/supporter-dashboard` | manager | supporter campaign live orders |
| `GET /api/club-portal/supporter-orders` | manager | JSON: orders + summary for their tag |
| `GET /api/club-portal/supporter-orders.csv` | manager | CSV export |
| `GET /api/club-portal/supporter-summary` | manager | totals + top supporters |
| `POST /api/admin/club-managers` | admin | create manager |
| `GET  /api/admin/club-managers` | admin | list |
| `POST /api/admin/reports/club-drop-summary` | admin | trigger report email |

Login rate limit: 5 attempts / IP / 15 min (in-memory).
Shopify Admin responses cached 5 min per tag.

### Env vars
Required for this feature:
- `SHOPIFY_STORE_URL` — e.g. `sideline-nz-2.myshopify.com`
- `SHOPIFY_ADMIN_TOKEN` — Admin API access token, scope `read_orders` (add `read_all_orders` for orders > 60 days)
- `RESEND_API_KEY` — sends reports; without it, emails log to console

Optional:
- `SHOPIFY_ADMIN_API_VERSION` — defaults to `2024-10`
- `RESEND_FROM` — defaults to `Sideline NZ <hello@sidelinenz.com>`

### Schema migration
Run `npm run db:push` to sync `shared/schema.ts` (no dry-run — review `migrations/club-supporter-fields.sql` first), or apply the SQL directly:
```bash
psql "$DATABASE_URL" -f migrations/club-supporter-fields.sql
```

### Tests
```bash
npx tsx scripts/test-supporter-flow.ts
```
Covers tag isolation (poisoned order rejection), summary math, date filter inclusivity, and cache TTL.

## Xero integration (Pull customer invoice PDF from Xero)

Lets the back office pull a customer invoice PDF straight from Xero by reference, mirrored into the PO's Drive `08. Invoicing/` folder. Used by the "Pull invoice PDF from Xero" button on the Invoices & Payments section of each PO detail.

### One-time setup

1. **Register a Xero app** at https://developer.xero.com/myapps/ → "New app"
   - **App name**: Sideline NZ
   - **Integration type**: Web app
   - **Company / app URL**: `https://sidelinenz.com`
   - **OAuth 2.0 redirect URI**: `https://sidelinenz.com/api/admin/xero/callback` (and a dev one: `http://localhost:5173/api/admin/xero/callback` if you ever test locally)

2. **Copy the credentials** Xero gives you into env vars on **both** Railway + Vercel:
   - `XERO_CLIENT_ID`
   - `XERO_CLIENT_SECRET`
   - `XERO_REDIRECT_URI` (optional — defaults to `{SITE_URL}/api/admin/xero/callback`)

3. **Apply the migration**: `psql "$DATABASE_URL" -f migrations/xero-connections.sql` (or `npm run db:push`)

4. **Connect from the UI**: visit `/admin/settings` → click "Connect Xero" → grant access in Xero's consent screen → you bounce back with a green "Connected" chip.

### How it works

- `server/xero-client.ts` handles OAuth2: `exchangeAuthCode` on first connect, `refreshAccessToken` lazily before any API call.
- Tokens stored in `xero_connections` (single-row table by tenant_id). Access token expires every 30 min; refresh token rotates on every refresh and lasts 60 days.
- `fetchInvoicePdf(invoiceNumberOrId)` resolves an invoice number → InvoiceID via the Invoices API, then GETs the single-invoice endpoint with `Accept: application/pdf` to get the PDF buffer.
- The `/api/admin/orders/:id/customer-invoice/pull-from-xero` endpoint pushes the PDF to Vercel Blob, then mirrors to Drive via the existing `mirrorBlobToPoFolder` helper.

### Scopes requested
```
openid profile email offline_access
accounting.transactions accounting.attachments accounting.contacts.read
```

### When the refresh token expires (after 60 days unused)
The "Pull from Xero" button will return a Xero refresh error. Visit `/admin/settings` and click "Re-connect" to grant a fresh refresh token. No data is lost.

## Daily digest (proactive ops summary)

Sends a morning summary to Telegram thread 614: overdue POs, at-risk POs this week, supplier invoices unpaid >7d, live supporter drops. The user gets it whether or not they open the admin portal — Ezra surfacing what matters before being asked.

### Surfaces

- **Manual fire**: `/admin/triage` → "📨 Send digest" button → preview modal → "Post to Telegram thread 614 →"
- **Scheduled** (GitHub Actions): `.github/workflows/daily-digest.yml` hits `/api/cron/daily-digest` at 18:30 UTC daily (~07:30 NZ; drift across DST is acceptable)

### Endpoint

`POST /api/cron/daily-digest` — accepts either an admin session cookie (for the UI button) or `X-Cron-Secret: <value>` header matching `CRON_SECRET` env var.

Query params:
- `?dryRun=true` — returns the digest payload without posting to Telegram

### Required env vars

- `CRON_SECRET` — random string, set on the server **and** as a GitHub Actions secret (`Settings → Secrets and variables → Actions`)
- `SITE_URL` — base URL the workflow hits (optional GitHub secret; defaults to `https://sidelinenz.com`)
- `JARVESI_BOT_TOKEN` + `KIG_GROUP_CHAT_ID` — already configured for other Telegram cards

### To turn off

Disable the workflow under `Actions → Daily digest → ⋯ → Disable workflow`. The manual button stays available either way.

## Customer-queue cron (Gmail → Ezra)

Drains the `sideline-auto-queue` Gmail label every 15 min: pulls labelled threads, hydrates context (Shopify by email/order#, internal by PO ref), spawns one Ezra turn per thread, applies `sideline-auto-handled` after.

### Surfaces

- **Manual fire**: `/admin/triage` → "📥 Scan queue" button → dry-run result modal → "Run live → process for real"
- **Scheduled**: `.github/workflows/customer-queue.yml` hits `/api/cron/process-customer-queue` every 15 min

### Endpoint

`POST /api/cron/process-customer-queue` — same auth model as daily-digest (admin cookie OR `X-Cron-Secret`).

Query params:
- `?dryRun=true` — scan + log without calling Ezra or modifying Gmail labels
- `?limit=N` — max threads per run (default 5, max 25)
- `?threadId=<id>` — process a single specific thread

### Setting up the Gmail label

1. In Gmail, create the label `sideline-auto-queue`
2. Create a Gmail filter — e.g. `to:orders@sidelinenz.com -from:@sidelinenz.com -from:@kig.co.nz` → "Apply the label: sideline-auto-queue"
3. From then on, every inbound customer email is queued automatically

### Reuse from CLI

The module `server/ezra/queue-processor.ts` is the single source of truth — `scripts/process-sideline-queue.ts` still works for ad-hoc CLI runs, and the cron endpoint imports the same `processCustomerQueue()` function.
