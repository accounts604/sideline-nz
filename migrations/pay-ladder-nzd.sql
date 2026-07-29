-- Pay is NZD, not USD (Romero, 2026-07-30), and the ladder replaces the flat fee.
--
-- The system said USD in six places and that was simply wrong. At ~1.65 NZD/USD
-- the gap on a top-tier drop is about $30, so this is a correctness fix rather
-- than a labelling nicety. The ledger has zero rows, so the rename is free.
ALTER TABLE designer_ledger RENAME COLUMN amount_usd TO amount_nzd;

-- What the ladder scored, kept alongside the amount so a payout can be explained
-- months later without re-deriving it: {items, targetHours, elapsedHours, band}.
ALTER TABLE designer_ledger ADD COLUMN IF NOT EXISTS breakdown jsonb;
