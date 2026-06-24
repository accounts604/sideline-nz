-- DHL shipment tracking → PO matching (designed 2026-06-24)
--
-- Puffin manufactures POs and ships them via DHL. DHL sends status updates over
-- WhatsApp ONLY (no API), so the reliable signal is the waybill Puffin gives us
-- AT DISPATCH. We link that waybill to the PO(s) it carries; DHL's WhatsApp
-- messages are parsed best-effort and only enrich the timeline.
--
-- Consolidation is many-to-many: ONE waybill can carry SEVERAL POs, and ONE PO
-- can span SEVERAL parcels. The legacy orders.tracking_number single column
-- cannot model that, so these tables become the source of truth and
-- orders.tracking_number is kept as a denormalised mirror (set on link).
--
--   shipments        — one row per DHL waybill (the anchor). is_orphan = true
--                      when a DHL event arrived for a waybill we never linked.
--   shipment_orders  — many-to-many waybill ↔ PO, with an expected_items
--                      snapshot of the PO's order_items taken at link time.
--   shipment_parcels — optional per-physical-parcel rows for content verify.
--   shipment_events  — append-only event log; dedup_key (UNIQUE) is the
--                      idempotency guard against repeated WhatsApp scrapes.
--
-- All additive; existing orders are unaffected. NOTE: adding "dhl"/"whatsapp"
-- to integration_events is a CODE-ONLY change (server/integration-events.ts
-- IntegrationSystem union) — integration_events.system is a plain text column
-- with no CHECK constraint, so there is no DDL for it here.

CREATE TABLE IF NOT EXISTS shipments (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  waybill text NOT NULL UNIQUE,
  carrier text NOT NULL DEFAULT 'dhl',
  status text NOT NULL DEFAULT 'created',
  last_event_code text,
  last_event_description text,
  last_event_at timestamp,
  estimated_delivery_date timestamp,
  delivered_at timestamp,
  source_channel text NOT NULL DEFAULT 'supplier',
  is_orphan boolean NOT NULL DEFAULT false,
  tracking_url text,
  raw_meta jsonb,
  created_by varchar REFERENCES users(id),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shipment_orders (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id varchar NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  order_id varchar NOT NULL REFERENCES orders(id),
  expected_parcel_count integer,
  expected_items jsonb,
  verification_status text NOT NULL DEFAULT 'unverified',
  verification_report jsonb,
  verified_at timestamp,
  linked_by varchar REFERENCES users(id),
  link_source text NOT NULL DEFAULT 'supplier',
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shipment_parcels (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id varchar NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  shipment_order_id varchar REFERENCES shipment_orders(id) ON DELETE SET NULL,
  piece_id text,
  description text,
  declared_items jsonb,
  weight_grams integer,
  status text,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shipment_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id varchar REFERENCES shipments(id) ON DELETE CASCADE,
  raw_waybill text NOT NULL,
  status text,
  event_code text,
  event_description text,
  occurred_at timestamp,
  location text,
  source text NOT NULL DEFAULT 'whatsapp',
  confidence integer,
  dedup_key text NOT NULL UNIQUE,
  raw_text text,
  created_at timestamp DEFAULT now()
);

-- CHECK constraints (drop-then-add so re-running after a value-set change is safe).
ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_status_check;
ALTER TABLE shipments
  ADD CONSTRAINT shipments_status_check
  CHECK (status IN ('created','label_created','picked_up','in_transit','customs','out_for_delivery','delivered','exception'));

ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_source_channel_check;
ALTER TABLE shipments
  ADD CONSTRAINT shipments_source_channel_check
  CHECK (source_channel IN ('supplier','whatsapp','admin','telegram_manual'));

ALTER TABLE shipment_orders DROP CONSTRAINT IF EXISTS shipment_orders_verification_check;
ALTER TABLE shipment_orders
  ADD CONSTRAINT shipment_orders_verification_check
  CHECK (verification_status IN ('unverified','verified','mismatch'));

-- One PO can only be linked to a given waybill once (idempotent re-linking).
ALTER TABLE shipment_orders DROP CONSTRAINT IF EXISTS shipment_orders_shipment_order_uniq;
ALTER TABLE shipment_orders
  ADD CONSTRAINT shipment_orders_shipment_order_uniq UNIQUE (shipment_id, order_id);

-- Indexes. waybill is the hot lookup on every ingestion; order_id powers the
-- PO→shipments join on the dashboard; the partial orphan index keeps the
-- "awaiting linking" query cheap.
CREATE UNIQUE INDEX IF NOT EXISTS shipments_waybill_idx ON shipments(waybill);
CREATE INDEX IF NOT EXISTS shipments_status_idx ON shipments(status);
CREATE INDEX IF NOT EXISTS shipments_is_orphan_idx ON shipments(is_orphan) WHERE is_orphan = true;
CREATE INDEX IF NOT EXISTS shipment_orders_order_id_idx ON shipment_orders(order_id);
CREATE INDEX IF NOT EXISTS shipment_orders_shipment_id_idx ON shipment_orders(shipment_id);
CREATE INDEX IF NOT EXISTS shipment_parcels_shipment_id_idx ON shipment_parcels(shipment_id);
CREATE UNIQUE INDEX IF NOT EXISTS shipment_events_dedup_idx ON shipment_events(dedup_key);
