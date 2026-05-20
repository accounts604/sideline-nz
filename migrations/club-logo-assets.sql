-- club_logo_assets — one row per logo asset assigned to a club, sourced from Canva.
-- The PO-raise hook reads this table to find the primary logo for a club,
-- exports it via Canva's API, and writes it into the order's Drive folder.
-- Apply with: psql "$DATABASE_URL" -f migrations/club-logo-assets.sql
-- OR run `npm run db:push` to let drizzle-kit reconcile the schema.

CREATE TABLE IF NOT EXISTS "club_logo_assets" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "club_account_id" varchar NOT NULL REFERENCES "club_accounts"("id") ON DELETE CASCADE,
  -- Canva design ID (e.g. "DAHCpwD2ghs"). Combined with page_index to pinpoint
  -- the exact page in multi-page decks like "Sideline Customer Logos" (27 pages).
  "canva_design_id" text NOT NULL,
  "canva_page_index" integer, -- 1-based; NULL for single-page designs
  -- "primary" = the one used on PO raise by default. "secondary"/"sponsor"
  -- are alternates surfaced in the admin UI but not auto-attached.
  "kind" text NOT NULL DEFAULT 'primary',
  "display_label" text, -- e.g. "Onewhero RFC — Primary mark"
  -- Cached preview URL from Canva (export-design result). Refreshed by the
  -- PO-raise hook so the admin UI shows the latest version. Nullable for
  -- newly-added rows that haven't been exported yet.
  "preview_url" text,
  "last_synced_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "club_logo_assets_club_account_idx"
  ON "club_logo_assets" ("club_account_id");

-- Enforce at most one primary per club. Partial unique index — `kind != 'primary'`
-- rows don't collide. CASCADE on club_accounts delete handles cleanup.
CREATE UNIQUE INDEX IF NOT EXISTS "club_logo_assets_one_primary_per_club"
  ON "club_logo_assets" ("club_account_id")
  WHERE "kind" = 'primary';
