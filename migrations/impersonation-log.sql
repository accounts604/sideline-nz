-- Admin impersonation audit trail (2026-07-29).
--
-- "View as them" that actually switches the session is a real privilege, so
-- every use is recorded: who did it, whose account, when it started and when it
-- ended. Without this an admin mistake made inside someone else's session is
-- indistinguishable from that person doing it themselves.
CREATE TABLE IF NOT EXISTS impersonation_log (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id varchar NOT NULL REFERENCES users(id),
  target_kind   text NOT NULL,          -- user | club_account
  target_id     varchar NOT NULL,
  target_label  text,                   -- name/email at the time, so the log reads later
  started_at    timestamp NOT NULL DEFAULT now(),
  ended_at      timestamp,
  ip            text,
  user_agent    text
);
CREATE INDEX IF NOT EXISTS impersonation_log_admin_idx ON impersonation_log (admin_user_id, started_at DESC);
