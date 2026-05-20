-- Customer-side invoice fields on orders. Pairs with supplier_invoice_*
-- (supplier billed us) and payment_receipt_* (we paid them). This one
-- captures what we billed the customer: either a Xero invoice reference
-- (direct POs) or an uploaded PDF (manual fallback). For supporter-
-- campaign POs the customer-side data lives in Shopify orders tagged
-- club:<slug>, fetched live — no column needed for that flow.
-- Apply with: psql "$DATABASE_URL" -f migrations/customer-invoice-fields.sql
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "customer_invoice_xero_ref" text,
  ADD COLUMN IF NOT EXISTS "customer_invoice_file_url" text,
  ADD COLUMN IF NOT EXISTS "customer_invoice_file_name" text,
  ADD COLUMN IF NOT EXISTS "customer_invoice_uploaded_at" timestamp;
