// Single source of truth for the Production Sheet file/document name.
// Used in three places that all need to agree:
//   1. server/po-pdf.ts — Drive upload filename
//   2. server/po-pdf.ts — <title> of the HTML (Puppeteer picks this up when
//      rendering server-side; not user-visible but good hygiene)
//   3. client/src/pages/admin/purchase-order.tsx — document.title on the
//      print-preview page, which is what Chrome's "Save as PDF" dialog
//      pre-fills the filename with
//
// Format: `YYYY-MM-DD - <PO-REF> - <Account>.pdf`
//   - Date first → chronological sort in any folder
//   - PO ref second → unique handle (what the factory will reference)
//   - Account third → readable label
//
// Sortable, readable, matches the `Date.Company.Contact` Drive folder
// pattern Romero already uses.

export type PoNamingInput = {
  poReference?: string | null;
  orderNumber?: string | null;
  accountName?: string | null;
  customerName?: string | null;
  createdAt?: Date | string | null;
};

// Strip filesystem-hostile characters without being overzealous. Keeps
// hyphens, ampersands, dots, parens — the kinds of things clubs legitimately
// have in their names ("St Heliers AFC", "Onewhero Rugby & Sports").
function safe(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]/g, "")   // Windows-illegal + path separators
    .replace(/\s+/g, " ")             // collapse whitespace
    .trim();
}

function toDateOnly(v: Date | string | null | undefined): string {
  if (!v) return new Date().toISOString().slice(0, 10);
  const d = typeof v === "string" ? new Date(v) : v;
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// Returns the base name WITHOUT the ".pdf" extension. Useful for
// document.title where the browser auto-appends on "Save as PDF".
export function poBaseName(input: PoNamingInput): string {
  const date = toDateOnly(input.createdAt);
  const ref = safe(input.poReference || input.orderNumber || "NO-REF");
  const account = safe(input.accountName || input.customerName || "");
  const parts = [date, ref];
  if (account) parts.push(account);
  return parts.join(" - ");
}

export function poFilename(input: PoNamingInput): string {
  return `${poBaseName(input)}.pdf`;
}
