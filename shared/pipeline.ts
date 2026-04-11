// Sideline - Merch Orders pipeline stages.
// Mirror of the live GHL pipeline `bne386ArJCVV5iuUs86h`.
// GHL is the source of truth — this file exists so the UI, portal logic,
// and GHL push/pull handlers all agree on the stage shape in one place.
//
// If the GHL pipeline changes (stages reordered, renamed, added), update
// this list AND server/ghl-config.ts in the same commit.

export const SIDELINE_PIPELINE_STAGES = [
  "Lead Received",
  "Brief Sent",
  "Mockup In Progress",
  "Mockup Sent",
  "Deposit Paid",
  "PO Raised",
  "Delivered",
  "Invoice Sent",
  "Paid",
] as const;

export type SidelinePipelineStage = (typeof SIDELINE_PIPELINE_STAGES)[number];

export function isSidelinePipelineStage(value: unknown): value is SidelinePipelineStage {
  return typeof value === "string" && (SIDELINE_PIPELINE_STAGES as readonly string[]).includes(value);
}

export function stageIndex(stage: SidelinePipelineStage): number {
  return SIDELINE_PIPELINE_STAGES.indexOf(stage);
}

// Convenience: stages where the deal is still "open" (not delivered/billed/paid).
export const OPEN_STAGES: readonly SidelinePipelineStage[] = [
  "Lead Received",
  "Brief Sent",
  "Mockup In Progress",
  "Mockup Sent",
  "Deposit Paid",
  "PO Raised",
];
