-- Per-line supplier override on order_items (2026-05-16)
--
-- Some orders span product categories handled by different suppliers (e.g.
-- Headwear → Suqian, Apparel → Puffin). With this column, raise-PO can split
-- one order into per-supplier PO emails — each supplier only sees the lines
-- they actually handle.
--
-- Resolution precedence in dispatch (highest first):
--   1. order_items.assigned_supplier_id  (explicit per-line)
--   2. orders.assigned_supplier_id       (order-level default)
--   3. users.supplier_categories match   (category-based fallback)
--
-- Null = follow the order-level default (backward compatible — existing rows
-- behave exactly as before).

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS assigned_supplier_id varchar
    REFERENCES users(id);

CREATE INDEX IF NOT EXISTS order_items_assigned_supplier_idx
  ON order_items (assigned_supplier_id)
 WHERE assigned_supplier_id IS NOT NULL;
