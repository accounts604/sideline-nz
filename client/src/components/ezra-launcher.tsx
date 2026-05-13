// EzraLauncher — global floating copilot widget.
//
// Mounted once in AdminLayout so it's reachable from every /admin/* page.
// Bottom-right bubble → slide-out 380px panel from the right edge. The
// panel scrolls independently and does not push or replace the main page.
//
// Context awareness: on open, the panel reads the current route via wouter
// and derives a scope ({ orderId from /admin/orders/:id, clubId from
// /admin/clubs/:id, ... }). The scope is sent with the first message of a
// new conversation so Ezra's system prompt already includes "you are
// anchored to order X" — the user doesn't have to retype IDs.

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Sparkles, Send, X, Plus, CheckCircle2, XCircle, Wrench, Maximize2, Minimize2 } from "lucide-react";

type Conversation = {
  id: string;
  title: string | null;
  scopeKind: string | null;
  scopeId: string | null;
  channel: string | null;
  updatedAt: string;
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
  createdAt: string;
};

type ChatResponse = {
  conversationId: string;
  assistantText: string;
  toolCalls: Array<{ name: string; args: any; result: any; durationMs: number }>;
  iterations: number;
  usage: { inputTokens?: number; outputTokens?: number };
};

type RouteScope = { scopeKind: "order" | "club" | "global"; scopeId?: string; label?: string };

// Parse the current admin route into an Ezra scope so the chat knows what
// entity the user is looking at. Add patterns here as new admin pages land.
function detectScope(path: string): RouteScope {
  let m;
  if ((m = /^\/admin\/orders\/([0-9a-f-]+)(?:\/|$)/.exec(path))) {
    return { scopeKind: "order", scopeId: m[1], label: `order ${m[1].slice(0, 6)}` };
  }
  if ((m = /^\/admin\/customers\/([0-9a-f-]+)(?:\/|$)/.exec(path))) {
    return { scopeKind: "club", scopeId: m[1], label: `customer ${m[1].slice(0, 6)}` };
  }
  // No anchored entity — chat happens at "global" scope.
  return { scopeKind: "global" };
}

const LS_OPEN = "ezra.launcher.open";
const LS_EXPANDED = "ezra.launcher.expanded";

export function EzraLauncher() {
  const [location] = useLocation();
  const onAdmin = location.startsWith("/admin");
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_OPEN) === "1"; } catch { return false; }
  });
  const [expanded, setExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_EXPANDED) === "1"; } catch { return false; }
  });

  useEffect(() => { try { localStorage.setItem(LS_OPEN, open ? "1" : "0"); } catch {} }, [open]);
  useEffect(() => { try { localStorage.setItem(LS_EXPANDED, expanded ? "1" : "0"); } catch {} }, [expanded]);

  // Only mount on admin pages — copilot is admin-scoped. Skip the full-page
  // /admin/ezra route since the page itself already renders the chat.
  if (!onAdmin || location.startsWith("/admin/ezra")) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Open Ezra"
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 100,
            width: "54px",
            height: "54px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #C9A84C 0%, #b8932f 100%)",
            border: "none",
            color: "#0a0a0a",
            cursor: "pointer",
            boxShadow: "0 6px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(201,168,76,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "transform 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <Sparkles size={22} />
        </button>
      )}
      {open && <EzraPanel currentPath={location} expanded={expanded} onClose={() => setOpen(false)} onToggleExpanded={() => setExpanded((v) => !v)} />}
    </>
  );
}

function EzraPanel({
  currentPath,
  expanded,
  onClose,
  onToggleExpanded,
}: {
  currentPath: string;
  expanded: boolean;
  onClose: () => void;
  onToggleExpanded: () => void;
}) {
  const qc = useQueryClient();
  const routeScope = useMemo(() => detectScope(currentPath), [currentPath]);
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

  // Auto-pick the most recent conversation matching the current scope, else
  // fall back to most recent web conversation. Falls through to "no
  // conversation; new one will be created on first send" if none.
  useEffect(() => {
    if (activeId || !convosQuery.data?.conversations?.length) return;
    const convos = convosQuery.data.conversations;
    const scoped = convos.find(
      (c) => c.channel === "web" && c.scopeKind === routeScope.scopeKind && (c.scopeId ?? null) === (routeScope.scopeId ?? null),
    );
    if (scoped) { setActiveId(scoped.id); return; }
    const anyWeb = convos.find((c) => c.channel === "web");
    if (anyWeb) setActiveId(anyWeb.id);
  }, [convosQuery.data, activeId, routeScope.scopeKind, routeScope.scopeId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messagesQuery.data?.messages?.length]);

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      const r = await apiRequest("POST", "/api/admin/ai/chat", {
        message: text,
        conversationId: activeId || undefined,
        // Only attach scope when starting a fresh conversation so the
        // anchor sticks; subsequent messages inherit the conversation's scope.
        ...(!activeId && routeScope.scopeKind !== "global"
          ? { scopeKind: routeScope.scopeKind, scopeId: routeScope.scopeId }
          : {}),
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

  const width = expanded ? "min(720px, 90vw)" : "min(420px, 90vw)";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width,
        zIndex: 100,
        background: "#0d0d0d",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "-12px 0 40px rgba(0,0,0,0.5)",
        display: "flex",
        flexDirection: "column",
        animation: "ezraSlideIn 0.2s ease-out",
      }}
    >
      {/* Header */}
      <header style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, background: "linear-gradient(135deg, rgba(201,168,76,0.06) 0%, transparent 100%)" }}>
        <Sparkles size={16} color="#C9A84C" />
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#fff", margin: 0 }}>Ezra</h2>
          <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", margin: 0 }}>
            {routeScope.scopeKind === "global"
              ? "Global · no anchor"
              : `Anchored: ${routeScope.label || routeScope.scopeKind}`}
          </p>
        </div>
        <button onClick={newConversation} title="New conversation" style={iconBtn}>
          <Plus size={14} />
        </button>
        <button onClick={onToggleExpanded} title={expanded ? "Shrink" : "Expand"} style={iconBtn}>
          {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
        <button onClick={onClose} title="Close" style={iconBtn}>
          <X size={14} />
        </button>
      </header>

      {/* Conversation list — only show when there are multiple AND we're not in the middle of one */}
      {conversations.length > 1 && (
        <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: "6px", overflowX: "auto", flexShrink: 0 }}>
          {conversations.slice(0, 8).map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              style={{
                padding: "4px 8px",
                fontSize: "10px",
                background: c.id === activeId ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.03)",
                color: c.id === activeId ? "#C9A84C" : "rgba(255,255,255,0.55)",
                border: `1px solid ${c.id === activeId ? "rgba(201,168,76,0.3)" : "rgba(255,255,255,0.05)"}`,
                borderRadius: "999px",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
                fontWeight: c.id === activeId ? 700 : 400,
              }}
            >
              {c.title || c.id.slice(0, 6)}
              {c.channel === "telegram" && <span style={{ marginLeft: "4px", color: "#0088cc" }}>tg</span>}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {!activeId && messages.length === 0 && !sending && (
          <EmptyState routeScope={routeScope} onPick={(text) => setInput(text)} />
        )}
        {messages.map((m) => <MessageBubble key={m.id} m={m} />)}
        {sending && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center", color: "rgba(201,168,76,0.7)", fontSize: "11px", padding: "4px 8px" }}>
            <Sparkles size={12} className="ezra-thinking" />
            Thinking…
          </div>
        )}
        {sendMutation.isError && (
          <div style={{ padding: "8px 10px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "6px", color: "#ef4444", fontSize: "11px" }}>
            {(sendMutation.error as any)?.message || "Failed to send"}
          </div>
        )}
      </div>

      {/* Composer */}
      <form onSubmit={onSubmit} style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "10px 12px", display: "flex", gap: "6px", flexShrink: 0, background: "#111" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(e as any); } }}
          placeholder={routeScope.scopeKind !== "global" ? `Ask Ezra about ${routeScope.label || "this"}…` : "Ask Ezra anything…"}
          rows={2}
          disabled={sending}
          style={{
            flex: 1, padding: "8px 10px", fontSize: "12px",
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "6px", color: "#fff", outline: "none", resize: "none", fontFamily: "inherit",
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          style={{
            padding: "0 12px",
            background: !input.trim() || sending ? "rgba(201,168,76,0.2)" : "#C9A84C",
            color: !input.trim() || sending ? "rgba(255,255,255,0.4)" : "#0a0a0a",
            border: "none", borderRadius: "6px",
            cursor: !input.trim() || sending ? "not-allowed" : "pointer",
            fontSize: "12px", fontWeight: 700,
            display: "flex", alignItems: "center", gap: "4px",
          }}
        >
          <Send size={13} />
        </button>
      </form>

      <style>{`
        @keyframes ezraSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes ezraPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        .ezra-thinking { animation: ezraPulse 1.2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.65)",
  borderRadius: "5px",
  padding: "5px 7px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
};

function EmptyState({ routeScope, onPick }: { routeScope: RouteScope; onPick: (text: string) => void }) {
  const examples = routeScope.scopeKind === "order"
    ? [
        "Summarise this order",
        "What's missing on this order?",
        "List the design files for this order",
      ]
    : routeScope.scopeKind === "club"
    ? [
        "What's this club's drop status?",
        "Show me recent orders for this club",
        "Search for similar products",
      ]
    : [
        "What's the status of Onewhero's drop?",
        "List the last 5 orders",
        "Search products for 'rugby jersey'",
      ];
  return (
    <div style={{ padding: "24px 16px", textAlign: "center" }}>
      <Sparkles size={28} color="#C9A84C" style={{ marginBottom: "10px" }} />
      <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", margin: 0, marginBottom: "14px" }}>
        Ask anything about orders, clubs, products, or drops.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {examples.map((e, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(e)}
            style={{
              fontSize: "11px",
              padding: "6px 10px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "5px",
              color: "rgba(255,255,255,0.65)",
              textAlign: "left",
              cursor: "pointer",
              fontFamily: "inherit",
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
              ev.currentTarget.style.color = "rgba(255,255,255,0.65)";
            }}
          >
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
      <div style={{ alignSelf: "flex-end", maxWidth: "85%", padding: "8px 12px", background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)", borderRadius: "10px 10px 2px 10px", color: "#fff", fontSize: "12px", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
        {m.content}
      </div>
    );
  }
  if (m.role === "assistant") {
    return (
      <div style={{ alignSelf: "flex-start", maxWidth: "90%", padding: "8px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px 10px 10px 2px", color: "#fff", fontSize: "12px", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
        {m.content || (m.error ? <span style={{ color: "#ef4444" }}>{m.error}</span> : "(no response)")}
      </div>
    );
  }
  if (m.role === "tool_call") {
    return (
      <details style={{ alignSelf: "flex-start", maxWidth: "90%", fontSize: "10px", color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "5px", padding: "5px 8px" }}>
        <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>
          <Wrench size={10} color="#C9A84C" />
          <span style={{ fontWeight: 700, color: "#C9A84C" }}>{m.toolName}</span>
        </summary>
        <pre style={{ fontSize: "9px", marginTop: "5px", marginBottom: 0, padding: "5px 6px", background: "rgba(0,0,0,0.3)", borderRadius: "3px", color: "rgba(255,255,255,0.6)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {JSON.stringify(m.toolArgs ?? {}, null, 2)}
        </pre>
      </details>
    );
  }
  if (m.role === "tool_result") {
    const isError = m.toolResult && typeof m.toolResult === "object" && (m.toolResult as any).error;
    return (
      <details style={{ alignSelf: "flex-start", maxWidth: "90%", fontSize: "10px", color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "5px", padding: "5px 8px" }}>
        <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>
          {isError ? <XCircle size={10} color="#ef4444" /> : <CheckCircle2 size={10} color="#22c55e" />}
          <span style={{ fontWeight: 700 }}>{m.toolName} result</span>
        </summary>
        <pre style={{ fontSize: "9px", marginTop: "5px", marginBottom: 0, padding: "5px 6px", background: "rgba(0,0,0,0.3)", borderRadius: "3px", color: isError ? "#ef4444" : "rgba(255,255,255,0.6)", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "240px", overflow: "auto" }}>
          {JSON.stringify(m.toolResult ?? {}, null, 2)}
        </pre>
      </details>
    );
  }
  return null;
}
