// PO number generator for the Sideline order management portal.
//
// Format: SL-YYYY-[CLIENT]-[SEQ]
//   SL      — fixed prefix (Sideline)
//   YYYY    — 4-digit year
//   CLIENT  — 3–5 char uppercase alphanumeric slug derived from the client name
//   SEQ     — 3-digit zero-padded sequence number, unique per (year, CLIENT)
//
// Examples:
//   "Manurewa Touch Association" → SL-2026-MTA-001
//   "Onewhero Rugby Juniors"     → SL-2026-ORJ-001
//   "Summit Homes"                → SL-2026-SH-001
//   "Auckland"                    → SL-2026-AUCK-001
//   null/""                       → SL-2026-CUST-001
//
// Collision handling: if two create-po requests race to the same sequence,
// one of them hits the unique constraint on orders.orderNumber — call
// nextAvailablePoNumber() in a retry loop (up to 3 attempts is plenty).

import { db } from "./db";
import { orders } from "@shared/schema";
import { like, sql } from "drizzle-orm";

/**
 * Turn a free-form client name into a short uppercase alphanumeric slug.
 * Rules:
 *   - 2+ words → initialism of the first 5 words (e.g. "Manurewa Touch Association" → "MTA",
 *                "Summit Homes" → "SH", "Onewhero Rugby Juniors" → "ORJ")
 *   - 1 word   → first 4 letters, uppercased (e.g. "Auckland" → "AUCK")
 *   - empty    → "CUST" fallback
 */
export function slugFromClient(name: string | null | undefined): string {
  if (!name) return "CUST";

  // Normalise: apostrophes are stripped (so "Mary's" stays one word), other
  // punctuation becomes a space, then collapse whitespace and uppercase.
  const cleaned = name
    .replace(/['\u2019]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

  if (!cleaned) return "CUST";

  const words = cleaned.split(" ").filter((w) => w.length > 0);
  if (words.length === 0) return "CUST";

  if (words.length >= 2) {
    // Initialism of the first 5 words — 2–5 chars, uppercase alphanumeric
    return words.slice(0, 5).map((w) => w[0]).join("");
  }

  // Single word: first 4 letters. If shorter than 3, pad with the last char.
  const single = words[0].slice(0, 4);
  return single.length >= 3 ? single : single.padEnd(3, single[single.length - 1] || "X");
}

/**
 * Find the next available PO sequence number for a given (year, slug).
 *
 * Queries all existing orders whose orderNumber matches the SL-YYYY-SLUG-% prefix,
 * parses the trailing sequence, and returns max+1. If no existing orders match,
 * returns 1. Always 3-digit zero-padded downstream.
 */
async function nextSeqFor(year: number, slug: string): Promise<number> {
  const prefix = `SL-${year}-${slug}-`;
  const rows = await db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(like(orders.orderNumber, `${prefix}%`));

  if (rows.length === 0) return 1;

  let maxSeq = 0;
  for (const row of rows) {
    const tail = row.orderNumber.slice(prefix.length);
    const seq = parseInt(tail, 10);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }
  return maxSeq + 1;
}

/**
 * Compute the next available PO number for a client.
 * Does NOT insert anything — caller is responsible for handling unique-violation
 * retries if they happen (see `nextAvailablePoNumber` for a retry loop wrapper).
 */
export async function buildPoNumber(
  clientName: string | null | undefined,
  now: Date = new Date(),
): Promise<string> {
  const year = now.getFullYear();
  const slug = slugFromClient(clientName);
  const seq = await nextSeqFor(year, slug);
  return `SL-${year}-${slug}-${String(seq).padStart(3, "0")}`;
}

/**
 * Retry wrapper: computes a PO number, and if the insert function fails with a
 * unique-constraint violation, recomputes (incrementing seq) and retries.
 * Pass the `insertFn` a fresh PO number each call; it should return the created
 * row or throw on unique-violation.
 */
export async function withPoNumberRetry<T>(
  clientName: string | null | undefined,
  insertFn: (poNumber: string) => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const poNumber = await buildPoNumber(clientName);
    try {
      return await insertFn(poNumber);
    } catch (err: any) {
      lastErr = err;
      // Postgres unique violation = 23505; Drizzle wraps but usually preserves .code
      const isUniqueViolation =
        err?.code === "23505" ||
        String(err?.message || "").includes("orders_order_number_unique") ||
        String(err?.message || "").includes("duplicate key value");
      if (!isUniqueViolation) throw err;
      // loop to retry with a fresh number
    }
  }
  throw lastErr ?? new Error("Failed to allocate a unique PO number after retries");
}

// ====================================================================
// PO REFERENCE (numeric code auto-assigned on PO creation).
//
// Format: PO-YYYY-NNNN
//   PO      — fixed prefix
//   YYYY    — 4-digit year
//   NNNN    — 4-digit zero-padded sequence, unique per year across ALL POs
//
// Examples:
//   PO-2026-0001, PO-2026-0042, ...
//
// Separate from orderNumber (SL-YYYY-CLIENT-SEQ) so the PO reference reads
// as a pure numeric receipt ID — no client slug embedded.
// ====================================================================

async function nextPoReferenceSeq(year: number): Promise<number> {
  const prefix = `PO-${year}-`;
  const rows = await db
    .select({ poReference: orders.poReference })
    .from(orders)
    .where(like(orders.poReference, `${prefix}%`));

  if (rows.length === 0) return 1;

  let maxSeq = 0;
  for (const row of rows) {
    if (!row.poReference) continue;
    const tail = row.poReference.slice(prefix.length);
    const seq = parseInt(tail, 10);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }
  return maxSeq + 1;
}

export async function buildPoReference(now: Date = new Date()): Promise<string> {
  const year = now.getFullYear();
  const seq = await nextPoReferenceSeq(year);
  return `PO-${year}-${String(seq).padStart(4, "0")}`;
}

// Keep sql import used so tree-shakers don't complain if we add raw queries later.
void sql;
