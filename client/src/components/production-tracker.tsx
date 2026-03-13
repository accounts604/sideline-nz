import { Check, Clock, Circle, Package, Printer, Shield, Box, Truck, Home, FileCheck, Paintbrush } from "lucide-react";

interface ProductionStage {
  id: string;
  stage: string;
  status: string; // pending, in_progress, completed, skipped
  enteredAt: string | null;
  completedAt: string | null;
  notes: string | null;
  estimatedDate: string | null;
}

const STAGE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  order_received: { label: "Order Received", icon: Package, color: "#3b82f6" },
  design_review: { label: "Design Review", icon: Paintbrush, color: "#8b5cf6" },
  design_confirmed: { label: "Design Confirmed", icon: FileCheck, color: "#6366f1" },
  in_production: { label: "In Production", icon: Circle, color: "#f59e0b" },
  printing: { label: "Print / Embroidery", icon: Printer, color: "#ec4899" },
  quality_check: { label: "Quality Check", icon: Shield, color: "#14b8a6" },
  packing: { label: "Packing", icon: Box, color: "#f97316" },
  shipped: { label: "Shipped", icon: Truck, color: "#22c55e" },
  delivered: { label: "Delivered", icon: Home, color: "#22c55e" },
};

function StageIcon({ stage, status }: { stage: string; status: string }) {
  const config = STAGE_CONFIG[stage] || { icon: Circle, color: "#666" };
  const Icon = config.icon;

  if (status === "completed") {
    return (
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        background: "rgba(34,197,94,0.15)", display: "flex",
        alignItems: "center", justifyContent: "center",
      }}>
        <Check size={18} color="#22c55e" />
      </div>
    );
  }

  if (status === "in_progress") {
    return (
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        background: `${config.color}22`, display: "flex",
        alignItems: "center", justifyContent: "center",
        boxShadow: `0 0 0 3px ${config.color}33`,
        animation: "pulse 2s ease-in-out infinite",
      }}>
        <Icon size={18} color={config.color} />
      </div>
    );
  }

  return (
    <div style={{
      width: 36, height: 36, borderRadius: "50%",
      background: "rgba(255,255,255,0.04)", display: "flex",
      alignItems: "center", justifyContent: "center",
    }}>
      <Icon size={18} color="rgba(255,255,255,0.2)" />
    </div>
  );
}

export function ProductionTracker({ stages }: { stages: ProductionStage[] }) {
  if (stages.length === 0) {
    return (
      <div style={{
        background: "#111", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "12px", padding: "24px", textAlign: "center",
      }}>
        <Clock size={24} color="rgba(255,255,255,0.2)" style={{ margin: "0 auto 12px" }} />
        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)" }}>
          Production pipeline not yet started
        </p>
      </div>
    );
  }

  const currentStage = stages.find(s => s.status === "in_progress");
  const completedCount = stages.filter(s => s.status === "completed").length;
  const progress = Math.round((completedCount / stages.length) * 100);

  return (
    <div style={{
      background: "#111", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "12px", overflow: "hidden",
    }}>
      {/* Header with progress */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>Production Progress</h3>
          <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>{progress}% complete</span>
        </div>
        {/* Progress bar */}
        <div style={{ height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${progress}%`,
            background: "linear-gradient(90deg, #3b82f6, #22c55e)",
            borderRadius: "2px", transition: "width 0.5s ease",
          }} />
        </div>
        {currentStage && (
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginTop: "8px" }}>
            Current: {STAGE_CONFIG[currentStage.stage]?.label || currentStage.stage}
          </p>
        )}
      </div>

      {/* Stage list */}
      <div style={{ padding: "8px 0" }}>
        {stages.map((stage, i) => {
          const config = STAGE_CONFIG[stage.stage] || { label: stage.stage, color: "#666" };
          const isLast = i === stages.length - 1;

          return (
            <div key={stage.id} style={{ display: "flex", padding: "12px 24px", gap: "16px", position: "relative" }}>
              {/* Connecting line */}
              {!isLast && (
                <div style={{
                  position: "absolute", left: "41px", top: "48px", bottom: "-4px",
                  width: "2px",
                  background: stage.status === "completed" ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.06)",
                }} />
              )}

              <StageIcon stage={stage.stage} status={stage.status} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: "14px", fontWeight: 500,
                  color: stage.status === "pending" ? "rgba(255,255,255,0.3)" : "#fff",
                }}>
                  {config.label}
                </p>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "2px" }}>
                  {stage.status === "completed" && stage.completedAt && (
                    <span style={{ fontSize: "11px", color: "rgba(34,197,94,0.7)" }}>
                      Completed {new Date(stage.completedAt).toLocaleDateString()}
                    </span>
                  )}
                  {stage.status === "in_progress" && stage.enteredAt && (
                    <span style={{ fontSize: "11px", color: config.color }}>
                      Started {new Date(stage.enteredAt).toLocaleDateString()}
                    </span>
                  )}
                  {stage.estimatedDate && stage.status !== "completed" && (
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>
                      Est. {new Date(stage.estimatedDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {stage.notes && (
                  <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
                    {stage.notes}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
