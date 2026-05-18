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
