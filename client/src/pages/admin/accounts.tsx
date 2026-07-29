import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Users as UsersIcon, ExternalLink } from "lucide-react";

interface Row {
  id: string; name: string | null; email: string | null; kind: string;
  scope: string[]; lastSeenAt: string | null; viewUrl: string; flags: string[];
  /** Set when the session can actually be switched (customers, suppliers). */
  impersonate?: { kind: "user" | "club_account"; id: string } | null;
}
interface Scope { can: string[]; cannot: string[]; where: string }
interface Audience { rows: Row[]; scope: Scope | null; note?: string }
interface AccountsResponse {
  ok: boolean;
  audiences: { customers: Audience; designers: Audience; suppliers: Audience; affiliates: Audience };
}

const TABS = [
  { key: "customers", label: "Customers" },
  { key: "designers", label: "Designers" },
  { key: "suppliers", label: "Suppliers" },
  { key: "affiliates", label: "Affiliates" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const card = { background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px" } as const;

function ago(iso: string | null): { text: string; dim: boolean } {
  if (!iso) return { text: "never", dim: true };
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000), h = Math.floor(m / 60), days = Math.floor(h / 24);
  if (m < 2) return { text: "just now", dim: false };
  if (h < 1) return { text: `${m}m ago`, dim: false };
  if (days < 1) return { text: `${h}h ago`, dim: false };
  return { text: `${days}d ago`, dim: days > 30 };
}

export default function AdminAccounts() {
  const [tab, setTab] = useState<TabKey>("customers");
  const { data, isLoading } = useQuery<AccountsResponse>({ queryKey: ["/api/admin/accounts"] });
  const audience = data?.audiences?.[tab];

  return (
    <AdminLayout>
      <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>Accounts</h1>
      <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", marginBottom: "22px", maxWidth: "74ch" }}>
        Everyone with a way into Sideline, what each of them can see, and when they last looked.
        Open any row to see their real view, rather than trusting a label.
      </p>

      <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: "20px", overflowX: "auto" }}>
        {TABS.map((t) => {
          const n = data?.audiences?.[t.key]?.rows?.length ?? 0;
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              background: "none", border: "none", borderBottom: on ? "2px solid #f97316" : "2px solid transparent",
              color: on ? "#fff" : "rgba(255,255,255,0.5)", fontWeight: on ? 600 : 400,
              padding: "11px 16px", cursor: "pointer", fontSize: "14px", marginBottom: "-1px", whiteSpace: "nowrap",
            }}>
              {t.label}{" "}
              <span style={{
                fontFamily: "ui-monospace, monospace", fontSize: "10.5px", fontWeight: 700, padding: "1px 6px",
                borderRadius: "5px", background: on ? "rgba(249,115,22,0.25)" : "rgba(255,255,255,0.08)",
                color: on ? "#fff" : "rgba(255,255,255,0.5)",
              }}>{n}</span>
            </button>
          );
        })}
      </div>

      {isLoading && <div style={{ color: "rgba(255,255,255,0.3)" }}>Loading accounts…</div>}

      {/* What this audience can and cannot see — the point of the page */}
      {audience?.scope && (
        <div style={{ ...card, padding: "16px 18px", marginBottom: "18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
          <div>
            <h3 style={{ fontSize: "12px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#22c55e", margin: "0 0 10px", fontWeight: 700 }}>Can see</h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "7px" }}>
              {audience.scope.can.map((c, i) => (
                <li key={i} style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", paddingLeft: "17px", position: "relative" }}>
                  <span style={{ position: "absolute", left: 0, color: "#22c55e", fontFamily: "ui-monospace, monospace" }}>+</span>{c}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 style={{ fontSize: "12px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#ef4444", margin: "0 0 10px", fontWeight: 700 }}>Can never see</h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "7px" }}>
              {audience.scope.cannot.map((c, i) => (
                <li key={i} style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", paddingLeft: "17px", position: "relative" }}>
                  <span style={{ position: "absolute", left: 0, color: "#ef4444", fontFamily: "ui-monospace, monospace" }}>&minus;</span>{c}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ gridColumn: "1/-1", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "13px", fontSize: "12.5px", color: "rgba(255,255,255,0.5)" }}>
            {audience.scope.where}
          </div>
        </div>
      )}

      {audience?.note && (
        <div style={{ ...card, border: "1px dashed rgba(245,158,11,0.35)", padding: "20px 22px" }}>
          <h3 style={{ color: "#f59e0b", fontSize: "14px", margin: "0 0 8px", fontWeight: 600 }}>Not built yet</h3>
          <p style={{ fontSize: "13.5px", color: "rgba(255,255,255,0.5)", margin: 0, lineHeight: 1.55, maxWidth: "70ch" }}>{audience.note}</p>
        </div>
      )}

      {audience && audience.rows.length > 0 && (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "720px" }}>
              <thead>
                <tr>
                  {["Account", "Type", "Access scope", "Last seen", ""].map((h) => (
                    <th key={h} style={{
                      textAlign: "left", fontSize: "10px", letterSpacing: "0.11em", textTransform: "uppercase",
                      color: "rgba(255,255,255,0.35)", fontWeight: 700, padding: "10px 18px",
                      borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audience.rows.map((r) => {
                  const seen = ago(r.lastSeenAt);
                  return (
                    <tr key={r.id}>
                      <td style={td}>
                        <span style={{ fontWeight: 600, color: "#fff", display: "block" }}>{r.name || "—"}</span>
                        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px", color: "rgba(255,255,255,0.35)", wordBreak: "break-all" }}>{r.email}</span>
                      </td>
                      <td style={td}><span style={chip}>{r.kind}</span></td>
                      <td style={td}>
                        {r.scope.map((s, i) => <span key={i} style={{ ...chip, marginRight: "5px" }}>{s}</span>)}
                        {r.flags.map((f, i) => <span key={i} style={{ ...chip, background: "rgba(239,68,68,0.13)", color: "#fca5a5", marginRight: "5px" }}>{f}</span>)}
                      </td>
                      <td style={{ ...td, fontFamily: "ui-monospace, monospace", fontSize: "12px", whiteSpace: "nowrap", color: seen.dim ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)" }}>
                        {seen.text}
                      </td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                        {r.impersonate && (
                          <button
                            onClick={async () => {
                              const res = await fetch("/api/view-as/start", {
                                method: "POST", credentials: "include",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(r.impersonate),
                              });
                              const j = await res.json();
                              if (!res.ok) { alert(j.error || "Could not view as this account"); return; }
                              window.location.href = j.redirectTo || "/portal";
                            }}
                            style={{
                              fontSize: "11.5px", background: "rgba(249,115,22,0.16)",
                              border: "1px solid rgba(249,115,22,0.4)", color: "#f0f0f0",
                              borderRadius: "6px", padding: "5px 11px", cursor: "pointer", marginRight: "6px",
                            }}
                          >
                            View as them
                          </button>
                        )}
                        <a href={r.viewUrl} target="_blank" rel="noopener noreferrer" style={{
                          display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11.5px",
                          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.06)",
                          color: "#f0f0f0", borderRadius: "6px", padding: "5px 11px", textDecoration: "none", whiteSpace: "nowrap",
                        }}>
                          {r.impersonate ? "Open" : "Open their view"} <ExternalLink size={12} />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

const td = { padding: "13px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: "13.5px", verticalAlign: "top" } as const;
const chip = { display: "inline-block", fontSize: "10.5px", fontWeight: 600, borderRadius: "4px", padding: "2px 7px", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" } as const;
