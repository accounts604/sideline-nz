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
