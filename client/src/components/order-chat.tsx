import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Send, Paperclip, Bot, User, Shield } from "lucide-react";

interface OrderMessage {
  id: string;
  orderId: string;
  userId: string | null;
  senderRole: string; // admin, customer, system, bot
  message: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  createdAt: string;
}

function MessageBubble({ msg, isOwn }: { msg: OrderMessage; isOwn: boolean }) {
  const roleConfig: Record<string, { label: string; icon: any; color: string }> = {
    admin: { label: "Sideline Team", icon: Shield, color: "#3b82f6" },
    customer: { label: "You", icon: User, color: "#22c55e" },
    system: { label: "System", icon: Bot, color: "#f59e0b" },
    bot: { label: "Sideline Bot", icon: Bot, color: "#8b5cf6" },
  };
  const config = roleConfig[msg.senderRole] || roleConfig.system;
  const Icon = config.icon;

  return (
    <div style={{
      display: "flex",
      flexDirection: isOwn ? "row-reverse" : "row",
      gap: "10px",
      marginBottom: "16px",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: `${config.color}22`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <Icon size={14} color={config.color} />
      </div>

      <div style={{ maxWidth: "75%", minWidth: 0 }}>
        <div style={{
          display: "flex", gap: "8px", alignItems: "center",
          flexDirection: isOwn ? "row-reverse" : "row",
          marginBottom: "4px",
        }}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: config.color }}>
            {isOwn ? "You" : config.label}
          </span>
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>
            {new Date(msg.createdAt).toLocaleString()}
          </span>
        </div>

        <div style={{
          padding: "10px 14px",
          background: isOwn ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${isOwn ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)"}`,
          borderRadius: isOwn ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
        }}>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.85)", lineHeight: "1.5", whiteSpace: "pre-wrap" }}>
            {msg.message}
          </p>
          {msg.attachmentUrl && (
            <a
              href={msg.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                marginTop: "8px", padding: "4px 10px",
                background: "rgba(255,255,255,0.04)", borderRadius: "4px",
                fontSize: "12px", color: "#3b82f6", textDecoration: "none",
              }}
            >
              <Paperclip size={12} />
              {msg.attachmentName || "Attachment"}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function OrderChat({ orderId, userRole, apiPrefix }: {
  orderId: string;
  userRole: "admin" | "customer";
  apiPrefix: string; // "/api/admin" or "/api/portal"
}) {
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: messages = [] } = useQuery<OrderMessage[]>({
    queryKey: [`${apiPrefix}/orders/${orderId}/messages`],
    refetchInterval: 10000, // Poll every 10s
  });

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", `${apiPrefix}/orders/${orderId}/messages`, { message: text });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiPrefix}/orders/${orderId}/messages`] });
      setMessage("");
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = message.trim();
    if (!text) return;
    sendMutation.mutate(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{
      background: "#111", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "12px", overflow: "hidden", display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>
          Order Chat
        </h3>
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>
          Message the {userRole === "admin" ? "customer" : "Sideline team"} about this order
        </p>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, minHeight: "200px", maxHeight: "400px",
        overflowY: "auto", padding: "16px 20px",
      }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <Bot size={24} color="rgba(255,255,255,0.15)" style={{ margin: "0 auto 8px" }} />
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)" }}>
              No messages yet. Start the conversation!
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isOwn={msg.senderRole === userRole}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)",
        display: "flex", gap: "10px", alignItems: "flex-end",
      }}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          style={{
            flex: 1, resize: "none", padding: "10px 14px",
            fontSize: "13px", lineHeight: "1.5",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "8px", color: "#fff", outline: "none",
            maxHeight: "120px",
          }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "auto";
            target.style.height = Math.min(target.scrollHeight, 120) + "px";
          }}
        />
        <button
          onClick={handleSend}
          disabled={!message.trim() || sendMutation.isPending}
          style={{
            width: 40, height: 40, borderRadius: "8px",
            background: message.trim() ? "#fff" : "rgba(255,255,255,0.04)",
            border: "none", cursor: message.trim() ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.2s",
          }}
        >
          <Send size={16} color={message.trim() ? "#000" : "rgba(255,255,255,0.2)"} />
        </button>
      </div>
    </div>
  );
}
