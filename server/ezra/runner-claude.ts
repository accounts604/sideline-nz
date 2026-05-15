// Ezra chat runner — Claude variant (Anthropic Sonnet 4.6).
//
// Parallel implementation to runner.ts (which uses Gemini). The Ezra index
// picks one based on AI_PROVIDER env. Keeping them separate so each
// provider's quirks live in its own file — Claude has tool_use content
// blocks + cache_control hints; Gemini has functionCall/functionResponse
// parts. Translating between them mid-loop would be more code than just
// having two files.
//
// Prompt caching: marks the system prompt + tool list as ephemeral cache
// targets. Multi-turn conversations get cache hits on the unchanging
// preamble, which keeps cost predictable as the chat grows.

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { ezraConversations, ezraMessages, type EzraMessage } from "@shared/schema";
import { eq, asc } from "drizzle-orm";
import { buildSystemPrompt } from "./prompt";
import { findTool, EZRA_TOOLS } from "./tools";
import { withEzraAudit } from "./audit";

const CLAUDE_MODEL = process.env.AI_CLAUDE_MODEL || "claude-sonnet-4-6";
const MAX_TURNS = 6;
const MAX_HISTORY = 40;

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

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  _client = new Anthropic({ apiKey });
  return _client;
}

// Translate Ezra's tool registry to Anthropic's tool format.
function claudeToolSchema(): Anthropic.Messages.Tool[] {
  return EZRA_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as any,
  }));
}

// Translate our EzraMessage[] history into Anthropic MessageParam[].
// Tool calls + results become tool_use / tool_result content blocks on the
// assistant/user messages, matching the alternating-role convention.
function historyToAnthropicMessages(history: EzraMessage[]): Anthropic.Messages.MessageParam[] {
  const out: Anthropic.Messages.MessageParam[] = [];
  let i = 0;
  while (i < history.length) {
    const m = history[i];
    if (m.role === "user") {
      out.push({ role: "user", content: m.content || "" });
      i++;
    } else if (m.role === "assistant") {
      // Skip empty assistant messages — Anthropic rejects empty turns.
      if (m.content && m.content.trim()) {
        out.push({ role: "assistant", content: m.content });
      }
      i++;
    } else if (m.role === "tool_call") {
      // Collect consecutive tool_call rows into one assistant message with
      // tool_use content blocks. Same for the matching tool_result rows.
      const callBlocks: Anthropic.Messages.ToolUseBlockParam[] = [];
      while (i < history.length && history[i].role === "tool_call") {
        const c = history[i];
        callBlocks.push({
          type: "tool_use",
          id: c.id,
          name: c.toolName || "unknown",
          input: (c.toolArgs as any) ?? {},
        });
        i++;
      }
      out.push({ role: "assistant", content: callBlocks });

      // Now collect the matching tool_result rows.
      const resultBlocks: Anthropic.Messages.ToolResultBlockParam[] = [];
      while (i < history.length && history[i].role === "tool_result") {
        const r = history[i];
        resultBlocks.push({
          type: "tool_result",
          tool_use_id: r.toolCallId || r.id,
          content: JSON.stringify(r.toolResult ?? {}),
        });
        i++;
      }
      if (resultBlocks.length) out.push({ role: "user", content: resultBlocks });
    } else {
      i++;
    }
  }
  return out;
}

export async function runChatTurn(input: ChatTurnInput): Promise<ChatTurnOutput> {
  const client = getClient();

  // 1) Persist the user message immediately
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

  return withEzraAudit(
    { action: "chat_turn", conversationId: input.conversationId, userId: input.userId, model: CLAUDE_MODEL },
    async () => {
      const toolCalls: ChatTurnOutput["toolCalls"] = [];
      let assistantText = "";
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let iterations = 0;
      let workingHistory: EzraMessage[] = history;

      while (iterations < MAX_TURNS) {
        iterations++;

        const messages = historyToAnthropicMessages(workingHistory);
        if (messages.length === 0) {
          // Shouldn't happen — the user message we just inserted is in history
          throw new Error("No messages to send to Claude");
        }

        const resp = await client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          // System block with cache_control so multi-turn conversations
          // reuse the cached preamble — keeps cost flat as chat grows.
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          tools: claudeToolSchema(),
          messages,
        });

        totalInputTokens += resp.usage?.input_tokens || 0;
        totalOutputTokens += resp.usage?.output_tokens || 0;

        // Split response content into text + tool_use blocks
        const textParts: string[] = [];
        const callBlocks: Array<{ id: string; name: string; input: any }> = [];
        for (const block of resp.content) {
          if (block.type === "text") textParts.push(block.text);
          else if (block.type === "tool_use") callBlocks.push({ id: block.id, name: block.name, input: block.input });
        }

        if (callBlocks.length === 0) {
          // Terminal text response
          assistantText = textParts.join("\n").trim();
          await db.insert(ezraMessages).values({
            conversationId: input.conversationId,
            role: "assistant",
            content: assistantText,
            finishReason: resp.stop_reason || "stop",
            inputTokens: resp.usage?.input_tokens || null,
            outputTokens: resp.usage?.output_tokens || null,
          });
          break;
        }

        // Execute tool calls, persist as tool_call + tool_result rows
        const newMessages: EzraMessage[] = [];

        // First persist the assistant's tool_use turn (with any text that came alongside).
        // We DON'T write a separate assistant text row — that mid-loop text shows
        // as a brief pre-tool thought; if Romero wants to see it, the tool_call
        // row will be visible regardless. Keeping the conversation clean.

        for (const call of callBlocks) {
          const tool = findTool(call.name);
          const callRow = await db.insert(ezraMessages).values({
            conversationId: input.conversationId,
            role: "tool_call",
            toolName: call.name,
            toolArgs: call.input,
            toolCallId: call.id,
          }).returning();

          const tcStart = Date.now();
          let result: any;
          try {
            if (!tool) {
              result = { error: `unknown_tool: ${call.name}` };
            } else {
              result = await withEzraAudit(
                { action: `tool:${call.name}`, conversationId: input.conversationId, userId: input.userId, toolName: call.name },
                () => tool.execute(call.input, { userId: input.userId, conversationId: input.conversationId }),
              );
            }
          } catch (err: any) {
            result = { error: err?.message || String(err) };
          }
          const tcDuration = Date.now() - tcStart;
          toolCalls.push({ name: call.name, args: call.input, result, durationMs: tcDuration });

          // Persist with the tool_call's own id so the matching pair stays linked
          // when historyToAnthropicMessages stitches the next turn.
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
        assistantText = `Hit the ${MAX_TURNS}-iteration tool limit. Tools called: ${toolCalls.map((t) => t.name).join(", ")}. Ask a more specific question.`;
        await db.insert(ezraMessages).values({
          conversationId: input.conversationId,
          role: "assistant",
          content: assistantText,
          finishReason: "iteration_cap",
        });
      }

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
