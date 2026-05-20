-- Supplier invoice tracking on orders. Captures payment status + the
-- supplier's invoice PDF/image link so the PO becomes a single source of
-- truth for "what we owe, what we paid, where the receipt lives."
-- Apply with: psql "$DATABASE_URL" -f migrations/supplier-invoice-fields.sql
-- OR run `npm run db:push`.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "supplier_invoice_paid_at" timestamp,
  ADD COLUMN IF NOT EXISTS "supplier_invoice_paid_by" varchar REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "supplier_invoice_payment_ref" text,
  ADD COLUMN IF NOT EXISTS "supplier_invoice_total_cents" integer,
  ADD COLUMN IF NOT EXISTS "supplier_invoice_currency" text,
  ADD COLUMN IF NOT EXISTS "supplier_invoice_file_url" text,
  ADD COLUMN IF NOT EXISTS "supplier_invoice_file_name" text,
  ADD COLUMN IF NOT EXISTS "supplier_invoice_uploaded_at" timestamp;
