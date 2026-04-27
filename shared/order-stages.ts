// Unified order stage list for the admin Stage picker.
//
// shared/pipeline.ts mirrors GHL exactly — we don't add Completed/Cancelled
// there because GHL doesn't have those stages. Instead this file extends the
// pipeline with two terminal stages used internally:
//   - Completed — order delivered + invoiced + paid + closed out
//   - Cancelled — order killed at any point (refunded or never paid)
//
// The admin Stage picker shows ALL_ORDER_STAGES. PATCH handler derives the
// legacy `orders.status` enum from the chosen stage and only pushes to GHL
// when the stage is one of the real pipeline stages.

import { SIDELINE_PIPELINE_STAGES, type SidelinePipelineStage, isSidelinePipelineStage } from "./pipeline";

export const TERMINAL_STAGES = ["Completed", "Cancelled"] as const;
export type TerminalStage = typeof TERMINAL_STAGES[number];

export const ALL_ORDER_STAGES = [
  ...SIDELINE_PIPELINE_STAGES,
  ...TERMINAL_STAGES,
] as const;
export type OrderStage = typeof ALL_ORDER_STAGES[number];

export function isOrderStage(value: unknown): value is OrderStage {
  return typeof value === "string" && (ALL_ORDER_STAGES as readonly string[]).includes(value);
}

export function isTerminalStage(value: unknown): value is TerminalStage {
  return typeof value === "string" && (TERMINAL_STAGES as readonly string[]).includes(value);
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
      return "processing";
    case "Delivered":
    case "Invoice Sent":
    case "Paid":
    case "Completed":
      return "delivered";
    case "Cancelled":
      return "cancelled";
  }
}
