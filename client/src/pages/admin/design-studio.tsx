import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { FileText, ExternalLink, Check, X, MessageSquare } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { DropsSection } from "@/components/drops-section";

interface PendingDesign {
  id: string;
  orderId: string;
  userId: string;
  label: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  status: string;
  version: number;
  createdAt: string;
  orderNumber?: string;
  customerEmail?: string;
}

interface DesignerJob {
  quoteId: string; club: string | null; designerName: string; status: string;
  deadlineAt: string | null; pausedMs: number; submittedAt: string | null;
  qcOnTime: boolean | null; token: string | null; practice: boolean;
}

const card = { background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "16px 18px" } as const;

export default function AdminDesignStudio() {
  const queryClient = useQueryClient();
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const { data: designs, isLoading } = useQuery<PendingDesign[]>({
    queryKey: ["/api/admin/designs/pending"],
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ orderId, designFileId, action, comment }: { orderId: string; designFileId: string; action: string; comment?: string }) => {
      const res = await apiRequest("POST", `/api/admin/orders/${orderId}/design-review`, { designFileId, action, comment });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/designs/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      setReviewingId(null);
      setComment("");
    },
  });

  const { data: jobs } = useQuery<DesignerJob[]>({ queryKey: ["/api/admin/designer-jobs"], refetchInterval: 60_000 });
  const all = jobs || [];

  const inProgress = all.filter((j) => j.status === "in_progress" || j.status === "revision").length;
  const awaiting = all.filter((j) => j.status === "submitted").length;
  const overdue = all.filter((j) => j.status !== "approved" && j.deadlineAt && (new Date(j.deadlineAt).getTime() + j.pausedMs) < Date.now()).length;
  const approved = all.filter((j) => j.status === "approved");
  const onTimeApproved = approved.filter((j) => j.qcOnTime !== false);
  // Flat $15/drop for approved on-time drops (bonuses tally in the Friday digest).
  const owedEstimate = onTimeApproved.length * 15;

  // Designer roster: throughput + on-time %
  const byDesigner: Record<string, { total: number; approved: number; onTime: number }> = {};
  for (const j of all) {
    const d = (byDesigner[j.designerName] ||= { total: 0, approved: 0, onTime: 0 });
    d.total++;
    if (j.status === "approved") { d.approved++; if (j.qcOnTime !== false) d.onTime++; }
  }

  const stat = (n: number | string, label: string, accent?: string) => (
    <div style={card}>
      <div style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "-0.02em", color: accent || "#fff", fontVariantNumeric: "tabular-nums" }}>{n}</div>
      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>{label}</div>
    </div>
  );

  return (
    <AdminLayout>
      <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>Design Studio</h1>
      <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", marginBottom: "24px" }}>
        Every drop in flight, its designer and deadline, and your one-tap QC. Freelancers work from their own job link; you approve here.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "14px", marginBottom: "28px" }}>
        {stat(inProgress, "in progress")}
        {stat(awaiting, "awaiting your QC", awaiting ? "#E3B75C" : undefined)}
        {stat(overdue, "overdue", overdue ? "#ef4444" : undefined)}
        {stat(approved.length, "approved")}
        {stat(`$${owedEstimate}`, "est. drop pay owed", "#5FD9C7")}
      </div>

      {/* The live drops queue + checklist-gated QC — the same surface as Design Review */}
      <h2 style={{ fontSize: "16px", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: "12px" }}>Drops</h2>
      <DropsSection />

      {/* Designer roster */}
      {Object.keys(byDesigner).length > 0 && (
        <div style={{ marginTop: "8px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: "12px" }}>Designers</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {Object.entries(byDesigner).map(([name, d]) => (
              <div key={name} style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "15px", fontWeight: 600, color: "#fff", textTransform: "capitalize" }}>{name}</span>
                <span style={{ fontSize: "12.5px", color: "rgba(255,255,255,0.5)" }}>
                  {d.total} assigned · {d.approved} approved · {d.approved ? Math.round((d.onTime / d.approved) * 100) : 100}% on time
                </span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", marginTop: "10px" }}>
            Pay: $15 per approved on-time drop + $30 store bonus at 20 orders. Bonuses and the weekly payout tally land in the Friday digest.
          </p>
        </div>
      )}
      <h2 style={{ fontSize: "16px", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: "12px" }}>
        Legacy uploads ({designs?.length ?? 0} pending)
      </h2>

      {isLoading ? (
        <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Loading...</div>
      ) : !designs?.length ? (
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "60px 40px", textAlign: "center" }}>
          <Check size={48} color="rgba(34,197,94,0.4)" style={{ marginBottom: "16px" }} />
          <p style={{ fontSize: "16px", color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>All caught up!</p>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)", marginTop: "8px" }}>No pending designs to review.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {designs.map((design) => (
            <div
              key={design.id}
              style={{
                background: "#111",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "12px",
                padding: "20px 24px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                <FileText size={20} color="rgba(255,255,255,0.4)" />
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <p style={{ fontSize: "15px", color: "#fff", fontWeight: 500 }}>{design.fileName}</p>
                  <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>
                    {design.label} &middot; v{design.version}
                    {design.fileSize && <> &middot; {(design.fileSize / 1024).toFixed(0)} KB</>}
                    &middot; {new Date(design.createdAt).toLocaleString()}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Link href={`/admin/orders/${design.orderId}`}>
                    <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: "4px 10px", background: "rgba(255,255,255,0.04)", borderRadius: "4px" }}>
                      {design.orderNumber || "Order"}
                    </span>
                  </Link>
                  {design.customerEmail && (
                    <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>{design.customerEmail}</span>
                  )}
                  <a href={design.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.4)", padding: "4px" }}>
                    <ExternalLink size={16} />
                  </a>
                </div>
              </div>

              {/* Preview for images */}
              {design.mimeType?.startsWith("image/") && (
                <div style={{ marginTop: "16px", marginLeft: "36px" }}>
                  <img
                    src={design.fileUrl}
                    alt={design.fileName}
                    style={{ maxWidth: "400px", maxHeight: "300px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)" }}
                  />
                </div>
              )}

              {/* Review actions */}
              <div style={{ marginTop: "16px", marginLeft: "36px" }}>
                {reviewingId === design.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <textarea
                      placeholder="Add a comment (optional for approve, recommended for reject)..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      style={{
                        width: "100%",
                        maxWidth: "500px",
                        padding: "10px 12px",
                        fontSize: "13px",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "6px",
                        color: "#fff",
                        outline: "none",
                        resize: "vertical",
                        minHeight: "60px",
                      }}
                    />
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => reviewMutation.mutate({ orderId: design.orderId, designFileId: design.id, action: "approved", comment })}
                        disabled={reviewMutation.isPending}
                        style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 600, background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        <Check size={14} /> Approve
                      </button>
                      <button
                        onClick={() => reviewMutation.mutate({ orderId: design.orderId, designFileId: design.id, action: "rejected", comment })}
                        disabled={reviewMutation.isPending}
                        style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 600, background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        <X size={14} /> Reject
                      </button>
                      <button
                        onClick={() => { setReviewingId(null); setComment(""); }}
                        style={{ padding: "8px 16px", fontSize: "13px", color: "rgba(255,255,255,0.4)", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", cursor: "pointer" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setReviewingId(design.id)}
                    style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 500, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <MessageSquare size={14} /> Review
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
