// Production schedule triage — given an order's pipeline state + due date,
// classify whether it's on track to hit the 35-day cycle.
//
// Pairs with shared/po-milestones.ts (the cycle itself) and the admin
// pipelineStage values from shared/pipeline.ts. Pure logic so both server
// and client can compute the same banner colour.

import { computeMilestones, type PoMilestone } from "./po-milestones";

export type TriageState =
  | "overdue"          // due date passed and not yet shipped/delivered
  | "at_risk"          // pipeline trailing behind where the calendar says it should be
  | "on_track"         // pipeline matches or leads the calendar
  | "awaiting_kickoff" // early stage but with comfortable runway
  | "no_due_date";     // can't compute without a due date

export interface TriageInput {
  pipelineStage: string | null;
  status: string | null;          // legacy enum: pending/paid/processing/shipped/delivered/cancelled
  dueDate: string | null;         // yyyy-mm-dd
  productionStage?: string | null;
}

export interface TriageResult {
  state: TriageState;
  daysUntilDue: number | null;    // negative if past
  expectedMilestone: PoMilestone | null;
  reason: string;                 // one short human-readable line
}

const EARLY_STAGES = new Set(["Lead Received", "Brief Sent", "Mockup In Progress"]);
const POST_DEPOSIT_PRE_PO = new Set(["Mockup Sent", "Deposit Paid"]);

function daysBetween(fromISO: string, today: Date): number {
  const d = new Date(fromISO + "T00:00:00");
  if (Number.isNaN(d.getTime())) return NaN;
  const ms = d.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.floor(ms / 86_400_000);
}

function currentExpectedMilestone(daysUntilDue: number, ms: PoMilestone[]): PoMilestone | null {
  // A milestone is "in the past or today" when its daysFromDue is at most
  // -daysUntilDue (i.e. it sits as far or further before the due date than
  // today does). Pick the latest such — that's where the order should be now.
  let chosen: PoMilestone | null = null;
  for (const m of ms) {
    if (m.daysFromDue <= -daysUntilDue) {
      chosen = m;
    }
  }
  return chosen;
}

export function triageOrder(input: TriageInput, today: Date = new Date()): TriageResult {
  if (!input.dueDate) {
    return { state: "no_due_date", daysUntilDue: null, expectedMilestone: null, reason: "No due date set" };
  }
  const daysUntilDue = daysBetween(input.dueDate, today);
  if (Number.isNaN(daysUntilDue)) {
    return { state: "no_due_date", daysUntilDue: null, expectedMilestone: null, reason: "Due date unparseable" };
  }

  const ms = computeMilestones(input.dueDate) || [];
  const expected = currentExpectedMilestone(daysUntilDue, ms);

  const stage = input.pipelineStage || "";
  const status = (input.status || "").toLowerCase();
  const isShippedOrDelivered = status === "shipped" || status === "delivered" || stage === "Delivered";

  if (daysUntilDue < 0) {
    if (isShippedOrDelivered) {
      return {
        state: "on_track",
        daysUntilDue,
        expectedMilestone: expected,
        reason: `Past due but ${status || "delivered"} — in customer's hands`,
      };
    }
    return {
      state: "overdue",
      daysUntilDue,
      expectedMilestone: expected,
      reason: `Due ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? "" : "s"} ago, still at "${stage || "unknown"}"`,
    };
  }

  if (daysUntilDue <= 7 && stage !== "PO Raised" && !isShippedOrDelivered) {
    return {
      state: "at_risk",
      daysUntilDue,
      expectedMilestone: expected,
      reason: `${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"} to go, PO not raised yet`,
    };
  }

  if (daysUntilDue <= 14 && EARLY_STAGES.has(stage)) {
    return {
      state: "at_risk",
      daysUntilDue,
      expectedMilestone: expected,
      reason: `${daysUntilDue} days out, still at "${stage}" — sample window closing`,
    };
  }

  if (daysUntilDue <= 21 && stage === "Mockup In Progress") {
    return {
      state: "at_risk",
      daysUntilDue,
      expectedMilestone: expected,
      reason: `Mockup unfinished with ${daysUntilDue} days to due date`,
    };
  }

  if (EARLY_STAGES.has(stage) || POST_DEPOSIT_PRE_PO.has(stage)) {
    return {
      state: "awaiting_kickoff",
      daysUntilDue,
      expectedMilestone: expected,
      reason: `Early stage ("${stage}") with ${daysUntilDue}-day runway`,
    };
  }

  return {
    state: "on_track",
    daysUntilDue,
    expectedMilestone: expected,
    reason: expected ? `On "${stage}" at ${expected.label} (day ${expected.dayNumber})` : `On "${stage}"`,
  };
}
