-- Designer claim board (2026-07-28).
--
-- Jobs were PUSHED: round-robin picked a designer and the clock started at
-- assignment, so a designer could be marked late for a job they had never seen.
-- That is exactly how SL-0064 died: assigned 20 Jul, deadline 23 Jul, never
-- opened, nothing chased, and "late" recorded against someone who never agreed
-- to it.
--
-- Now jobs are POSTED to a board and a designer CLAIMS one. The SLA clock starts
-- at the claim. The commitment is theirs, so on-time percentage finally means
-- something, and the board self-balances across any number of designers.

CREATE TABLE IF NOT EXISTS designers (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,          -- stable slug; never change once they have jobs
  display_name  text NOT NULL,
  email         text,
  token         text NOT NULL UNIQUE,          -- personal board link; the credential
  timezone      text NOT NULL DEFAULT 'Pacific/Auckland',
  sla_hours     integer NOT NULL DEFAULT 48,
  wip_cap       integer NOT NULL DEFAULT 1,    -- new designers hold one job at a time
  tier          text NOT NULL DEFAULT 'rookie',
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamp DEFAULT now(),
  updated_at    timestamp DEFAULT now()
);

ALTER TABLE designer_jobs ADD COLUMN IF NOT EXISTS posted_at timestamp;
ALTER TABLE designer_jobs ADD COLUMN IF NOT EXISTS claimed_at timestamp;
ALTER TABLE designer_jobs ADD COLUMN IF NOT EXISTS release_count integer NOT NULL DEFAULT 0;

-- The board reads "everything still available", so index that path.
CREATE INDEX IF NOT EXISTS designer_jobs_status_idx ON designer_jobs (status);
