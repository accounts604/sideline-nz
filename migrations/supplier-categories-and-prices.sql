-- Supplier categories + per-supplier pricelist (2026-05-16)
--
-- 1. users.supplier_categories — text[] used as fallback for raise-po when no
--    explicit supplier is assigned. Category strings must match the `category`
--    field in shared/product-catalog.ts (e.g. "Headwear", "Rugby").
--
-- 2. supplier_prices — admin-maintained unit costs per supplier, populated from
--    the invoices the supplier sends. Multiple rows per (supplier, productType)
--    are allowed: per-size variants and price changes over time both work.
--    The application picks the row with the latest effective_from that matches
--    the line being priced.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS supplier_categories text[];

CREATE TABLE IF NOT EXISTS supplier_prices (
  id                 varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id        varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_type       text    NOT NULL,
  size_or_variant    text,
  unit_cost_cents    integer NOT NULL,
  currency           text    NOT NULL DEFAULT 'USD',
  source_invoice_ref text,
  effective_from     timestamp NOT NULL DEFAULT now(),
  notes              text,
  created_at         timestamp NOT NULL DEFAULT now(),
  updated_at         timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_prices_supplier_id_idx
  ON supplier_prices (supplier_id);

CREATE INDEX IF NOT EXISTS supplier_prices_supplier_product_idx
  ON supplier_prices (supplier_id, product_type, effective_from DESC);
