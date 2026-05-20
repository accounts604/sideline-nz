// Public API for Ezra. Other modules (admin routes, eventually mission-
// control bridge) should import only from this file.

import { db } from "../db";
import { ezraConversations, ezraMessages } from "@shared/schema";
import { and, eq, desc } from "drizzle-orm";
// Provider switch — AI_PROVIDER env picks Gemini (default, free) or
// Claude Sonnet (better tool use, needs ANTHROPIC_API_KEY credit). Both
// runners share the same {ChatTurnInput, ChatTurnOutput} signatures, so
// callers don't care which one's wired.
import { runChatTurn as runChatTurnGemini, type ChatTurnInput, type ChatTurnOutput, EZRA_TOOLS_AVAILABLE } from "./runner";
import { runChatTurn as runChatTurnClaude } from "./runner-claude";

const AI_PROVIDER = process.env.AI_PROVIDER || "gemini";
export const runChatTurn: typeof runChatTurnGemini =
  AI_PROVIDER === "claude" ? runChatTurnClaude : runChatTurnGemini;

export { EZRA_TOOLS_AVAILABLE };
export type { ChatTurnInput, ChatTurnOutput };

// Get-or-create a conversation. The caller passes a logical key (userId +
// optional channel/channelRef for Telegram or scope for web). When called
// from the web chat, channel='web' with no channelRef — one conversation
// per user per scope. When called from Telegram (Phase E), channelRef
// is the telegram chat_id.
export async function getOrCreateConversation(opts: {
  userId: string;
  channel?: "web" | "telegram" | "gmail";
  channelRef?: string;
  scopeKind?: string;
  scopeId?: string;
}) {
  const channel = opts.channel || "web";

  // For telegram, dedupe by channel + channelRef (one conversation per chat).
  if (channel === "telegram" && opts.channelRef) {
    const existing = await db
      .select()
      .from(ezraConversations)
      .where(and(eq(ezraConversations.channel, "telegram"), eq(ezraConversations.channelRef, opts.channelRef)))
      .limit(1);
    if (existing[0]) return existing[0];
  }

  // For gmail, dedupe by channel + channelRef (channelRef = Gmail threadId).
  // One Ezra conversation per Gmail thread — every customer reply on the
  // same thread continues the same conversation, so Ezra has prior turns
  // as context when deciding.
  if (channel === "gmail" && opts.channelRef) {
    const existing = await db
      .select()
      .from(ezraConversations)
      .where(and(eq(ezraConversations.channel, "gmail"), eq(ezraConversations.channelRef, opts.channelRef)))
      .limit(1);
    if (existing[0]) return existing[0];
  }

  // For web, dedupe by user + scope (one conversation per user per anchored order/club).
  if (channel === "web") {
    const conds = [eq(ezraConversations.userId, opts.userId), eq(ezraConversations.channel, "web")];
    if (opts.scopeKind) conds.push(eq(ezraConversations.scopeKind, opts.scopeKind));
    if (opts.scopeId) conds.push(eq(ezraConversations.scopeId, opts.scopeId));
    const existing = await db
      .select()
      .from(ezraConversations)
      .where(and(...conds))
      .orderBy(desc(ezraConversations.updatedAt))
      .limit(1);
    if (existing[0]) return existing[0];
  }

  const [created] = await db
    .insert(ezraConversations)
    .values({
      userId: opts.userId,
      channel,
      channelRef: opts.channelRef || null,
      scopeKind: opts.scopeKind || "global",
      scopeId: opts.scopeId || null,
    })
    .returning();
  return created;
}

export async function listConversations(userId: string, limit = 30) {
  return db
    .select()
    .from(ezraConversations)
    .where(eq(ezraConversations.userId, userId))
    .orderBy(desc(ezraConversations.updatedAt))
    .limit(limit);
}

export async function listMessages(conversationId: string, limit = 200) {
  const rows = await db
    .select()
    .from(ezraMessages)
    .where(eq(ezraMessages.conversationId, conversationId))
    .orderBy(desc(ezraMessages.createdAt))
    .limit(limit);
  return rows.reverse(); // newest-first → oldest-first for display
}
