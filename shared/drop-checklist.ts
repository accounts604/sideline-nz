// The drop QC checklist — ONE definition, used by the admin Design Studio review
// card and by the public /job/<token> page. It was previously only in the admin
// component, which meant a rejected designer was told "items 2 and 5 failed" with
// no way to know what 2 and 5 were. Shared so rejection feedback is readable by
// the person who has to act on it.
//
// Order is the contract: qc_failed_items stores 1-based indexes into this list.
// Append new items at the end; never reorder or remove.
export const DROP_CHECKLIST = [
  "Sideline inner-collar lining + size tag correct",
  'Sideline "S" logo on left chest (composite)',
  "Club crest / wordmark placed correctly",
  "Design matches the brief (colours, pattern, garment, text)",
  "Consistent across all garments",
  "Cultural pattern check — accurate and respectful",
] as const;

export const checklistLabel = (n: number) => DROP_CHECKLIST[n - 1] || `Item ${n}`;
