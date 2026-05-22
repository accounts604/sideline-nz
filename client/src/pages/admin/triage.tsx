import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AdminLayout } from "@/components/admin-layout";
import type { TriageResult, TriageState } from "@shared/triage";

interface TriageRow {
  id: string;
  orderNumber: string;
  poReference: string | null;
  accountName: string | null;
  pipelineStage: string | null;
  status: string | null;
  dueDate: string | null;
  createdAt: string;
  triage: TriageResult;
}

interface TriageResponse {
  ok: boolean;
  generatedAt: string;
  counts: Partial<Record<TriageState, number>>;
  rows: TriageRow[];
}

const STATE_STYLES: Record<TriageState, { label: string; bg: string; fg: string; border: string }> = {
  overdue:           { label: "Overdue",          bg: "rgba(239,68,68,0.14)",  fg: "#fca5a5", border: "rgba(239,68,68,0.35)" },
  at_risk:           { label: "At risk",          bg: "rgba(249,115,22,0.14)", fg: "#fdba74", border: "rgba(249,115,22,0.35)" },
  awaiting_kickoff:  { label: "Awaiting kickoff", bg: "rgba(59,130,246,0.12)", fg: "#93c5fd", border: "rgba(59,130,246,0.3)" },
  on_track:          { label: "On track",         bg: "rgba(34,197,94,0.12)",  fg: "#86efac", border: "rgba(34,197,94,0.3)" },
  no_due_date:       { label: "No due date",      bg: "rgba(148,163,184,0.12)", fg: "#cbd5e1", border: "rgba(148,163,184,0.3)" },
};

const STATE_ORDER: TriageState[] = ["overdue", "at_risk", "awaiting_kickoff", "on_track", "no_due_date"];

export default function AdminTriage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<TriageResponse>({
    queryKey: ["/api/admin/orders/triage"],
    refetchInterval: 60_000,
  });

  return (
    <AdminLayout>
      <div style={{ padding: "32px 36px", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "26px", fontWeight: 700, margin: 0, letterSpacing: "-0.4px" }}>Production Triage</h1>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", margin: "6px 0 0" }}>
              Active orders against the 35-day build calendar. Auto-refreshes every 60s.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            style={{
              padding: "8px 16px", fontSize: "12px", fontWeight: 600,
              background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)",
              border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", cursor: "pointer",
            }}
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {/* Status counters */}
        {data && (
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "24px" }}>
            {STATE_ORDER.map((s) => {
              const count = data.counts[s] || 0;
              const styles = STATE_STYLES[s];
              return (
                <div key={s} style={{
                  padding: "10px 14px", borderRadius: "8px",
                  background: styles.bg, border: `1px solid ${styles.border}`,
                  minWidth: "120px",
                }}>
                  <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.8px", color: styles.fg, marginBottom: "4px", fontWeight: 600 }}>
                    {styles.label}
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 700, color: "#fff", lineHeight: 1 }}>{count}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Action Required — orthogonal bucket-based view. What needs ops attention TODAY. */}
        <ActionRequiredPanel />

        {isLoading && <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>}
        {error && <p style={{ color: "#fca5a5" }}>Failed to load triage: {String((error as any)?.message || error)}</p>}

        {/* Table */}
        {data && data.rows.length === 0 && (
          <p style={{ color: "rgba(255,255,255,0.5)", padding: "24px 0" }}>No active orders. Nothing to triage.</p>
        )}

        {data && data.rows.length > 0 && (
          <div style={{
            background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                  <Th>Status</Th>
                  <Th>PO ref</Th>
                  <Th>Account</Th>
                  <Th>Stage</Th>
                  <Th right>Due</Th>
                  <Th right>Days</Th>
                  <Th>Reason</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const styles = STATE_STYLES[r.triage.state];
                  return (
                    <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                      <Td>
                        <span style={{
                          display: "inline-block", padding: "3px 10px", borderRadius: "12px",
                          background: styles.bg, color: styles.fg, border: `1px solid ${styles.border}`,
                          fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px",
                        }}>{styles.label}</span>
                      </Td>
                      <Td>
                        <Link href={`/admin/orders/${r.id}`} style={{ color: "#C9A84C", textDecoration: "none", fontWeight: 600, fontSize: "13px" }}>
                          {r.poReference || r.orderNumber}
                        </Link>
                      </Td>
                      <Td>{r.accountName || <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>}</Td>
                      <Td><span style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>{r.pipelineStage || r.status || "—"}</span></Td>
                      <Td right>{r.dueDate || <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>}</Td>
                      <Td right>
                        {r.triage.daysUntilDue === null ? "—" : (
                          <span style={{
                            fontWeight: 600,
                            color: r.triage.daysUntilDue < 0 ? "#fca5a5" : r.triage.daysUntilDue <= 7 ? "#fdba74" : "rgba(255,255,255,0.7)",
                          }}>
                            {r.triage.daysUntilDue > 0 ? `+${r.triage.daysUntilDue}` : r.triage.daysUntilDue}
                          </span>
                        )}
                      </Td>
                      <Td><span style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)" }}>{r.triage.reason}</span></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th style={{
      padding: "12px 16px",
      textAlign: right ? "right" : "left",
      fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.8px",
      color: "rgba(255,255,255,0.45)", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.08)",
    }}>{children}</th>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td style={{
      padding: "12px 16px",
      textAlign: right ? "right" : "left",
      fontSize: "13px", color: "#fff", verticalAlign: "middle",
    }}>{children}</td>
  );
}

// ─── Action Required panel ───────────────────────────────────────────
//
// Bucket-based view orthogonal to the time-based triage. Shows the four
// categories ops must clear daily:
//   needs_supplier · pending_costs · dispatched_unpaid · on_hold

interface ActionRow {
  id: string;
  po_reference: string | null;
  account_name: string | null;
  pipeline_stage: string | null;
  due_date: string | null;
  assigned_supplier_id: string | null;
  po_dispatched_at: string | null;
  po_held_at: string | null;
  po_hold_reason: string | null;
  supplier_invoice_paid_at: string | null;
  supplier_invoice_file_url: string | null;
  supplier_invoice_total_cents: number | null;
  supplier_invoice_currency: string | null;
  line_count: number;
  pending_cost_lines: number;
}

interface ActionResponse {
  ok: boolean;
  generatedAt: string;
  buckets: {
    needs_supplier: ActionRow[];
    pending_costs: ActionRow[];
    dispatched_unpaid: ActionRow[];
    on_hold: ActionRow[];
  };
  counts: {
    needs_supplier: number;
    pending_costs: number;
    dispatched_unpaid: number;
    on_hold: number;
    total_active_pos: number;
  };
}

function ActionRequiredPanel() {
  const { data } = useQuery<ActionResponse>({
    queryKey: ["/api/admin/orders/action-required"],
    refetchInterval: 60_000,
  });
  if (!data) return null;

  const BUCKETS: Array<{ key: keyof ActionResponse["buckets"]; label: string; color: string; sub: string }> = [
    { key: "needs_supplier",    label: "Needs supplier",    color: "#fca5a5", sub: "Can't dispatch — assign before raise-PO" },
    { key: "pending_costs",     label: "Pending costs",     color: "#fb923c", sub: "Stamp from supplier pricelist or enter manually" },
    { key: "dispatched_unpaid", label: "Dispatched · unpaid", color: "#93c5fd", sub: "AP follow-up — chase supplier invoice or mark paid" },
    { key: "on_hold",           label: "On hold",           color: "#fcd34d", sub: "Decision required" },
  ];

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#fff" }}>Action Required</h2>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
          {data.counts.total_active_pos} active PO{data.counts.total_active_pos === 1 ? "" : "s"} · auto-refreshes
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        {BUCKETS.map((b) => {
          const rows = data.buckets[b.key];
          return (
            <div key={b.key} style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: b.color, textTransform: "uppercase", letterSpacing: 0.6 }}>{b.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{rows.length}</div>
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>{b.sub}</div>
              {rows.length === 0 ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>All clear ✓</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
                  {rows.map((r) => (
                    <Link key={r.id} href={`/admin/orders/${r.id}`}>
                      <div style={{ padding: "6px 8px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 5, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 11, color: "#93c5fd" }}>{r.po_reference}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.account_name || "—"}</div>
                        </div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
                          {b.key === "pending_costs" ? `${r.pending_cost_lines}/${r.line_count} lines` :
                           b.key === "dispatched_unpaid" ? (r.po_dispatched_at ? `${Math.floor((Date.now() - new Date(r.po_dispatched_at).getTime()) / 86400000)}d ago` : "") :
                           b.key === "on_hold" ? (r.po_hold_reason || "—") :
                           (r.due_date || "no due date")}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
