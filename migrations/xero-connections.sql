-- xero_connections — single-row table that holds the org's connection to Xero.
-- One Sideline = one Xero org for now. The schema permits multiple rows
-- (one per tenant_id) so a future "multi-org" mode wouldn't need a migration.
--
-- Token handling:
--   - access_token: ~30 min lifetime; refreshed lazily on use
--   - refresh_token: ~60 day lifetime; rotated on every refresh
--   - expires_at: set when we store/refresh
-- Tokens are stored plaintext — XERO_CLIENT_SECRET in env vars is the only
-- boundary today. If/when we add app-layer encryption, this is the row to
-- protect.
--
-- Apply with: psql "$DATABASE_URL" -f migrations/xero-connections.sql
CREATE TABLE IF NOT EXISTS "xero_connections" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" text NOT NULL UNIQUE,
  "tenant_name" text,
  "access_token" text NOT NULL,
  "refresh_token" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "scopes" text, -- space-separated scope list returned by Xero
  "connected_at" timestamp DEFAULT now(),
  "connected_by" varchar REFERENCES "users"("id"),
  "updated_at" timestamp DEFAULT now()
);
