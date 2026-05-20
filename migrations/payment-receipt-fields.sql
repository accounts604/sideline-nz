-- Payment receipt fields on orders. Sits next to the supplier_invoice_*
-- columns: invoice = what the supplier billed us, receipt = proof we paid
-- them. Both files live in the same PO Drive folder under "08. Invoicing".
-- Apply with: psql "$DATABASE_URL" -f migrations/payment-receipt-fields.sql
-- OR `npm run db:push`.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "payment_receipt_file_url" text,
  ADD COLUMN IF NOT EXISTS "payment_receipt_file_name" text,
  ADD COLUMN IF NOT EXISTS "payment_receipt_uploaded_at" timestamp;
