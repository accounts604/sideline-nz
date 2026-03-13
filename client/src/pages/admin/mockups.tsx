import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Wand2,
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Trash2,
  ExternalLink,
  Palette,
  Video,
} from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";

interface MockupRequest {
  id: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  teamName: string;
  sport: string;
  primaryColor: string;
  secondaryColor: string | null;
  accentColor: string | null;
  status: string;
  errorMessage: string | null;
  videoUrl: string | null;
  emailSentAt: string | null;
  ghlTagsSynced: boolean;
  clickupTaskId: string | null;
  generationStartedAt: string | null;
  generationCompletedAt: string | null;
  createdAt: string;
}

interface MockupDesign {
  id: string;
  designNumber: number;
  prompt: string;
  imageUrl: string | null;
  status: string;
  generationTimeMs: number | null;
}

interface StatsData {
  total: number;
  pending: number;
  generating: number;
  sent: number;
  failed: number;
  avgGenerationTimeMs: number | null;
}

const STATUS_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  pending: { icon: Clock, color: "#f59e0b", label: "Pending" },
  generating: { icon: Loader2, color: "#3b82f6", label: "Generating" },
  designs_ready: { icon: Palette, color: "#8b5cf6", label: "Designs Ready" },
  video_ready: { icon: Video, color: "#6366f1", label: "Video Ready" },
  sent: { icon: Mail, color: "#22c55e", label: "Sent" },
  failed: { icon: XCircle, color: "#ef4444", label: "Failed" },
};

export default function AdminMockups() {
  const queryClient = useQueryClient();

  const { data: stats } = useQuery<StatsData>({
    queryKey: ["/api/admin/mockups/stats"],
  });

  const { data, isLoading } = useQuery<{ requests: MockupRequest[]; total: number }>({
    queryKey: ["/api/admin/mockups"],
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/mockups/${id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error("Retry failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mockups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mockups/stats"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/mockups/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mockups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mockups/stats"] });
    },
  });

  return (
    <AdminLayout>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff" }}>Mockup Engine</h1>
            <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>
              AI-generated uniform mockups — lead form to email in &lt;5 minutes
            </p>
          </div>
          <Link href="/get-mockup">
            <span style={{
              padding: "10px 20px", background: "#f97316", color: "#fff", borderRadius: "8px",
              fontSize: "14px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
            }}>
              <Wand2 size={16} /> View Lead Form
            </span>
          </Link>
        </div>

        {/* Stats cards */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "24px" }}>
            {[
              { label: "Total Requests", value: stats.total, color: "#fff" },
              { label: "Pending", value: stats.pending, color: "#f59e0b" },
              { label: "Generating", value: stats.generating, color: "#3b82f6" },
              { label: "Sent", value: stats.sent, color: "#22c55e" },
              { label: "Failed", value: stats.failed, color: "#ef4444" },
              {
                label: "Avg Time",
                value: stats.avgGenerationTimeMs
                  ? `${(stats.avgGenerationTimeMs / 1000).toFixed(0)}s`
                  : "—",
                color: "#8b5cf6",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px",
                  padding: "16px",
                }}
              >
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {stat.label}
                </p>
                <p style={{ fontSize: "24px", fontWeight: 700, color: stat.color, marginTop: "4px" }}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Requests list */}
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>All Requests</h3>
          </div>

          {isLoading ? (
            <div style={{ padding: "40px", textAlign: "center" }}>
              <Loader2 size={20} color="rgba(255,255,255,0.3)" style={{ animation: "spin 1s linear infinite" }} />
            </div>
          ) : !data?.requests?.length ? (
            <div style={{ padding: "40px", textAlign: "center" }}>
              <Wand2 size={24} color="rgba(255,255,255,0.15)" style={{ margin: "0 auto 8px" }} />
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)" }}>No mockup requests yet</p>
            </div>
          ) : (
            data.requests.map((req) => {
              const config = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
              const Icon = config.icon;
              const genTime =
                req.generationStartedAt && req.generationCompletedAt
                  ? Math.round(
                      (new Date(req.generationCompletedAt).getTime() -
                        new Date(req.generationStartedAt).getTime()) /
                        1000
                    )
                  : null;

              return (
                <div
                  key={req.id}
                  style={{
                    padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)",
                    display: "flex", alignItems: "center", gap: "16px",
                  }}
                >
                  {/* Color swatches */}
                  <div style={{ display: "flex", gap: "2px" }}>
                    <div style={{ width: 20, height: 20, borderRadius: "4px", background: req.primaryColor }} />
                    {req.secondaryColor && (
                      <div style={{ width: 20, height: 20, borderRadius: "4px", background: req.secondaryColor }} />
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <p style={{ fontSize: "14px", fontWeight: 600, color: "#fff" }}>{req.teamName}</p>
                      <span style={{
                        fontSize: "11px", padding: "2px 6px", borderRadius: "4px",
                        background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)",
                        textTransform: "capitalize",
                      }}>
                        {req.sport}
                      </span>
                    </div>
                    <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>
                      {req.contactName} &middot; {req.contactEmail}
                    </p>
                  </div>

                  {/* Generation time */}
                  {genTime !== null && (
                    <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
                      {genTime}s
                    </span>
                  )}

                  {/* Status badge */}
                  <span style={{
                    fontSize: "11px", fontWeight: 600, padding: "4px 10px", borderRadius: "6px",
                    background: `${config.color}15`, color: config.color,
                    display: "flex", alignItems: "center", gap: "4px",
                  }}>
                    <Icon size={12} />
                    {config.label}
                  </span>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "8px" }}>
                    {req.status === "failed" && (
                      <button
                        onClick={() => retryMutation.mutate(req.id)}
                        style={{
                          background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)",
                          borderRadius: "6px", padding: "6px", cursor: "pointer", color: "#3b82f6",
                        }}
                        title="Retry"
                      >
                        <RefreshCw size={14} />
                      </button>
                    )}
                    <Link href={`/admin/mockups/${req.id}`}>
                      <span style={{
                        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "6px", padding: "6px", cursor: "pointer", color: "rgba(255,255,255,0.5)",
                        display: "inline-flex",
                      }}>
                        <ExternalLink size={14} />
                      </span>
                    </Link>
                    <button
                      onClick={() => {
                        if (confirm("Delete this mockup request?")) {
                          deleteMutation.mutate(req.id);
                        }
                      }}
                      style={{
                        background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.1)",
                        borderRadius: "6px", padding: "6px", cursor: "pointer", color: "#ef4444",
                      }}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
