import { Check, Clock, Circle, Package, Printer, Shield, Box, Truck, Home, FileCheck, Paintbrush } from "lucide-react";
import "../styles/horizon-theme-override.css";
import "../styles/horizon-components.css";

interface ProductionStage {
  id: string;
  stage: string;
  status: string; // pending, in_progress, completed, skipped
  enteredAt: string | null;
  completedAt: string | null;
  notes: string | null;
  estimatedDate: string | null;
}

/**
 * 8-Stage Order Pipeline (Horizon Integration)
 * 1. Order Received
 * 2. Design Review
 * 3. Design Confirmed
 * 4. In Production
 * 5. Print / Embroidery
 * 6. Quality Check
 * 7. Packing
 * 8. Shipped
 */
const STAGE_CONFIG: Record<string, { label: string; icon: any; order: number }> = {
  // Bulk path
  order_received: { label: "Order Received", icon: Package, order: 1 },
  design_review: { label: "Design Review", icon: Paintbrush, order: 2 },
  design_confirmed: { label: "Design Confirmed", icon: FileCheck, order: 3 },
  in_production: { label: "In Production", icon: Circle, order: 4 },
  printing: { label: "Print / Embroidery", icon: Printer, order: 5 },
  quality_check: { label: "Quality Check", icon: Shield, order: 6 },
  packing: { label: "Packing", icon: Box, order: 7 },
  shipped: { label: "Shipped", icon: Truck, order: 8 },
  delivered: { label: "Delivered", icon: Home, order: 9 },
  // Sample path
  sample_produced: { label: "Sample Produced", icon: Package, order: 4 },
  sample_dispatched: { label: "Sample Dispatched", icon: Truck, order: 5 },
  sample_received_by_client: { label: "Sample Received", icon: Home, order: 6 },
  sample_approved_by_client: { label: "Sample Approved", icon: FileCheck, order: 7 },
};

function StageIcon({ stage, status }: { stage: string; status: string }) {
  const config = STAGE_CONFIG[stage] || { icon: Circle };
  const Icon = config.icon;

  if (status === "completed") {
    return (
      <div className="stage-indicator" style={{ backgroundColor: "var(--color-primary)", borderColor: "var(--color-primary)" }}>
        <Check size={20} style={{ color: "#0a0a0a" }} />
      </div>
    );
  }

  if (status === "in_progress") {
    return (
      <div className="stage-indicator" style={{
        backgroundColor: "var(--color-primary)",
        borderColor: "var(--color-primary)",
        animation: "pulse 2s ease-in-out infinite",
      }}>
        <Icon size={20} style={{ color: "#0a0a0a" }} />
      </div>
    );
  }

  return (
    <div className="stage-indicator">
      <Icon size={20} style={{ color: "var(--color-text-tertiary)" }} />
    </div>
  );
}

export function ProductionTracker({ stages }: { stages: ProductionStage[] }) {
  if (stages.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <Clock size={24} style={{ margin: "0 auto 12px", color: "var(--color-text-tertiary)" }} />
        <p className="text-tertiary" style={{ fontSize: "14px" }}>
          Production pipeline not yet started
        </p>
      </div>
    );
  }

  const currentStage = stages.find(s => s.status === "in_progress");
  const completedCount = stages.filter(s => s.status === "completed").length;
  const progress = Math.round((completedCount / stages.length) * 100);

  return (
    <div className="card">
      {/* Header with progress */}
      <div style={{ paddingBottom: "var(--spacing-lg)", borderBottom: "var(--border-width-1) solid var(--color-border)", marginBottom: "var(--spacing-lg)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--spacing-md)" }}>
          <h3 style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-foreground)", margin: 0 }}>
            Production Progress
          </h3>
          <span className="text-secondary" style={{ fontSize: "13px" }}>
            {progress}% complete
          </span>
        </div>
        {/* Progress bar */}
        <div style={{ height: "4px", background: "var(--color-input-background)", borderRadius: "2px", overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${progress}%`,
            background: "var(--color-primary)",
            borderRadius: "2px",
            transition: "width 0.5s ease-out",
          }} />
        </div>
        {currentStage && (
          <p className="text-tertiary" style={{ fontSize: "12px", marginTop: "var(--spacing-md)", margin: "var(--spacing-md) 0 0" }}>
            Current: {STAGE_CONFIG[currentStage.stage]?.label || currentStage.stage}
          </p>
        )}
      </div>

      {/* 8-Stage Pipeline Tracker */}
      <div className="order-tracker">
        {stages.map((stage, i) => {
          const config = STAGE_CONFIG[stage.stage] || { label: stage.stage };
          const stageNumber = config.order || (i + 1);
          const isCompleted = stage.status === "completed";
          const isActive = stage.status === "in_progress";

          return (
            <div
              key={stage.id}
              className={`tracker-stage ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}`}
            >
              <div className="tracker-indicator">
                {isCompleted ? (
                  <Check size={18} style={{ color: "#0a0a0a" }} />
                ) : (
                  stageNumber
                )}
              </div>
              <div className="tracker-label" title={config.label}>
                {config.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Timeline details below tracker */}
      <div style={{ marginTop: "var(--spacing-xl)", paddingTop: "var(--spacing-lg)", borderTop: "var(--border-width-1) solid var(--color-border)" }}>
        {stages.map((stage) => {
          const config = STAGE_CONFIG[stage.stage] || { label: stage.stage };

          return (
            <div key={stage.id} style={{ marginBottom: "var(--spacing-md)", paddingBottom: "var(--spacing-md)", borderBottom: "var(--border-width-1) solid var(--color-border)" }}>
              <p style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, color: "var(--color-foreground)", margin: "0 0 var(--spacing-xs)" }}>
                {config.label}
              </p>
              <div style={{ display: "flex", gap: "var(--spacing-lg)", flexWrap: "wrap" }}>
                {stage.status === "completed" && stage.completedAt && (
                  <span className="text-success" style={{ fontSize: "11px" }}>
                    ✓ Completed {new Date(stage.completedAt).toLocaleDateString()}
                  </span>
                )}
                {stage.status === "in_progress" && stage.enteredAt && (
                  <span className="text-primary" style={{ fontSize: "11px" }}>
                    → Started {new Date(stage.enteredAt).toLocaleDateString()}
                  </span>
                )}
                {stage.estimatedDate && stage.status !== "completed" && (
                  <span className="text-tertiary" style={{ fontSize: "11px" }}>
                    Est. {new Date(stage.estimatedDate).toLocaleDateString()}
                  </span>
                )}
              </div>
              {stage.notes && (
                <p className="text-secondary" style={{ fontSize: "12px", marginTop: "var(--spacing-sm)", margin: "var(--spacing-sm) 0 0" }}>
                  {stage.notes}
                </p>
              )}
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
