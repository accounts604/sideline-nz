// Audit wrapper for the AI worker. Every runTask call is logged to
// integration_events via tracked(), with the model/provider/usage in meta.
//
// Unlike the generic tracked() in server/integration-events.ts (which
// swallows errors and returns null), the AI worker re-throws on failure
// because endpoint callers want a 5xx — not a silent null result.

import { logIntegrationEvent } from "../integration-events";

export type AiAuditMeta = {
  taskName: string;
  orderId?: string | null;
  userId?: string | null;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  extra?: Record<string, any>;
};

export async function withAiAudit<T>(meta: AiAuditMeta, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    void logIntegrationEvent({
      system: "ai",
      action: meta.taskName,
      status: "success",
      orderId: meta.orderId ?? null,
      userId: meta.userId ?? null,
      durationMs: Date.now() - start,
      meta: {
        provider: meta.provider,
        model: meta.model,
        inputTokens: meta.inputTokens,
        outputTokens: meta.outputTokens,
        ...(meta.extra || {}),
      },
    });
    return result;
  } catch (err: any) {
    void logIntegrationEvent({
      system: "ai",
      action: meta.taskName,
      status: "failed",
      orderId: meta.orderId ?? null,
      userId: meta.userId ?? null,
      durationMs: Date.now() - start,
      error: err?.message ? String(err.message).slice(0, 1000) : String(err).slice(0, 1000),
      meta: {
        provider: meta.provider,
        model: meta.model,
        ...(meta.extra || {}),
      },
    });
    throw err;
  }
}
