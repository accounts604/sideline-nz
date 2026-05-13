-- Sample / Bulk PO split (designed 2026-04-28, shipped 2026-05-07)
--
-- A purchase order is still an `orders` row, but now it carries a `po_kind`
-- and an optional `parent_order_id`. The flow is:
--
--   1. Admin raises a SAMPLE PO from the original order — qty 1 of each
--      garment. Approval card is posted to the Sideline Telegram thread
--      with Send / Edit / Hold. Tap Send → Gmail dispatch fires.
--
--   2. After client signs off the sample AND the deposit lands in Xero
--      (Enoch flips `deposit_paid_at`), a BULK PO is auto-duplicated from
--      the sample, linked via `parent_order_id`, and posted as a fresh
--      approval card. Tap Send → bulk Gmail dispatch fires.
--
-- Gates:
--   - `po_held_at` + `po_hold_reason` make Hold resumable (vs Cancelled).
--   - `sample_approved_by_client_at` is the client-mockup-sign-off signal.
--   - `deposit_paid_at` is the Xero-deposit signal (Enoch sets it).
--   - Bulk dispatch requires both gates met.
--
-- All columns are additive with safe defaults, so existing orders keep
-- working exactly as before — they read as `po_kind = 'single'` (the
-- legacy single-step raise-po path).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS po_kind text NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS parent_order_id varchar REFERENCES orders(id),
  ADD COLUMN IF NOT EXISTS po_dispatched_at timestamp,
  ADD COLUMN IF NOT EXISTS po_held_at timestamp,
  ADD COLUMN IF NOT EXISTS po_hold_reason text,
  ADD COLUMN IF NOT EXISTS po_held_by varchar REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS sample_approved_by_client_at timestamp,
  ADD COLUMN IF NOT EXISTS deposit_paid_at timestamp;

-- Constrain po_kind to the three valid values. Drop-then-add so re-running
-- the migration after a value-set change doesn't fail.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_po_kind_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_po_kind_check
  CHECK (po_kind IN ('single', 'sample', 'bulk'));

-- Lookups: parent → children (sample → its bulk) is the hot path on the
-- bulk approval card, so an index on parent_order_id pays for itself.
CREATE INDEX IF NOT EXISTS orders_parent_order_id_idx ON orders(parent_order_id);
CREATE INDEX IF NOT EXISTS orders_po_kind_idx ON orders(po_kind);
