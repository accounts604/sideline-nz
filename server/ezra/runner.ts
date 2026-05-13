// Ezra conversation runner — Gemini function-calling loop.
//
// Phase A is non-streaming: one POST in, one full response out. The chat UI
// can show "thinking…" until the response lands. Streaming (SSE) is a
// Phase A.5 upgrade if perceived latency becomes a problem.
//
// Loop shape:
//   1. Load prior messages from DB
//   2. Build Gemini contents array (user/model turns + functionCall/Response)
//   3. Call Gemini with tools registered
//   4. If response has functionCall parts → execute each, append as
//      functionResponse, loop
//   5. If response has only text → save assistant message + return
//   6. Hard cap at MAX_TURNS iterations to avoid runaway loops
//
// Every step writes a row to ezra_messages so the conversation IS the audit
// trail. Tool calls and results are first-class messages, not just side data.

import { db } from "../db";
import { ezraConversations, ezraMessages, type EzraMessage } from "@shared/schema";
import { eq, asc } from "drizzle-orm";
import { buildSystemPrompt } from "./prompt";
import { findTool, geminiToolSchema, EZRA_TOOLS } from "./tools";
import { withEzraAudit } from "./audit";

const GEMINI_MODEL = process.env.AI_GEMINI_MODEL || "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_TURNS = 6;          // hard cap on tool-call iterations per chat turn
const MAX_HISTORY = 40;       // most recent N messages sent back to the model

export type ChatTurnInput = {
  conversationId: string;
  userId: string;
  message: string;
};

export type ChatTurnOutput = {
  conversationId: string;
  assistantText: string;
  toolCalls: Array<{ name: string; args: any; result: any; durationMs: number }>;
  iterations: number;
  usage: { inputTokens?: number; outputTokens?: number };
};

export async function runChatTurn(input: ChatTurnInput): Promise<ChatTurnOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  // 1) Persist the user message immediately so it shows up if anything below fails
  await db.insert(ezraMessages).values({
    conversationId: input.conversationId,
    role: "user",
    content: input.message,
  });

  // 2) Load conversation + history
  const [conv] = await db.select().from(ezraConversations).where(eq(ezraConversations.id, input.conversationId)).limit(1);
  if (!conv) throw new Error(`Conversation ${input.conversationId} not found`);

  const allMessages = await db
    .select()
    .from(ezraMessages)
    .where(eq(ezraMessages.conversationId, input.conversationId))
    .orderBy(asc(ezraMessages.createdAt));
  const history = allMessages.slice(-MAX_HISTORY);

  const systemPrompt = await buildSystemPrompt({ scopeKind: conv.scopeKind, scopeId: conv.scopeId });

  // 3) Run the tool-use loop
  return withEzraAudit(
    { action: "chat_turn", conversationId: input.conversationId, userId: input.userId, model: GEMINI_MODEL },
    async () => {
      const toolCalls: ChatTurnOutput["toolCalls"] = [];
      let assistantText = "";
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let iterations = 0;
      let workingHistory: EzraMessage[] = history;

      while (iterations < MAX_TURNS) {
        iterations++;

        const contents = historyToGeminiContents(workingHistory);
        const body = {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          tools: geminiToolSchema(),
          generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
        };

        const resp = await fetch(`${API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          await persistError(input.conversationId, `Gemini API error (${resp.status}): ${errText.slice(0, 300)}`);
          throw new Error(`Gemini API error (${resp.status}): ${errText.slice(0, 300)}`);
        }

        const data: any = await resp.json();
        totalInputTokens += data?.usageMetadata?.promptTokenCount || 0;
        totalOutputTokens += data?.usageMetadata?.candidatesTokenCount || 0;

        const parts = data?.candidates?.[0]?.content?.parts || [];
        const finishReason = data?.candidates?.[0]?.finishReason as string | undefined;

        // Separate text from functionCall parts
        const textParts: string[] = [];
        const functionCalls: Array<{ name: string; args: any }> = [];
        for (const p of parts) {
          if (typeof p.text === "string") textParts.push(p.text);
          if (p.functionCall) functionCalls.push({ name: p.functionCall.name, args: p.functionCall.args || {} });
        }

        // No function calls → terminal text response
        if (functionCalls.length === 0) {
          assistantText = textParts.join("").trim();
          await db.insert(ezraMessages).values({
            conversationId: input.conversationId,
            role: "assistant",
            content: assistantText,
            finishReason: finishReason || "stop",
            inputTokens: data?.usageMetadata?.promptTokenCount || null,
            outputTokens: data?.usageMetadata?.candidatesTokenCount || null,
          });
          break;
        }

        // Function calls → execute each, persist as tool_call + tool_result messages, append to working history
        const newMessages: EzraMessage[] = [];
        for (const call of functionCalls) {
          const tool = findTool(call.name);
          const callRow = await db.insert(ezraMessages).values({
            conversationId: input.conversationId,
            role: "tool_call",
            toolName: call.name,
            toolArgs: call.args,
          }).returning();
          const tcStart = Date.now();
          let result: any;
          try {
            if (!tool) {
              result = { error: `unknown_tool: ${call.name}` };
            } else {
              result = await withEzraAudit(
                { action: `tool:${call.name}`, conversationId: input.conversationId, userId: input.userId, toolName: call.name },
                () => tool.execute(call.args, { userId: input.userId, conversationId: input.conversationId }),
              );
            }
          } catch (err: any) {
            result = { error: err?.message || String(err) };
          }
          const tcDuration = Date.now() - tcStart;
          toolCalls.push({ name: call.name, args: call.args, result, durationMs: tcDuration });
          const resultRow = await db.insert(ezraMessages).values({
            conversationId: input.conversationId,
            role: "tool_result",
            toolName: call.name,
            toolResult: result,
            toolCallId: callRow[0].id,
          }).returning();
          newMessages.push(callRow[0], resultRow[0]);
        }
        workingHistory = [...workingHistory, ...newMessages];
      }

      if (iterations >= MAX_TURNS && !assistantText) {
        assistantText = `I hit the ${MAX_TURNS}-iteration tool limit before reaching a final answer. The tool history is above — try a more specific ask.`;
        await db.insert(ezraMessages).values({
          conversationId: input.conversationId,
          role: "assistant",
          content: assistantText,
          finishReason: "iteration_cap",
        });
      }

      // Bump updatedAt on the conversation
      await db.update(ezraConversations).set({ updatedAt: new Date() }).where(eq(ezraConversations.id, input.conversationId));

      return {
        conversationId: input.conversationId,
        assistantText,
        toolCalls,
        iterations,
        usage: { inputTokens: totalInputTokens || undefined, outputTokens: totalOutputTokens || undefined },
      };
    },
  );
}

// Convert ezra_messages rows into Gemini's contents[] format. Tool calls
// become role='model' with functionCall parts; tool results become
// role='user' with functionResponse parts (Gemini's convention).
function historyToGeminiContents(messages: EzraMessage[]): any[] {
  const out: any[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", parts: [{ text: m.content || "" }] });
    } else if (m.role === "assistant") {
      if (m.content) out.push({ role: "model", parts: [{ text: m.content }] });
    } else if (m.role === "tool_call") {
      out.push({ role: "model", parts: [{ functionCall: { name: m.toolName, args: m.toolArgs || {} } }] });
    } else if (m.role === "tool_result") {
      out.push({
        role: "user",
        parts: [{
          functionResponse: {
            name: m.toolName,
            response: m.toolResult || {},
          },
        }],
      });
    }
    // 'system' rows: not part of contents; system instruction goes via systemInstruction
  }
  return out;
}

async function persistError(conversationId: string, error: string): Promise<void> {
  try {
    await db.insert(ezraMessages).values({
      conversationId,
      role: "assistant",
      content: `[error] ${error.slice(0, 400)}`,
      finishReason: "error",
      error: error.slice(0, 1000),
    });
  } catch {
    // Swallow — caller is already propagating the original error
  }
}

export const EZRA_TOOLS_AVAILABLE = EZRA_TOOLS.map((t) => ({ name: t.name, description: t.description }));
