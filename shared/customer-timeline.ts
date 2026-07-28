// What a customer is allowed to see on their tracking timeline.
//
// order_activity is an INTERNAL audit log. It contains supplier identity, PO
// numbers, cost fields, draft chaser emails and admin file uploads. None of that
// can reach a customer, so this is an explicit allowlist keyed by action, not a
// denylist. An action not named here is invisible to the customer, which means a
// new internal event type added later is private by default rather than leaking.
//
// The label is what the customer reads. It is deliberately written from their
// side of the screen: "You approved the design", not "client_approved".

export interface CustomerVisibleEvent {
  at: string;
  label: string;
  detail?: string;
}

/** action -> customer-facing label. Anything absent is never shown. */
export const CUSTOMER_VISIBLE_ACTIONS: Record<string, string> = {
  design_proof_dispatched_to_customer: "Design proof sent to you",
  client_approved: "You approved the design",
  client_requested_changes: "You asked for changes",
  approval_link_issued: "Mockups sent for your approval",
  shipment_event: "Shipping update",
};

/**
 * Stage names are internal pipeline labels. Only these few are safe and
 * meaningful to a customer; the rest (PO Raised, supplier stages) are not shown
 * because they reveal the supply chain.
 */
export const CUSTOMER_VISIBLE_STAGES: Record<string, string> = {
  "Mockup Sent": "Your mockups were sent",
  "Deposit Paid": "Deposit received, production booked",
  "In Production": "Production started",
  Shipped: "Shipped",
  Delivered: "Delivered",
  Completed: "Order complete",
};

/**
 * Filter a raw activity log down to what the customer may see.
 * `details` is deliberately NOT passed through: it carries supplier names,
 * cost fields and internal ids. Only a hand-built detail string is emitted.
 */
export function toCustomerEvents(
  rows: Array<{ action: string; details?: unknown; createdAt: string | Date | null }>,
): CustomerVisibleEvent[] {
  const out: CustomerVisibleEvent[] = [];
  for (const r of rows) {
    if (!r.createdAt) continue;
    const at = new Date(r.createdAt).toISOString();

    if (r.action === "stage_changed") {
      const to = (r.details as { to?: string } | null)?.to;
      const label = to ? CUSTOMER_VISIBLE_STAGES[to] : undefined;
      if (label) out.push({ at, label });
      continue;
    }

    const label = CUSTOMER_VISIBLE_ACTIONS[r.action];
    if (!label) continue;

    // The one safe detail: the customer's own words back to them.
    let detail: string | undefined;
    if (r.action === "client_requested_changes") {
      const notes = (r.details as { changesNotes?: string } | null)?.changesNotes;
      if (notes) detail = notes.length > 160 ? notes.slice(0, 157) + "..." : notes;
    }
    out.push({ at, label, ...(detail ? { detail } : {}) });
  }
  // Oldest first — a timeline reads forwards.
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
