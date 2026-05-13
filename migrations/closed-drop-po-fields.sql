-- Closed-drop PO build pipeline.
--
-- Adds:
--   club_accounts.supporter_collection_handle    — Shopify collection handle the cron watches
--   club_accounts.supporter_collection_published — last-seen state (for transition detection)
--   club_accounts.supporter_drop_closed_at       — debounce: don't auto-fire twice
--   orders.bulk_size_breakdown                   — stashed { itemId: { size: qty } } from drop close
--   orders.source_collection_handle              — provenance: which collection this PO came from
--
-- Safe to re-run.

ALTER TABLE club_accounts
  ADD COLUMN IF NOT EXISTS supporter_collection_handle    text,
  ADD COLUMN IF NOT EXISTS supporter_collection_published boolean,
  ADD COLUMN IF NOT EXISTS supporter_drop_closed_at       timestamp;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS bulk_size_breakdown    jsonb,
  ADD COLUMN IF NOT EXISTS source_collection_handle text;
