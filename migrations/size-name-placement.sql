-- Add per-row name placement to order_size_breakdowns (2026-05-12). Lets the
-- admin specify WHERE on the garment the player's name goes (e.g. "Back
-- Upper", "Back Below Number", "Left Sleeve"). Renders in the PO PDF so the
-- supplier doesn't have to guess.

ALTER TABLE order_size_breakdowns
  ADD COLUMN IF NOT EXISTS name_placement TEXT;
