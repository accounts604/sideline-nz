import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Link } from "wouter";
import { FileText, Plus, Search, Send, Eye, CheckCircle, XCircle, Clock } from "lucide-react";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.5)" },
  sent: { bg: "rgba(59,130,246,0.12)", text: "#3b82f6" },
  viewed: { bg: "rgba(168,85,247,0.12)", text: "#a855f7" },
  accepted: { bg: "rgba(34,197,94,0.12)", text: "#22c55e" },
  rejected: { bg: "rgba(239,68,68,0.12)", text: "#ef4444" },
  expired: { bg: "rgba(255,255,255,0.04)", text: "rgba(255,255,255,0.3)" },
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  draft: Clock,
  sent: Send,
  viewed: Eye,
  accepted: CheckCircle,
  rejected: XCircle,
  expired: Clock,
};

export default function AdminQuotes() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/admin/quotes/stats"],
  });

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/quotes", { status, search, page }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (search) params.set("search", search);
      params.set("page", String(page));
      const res = await fetch(`/api/admin/quotes?${params}`);
      return res.json();
    },
  });

  const inputStyle: React.CSSProperties = {
    padding: "10px 12px", fontSize: "13px",
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "6px", color: "#fff", outline: "none",
  };

  return (
    <AdminLayout>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "12px" }}>
          <FileText size={24} /> Smart Quotes
        </h1>
        <Link href="/admin/quotes/create">
          <button style={{
            padding: "10px 20px", fontSize: "13px", fontWeight: 600,
            background: "#f97316", color: "#fff", border: "none",
            borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
          }}>
            <Plus size={16} /> New Quote
          </button>
        </Link>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", marginBottom: "24px" }}>
          {[
            { label: "Total", value: stats.total, color: "#fff" },
            { label: "Draft", value: stats.draft, color: "rgba(255,255,255,0.5)" },
            { label: "Sent", value: stats.sent, color: "#3b82f6" },
            { label: "Accepted", value: stats.accepted, color: "#22c55e" },
            { label: "Value Won", value: `$${(stats.acceptedValue / 100).toFixed(0)}`, color: "#f97316" },
          ].map((s, i) => (
            <div key={i} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "16px 20px" }}>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{s.label}</div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: s.color, marginTop: "4px" }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={14} style={{ position: "absolute", left: "12px", top: "12px", color: "rgba(255,255,255,0.3)" }} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search quotes..."
            style={{ ...inputStyle, width: "100%", paddingLeft: "34px" }}
          />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ ...inputStyle, width: "160px" }}>
          <option value="" style={{ background: "#111" }}>All Status</option>
          {["draft", "sent", "viewed", "accepted", "rejected", "expired"].map(s => (
            <option key={s} value={s} style={{ background: "#111" }}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Quote #", "Customer", "Team", "Total", "Status", "Created"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: "11px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Loading...</td></tr>
            ) : data?.quotes?.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>No quotes found</td></tr>
            ) : (
              data?.quotes?.map((q: any) => {
                const statusStyle = STATUS_COLORS[q.status] || STATUS_COLORS.draft;
                const StatusIcon = STATUS_ICONS[q.status] || Clock;
                return (
                  <tr key={q.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
                    onClick={() => window.location.href = `/admin/quotes/${q.id}`}>
                    <td style={{ padding: "14px 16px", fontSize: "13px", color: "#f97316", fontWeight: 600 }}>{q.quoteNumber}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontSize: "13px", color: "#fff" }}>{q.customerName}</div>
                      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>{q.customerEmail}</div>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>{q.teamName || "—"}</td>
                    <td style={{ padding: "14px 16px", fontSize: "13px", color: "#fff", fontWeight: 600 }}>${(q.total / 100).toFixed(2)}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: "6px",
                        padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600,
                        background: statusStyle.bg, color: statusStyle.text,
                      }}>
                        <StatusIcon size={12} />
                        {q.status.charAt(0).toUpperCase() + q.status.slice(1)}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
                      {new Date(q.createdAt).toLocaleDateString("en-NZ")}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "16px" }}>
          {Array.from({ length: data.totalPages }, (_, i) => (
            <button key={i} onClick={() => setPage(i + 1)} style={{
              padding: "6px 12px", fontSize: "12px", borderRadius: "6px", cursor: "pointer",
              background: page === i + 1 ? "#f97316" : "rgba(255,255,255,0.06)",
              color: page === i + 1 ? "#fff" : "rgba(255,255,255,0.5)",
              border: "none",
            }}>{i + 1}</button>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
