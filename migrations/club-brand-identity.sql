-- Sideline Studio Phase 2 — Brand Identity.
-- club_brand_identity: 1:1 "header" per club holding logos/colours/designs once,
-- read by every order/PO + the AI mockup engine. club_logo_assets stays the
-- per-club logo rows under this header. Additive + idempotent.

CREATE TABLE IF NOT EXISTS club_brand_identity (
  id                varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  club_account_id   varchar NOT NULL UNIQUE REFERENCES club_accounts(id) ON DELETE CASCADE,
  colors            jsonb,
  fonts             jsonb,
  placement_defaults jsonb,
  artwork_files     jsonb,
  design_templates  jsonb,
  sponsors          jsonb,
  design_brief      text,
  reference_images  jsonb,
  render_spec       jsonb,
  enrichment_stage  text NOT NULL DEFAULT 'lead',
  source_channel    text,
  created_at        timestamp DEFAULT now(),
  updated_at        timestamp DEFAULT now()
);

-- Per-asset placement + production artwork on the existing logo rows.
ALTER TABLE club_logo_assets ADD COLUMN IF NOT EXISTS default_position    text;
ALTER TABLE club_logo_assets ADD COLUMN IF NOT EXISTS default_application text;
ALTER TABLE club_logo_assets ADD COLUMN IF NOT EXISTS default_size_mm     text;
ALTER TABLE club_logo_assets ADD COLUMN IF NOT EXISTS artwork_file_url    text;
ALTER TABLE club_logo_assets ADD COLUMN IF NOT EXISTS thread_colours      jsonb;
