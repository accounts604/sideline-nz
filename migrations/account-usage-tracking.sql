-- Usage tracking across every account type (2026-07-29).
--
-- Nothing recorded when anyone last used Sideline. Order activity is rich, but
-- every event is scoped to an ORDER, so there was no way to ask "when did
-- Otahuhu last look at anything" or "who has gone quiet". That is the question
-- that actually matters when you are overseeing four different audiences.
--
-- last_seen_at is stamped on any authenticated request (customers, suppliers)
-- and on any token-page load (designers), so it covers the no-login surfaces too.
ALTER TABLE users          ADD COLUMN IF NOT EXISTS last_seen_at timestamp;
ALTER TABLE club_accounts  ADD COLUMN IF NOT EXISTS last_seen_at timestamp;
ALTER TABLE designers      ADD COLUMN IF NOT EXISTS last_seen_at timestamp;
