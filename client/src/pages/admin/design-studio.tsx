import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { DropsSection } from "@/components/drops-section";

interface DesignerJob {
  quoteId: string; club: string | null; designerName: string; status: string;
  deadlineAt: string | null; pausedMs: number; submittedAt: string | null;
  qcOnTime: boolean | null; token: string | null; practice: boolean;
}

const card = { background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "16px 18px" } as const;

export default function AdminDesignStudio() {
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
    </AdminLayout>
  );
}
