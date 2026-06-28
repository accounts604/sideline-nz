-- Teams layer: the MIDDLE level of Club/School to Team to Orders. A team belongs
-- to a club and owns a list of orders over time. Additive and idempotent.

CREATE TABLE IF NOT EXISTS teams (
  id                 varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id            varchar NOT NULL REFERENCES clubs(id),
  name               text NOT NULL,
  secondary_logo_url text,
  notes              text,
  created_at         timestamp DEFAULT now(),
  updated_at         timestamp DEFAULT now()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS team_id varchar REFERENCES teams(id);
