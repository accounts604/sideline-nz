// PO guard-rail milestones — computed backwards from the customer's due date.
//
// Romero's rule (2026-04-16): a PO runs on a 35-day forward schedule where
// Day 1 = Design Proof sent and Day 35 = customer receives goods. The admin
// UI stores the customer's due date; this file converts that into the full
// 7-stage timeline. Days below are forward-from-start; offsets are computed
// automatically so "day X of a 35-day build" == "due date − (35−X) days".
//
//   Day 1  — Design Proof sent
//   Day 2  — Sample Production starts
//   Day 7  — Samples approved, start bulk production
//   Day 19 — Photos & Final Proof
//   Day 21 — Shipped from Production
//   Day 30 — Goods received at Sideline
//   Day 35 — Customer receives goods (due date)
//
// If Sideline's build cycle changes, update PO_MILESTONE_DAYS below and the
// whole admin UI updates.

export interface PoMilestone {
  key:
    | "design_proof"
    | "sample_production"
    | "samples_approved"
    | "photos_final_proof"
    | "ship_production"
    | "arrive_sideline"
    | "door_to_customer";
  label: string;
  description: string;
  date: string; // ISO yyyy-mm-dd
  dayNumber: number; // forward day count starting at 1
  daysFromDue: number; // negative integer; 0 for due date itself
}

// Forward-from-start day numbers. Total PO cycle = the largest value here.
export const PO_MILESTONE_DAYS = {
  designProof: 1,
  sampleProduction: 2,
  samplesApproved: 7,
  photosFinalProof: 19,
  shipProduction: 21,
  arriveSideline: 30,
  doorToCustomer: 35,
} as const;

const TOTAL_DAYS = PO_MILESTONE_DAYS.doorToCustomer;

function toISODate(d: Date): string {
  // yyyy-mm-dd in local time — Sideline is NZ-only, timezone drift doesn't matter
  // beyond showing a date string on a UI.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * Given a customer due date (ISO string yyyy-mm-dd OR Date), compute every
 * upstream milestone. Earliest first (design proof → delivery).
 */
/**
 * Given a customer due date (ISO string yyyy-mm-dd OR Date), compute every
 * upstream milestone. Earliest first (design proof → delivery).
 */
export function computeMilestones(dueDate: string | Date | null | undefined): PoMilestone[] | null {
  if (!dueDate) return null;
  const base = typeof dueDate === "string" ? new Date(dueDate + "T00:00:00") : new Date(dueDate);
  if (Number.isNaN(base.getTime())) return null;

  const d = PO_MILESTONE_DAYS;
  const dateForDay = (day: number) => toISODate(addDays(base, day - TOTAL_DAYS));

  const make = (
    key: PoMilestone["key"],
    day: number,
    label: string,
    description: string,
  ): PoMilestone => ({
    key,
    label,
    description,
    date: dateForDay(day),
    dayNumber: day,
    daysFromDue: day - TOTAL_DAYS,
  });

  return [
    make("design_proof",       d.designProof,       "Design Proof",         "First design proof sent to client."),
    make("sample_production",  d.sampleProduction,  "Sample Production",    "Sample production kicks off."),
    make("samples_approved",   d.samplesApproved,   "Samples Approved",     "Samples signed off — bulk production starts."),
    make("photos_final_proof", d.photosFinalProof,  "Photos & Final Proof", "Professional photos taken; final design proof locked."),
    make("ship_production",    d.shipProduction,    "Shipped from Production", "Producer dispatches goods."),
    make("arrive_sideline",    d.arriveSideline,    "Arrive at Sideline",   "Stock received and QC'd at Sideline."),
    make("door_to_customer",   d.doorToCustomer,    "Door to Customer",     "Customer's due date — kit in their hands."),
  ];
}
