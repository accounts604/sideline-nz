import { Shield, CheckCircle, XCircle, AlertTriangle, Clock, ExternalLink } from "lucide-react";

interface QualityCheck {
  id: string;
  orderId: string;
  productionStageId: string | null;
  checkType: string;
  status: string; // pending, passed, failed, conditional
  checkedBy: string | null;
  notes: string | null;
  photoUrls: string[] | null;
  issues: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

const CHECK_TYPE_LABELS: Record<string, string> = {
  pre_production: "Pre-Production Check",
  mid_production: "Mid-Production Check",
  final: "Final Inspection",
  packaging: "Packaging Check",
};

const STATUS_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  pending: { icon: Clock, color: "#f59e0b", label: "Pending" },
  passed: { icon: CheckCircle, color: "#22c55e", label: "Passed" },
  failed: { icon: XCircle, color: "#ef4444", label: "Failed" },
  conditional: { icon: AlertTriangle, color: "#f97316", label: "Conditional" },
};

export function QualityChecksView({ checks, isAdmin }: { checks: QualityCheck[]; isAdmin?: boolean }) {
  if (checks.length === 0) {
    return (
      <div style={{
        background: "#111", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "12px", padding: "24px", textAlign: "center",
      }}>
        <Shield size={24} color="rgba(255,255,255,0.15)" style={{ margin: "0 auto 8px" }} />
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)" }}>
          No quality checks recorded yet
        </p>
      </div>
    );
  }

  const passedCount = checks.filter(c => c.status === "passed").length;
  const failedCount = checks.filter(c => c.status === "failed").length;

  return (
    <div style={{
      background: "#111", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "12px", overflow: "hidden",
    }}>
      <div style={{
        padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>
          Quality Control ({checks.length})
        </h3>
        <div style={{ display: "flex", gap: "12px", fontSize: "12px" }}>
          {passedCount > 0 && (
            <span style={{ color: "#22c55e", display: "flex", alignItems: "center", gap: "4px" }}>
              <CheckCircle size={12} /> {passedCount} passed
            </span>
          )}
          {failedCount > 0 && (
            <span style={{ color: "#ef4444", display: "flex", alignItems: "center", gap: "4px" }}>
              <XCircle size={12} /> {failedCount} failed
            </span>
          )}
        </div>
      </div>

      {checks.map((check) => {
        const config = STATUS_CONFIG[check.status] || STATUS_CONFIG.pending;
        const Icon = config.icon;

        return (
          <div key={check.id} style={{
            padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <div style={{
                width: 28, height: 28, borderRadius: "6px",
                background: `${config.color}15`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon size={14} color={config.color} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "13px", fontWeight: 500, color: "#fff" }}>
                  {CHECK_TYPE_LABELS[check.checkType] || check.checkType}
                </p>
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>
                  {new Date(check.createdAt).toLocaleString()}
                </p>
              </div>
              <span style={{
                fontSize: "11px", fontWeight: 600, padding: "3px 8px",
                borderRadius: "4px", textTransform: "uppercase",
                background: `${config.color}15`, color: config.color,
              }}>
                {config.label}
              </span>
            </div>

            {check.notes && (
              <p style={{
                fontSize: "12px", color: "rgba(255,255,255,0.5)",
                marginLeft: "40px", marginBottom: "6px",
              }}>
                {check.notes}
              </p>
            )}

            {check.issues && (
              <div style={{
                marginLeft: "40px", padding: "8px 12px",
                background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.1)",
                borderRadius: "6px", marginBottom: "6px",
              }}>
                <p style={{ fontSize: "12px", color: "#ef4444" }}>
                  Issue: {check.issues}
                </p>
                {check.resolvedAt && (
                  <p style={{ fontSize: "11px", color: "rgba(34,197,94,0.7)", marginTop: "4px" }}>
                    Resolved {new Date(check.resolvedAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {check.photoUrls && Array.isArray(check.photoUrls) && check.photoUrls.length > 0 && (
              <div style={{ marginLeft: "40px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {(check.photoUrls as string[]).map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      width: 60, height: 60, borderRadius: "6px", overflow: "hidden",
                      border: "1px solid rgba(255,255,255,0.08)", display: "block",
                      position: "relative",
                    }}
                  >
                    <img src={url} alt={`QC photo ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <div style={{
                      position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      opacity: 0, transition: "opacity 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                    >
                      <ExternalLink size={14} color="#fff" />
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
