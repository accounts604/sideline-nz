// Integration event logger — the thin "what happened with the external
// world" audit trail. Writes to integration_events, never throws. Swallowing
// logging failures is intentional — a broken logger must not crash the
// caller path.
//
// Two entry points:
//
//   logIntegrationEvent(input)         — manual success/failure row
//   tracked(meta, fn)                  — wrap a fire-and-forget operation;
//                                        times it, logs outcome, returns
//                                        the value or null (preserves the
//                                        fire-and-forget contract)
//
// Typical usage at a call site that was previously silent:
//
//   void tracked(
//     { system: "ghl", action: "upsertContact", orderId },
//     () => upsertGhlContact(args),
//   );

import { db } from "./db";
import { integrationEvents } from "../shared/schema";

export type IntegrationSystem =
  | "ghl"
  | "drive"
  | "gmail"
  | "resend"
  | "apiease"
  | "stripe"
  | "shopify"
  | "xero"
  | "vercel-blob"
  | "gemini"
  | "elevenlabs"
  | "clickup";

export type LogEventInput = {
  system: IntegrationSystem | string;
  action: string;
  status: "success" | "failed";
  orderId?: string | null;
  userId?: string | null;
  durationMs?: number;
  error?: string;
  meta?: Record<string, any>;
};

export async function logIntegrationEvent(input: LogEventInput): Promise<void> {
  try {
    await db.insert(integrationEvents).values({
      system: input.system,
      action: input.action,
      status: input.status,
      orderId: input.orderId ?? null,
      userId: input.userId ?? null,
      durationMs: input.durationMs ?? null,
      error: input.error ?? null,
      meta: (input.meta as any) ?? null,
    });
  } catch (err) {
    // A failing audit log must never take down the caller. Last-resort stderr.
    console.error("[integration-events] insert failed:", err);
  }
}

export type TrackedMeta = {
  system: IntegrationSystem | string;
  action: string;
  orderId?: string | null;
  userId?: string | null;
  context?: Record<string, any>;
};

// Wrap an async function in tracking. Returns the result on success, or
// null on failure (does NOT rethrow — callers already treat these as
// fire-and-forget). Use `tracked()` for the integration calls where you
// don't want an external-API blip to abort the parent request, but you
// DO want to know later that it blipped.
export async function tracked<T>(meta: TrackedMeta, fn: () => Promise<T>): Promise<T | null> {
  const start = Date.now();
  try {
    const result = await fn();
    void logIntegrationEvent({
      system: meta.system,
      action: meta.action,
      status: "success",
      orderId: meta.orderId,
      userId: meta.userId,
      durationMs: Date.now() - start,
      meta: meta.context,
    });
    return result;
  } catch (err: any) {
    void logIntegrationEvent({
      system: meta.system,
      action: meta.action,
      status: "failed",
      orderId: meta.orderId,
      userId: meta.userId,
      durationMs: Date.now() - start,
      error: err?.message ? String(err.message).slice(0, 1000) : String(err).slice(0, 1000),
      meta: meta.context,
    });
    // Keep the stderr line too so Railway logs still have it.
    console.error(`[${meta.system}.${meta.action}] failed:`, err?.message || err);
    return null;
  }
}
