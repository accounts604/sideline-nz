// Ezra — in-app copilot chat.
//
// Phase A: a single-pane chat with conversation history in a left rail.
// Non-streaming for now — POST a message, wait, show the response. Tool
// calls render inline as compact pills between user and assistant messages.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { apiRequest } from "@/lib/queryClient";
import { Sparkles, Send, Plus, CheckCircle2, XCircle, ChevronRight, Wrench } from "lucide-react";

type Conversation = {
  id: string;
  title: string | null;
  scopeKind: string | null;
  scopeId: string | null;
  channel: string | null;
  updatedAt: string;
  createdAt: string;
};

type Message = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "tool_call" | "tool_result" | "system";
  content: string | null;
  toolName: string | null;
  toolArgs: any;
  toolResult: any;
  toolCallId: string | null;
  finishReason: string | null;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
};

type ChatResponse = {
  conversationId: string;
  assistantText: string;
  toolCalls: Array<{ name: string; args: any; result: any; durationMs: number }>;
  iterations: number;
  usage: { inputTokens?: number; outputTokens?: number };
};

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function AdminEzra() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const convosQuery = useQuery<{ conversations: Conversation[] }>({
    queryKey: ["/api/admin/ai/conversations"],
    staleTime: 10_000,
  });

  const messagesQuery = useQuery<{ conversation: Conversation; messages: Message[] }>({
    queryKey: [`/api/admin/ai/conversations/${activeId}/messages`],
    enabled: !!activeId,
    staleTime: 0,
  });

  // Pick the most-recent web conversation on mount if no activeId.
  useEffect(() => {
    if (!activeId && convosQuery.data?.conversations?.length) {
      const firstWeb = convosQuery.data.conversations.find((c) => c.channel === "web");
      if (firstWeb) setActiveId(firstWeb.id);
    }
  }, [convosQuery.data, activeId]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messagesQuery.data?.messages?.length]);

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      const r = await apiRequest("POST", "/api/admin/ai/chat", {
        message: text,
        conversationId: activeId || undefined,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      return j as ChatResponse;
    },
    onSuccess: (resp) => {
      if (!activeId) setActiveId(resp.conversationId);
      setInput("");
      qc.invalidateQueries({ queryKey: ["/api/admin/ai/conversations"] });
      qc.invalidateQueries({ queryKey: [`/api/admin/ai/conversations/${resp.conversationId}/messages`] });
    },
  });

  const conversations = convosQuery.data?.conversations ?? [];
  const messages = messagesQuery.data?.messages ?? [];
  const sending = sendMutation.isPending;

  function newConversation() {
    setActiveId(null);
    qc.invalidateQueries({ queryKey: ["/api/admin/ai/conversations"] });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    sendMutation.mutate(text);
  }

  return (
    <AdminLayout>
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: "16px", height: "calc(100vh - 96px)", minHeight: "560px" }}>
        {/* Sidebar — conversation list */}
        <aside style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "12px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <button
            onClick={newConversation}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", marginBottom: "12px", background: "#C9A84C", color: "#0a0a0a", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", letterSpacing: "0.3px" }}
          >
            <Plus size={14} /> New conversation
          </button>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {convosQuery.isLoading && <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>Loading…</p>}
            {conversations.length === 0 && !convosQuery.isLoading && (
              <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", margin: 0 }}>No conversations yet.</p>
            )}
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  marginBottom: "4px",
                  background: c.id === activeId ? "rgba(201,168,76,0.12)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${c.id === activeId ? "rgba(201,168,76,0.3)" : "rgba(255,255,255,0.05)"}`,
                  borderRadius: "6px",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                <div style={{ fontWeight: 600, color: c.id === activeId ? "#C9A84C" : "#fff", marginBottom: "2px" }}>
                  {c.title || `Conversation ${c.id.slice(0, 6)}`}
                </div>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>{relativeTime(c.updatedAt)}</span>
                  {c.channel === "telegram" && <span style={{ color: "#0088cc", fontWeight: 600 }}>tg</span>}
                  {c.scopeKind && c.scopeKind !== "global" && <span style={{ color: "rgba(255,255,255,0.3)" }}>· {c.scopeKind}</span>}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Main — messages + input */}
        <section style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px" }}>
          <header style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
            <Sparkles size={16} color="#C9A84C" />
            <div>
              <h1 style={{ fontSize: "14px", fontWeight: 700, color: "#fff", margin: 0 }}>Ezra</h1>
              <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", margin: 0 }}>Sideline operations copilot · read-only (Phase A)</p>
            </div>
          </header>

          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {!activeId && messages.length === 0 && !sending && (
              <EmptyState onPick={(text) => setInput(text)} />
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} m={m} />
            ))}
            {sending && (
              <div style={{ display: "flex", gap: "8px", alignItems: "center", color: "rgba(201,168,76,0.7)", fontSize: "12px", padding: "8px 12px" }}>
                <Sparkles size={12} className="ezra-thinking" />
                Ezra is thinking…
              </div>
            )}
            {sendMutation.isError && (
              <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "6px", color: "#ef4444", fontSize: "12px" }}>
                {(sendMutation.error as any)?.message || "Failed to send"}
              </div>
            )}
          </div>

          {/* Composer */}
          <form onSubmit={onSubmit} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "12px 16px", display: "flex", gap: "8px", flexShrink: 0, background: "#111" }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit(e as any);
                }
              }}
              placeholder="Ask Ezra anything about an order, club, or product. (Shift+Enter for newline)"
              rows={2}
              disabled={sending}
              style={{
                flex: 1, padding: "10px 12px", fontSize: "13px",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "6px", color: "#fff", outline: "none", resize: "none", fontFamily: "inherit",
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              style={{
                padding: "0 16px",
                background: !input.trim() || sending ? "rgba(201,168,76,0.25)" : "#C9A84C",
                color: !input.trim() || sending ? "rgba(255,255,255,0.4)" : "#0a0a0a",
                border: "none", borderRadius: "6px",
                cursor: !input.trim() || sending ? "not-allowed" : "pointer",
                fontSize: "13px", fontWeight: 700,
                display: "flex", alignItems: "center", gap: "6px",
              }}
            >
              <Send size={14} /> Send
            </button>
          </form>
        </section>
      </div>
      <style>{`
        @keyframes ezraPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        .ezra-thinking { animation: ezraPulse 1.2s ease-in-out infinite; }
      `}</style>
    </AdminLayout>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  const examples = [
    "What's the status of Onewhero's drop?",
    "Name this image for a Glenora bucket hat — https://...",
    "List the last 5 orders for Manurewa EFKS",
    "Search products for 'rugby jersey'",
  ];
  return (
    <div style={{ padding: "60px 40px", textAlign: "center" }}>
      <Sparkles size={36} color="#C9A84C" style={{ marginBottom: "16px" }} />
      <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", margin: "0 0 8px" }}>Talk to Ezra</h2>
      <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", marginTop: 0, marginBottom: "24px", maxWidth: "420px", marginLeft: "auto", marginRight: "auto" }}>
        Sideline operations copilot. Reads orders, clubs, products, drop status. Can name uploaded images using the canonical scheme.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxWidth: "420px", margin: "0 auto" }}>
        <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.8px", color: "rgba(255,255,255,0.35)", marginBottom: "4px" }}>Try</p>
        {examples.map((e, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(e)}
            style={{
              fontSize: "12px",
              padding: "8px 12px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "6px",
              color: "rgba(255,255,255,0.7)",
              textAlign: "left",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              transition: "all 0.12s",
            }}
            onMouseEnter={(ev) => {
              ev.currentTarget.style.background = "rgba(201,168,76,0.08)";
              ev.currentTarget.style.borderColor = "rgba(201,168,76,0.25)";
              ev.currentTarget.style.color = "#C9A84C";
            }}
            onMouseLeave={(ev) => {
              ev.currentTarget.style.background = "rgba(255,255,255,0.03)";
              ev.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
              ev.currentTarget.style.color = "rgba(255,255,255,0.7)";
            }}
          >
            <ChevronRight size={11} style={{ color: "#C9A84C", flexShrink: 0 }} />
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ m }: { m: Message }) {
  if (m.role === "user") {
    return (
      <div style={{ alignSelf: "flex-end", maxWidth: "75%", padding: "10px 14px", background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: "10px 10px 2px 10px", color: "#fff", fontSize: "13px", whiteSpace: "pre-wrap" }}>
        {m.content}
      </div>
    );
  }

  if (m.role === "assistant") {
    return (
      <div style={{ alignSelf: "flex-start", maxWidth: "85%", padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px 10px 10px 2px", color: "#fff", fontSize: "13px", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
        {m.content || (m.error ? <span style={{ color: "#ef4444" }}>{m.error}</span> : "(no response)")}
        {m.error && <div style={{ fontSize: "11px", color: "rgba(239,68,68,0.6)", marginTop: "6px" }}>{m.error}</div>}
      </div>
    );
  }

  if (m.role === "tool_call") {
    return (
      <details style={{ alignSelf: "flex-start", maxWidth: "85%", fontSize: "11px", color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "6px", padding: "6px 10px" }}>
        <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
          <Wrench size={11} color="#C9A84C" />
          <span style={{ fontWeight: 700, color: "#C9A84C" }}>{m.toolName}</span>
          <span style={{ fontStyle: "italic" }}>(tool call)</span>
        </summary>
        <pre style={{ fontSize: "10px", marginTop: "6px", marginBottom: 0, padding: "6px 8px", background: "rgba(0,0,0,0.3)", borderRadius: "4px", color: "rgba(255,255,255,0.6)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {JSON.stringify(m.toolArgs ?? {}, null, 2)}
        </pre>
      </details>
    );
  }

  if (m.role === "tool_result") {
    const isError = m.toolResult && typeof m.toolResult === "object" && (m.toolResult as any).error;
    return (
      <details style={{ alignSelf: "flex-start", maxWidth: "85%", fontSize: "11px", color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "6px", padding: "6px 10px" }}>
        <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
          {isError ? <XCircle size={11} color="#ef4444" /> : <CheckCircle2 size={11} color="#22c55e" />}
          <span style={{ fontWeight: 700 }}>{m.toolName} result</span>
        </summary>
        <pre style={{ fontSize: "10px", marginTop: "6px", marginBottom: 0, padding: "6px 8px", background: "rgba(0,0,0,0.3)", borderRadius: "4px", color: isError ? "#ef4444" : "rgba(255,255,255,0.6)", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "300px", overflow: "auto" }}>
          {JSON.stringify(m.toolResult ?? {}, null, 2)}
        </pre>
      </details>
    );
  }

  return null;
}
