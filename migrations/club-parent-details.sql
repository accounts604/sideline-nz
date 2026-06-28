-- Parent (Club/School) org details: website, delivery address, main contact, and
-- a GHL business link (the parent IS the GHL business). Additive and idempotent.

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS delivery_address text;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS ghl_business_id text;
