import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import {
  ArrowLeft,
  Mail,
  Phone,
  User,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Video,
  Image,
  ExternalLink,
  Tag,
  ListTodo,
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
  logoUrl: string | null;
  notes: string | null;
  status: string;
  errorMessage: string | null;
  videoUrl: string | null;
  voiceoverUrl: string | null;
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
  thumbnailUrl: string | null;
  status: string;
  errorMessage: string | null;
  generationTimeMs: number | null;
  createdAt: string;
}

export default function AdminMockupDetail() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ request: MockupRequest; designs: MockupDesign[] }>({
    queryKey: [`/api/admin/mockups/${params.id}`],
    enabled: !!params.id,
    refetchInterval: (query) => {
      const status = query.state.data?.request?.status;
      if (status === "pending" || status === "generating") return 3000;
      return false;
    },
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/mockups/${params.id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error("Retry failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/admin/mockups/${params.id}`] }),
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
          Loading...
        </div>
      </AdminLayout>
    );
  }

  if (!data) {
    return (
      <AdminLayout>
        <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
          Mockup request not found
        </div>
      </AdminLayout>
    );
  }

  const { request: req, designs } = data;

  const genTime =
    req.generationStartedAt && req.generationCompletedAt
      ? ((new Date(req.generationCompletedAt).getTime() - new Date(req.generationStartedAt).getTime()) / 1000).toFixed(1)
      : null;

  return (
    <AdminLayout>
      <div>
        {/* Header */}
        <div style={{ marginBottom: "24px" }}>
          <Link href="/admin/mockups">
            <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
              <ArrowLeft size={14} /> Back to Mockups
            </span>
          </Link>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ display: "flex", gap: "3px" }}>
                <div style={{ width: 28, height: 28, borderRadius: "6px", background: req.primaryColor, border: "1px solid rgba(255,255,255,0.1)" }} />
                {req.secondaryColor && <div style={{ width: 28, height: 28, borderRadius: "6px", background: req.secondaryColor, border: "1px solid rgba(255,255,255,0.1)" }} />}
                {req.accentColor && <div style={{ width: 28, height: 28, borderRadius: "6px", background: req.accentColor, border: "1px solid rgba(255,255,255,0.1)" }} />}
              </div>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#fff" }}>{req.teamName}</h1>
                <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", textTransform: "capitalize" }}>{req.sport}</p>
              </div>
            </div>
            {req.status === "failed" && (
              <button
                onClick={() => retryMutation.mutate()}
                disabled={retryMutation.isPending}
                style={{
                  padding: "10px 20px", background: "#3b82f6", color: "#fff", border: "none",
                  borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "8px",
                }}
              >
                <RefreshCw size={16} /> Retry Pipeline
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "24px" }}>
          {/* Main content — designs */}
          <div>
            {/* Status banner */}
            {req.status === "generating" && (
              <div style={{
                padding: "16px 20px", background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)",
                borderRadius: "10px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px",
              }}>
                <Loader2 size={18} color="#3b82f6" style={{ animation: "spin 1s linear infinite" }} />
                <p style={{ fontSize: "14px", color: "#3b82f6" }}>Generating mockup designs...</p>
              </div>
            )}

            {req.status === "failed" && req.errorMessage && (
              <div style={{
                padding: "16px 20px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)",
                borderRadius: "10px", marginBottom: "20px",
              }}>
                <p style={{ fontSize: "14px", color: "#ef4444", fontWeight: 600 }}>Pipeline Failed</p>
                <p style={{ fontSize: "13px", color: "rgba(239,68,68,0.7)", marginTop: "4px" }}>{req.errorMessage}</p>
              </div>
            )}

            {/* Design grid */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px",
            }}>
              {designs.map((design) => (
                <div key={design.id} style={{
                  background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px",
                  overflow: "hidden",
                }}>
                  {/* Image */}
                  <div style={{
                    aspectRatio: "4/3", background: "#0a0a0a",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    position: "relative",
                  }}>
                    {design.imageUrl ? (
                      <a href={design.imageUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", width: "100%", height: "100%" }}>
                        <img
                          src={design.imageUrl}
                          alt={`Design ${design.designNumber}`}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </a>
                    ) : design.status === "generating" ? (
                      <Loader2 size={24} color="rgba(255,255,255,0.2)" style={{ animation: "spin 1s linear infinite" }} />
                    ) : design.status === "failed" ? (
                      <XCircle size={24} color="#ef4444" />
                    ) : (
                      <Image size={24} color="rgba(255,255,255,0.1)" />
                    )}
                  </div>
                  {/* Info */}
                  <div style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <p style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>Design {design.designNumber}</p>
                      <span style={{
                        fontSize: "11px", padding: "2px 8px", borderRadius: "4px",
                        background: design.status === "completed" ? "rgba(34,197,94,0.1)" : design.status === "failed" ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.06)",
                        color: design.status === "completed" ? "#22c55e" : design.status === "failed" ? "#ef4444" : "rgba(255,255,255,0.4)",
                        textTransform: "capitalize",
                      }}>
                        {design.status}
                      </span>
                    </div>
                    {design.generationTimeMs && (
                      <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>
                        Generated in {(design.generationTimeMs / 1000).toFixed(1)}s
                      </p>
                    )}
                    {design.errorMessage && (
                      <p style={{ fontSize: "11px", color: "#ef4444", marginTop: "4px" }}>{design.errorMessage}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Video */}
            {req.videoUrl && (
              <div style={{
                marginTop: "20px", background: "#111", border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "12px", padding: "20px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <Video size={16} color="#8b5cf6" />
                  <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#fff" }}>Presentation Video</h3>
                </div>
                <video
                  src={req.videoUrl}
                  controls
                  style={{ width: "100%", borderRadius: "8px", background: "#000" }}
                />
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Contact info */}
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px" }}>
              <h3 style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>
                Contact
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <User size={14} color="rgba(255,255,255,0.3)" />
                  <span style={{ fontSize: "13px", color: "#fff" }}>{req.contactName}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Mail size={14} color="rgba(255,255,255,0.3)" />
                  <a href={`mailto:${req.contactEmail}`} style={{ fontSize: "13px", color: "#3b82f6" }}>{req.contactEmail}</a>
                </div>
                {req.contactPhone && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Phone size={14} color="rgba(255,255,255,0.3)" />
                    <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>{req.contactPhone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Status + timing */}
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px" }}>
              <h3 style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>
                Status
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Status</span>
                  <span style={{ fontSize: "12px", color: "#fff", textTransform: "capitalize" }}>{req.status.replace(/_/g, " ")}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Created</span>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>
                    {new Date(req.createdAt).toLocaleString()}
                  </span>
                </div>
                {genTime && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Generation Time</span>
                    <span style={{ fontSize: "12px", color: "#22c55e", fontWeight: 600 }}>{genTime}s</span>
                  </div>
                )}
                {req.emailSentAt && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Email Sent</span>
                    <span style={{ fontSize: "12px", color: "#22c55e" }}>
                      {new Date(req.emailSentAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Integrations */}
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px" }}>
              <h3 style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>
                Integrations
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Tag size={14} color={req.ghlTagsSynced ? "#22c55e" : "rgba(255,255,255,0.2)"} />
                  <span style={{ fontSize: "12px", color: req.ghlTagsSynced ? "#22c55e" : "rgba(255,255,255,0.4)" }}>
                    GHL Tags {req.ghlTagsSynced ? "Synced" : "Not synced"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <ListTodo size={14} color={req.clickupTaskId ? "#22c55e" : "rgba(255,255,255,0.2)"} />
                  <span style={{ fontSize: "12px", color: req.clickupTaskId ? "#22c55e" : "rgba(255,255,255,0.4)" }}>
                    ClickUp Task {req.clickupTaskId ? "Created" : "Not created"}
                  </span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {req.notes && (
              <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px" }}>
                <h3 style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                  Notes
                </h3>
                <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>{req.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </AdminLayout>
  );
}
