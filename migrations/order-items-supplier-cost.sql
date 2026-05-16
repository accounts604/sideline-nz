-- Per-line supplier cost stamp (2026-05-16)
--
-- When raise-PO fires, dispatchPoToSupplier looks up the latest matching row
-- in supplier_prices for each item's productType and stamps these columns.
-- unitAmount stays as the client sell price; this gives margin analytics +
-- the Shopify cost write-back a separate, supplier-authoritative source.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS supplier_unit_cost_cents  integer,
  ADD COLUMN IF NOT EXISTS supplier_cost_currency    text,
  ADD COLUMN IF NOT EXISTS supplier_cost_source_id   varchar,
  ADD COLUMN IF NOT EXISTS supplier_cost_applied_at  timestamp;
