// PO guard-rail milestones — computed backwards from the customer's due date.
//
// Romero's rule (2026-04-16): due date = the day the customer needs kit in hand
// ("Door to Customer"). Every earlier milestone is a cumulative delta working
// backwards so the team has a hard internal deadline for each stage:
//
//   Door to Customer         (= due date)
//   Arrive at Sideline       (due − 3 days)   ← Sideline receives from producer
//   Ship from Production     (due − 13 days)  ← producer dispatches
//   Photos / Final Proof     (due − 25 days)  ← pro photos + final design proof
//   Design Proof             (due − 58 days)  ← first design proof sent
//
// The deltas are cumulative: Arrive−3, Ship−10 before Arrive, Photos−12 before
// Ship, Design Proof−33 before Photos. If Sideline's lead times change, bump
// the numbers here and the whole admin UI updates.

export interface PoMilestone {
  key: "design_proof" | "photos_final_proof" | "ship_production" | "arrive_sideline" | "door_to_customer";
  label: string;
  description: string;
  date: string; // ISO yyyy-mm-dd
  daysFromDue: number; // negative integer; 0 for due date itself
}

export const PO_MILESTONE_OFFSETS = {
  designProofDaysBeforeDue: 58,
  photosDaysBeforeDue: 25,
  shipProductionDaysBeforeDue: 13,
  arriveSidelineDaysBeforeDue: 3,
} as const;

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
export function computeMilestones(dueDate: string | Date | null | undefined): PoMilestone[] | null {
  if (!dueDate) return null;
  const base = typeof dueDate === "string" ? new Date(dueDate + "T00:00:00") : new Date(dueDate);
  if (Number.isNaN(base.getTime())) return null;

  const o = PO_MILESTONE_OFFSETS;

  return [
    {
      key: "design_proof",
      label: "Design Proof",
      description: "First design proof sent to client.",
      date: toISODate(addDays(base, -o.designProofDaysBeforeDue)),
      daysFromDue: -o.designProofDaysBeforeDue,
    },
    {
      key: "photos_final_proof",
      label: "Photos & Final Proof",
      description: "Professional photos taken; final design proof locked.",
      date: toISODate(addDays(base, -o.photosDaysBeforeDue)),
      daysFromDue: -o.photosDaysBeforeDue,
    },
    {
      key: "ship_production",
      label: "Ship from Production",
      description: "Producer dispatches to Sideline.",
      date: toISODate(addDays(base, -o.shipProductionDaysBeforeDue)),
      daysFromDue: -o.shipProductionDaysBeforeDue,
    },
    {
      key: "arrive_sideline",
      label: "Arrive at Sideline",
      description: "Stock received and QC'd at Sideline.",
      date: toISODate(addDays(base, -o.arriveSidelineDaysBeforeDue)),
      daysFromDue: -o.arriveSidelineDaysBeforeDue,
    },
    {
      key: "door_to_customer",
      label: "Door to Customer",
      description: "Customer's due date — kit in their hands.",
      date: toISODate(base),
      daysFromDue: 0,
    },
  ];
}
