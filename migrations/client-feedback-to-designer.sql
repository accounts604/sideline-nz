-- Client feedback reaches the designer without a human relay (2026-07-28).
--
-- Before this, a client clicking "Request changes" on /approve/<token> wrote the
-- decision, stored their notes, and emailed ADMIN_NOTIFY_EMAIL. That is Romero,
-- and only Romero. The designer never learned their work needed changing until
-- he told them, which made him a human message queue on every revision.
--
-- The blocker was structural: designer_jobs.quote_id is an SL-#### string that
-- references nothing, so the app could not tell which designer made the mockups
-- a given client was commenting on.
--
--   order_id          — the missing link. Nullable, because a job exists before
--                       an order does and speculative mockups may never convert.
--   designer_email    — so the app can tell the designer directly.
--   revision_requests — append-only [{at, source:"client"|"qc", notes, round}].
--                       Append-only so round 2 never erases what round 1 asked for.
ALTER TABLE designer_jobs ADD COLUMN IF NOT EXISTS order_id varchar REFERENCES orders(id);
ALTER TABLE designer_jobs ADD COLUMN IF NOT EXISTS designer_email text;
ALTER TABLE designer_jobs ADD COLUMN IF NOT EXISTS revision_requests jsonb;

CREATE INDEX IF NOT EXISTS designer_jobs_order_id_idx ON designer_jobs (order_id);
