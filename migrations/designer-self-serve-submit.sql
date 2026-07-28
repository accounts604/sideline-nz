-- Designer self-serve submit (2026-07-28 multi-freelancer refresh).
--
-- Before this, /job/<token> was read-only: the designer had no way to hand work
-- back through the system, so every delivery needed a human to receive files and
-- run a CLI submit. That was the bottleneck that stalled the first trial and it
-- gets worse with every extra freelancer.
--
--  submissions — [{url,name,size,at}] uploaded from the job page itself.
--                Append-only across revision rounds, so a reject never destroys
--                evidence of what was delivered in the first round.
--  timezone    — the designer's IANA zone. Was hardcoded to Asia/Colombo in both
--                the page clock and the workspace deadline math; now per job so a
--                designer anywhere gets a correct clock.
ALTER TABLE designer_jobs ADD COLUMN IF NOT EXISTS submissions jsonb;
ALTER TABLE designer_jobs ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Colombo';
