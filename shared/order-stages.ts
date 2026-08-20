// Unified order stage list for the admin Stage picker.
//
// shared/pipeline.ts mirrors GHL exactly. This file extends the pipeline
// with stages used internally only:
//   - In Production    — between PO Raised and Delivered; the 30-day
//                        production window. Add to GHL to push through.
//   - Shipped          — distinct from Delivered. Goods left supplier,
//                        in transit to customer. Add to GHL to push.
//   - Completed        — order delivered + invoiced + paid + closed out
//   - Cancelled        — order killed at any point (refunded or never paid)
//
// isPushableToGhl() returns true only for stages registered with GHL.
// Until the user adds In Production + Shipped to the GHL pipeline, those
// stages stay internal — admin can set them but no GHL push fires.

import { SIDELINE_PIPELINE_STAGES, type SidelinePipelineStage, isSidelinePipelineStage } from "./pipeline";

// Stages that exist on the Sideline ops side but not yet in GHL. Promoting
// one to a real pipeline stage = add it to SIDELINE_PIPELINE_STAGES (after
// the matching GHL stage exists) and remove from this list.
export const INTERNAL_PIPELINE_STAGES = [
  "In Production",
  "Shipped",
] as const;
export type InternalPipelineStage = typeof INTERNAL_PIPELINE_STAGES[number];

export const TERMINAL_STAGES = ["Completed", "Cancelled"] as const;
export type TerminalStage = typeof TERMINAL_STAGES[number];

// Order matters — this is the order shown in the admin Stage picker dropdown
// and on the cockpit progress bar. Internal production stages slot in between
// "PO Raised" and "Delivered" since that's where the 30-day production
// window lives.
export const ALL_ORDER_STAGES = [
  "Lead Received",
  "Brief Sent",
  "Mockup In Progress",
  "Mockup Sent",
  "Deposit Paid",
  "PO Raised",
  "In Production",
  "Shipped",
  "Delivered",
  "Invoice Sent",
  "Paid",
  "Completed",
  "Cancelled",
] as const;
export type OrderStage = typeof ALL_ORDER_STAGES[number];

// Sanity check the manually-ordered list above against the imported sources.
// If a developer adds a new stage to pipeline.ts without updating
// ALL_ORDER_STAGES the type would silently lose it. Throw at import time.
{
  const expected = new Set<string>([
    ...SIDELINE_PIPELINE_STAGES,
    ...INTERNAL_PIPELINE_STAGES,
    ...TERMINAL_STAGES,
  ]);
  for (const s of ALL_ORDER_STAGES) {
    if (!expected.has(s)) throw new Error(`ALL_ORDER_STAGES contains unknown stage "${s}"`);
  }
  expected.forEach((s) => {
    if (!(ALL_ORDER_STAGES as readonly string[]).includes(s)) {
      throw new Error(`Stage "${s}" missing from ALL_ORDER_STAGES — add it in the right position.`);
    }
  });
}

export function isOrderStage(value: unknown): value is OrderStage {
  return typeof value === "string" && (ALL_ORDER_STAGES as readonly string[]).includes(value);
}

export function isTerminalStage(value: unknown): value is TerminalStage {
  return typeof value === "string" && (TERMINAL_STAGES as readonly string[]).includes(value);
}

export function isInternalPipelineStage(value: unknown): value is InternalPipelineStage {
  return typeof value === "string" && (INTERNAL_PIPELINE_STAGES as readonly string[]).includes(value);
}

// True when the stage exists in GHL and should be pushed there on change.
export function isPushableToGhl(stage: OrderStage): stage is SidelinePipelineStage {
  return isSidelinePipelineStage(stage);
}

export type LegacyOrderStatus = "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled";

// Map a stage to the legacy `orders.status` enum so existing UI badges,
// notification triggers, and any code reading `status` keep working.
export function legacyStatusForStage(stage: OrderStage): LegacyOrderStatus {
  switch (stage) {
    case "Lead Received":
    case "Brief Sent":
    case "Mockup In Progress":
    case "Mockup Sent":
      return "pending";
    case "Deposit Paid":
      return "paid";
    case "PO Raised":
    case "In Production":
      return "processing";
    case "Shipped":
      return "shipped";
    case "Delivered":
    case "Invoice Sent":
    case "Paid":
    case "Completed":
      return "delivered";
    case "Cancelled":
      return "cancelled";
  }
}
