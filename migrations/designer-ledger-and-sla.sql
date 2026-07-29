-- Designer pay ledger + SLA safety nets (2026-07-29).
--
-- The pay ledger has NEVER written a row. Accrual lived in a workspace jsonl
-- file, synced by a cron keyed on quote.json, and nothing ever reached it — so
-- the money path was entirely unproven. Moving it into the app makes the QC
-- approve that earns the money and the row that records it the same transaction.
--
-- UNIQUE(job_id, kind) is the whole safety design: paying twice for one drop is
-- structurally impossible, not merely guarded by code. That matters because the
-- July 2026 auto-assign incident showed retry loops WILL happen.
CREATE TABLE IF NOT EXISTS designer_ledger (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        varchar NOT NULL REFERENCES designer_jobs(id) ON DELETE CASCADE,
  designer_name text NOT NULL,
  kind          text NOT NULL,              -- drop | bonus | clawback
  amount_usd    numeric(10,2) NOT NULL,
  on_time       boolean,
  note          text,
  accrued_at    timestamp NOT NULL DEFAULT now(),
  paid_at       timestamp,                  -- set by the Friday pay run
  CONSTRAINT designer_ledger_job_kind_unique UNIQUE (job_id, kind)
);
CREATE INDEX IF NOT EXISTS designer_ledger_designer_idx ON designer_ledger (designer_name, accrued_at DESC);
CREATE INDEX IF NOT EXISTS designer_ledger_unpaid_idx   ON designer_ledger (paid_at) WHERE paid_at IS NULL;

-- Which SLA nudges have already fired for a job, so a 30-minute cron cannot
-- send the same warning 48 times. Append-only list of stage keys.
ALTER TABLE designer_jobs ADD COLUMN IF NOT EXISTS sla_nudges_sent jsonb;
