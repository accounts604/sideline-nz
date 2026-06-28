-- Clubs to Teams grouping (Sideline Studio). A CLUB or SCHOOL owns the shared
-- primary logo and colours. club_accounts (teams) link to it via club_id and add
-- their own secondary. Additive and idempotent. See reference_sideline_clubs_vs_teams.

CREATE TABLE IF NOT EXISTS clubs (
  id                 varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL UNIQUE,
  kind               text NOT NULL DEFAULT 'club',   -- 'club' | 'school'
  primary_logo_url   text,
  primary_logo_label text,
  colors             jsonb,
  created_at         timestamp DEFAULT now(),
  updated_at         timestamp DEFAULT now()
);

ALTER TABLE club_accounts ADD COLUMN IF NOT EXISTS club_id varchar REFERENCES clubs(id);

-- Orders link to a club too, so standalone bulk orders (no club_account) can be
-- teams under a club/school. The order's account_name is the team.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS club_id varchar REFERENCES clubs(id);
