import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ExternalLink, Check, X, MessageSquare } from "lucide-react";

// ---- Drop Designer pipeline (designer_jobs) — the primary review surface ----
interface DesignerJob {
  id: string;
  quoteId: string;
  token: string;
  club: string | null;
  designerName: string;
  briefMd: string | null;
  assetsBase: string | null;
  assetFiles: string[] | null;
  assignedAt: string | null;
  deadlineAt: string | null;
  pausedMs: number;
  pauseOpenAt: string | null;
  status: string; // in_progress | submitted | revision | approved | rejected
  submittedAt: string | null;
  revisions: number;
  qcBy: string | null;
  qcAt: string | null;
  qcOnTime: boolean | null;
  qcReason: string | null;
  qcFailedItems: number[] | null;
  practice: boolean;
}

const DROP_CHECKLIST = [
  "Sideline inner-collar lining + size tag correct",
  'Sideline "S" logo on left chest (composite)',
  "Club crest / wordmark placed correctly",
  "Design matches the brief (colours, pattern, garment, text)",
  "Consistent across all garments",
  "Cultural pattern check — accurate and respectful",
];

function slaChip(job: DesignerJob): { text: string; color: string; bg: string } {
  if (job.status === "approved") return { text: job.qcOnTime === false ? "APPROVED · LATE" : "APPROVED", color: "#22c55e", bg: "rgba(34,197,94,0.12)" };
  if (job.status === "revision") return { text: `REVISION ${job.revisions}`, color: "#f59e0b", bg: "rgba(245,158,11,0.12)" };
  if (job.pauseOpenAt) return { text: "⏸ CLOCK PAUSED", color: "rgba(255,255,255,0.5)", bg: "rgba(255,255,255,0.06)" };
  if (job.status === "submitted") return { text: "AWAITING QC", color: "#E3B75C", bg: "rgba(217,164,64,0.12)" };
  if (job.deadlineAt) {
    const left = new Date(job.deadlineAt).getTime() + job.pausedMs - Date.now();
    if (left < 0) return { text: "OVERDUE", color: "#ef4444", bg: "rgba(239,68,68,0.12)" };
    const h = Math.floor(left / 36e5);
    return { text: `IN PROGRESS · ${h}h left`, color: "#5FD9C7", bg: "rgba(43,184,163,0.12)" };
  }
  return { text: job.status.toUpperCase(), color: "rgba(255,255,255,0.5)", bg: "rgba(255,255,255,0.06)" };
}

export function DropsSection() {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const [reason, setReason] = useState("");

  const { data: jobs, isLoading } = useQuery<DesignerJob[]>({
    queryKey: ["/api/admin/designer-jobs"],
    refetchInterval: 60_000,
  });

  const qcMutation = useMutation({
    mutationFn: async ({ quoteId, action, failedItems, reason }: { quoteId: string; action: "approve" | "reject"; failedItems?: number[]; reason?: string }) => {
      const res = await apiRequest("POST", `/api/admin/designer-jobs/${quoteId}/qc`, { action, by: "Romero", failedItems, reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/designer-jobs"] });
      setOpenId(null); setChecked({}); setFailed({}); setReason("");
    },
  });

  const active = (jobs || []).filter((j) => j.status !== "approved");
  const done = (jobs || []).filter((j) => j.status === "approved");
  const allChecked = DROP_CHECKLIST.every((_, i) => checked[i]);
  const failedList = DROP_CHECKLIST.map((_, i) => i + 1).filter((n) => failed[n - 1]);

  if (isLoading) return <div style={{ padding: "20px", color: "rgba(255,255,255,0.3)" }}>Loading drops…</div>;

  return (
    <div style={{ marginBottom: "40px" }}>
      {!active.length ? (
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "24px", color: "rgba(255,255,255,0.4)", fontSize: "14px" }}>
          No drops in flight. New jobs appear here the moment a brief is assigned.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {active.map((job) => {
            const chip = slaChip(job);
            return (
              <div key={job.id} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <p style={{ fontSize: "15px", color: "#fff", fontWeight: 600 }}>
                      {job.club || job.quoteId}
                      {job.practice && <span style={{ marginLeft: "8px", fontSize: "10px", letterSpacing: "0.05em", padding: "2px 8px", borderRadius: "4px", background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>PRACTICE</span>}
                    </p>
                    <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>
                      {job.quoteId} &middot; {job.designerName}
                      {job.submittedAt && <> &middot; submitted {new Date(job.submittedAt).toLocaleString("en-NZ")}</>}
                      {job.deadlineAt && !job.submittedAt && <> &middot; due {new Date(new Date(job.deadlineAt).getTime() + job.pausedMs).toLocaleString("en-NZ")}</>}
                    </p>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", padding: "4px 10px", borderRadius: "5px", color: chip.color, background: chip.bg }}>{chip.text}</span>
                  <a href={`/job/${job.token}`} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.4)", padding: "4px" }} title="Open the designer's job page">
                    <ExternalLink size={16} />
                  </a>
                </div>

                {job.qcReason && job.status === "revision" && (
                  <p style={{ marginTop: "10px", fontSize: "12.5px", color: "#f59e0b" }}>
                    Rejected (items {(job.qcFailedItems || []).join(", ")}): {job.qcReason}
                    {job.revisions >= 2 && <b> — second rejection: decide re-brief vs reassign.</b>}
                  </p>
                )}

                <div style={{ marginTop: "14px" }}>
                  {openId === job.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {DROP_CHECKLIST.map((item, i) => (
                          <label key={i} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: checked[i] ? "#22c55e" : "rgba(255,255,255,0.6)", cursor: "pointer" }}>
                            <input type="checkbox" checked={!!checked[i]} onChange={(e) => setChecked({ ...checked, [i]: e.target.checked })} />
                            <span style={{ flex: 1 }}>{i + 1}. {item}</span>
                            <label style={{ fontSize: "11px", color: failed[i] ? "#ef4444" : "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                              <input type="checkbox" checked={!!failed[i]} onChange={(e) => setFailed({ ...failed, [i]: e.target.checked })} /> failed
                            </label>
                          </label>
                        ))}
                      </div>
                      <textarea
                        placeholder="Reject reason (required for reject — it trains the engine)…"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        style={{ width: "100%", maxWidth: "500px", padding: "10px 12px", fontSize: "13px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff", outline: "none", resize: "vertical", minHeight: "50px" }}
                      />
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button
                          onClick={() => qcMutation.mutate({ quoteId: job.quoteId, action: "approve" })}
                          disabled={qcMutation.isPending || !allChecked}
                          title={allChecked ? "Approve — QC pass" : "Tick every checklist item to enable approve"}
                          style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 600, background: allChecked ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)", color: allChecked ? "#22c55e" : "rgba(255,255,255,0.25)", border: `1px solid ${allChecked ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)"}`, borderRadius: "6px", cursor: allChecked ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: "6px" }}
                        >
                          <Check size={14} /> Approve (QC pass{allChecked ? "" : " — tick all 6"})
                        </button>
                        <button
                          onClick={() => qcMutation.mutate({ quoteId: job.quoteId, action: "reject", failedItems: failedList, reason })}
                          disabled={qcMutation.isPending || !failedList.length || !reason.trim()}
                          title="Mark which items failed + a reason — evidence-based rejection"
                          style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 600, background: "rgba(239,68,68,0.15)", color: failedList.length && reason.trim() ? "#ef4444" : "rgba(239,68,68,0.4)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "6px", cursor: failedList.length && reason.trim() ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: "6px" }}
                        >
                          <X size={14} /> Reject ({failedList.length ? `items ${failedList.join(",")}` : "mark failed items"})
                        </button>
                        <button onClick={() => { setOpenId(null); setChecked({}); setFailed({}); setReason(""); }} style={{ padding: "8px 16px", fontSize: "13px", color: "rgba(255,255,255,0.4)", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", cursor: "pointer" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    job.status === "submitted" && (
                      <button
                        onClick={() => { setOpenId(job.id); setChecked({}); setFailed({}); setReason(""); }}
                        style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 500, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        <MessageSquare size={14} /> Review against checklist
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {done.length > 0 && (
        <p style={{ marginTop: "12px", fontSize: "12px", color: "rgba(255,255,255,0.35)" }}>
          {done.length} approved drop{done.length !== 1 ? "s" : ""}: {done.map((j) => `${j.quoteId}${j.qcOnTime === false ? " (late)" : ""}`).join(" · ")}
        </p>
      )}
    </div>
  );
}
