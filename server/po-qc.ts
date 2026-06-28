// PO QC gate — Sideline Studio, Phase 0.
//
// Pure, side-effect-free validation that an order is production-ready BEFORE a
// PO is raised. Runs at the top of dispatchOrderToSuppliers (Pass A) so an
// incomplete PO never half-dispatches. Verifies the data that already lives on
// the line: fabric, branding method, a positive quantity, and a size breakdown
// that reconciles to the line quantity.
//
// NOT checked here (produced by dispatch itself → verified in a later Pass B):
// club-logo / Sideline-mark presence and supplier cost. See docs/sideline-studio.md.

import { db } from "./db";
import { orderItems, orderSizeBreakdowns } from "@shared/schema";
import { eq } from "drizzle-orm";

export type QcSeverity = "block" | "warn";
export type LineFailure = {
  itemId: string;
  productName: string;
  field: "fabric" | "branding" | "quantity" | "sizes" | "logo";
  reason: string;
  severity: QcSeverity;
};

function arr(e: any): any[] {
  if (Array.isArray(e)) return e;
  if (typeof e === "string") { try { const a = JSON.parse(e || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } }
  return [];
}

// Pure equipment / accessories — no fabric, branding, or sizing expected.
const NON_GARMENT = /(^|[-_ ])(balls?|cones?|backpacks?|bags?|towels?|bottles?)$/i;

function isNonGarment(productType?: string | null, productName?: string | null): boolean {
  return (
    NON_GARMENT.test((productType || "").toLowerCase()) ||
    NON_GARMENT.test((productName || "").toLowerCase())
  );
}

/**
 * Phase 0 PO QC gate. Returns ok:true when every garment line carries fabric,
 * branding, a positive quantity, and a reconciling size breakdown; otherwise a
 * list of per-line failures. Read-only.
 */
export async function assertProductionReady(
  orderId: string,
): Promise<{ ok: true } | { ok: false; failures: LineFailure[] }> {
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const failures: LineFailure[] = [];

  for (const it of items) {
    const name = it.productName || it.productType || it.id;
    const qty = Number(it.quantity ?? 0);

    // quantity — every line
    if (!Number.isFinite(qty) || qty <= 0) {
      failures.push({ itemId: it.id, productName: name, field: "quantity", reason: `quantity is ${it.quantity ?? "empty"}`, severity: "block" });
    }

    if (isNonGarment(it.productType, it.productName)) continue;

    // fabric
    if (!String(it.material || "").trim()) {
      failures.push({ itemId: it.id, productName: name, field: "fabric", reason: "no fabric/material set", severity: "block" });
    }
    // branding method
    if (!String(it.brandingMethod || "").trim()) {
      failures.push({ itemId: it.id, productName: name, field: "branding", reason: "no branding method set", severity: "block" });
    }
    // size breakdown exists + reconciles to quantity
    const rows = await db.select().from(orderSizeBreakdowns).where(eq(orderSizeBreakdowns.orderItemId, it.id));
    const sized = rows.reduce((a, r) => a + Number(r.quantity || 0), 0);
    if (rows.length === 0 || sized === 0) {
      failures.push({ itemId: it.id, productName: name, field: "sizes", reason: "no size breakdown submitted", severity: "block" });
    } else if (qty > 0 && sized !== qty) {
      failures.push({ itemId: it.id, productName: name, field: "sizes", reason: `sizes total ${sized} ≠ quantity ${qty}`, severity: "block" });
    }
  }

  return failures.length ? { ok: false, failures } : { ok: true };
}

/**
 * Phase 1 PO QC — Pass B. Run AFTER dispatch's logo auto-attach steps (2.6/2.7)
 * on the in-memory items: every garment line must carry both a club logo
 * (a non-Sideline element) and the Sideline maker's mark. Synchronous — operates
 * on the already-mutated items, no DB read. Equipment/bags exempt.
 */
export function checkLogosAttached(
  items: Array<{ id: string; productName?: string | null; productType?: string | null; elementUrls?: any }>,
): { ok: true } | { ok: false; failures: LineFailure[] } {
  const failures: LineFailure[] = [];
  for (const it of items) {
    if (isNonGarment(it.productType, it.productName)) continue;
    const name = it.productName || it.productType || it.id;
    const els = arr(it.elementUrls);
    const hasSideline = els.some((e: any) => String(e?.name || "").toLowerCase().includes("sideline"));
    const hasClubLogo = els.some((e: any) => e?.url && !String(e?.name || "").toLowerCase().includes("sideline"));
    if (!hasClubLogo) {
      failures.push({ itemId: it.id, productName: name, field: "logo", reason: "no club logo attached — add a club logo (or set the club's primary logo asset)", severity: "block" });
    }
    if (!hasSideline) {
      failures.push({ itemId: it.id, productName: name, field: "logo", reason: "Sideline maker's mark missing", severity: "block" });
    }
  }
  return failures.length ? { ok: false, failures } : { ok: true };
}

/** Human one-line summary of QC failures for a dispatch 400 error string. */
export function summarizeFailures(failures: LineFailure[]): string {
  const parts = failures.map((f) => `${f.productName} (${f.field}: ${f.reason})`);
  return `PO not production-ready — ${failures.length} issue${failures.length === 1 ? "" : "s"} to fix before dispatch: ${parts.join("; ")}`;
}
