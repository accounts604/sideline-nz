-- Register-interest signups from closed supporter-campaign drops.
--
-- When a drop has closed, the storefront swaps the buy box for an email
-- "notify me when this club drops again" form. POST /api/notify/:slug writes
-- a row here, deduped on (club_slug, email).
--
-- Kept separate from order_activity because the signups are pre-customer
-- (no user_id) and pre-order (no order_id), so they don't fit either log.

CREATE TABLE IF NOT EXISTS notify_signups (
  id              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  club_slug       text    NOT NULL,
  email           text    NOT NULL,
  collection_handle text  NOT NULL,
  source          text,                  -- 'collection_page' | 'product_page' | 'api'
  user_agent      text,
  referrer        text,
  created_at      timestamp NOT NULL DEFAULT now(),
  notified_at     timestamp,             -- set when we ping them on the next drop
  UNIQUE (club_slug, email)
);

CREATE INDEX IF NOT EXISTS notify_signups_club_slug_idx ON notify_signups (club_slug);
CREATE INDEX IF NOT EXISTS notify_signups_created_at_idx ON notify_signups (created_at DESC);
