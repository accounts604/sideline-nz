-- Adds Shopify supporter-campaign fields to club_accounts.
-- Apply with: psql "$DATABASE_URL" -f migrations/club-supporter-fields.sql
-- OR run `npm run db:push` to let drizzle-kit reconcile the schema.
ALTER TABLE "club_accounts"
  ADD COLUMN IF NOT EXISTS "shopify_order_tag" text,
  ADD COLUMN IF NOT EXISTS "profit_share_tier_bps" integer NOT NULL DEFAULT 800;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'club_accounts_shopify_order_tag_unique'
  ) THEN
    ALTER TABLE "club_accounts"
      ADD CONSTRAINT "club_accounts_shopify_order_tag_unique" UNIQUE ("shopify_order_tag");
  END IF;
END $$;
