-- Add Shopify sync fields to order_items (2026-05-06)
-- - shopify_variant_id            : gid://shopify/ProductVariant/...
-- - shopify_inventory_item_id     : gid://shopify/InventoryItem/... (used for cost write-back)
-- - shopify_synced_at             : last time we pushed cost back to Shopify
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS shopify_variant_id        text,
  ADD COLUMN IF NOT EXISTS shopify_inventory_item_id text,
  ADD COLUMN IF NOT EXISTS shopify_synced_at         timestamp;
