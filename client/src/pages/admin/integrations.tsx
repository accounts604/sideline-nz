// Admin view over integration_events — the audit trail of every external
// API call the app makes. Backed by GET /api/admin/integration-events.
//
// Filters: system · status · free-text order-id. Auto-refreshes every 30s.
// Clicking a failed row expands to show the error + meta blob.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Activity, RefreshCw, CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight } from "lucide-react";

type IntegrationEvent = {
  id: string;
  createdAt: string;
  system: string;
  action: string;
  status: "success" | "failed";
  orderId: string | null;
  userId: string | null;
  durationMs: number | null;
  error: string | null;
  meta: Record<string, any> | null;
};

const SYSTEM_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "ghl", label: "GHL" },
  { value: "drive", label: "Drive" },
  { value: "gmail", label: "Gmail" },
  { value: "resend", label: "Email" },
  { value: "apiease", label: "APIEase" },
  { value: "stripe", label: "Stripe" },
  { value: "shopify", label: "Shopify" },
];

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function AdminIntegrations() {
  const [systemFilter, setSystemFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "success" | "failed">("");
  const [orderIdFilter, setOrderIdFilter] = useState("");
  const [orderIdInput, setOrderIdInput] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const qs = new URLSearchParams();
  if (systemFilter) qs.set("system", systemFilter);
  if (statusFilter) qs.set("status", statusFilter);
  if (orderIdFilter) qs.set("orderId", orderIdFilter);
  qs.set("limit", "200");
  const queryKey = [`/api/admin/integration-events?${qs.toString()}`];

  const { data, isLoading, refetch, isFetching } = useQuery<{ events: IntegrationEvent[]; total: number }>({
    queryKey,
    refetchInterval: 30_000,
  });

  const events = data?.events || [];
  const failedCount = events.filter((e) => e.status === "failed").length;
  const successCount = events.length - failedCount;

  return (
    <AdminLayout>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "10px" }}>
            <Activity size={20} /> Integration Events
          </h1>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", marginTop: "4px" }}>
            Audit trail of every outbound call to Drive, GHL, Gmail, Resend, APIEase, Stripe, Shopify.
            Auto-refreshes every 30s.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "12px", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
            <span style={{ color: "#22c55e" }}><CheckCircle2 size={13} style={{ display: "inline", marginRight: "4px" }} />{successCount}</span>
            <span style={{ color: "#ef4444" }}><XCircle size={13} style={{ display: "inline", marginRight: "4px" }} />{failedCount}</span>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            style={{ padding: "7px 12px", fontSize: "12px", fontWeight: 600, background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", cursor: isFetching ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <RefreshCw size={12} style={{ animation: isFetching ? "spin 1s linear infinite" : "none" }} /> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        {SYSTEM_FILTERS.map((s) => (
          <button
            key={s.value}
            onClick={() => setSystemFilter(s.value)}
            style={{
              padding: "6px 12px", fontSize: "12px",
              fontWeight: systemFilter === s.value ? 700 : 400,
              color: systemFilter === s.value ? "#fff" : "rgba(255,255,255,0.55)",
              background: systemFilter === s.value ? "rgba(255,255,255,0.1)" : "transparent",
              border: "1px solid", borderColor: systemFilter === s.value ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)",
              borderRadius: "5px", cursor: "pointer",
            }}
          >
            {s.label}
          </button>
        ))}
        <span style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.1)", margin: "0 4px" }} />
        {(["", "success", "failed"] as const).map((v) => (
          <button
            key={v || "all"}
            onClick={() => setStatusFilter(v)}
            style={{
              padding: "6px 12px", fontSize: "12px",
              fontWeight: statusFilter === v ? 700 : 400,
              color: statusFilter === v ? (v === "failed" ? "#ef4444" : v === "success" ? "#22c55e" : "#fff") : "rgba(255,255,255,0.55)",
              background: statusFilter === v ? (v === "failed" ? "rgba(239,68,68,0.1)" : v === "success" ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.1)") : "transparent",
              border: "1px solid",
              borderColor: statusFilter === v ? (v === "failed" ? "rgba(239,68,68,0.3)" : v === "success" ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.15)") : "rgba(255,255,255,0.08)",
              borderRadius: "5px", cursor: "pointer", textTransform: "capitalize",
            }}
          >
            {v || "Any status"}
          </button>
        ))}
        <input
          type="text"
          placeholder="Filter by order id…"
          value={orderIdInput}
          onChange={(e) => setOrderIdInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") setOrderIdFilter(orderIdInput.trim()); }}
          onBlur={() => setOrderIdFilter(orderIdInput.trim())}
          style={{ marginLeft: "auto", padding: "7px 10px", fontSize: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "5px", color: "#fff", outline: "none", width: "280px" }}
        />
      </div>

      {/* Table */}
      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Loading…</div>
        ) : events.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>
            No events yet. Events appear as the app makes outbound API calls.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["", "System", "Action", "Status", "Order", "Duration", "When"].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: "10px", fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const expanded = expandedId === ev.id;
                const hasDetails = !!(ev.error || ev.meta);
                return (
                  <>
                    <tr
                      key={ev.id}
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: hasDetails ? "pointer" : "default" }}
                      onClick={() => hasDetails && setExpandedId(expanded ? null : ev.id)}
                    >
                      <td style={{ padding: "10px 12px", width: "24px" }}>
                        {hasDetails ? (expanded ? <ChevronDown size={13} color="rgba(255,255,255,0.4)" /> : <ChevronRight size={13} color="rgba(255,255,255,0.25)" />) : null}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: "12px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                        {ev.system}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: "12px", color: "rgba(255,255,255,0.75)", fontFamily: "ui-monospace, Menlo, monospace" }}>
                        {ev.action}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", fontSize: "10px", fontWeight: 700, borderRadius: "4px", textTransform: "uppercase", letterSpacing: "0.3px", background: ev.status === "success" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: ev.status === "success" ? "#22c55e" : "#ef4444" }}>
                          {ev.status === "success" ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                          {ev.status}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: "11px", color: "rgba(255,255,255,0.55)", fontFamily: "ui-monospace, Menlo, monospace" }}>
                        {ev.orderId ? <span title={ev.orderId}>{ev.orderId.slice(0, 8)}…</span> : <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: "11px", color: "rgba(255,255,255,0.55)", fontFamily: "ui-monospace, Menlo, monospace" }}>
                        {ev.durationMs != null ? <span><Clock size={10} style={{ display: "inline", marginRight: "3px", verticalAlign: "middle" }} />{ev.durationMs}ms</span> : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: "11px", color: "rgba(255,255,255,0.45)" }} title={new Date(ev.createdAt).toISOString()}>
                        {relativeTime(ev.createdAt)}
                      </td>
                    </tr>
                    {expanded && hasDetails && (
                      <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                        <td colSpan={7} style={{ padding: "12px 48px 16px" }}>
                          {ev.error && (
                            <div style={{ marginBottom: "10px" }}>
                              <div style={{ fontSize: "10px", fontWeight: 700, color: "#ef4444", letterSpacing: "0.3px", marginBottom: "4px", textTransform: "uppercase" }}>Error</div>
                              <pre style={{ fontSize: "11px", color: "rgba(255,255,255,0.8)", fontFamily: "ui-monospace, Menlo, monospace", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, padding: "8px 10px", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: "4px" }}>{ev.error}</pre>
                            </div>
                          )}
                          {ev.meta && (
                            <div>
                              <div style={{ fontSize: "10px", fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "0.3px", marginBottom: "4px", textTransform: "uppercase" }}>Meta</div>
                              <pre style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)", fontFamily: "ui-monospace, Menlo, monospace", margin: 0, padding: "8px 10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "4px", overflowX: "auto" }}>{JSON.stringify(ev.meta, null, 2)}</pre>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </AdminLayout>
  );
}
