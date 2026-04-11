// GHL pipeline + stage IDs for the Sideline - Merch Orders pipeline.
//
// Source: ~/.openclaw/credentials/ghl/config.json (authoritative).
// Kept in-repo (rather than read from openclaw at boot) to keep sideline-nz
// self-contained and deployable to Vercel without external file deps.
//
// If GHL stage IDs ever change (rare — they're stable UUIDs), update this
// file AND shared/pipeline.ts in the same commit.
//
// API credentials remain in env vars — do NOT put SIDELINE_GHL_API_KEY here.

import type { SidelinePipelineStage } from "../shared/pipeline";

export const SIDELINE_PIPELINE_ID = "bne386ArJCVV5iuUs86h";

// Map stage name → GHL stage UUID. Used when pushing stage moves to GHL.
export const SIDELINE_STAGE_IDS: Record<SidelinePipelineStage, string> = {
  "Lead Received": "0c31b3f0-5191-4fe8-912b-3cf469a01511",
  "Brief Sent": "617d8ade-ec2d-4d09-bc2a-e72d7f42ccd8",
  "Mockup In Progress": "268aaef0-4f4a-4a5e-9695-6df7a0d8c9b6",
  "Mockup Sent": "6f1e4d41-62cc-47ce-b660-eb1dc0ad7bbf",
  "Deposit Paid": "2579aa95-6425-4ddb-957e-0b9ea6b44808",
  "PO Raised": "98976057-9934-4bee-a969-0ca510ef3623",
  "Delivered": "bc10e2bc-7f5e-41dd-8cbb-136c5612b507",
  "Invoice Sent": "ed998862-8998-4715-9a34-409e34c9d07e",
  "Paid": "8a6c6b9a-44a0-48a3-b2e7-5a212e9504a4",
};

// Reverse lookup: GHL stage UUID → stage name. Used when consuming GHL webhooks.
export const SIDELINE_STAGE_NAMES: Record<string, SidelinePipelineStage> = Object.fromEntries(
  Object.entries(SIDELINE_STAGE_IDS).map(([name, id]) => [id, name as SidelinePipelineStage]),
);
