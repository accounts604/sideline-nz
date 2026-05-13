-- Ezra (in-app copilot) Phase A — conversations + messages (2026-05-12).
-- Backs the chat UI at /admin/ezra and the same brain reached via the
-- Telegram bridge (Phase E). One conversation is scoped to a user, with an
-- optional context anchor (the order or club they were looking at when they
-- opened the chat). Tool calls and their results live as message rows of
-- type 'tool_call' / 'tool_result' so the audit trail is the source of
-- truth for "what did Ezra do".

CREATE TABLE IF NOT EXISTS ezra_conversations (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  title         TEXT,
  -- Context anchor (optional). When opened from an order page, we record
  -- the order; lets the system prompt say "you are currently looking at
  -- order X" without the user having to re-type it.
  scope_kind    TEXT,           -- 'order' | 'club' | 'global' | 'telegram'
  scope_id      TEXT,           -- orderId / clubAccountId / null
  -- External channel binding for the Telegram bridge. Phase E uses this to
  -- map an incoming Telegram chat_id to one ezra_conversation row.
  channel       TEXT,           -- 'web' | 'telegram'
  channel_ref   TEXT,           -- telegram chat_id (when channel='telegram')
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ezra_conversations_user_idx ON ezra_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ezra_conversations_channel_idx ON ezra_conversations(channel, channel_ref) WHERE channel_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS ezra_messages (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT NOT NULL REFERENCES ezra_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,   -- 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'system'
  content         TEXT,            -- text body (null for tool_call/tool_result; payload lives in tool_*)
  tool_name       TEXT,            -- for role='tool_call'/'tool_result'
  tool_args       JSONB,           -- for role='tool_call'
  tool_result     JSONB,           -- for role='tool_result' (the tool's return value)
  tool_call_id    TEXT,            -- links a tool_result back to its tool_call
  finish_reason   TEXT,            -- 'stop' | 'tool_calls' | 'error' | null
  error           TEXT,            -- populated when something blew up mid-turn
  -- Token usage attribution per message — drives the activity feed cost
  -- panel; matches the shape from server/ai/providers/types.ts.
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ezra_messages_conversation_idx ON ezra_messages(conversation_id, created_at);
