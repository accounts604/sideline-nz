// Audit wrapper for Ezra. Mirrors server/ai/audit.ts but logs against
// system="ezra" so the integration_events audit view can be filtered to
// just copilot activity (model call durations, tool calls, errors).
//
// Unlike the generic fire-and-forget tracked(), Ezra's wrapper re-throws on
// failure so the caller's response path can return a useful 500 to the chat
// client (which displays the error in the conversation).

import { logIntegrationEvent } from "../integration-events";

export type EzraAuditMeta = {
  action: string;                // 'chat_turn' | 'tool:<name>' | 'gemini_call'
  conversationId?: string | null;
  userId?: string | null;
  toolName?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  extra?: Record<string, any>;
};

export async function withEzraAudit<T>(meta: EzraAuditMeta, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    void logIntegrationEvent({
      system: "ezra",
      action: meta.action,
      status: "success",
      userId: meta.userId ?? null,
      durationMs: Date.now() - start,
      meta: {
        conversationId: meta.conversationId,
        toolName: meta.toolName,
        model: meta.model,
        inputTokens: meta.inputTokens,
        outputTokens: meta.outputTokens,
        ...(meta.extra || {}),
      },
    });
    return result;
  } catch (err: any) {
    void logIntegrationEvent({
      system: "ezra",
      action: meta.action,
      status: "failed",
      userId: meta.userId ?? null,
      durationMs: Date.now() - start,
      error: err?.message ? String(err.message).slice(0, 1000) : String(err).slice(0, 1000),
      meta: {
        conversationId: meta.conversationId,
        toolName: meta.toolName,
        model: meta.model,
        ...(meta.extra || {}),
      },
    });
    throw err;
  }
}
