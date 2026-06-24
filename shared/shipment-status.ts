// DHL shipment lifecycle statuses.
//
// Puffin ships finished POs via DHL and gives us the waybill at dispatch —
// that waybill is the reliable anchor we link to one-or-more POs (see
// migrations/dhl-shipment-tracking.sql). DHL then sends status updates over
// WhatsApp only (no API); those are parsed best-effort and normalised to one
// of these statuses via normalizeDhlStatus(). GUI WhatsApp scraping is noisy,
// so an unknown status string never overwrites a known one — it just records
// the raw description.

export const SHIPMENT_STATUSES = [
  "created", // waybill captured at dispatch; no DHL movement yet
  "label_created", // DHL label generated
  "picked_up", // DHL collected from supplier
  "in_transit", // moving through the network
  "customs", // held / clearing customs
  "out_for_delivery", // on the final-mile vehicle
  "delivered", // delivered to the address
  "exception", // failed delivery / held / damaged / returned
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export function isShipmentStatus(value: unknown): value is ShipmentStatus {
  return typeof value === "string" && (SHIPMENT_STATUSES as readonly string[]).includes(value);
}

// Where a shipment row (or an event) originated.
export const SHIPMENT_SOURCE_CHANNELS = ["supplier", "whatsapp", "admin", "telegram_manual"] as const;
export type ShipmentSourceChannel = (typeof SHIPMENT_SOURCE_CHANNELS)[number];

// Per-PO content verification grade. Deliberately confidence-graded rather
// than pass/fail because the observed contents come from noisy WhatsApp text
// that is frequently absent. Only "mismatch" (red) escalates as an exception;
// "unverified" covers the common "no observed contents" case.
export const VERIFICATION_STATUSES = ["unverified", "verified", "mismatch"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

// Statuses at which a shipment has effectively reached the customer / been
// closed out — used by exception detection (delivered-but-PO-not-advanced).
export const TERMINAL_SHIPMENT_STATUSES: readonly ShipmentStatus[] = ["delivered"];

// Normalise a free-form DHL status/event string (from WhatsApp) to one of our
// canonical statuses. Returns null when nothing matches — callers keep the
// existing status and only store the raw description in that case.
export function normalizeDhlStatus(raw: string | null | undefined): ShipmentStatus | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  // Order matters: check the more specific phrases first.
  if (/\bdeliver(ed|y complete|ed to)\b/.test(s) || /\bdelivered\b/.test(s)) return "delivered";
  if (/out for delivery|with (the )?courier|on (the )?vehicle for delivery/.test(s)) return "out_for_delivery";
  if (/customs|clearance|held|on hold|import processing/.test(s)) return "customs";
  if (/exception|failed|undeliverable|returned|delay|damaged|refused/.test(s)) return "exception";
  if (/in transit|departed|arrived|processed at|transit|shipment on hold released|forwarded/.test(s)) return "in_transit";
  if (/picked up|collected|received by dhl|shipment picked/.test(s)) return "picked_up";
  if (/label (created|generated)|shipment information received|electronic.*received|created/.test(s)) return "label_created";
  return null;
}

// DHL public tracking URL for a waybill.
export function dhlTrackingUrl(waybill: string): string {
  return `https://www.dhl.com/nz-en/home/tracking/tracking-parcel.html?submit=1&tracking-id=${encodeURIComponent(waybill)}`;
}

// Normalise a waybill string for storage + matching: strip whitespace/dashes,
// uppercase. The same normalisation MUST be used everywhere a waybill is
// written or looked up so dedup + matching are stable.
export function normalizeWaybill(raw: string): string {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}
