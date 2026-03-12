import { Activity, ArrowRight, Upload, MessageSquare, Shield, CheckCircle, Package } from "lucide-react";

interface OrderActivityItem {
  id: string;
  orderId: string;
  userId: string | null;
  action: string;
  details: Record<string, any> | null;
  createdAt: string;
}

const ACTION_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  status_change: { icon: ArrowRight, color: "#3b82f6", label: "Status Changed" },
  design_uploaded: { icon: Upload, color: "#8b5cf6", label: "Design Uploaded" },
  design_reviewed: { icon: CheckCircle, color: "#22c55e", label: "Design Reviewed" },
  qc_created: { icon: Shield, color: "#14b8a6", label: "QC Check Created" },
  qc_updated: { icon: Shield, color: "#14b8a6", label: "QC Check Updated" },
  message_sent: { icon: MessageSquare, color: "#f59e0b", label: "Message Sent" },
  stage_advanced: { icon: ArrowRight, color: "#6366f1", label: "Stage Advanced" },
  production_initialized: { icon: Package, color: "#3b82f6", label: "Production Started" },
  size_breakdown_added: { icon: Activity, color: "#ec4899", label: "Size Details Added" },
};

function formatDetails(action: string, details: Record<string, any> | null): string {
  if (!details) return "";
  if (action === "stage_advanced") {
    const from = (details.from || "").replace(/_/g, " ");
    const to = (details.to || "").replace(/_/g, " ");
    return `${from} → ${to}`;
  }
  if (action === "status_change") {
    return `${details.from || "?"} → ${details.to || "?"}`;
  }
  if (action === "qc_created" || action === "qc_updated") {
    return `${(details.checkType || "").replace(/_/g, " ")} — ${details.status}`;
  }
  if (action === "size_breakdown_added") {
    const parts = [];
    if (details.playerName) parts.push(details.playerName);
    if (details.playerNumber) parts.push(`#${details.playerNumber}`);
    parts.push(`${details.size} x${details.quantity}`);
    return parts.join(" · ");
  }
  return "";
}

export function ActivityLog({ activity }: { activity: OrderActivityItem[] }) {
  if (activity.length === 0) {
    return (
      <div style={{
        background: "#111", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "12px", padding: "24px", textAlign: "center",
      }}>
        <Activity size={24} color="rgba(255,255,255,0.15)" style={{ margin: "0 auto 8px" }} />
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)" }}>
          No activity recorded yet
        </p>
      </div>
    );
  }

  return (
    <div style={{
      background: "#111", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "12px", overflow: "hidden",
    }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>Activity Log</h3>
      </div>

      <div style={{ maxHeight: "400px", overflowY: "auto" }}>
        {activity.map((item, i) => {
          const config = ACTION_CONFIG[item.action] || { icon: Activity, color: "#666", label: item.action.replace(/_/g, " ") };
          const Icon = config.icon;
          const detail = formatDetails(item.action, item.details as Record<string, any> | null);

          return (
            <div key={item.id} style={{
              padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.03)",
              display: "flex", alignItems: "center", gap: "12px",
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: "4px",
                background: `${config.color}12`,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <Icon size={12} color={config.color} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>
                  {config.label}
                  {detail && <span style={{ color: "rgba(255,255,255,0.4)" }}> — {detail}</span>}
                </p>
              </div>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>
                {new Date(item.createdAt).toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
