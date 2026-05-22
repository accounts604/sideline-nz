import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Link, useLocation } from "wouter";
import { Search, Trash2, Copy, FileText, ArrowDown, ArrowUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { ALL_ORDER_STAGES } from "@shared/order-stages";
import { triageOrder, type TriageState } from "@shared/triage";

interface Order {
  id: string;
  orderNumber: string;
  poReference: string | null;
  accountName: string | null;
  customerEmail: string | null;
  customerName: string | null;
  storeSlug: string;
  status: string;
  pipelineStage: string | null;
  designStatus: string | null;
  orderType: string | null;
  total: number;
  dueDate: string | null;
  createdAt: string;
  supplierUsdCents: number;
  pendingCostLines: number;
  supplierInvoicePaidAt: string | null;
}

// Matches shared/product-catalog.ts PUFFIN_USD_TO_NZD; inlined to avoid a new import.
const FX_USD_TO_NZD = 1.72;

const iconBtnStyle: React.CSSProperties = {
  padding: "4px 6px",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.6)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "4px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
};

// Triage state → left-border colour. Mirrors /admin/triage palette so the
// orders list reads the same as the cockpit view.
const TRIAGE_BORDER: Record<TriageState, string> = {
  overdue:           "#ef4444",
  at_risk:           "#f97316",
  awaiting_kickoff:  "#3b82f6",
  on_track:          "#22c55e",
  no_due_date:       "transparent",
};

const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  "Lead Received":      { bg: "rgba(148,163,184,0.15)", text: "#94a3b8" },
  "Brief Sent":         { bg: "rgba(59,130,246,0.15)",  text: "#3b82f6" },
  "Mockup In Progress": { bg: "rgba(234,179,8,0.15)",   text: "#eab308" },
  "Mockup Sent":        { bg: "rgba(168,85,247,0.15)",  text: "#a855f7" },
  "Deposit Paid":       { bg: "rgba(34,197,94,0.15)",   text: "#22c55e" },
  "PO Raised":          { bg: "rgba(249,115,22,0.15)",  text: "#f97316" },
  "Delivered":          { bg: "rgba(20,184,166,0.15)",  text: "#14b8a6" },
  "Invoice Sent":       { bg: "rgba(99,102,241,0.15)",  text: "#6366f1" },
  "Paid":               { bg: "rgba(34,197,94,0.18)",   text: "#22c55e" },
  "Completed":          { bg: "rgba(16,185,129,0.18)",  text: "#10b981" },
  "Cancelled":          { bg: "rgba(239,68,68,0.15)",   text: "#ef4444" },
};

// Compact status pill — replaces the old separate Stage + Design columns.
// Combines pipeline stage (primary) with a small design-status dot underneath.
function StatusPill({ stage, design }: { stage: string | null; design: string | null }) {
  const c = stage ? (STAGE_COLORS[stage] || { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.5)" })
                  : { bg: "rgba(255,255,255,0.04)", text: "rgba(255,255,255,0.35)" };
  const designLabel = design && design !== "not_started" ? design.replace(/_/g, " ") : null;
  const designColor =
    design === "approved" ? "#22c55e" :
    design === "needs_revision" ? "#ef4444" :
    design === "pending_review" ? "#eab308" : "rgba(255,255,255,0.3)";
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 2, lineHeight: 1.1 }}>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3,
        background: c.bg, color: c.text, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap",
      }}>{stage || "—"}</span>
      {designLabel && (
        <span style={{ fontSize: 9, color: designColor, fontWeight: 600, letterSpacing: 0.3, marginLeft: 2 }}>
          · {designLabel}
        </span>
      )}
    </div>
  );
}

// Small inline triage chip — text label + dot, fits next to the due date.
function TriageChip({ state, daysUntilDue }: { state: TriageState; daysUntilDue: number | null }) {
  if (state === "no_due_date") return null;
  const colorMap: Record<TriageState, { bg: string; fg: string; label: string }> = {
    overdue:           { bg: "rgba(239,68,68,0.14)",  fg: "#fca5a5", label: "Overdue" },
    at_risk:           { bg: "rgba(249,115,22,0.14)", fg: "#fdba74", label: "At risk" },
    awaiting_kickoff:  { bg: "rgba(59,130,246,0.12)", fg: "#93c5fd", label: "Kickoff" },
    on_track:          { bg: "rgba(34,197,94,0.12)",  fg: "#86efac", label: "On track" },
    no_due_date:       { bg: "transparent", fg: "rgba(255,255,255,0.3)", label: "" },
  };
  const c = colorMap[state];
  const daysSuffix =
    state === "overdue" && daysUntilDue !== null ? ` · ${Math.abs(daysUntilDue)}d late` :
    state === "at_risk" && daysUntilDue !== null && daysUntilDue >= 0 ? ` · ${daysUntilDue}d` : "";
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
      background: c.bg, color: c.fg, textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap",
    }}>{c.label}{daysSuffix}</span>
  );
}

function OrderTypeBadge({ type }: { type: string | null }) {
  const label = type === "team-store" ? "Store" : type === "sample-run" ? "Sample" : "Bulk";
  const bg = type === "team-store" ? "rgba(59,130,246,0.12)" : type === "sample-run" ? "rgba(234,179,8,0.12)" : "rgba(168,85,247,0.12)";
  const fg = type === "team-store" ? "#60a5fa" : type === "sample-run" ? "#facc15" : "#c084fc";
  return (
    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: bg, color: fg, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
  );
}

export default function AdminOrders() {
  const [stageFilter, setStageFilter] = useState("");
  const [triageFilter, setTriageFilter] = useState<TriageState | "">("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [sortBy, setSortBy] = useState<"createdAt" | "dueDate">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const queryParams = new URLSearchParams();
  if (stageFilter) queryParams.set("stage", stageFilter);
  if (search) queryParams.set("search", search);
  if (createdFrom) queryParams.set("createdFrom", createdFrom);
  if (createdTo) queryParams.set("createdTo", createdTo);
  if (dueFrom) queryParams.set("dueFrom", dueFrom);
  if (dueTo) queryParams.set("dueTo", dueTo);
  if (overdue) queryParams.set("overdue", "true");
  if (sortBy !== "createdAt" || sortDir !== "desc") {
    queryParams.set("sortBy", sortBy);
    queryParams.set("sortDir", sortDir);
  }
  const queryString = queryParams.toString();

  const { data, isLoading } = useQuery<{ orders: Order[]; total: number }>({
    queryKey: [`/api/admin/orders${queryString ? `?${queryString}` : ""}`],
  });

  // Client-side enrichment — compute triage state for every row so the
  // row border colour + triage chip stay in sync with /admin/triage.
  const today = new Date();
  const enrichedOrders = (data?.orders || []).map((o) => {
    const t = triageOrder({
      pipelineStage: o.pipelineStage, status: o.status, dueDate: o.dueDate,
    } as any, today);
    return { ...o, triage: t };
  });
  const filteredOrders = triageFilter ? enrichedOrders.filter((o) => o.triage.state === triageFilter) : enrichedOrders;
  const triageCounts = enrichedOrders.reduce((acc, o) => {
    acc[o.triage.state] = (acc[o.triage.state] || 0) + 1;
    return acc;
  }, {} as Record<TriageState, number>);

  // Filter-aware tally — sums supplier cost across whatever's currently
  // visible (filtered + sorted) so the user sees their slice, not just selected.
  const visibleUsdCents = filteredOrders.reduce((s, o) => s + (o.supplierUsdCents || 0), 0);
  const visiblePendingLines = filteredOrders.reduce((s, o) => s + (o.pendingCostLines || 0), 0);

  const filtersActive = !!(stageFilter || createdFrom || createdTo || dueFrom || dueTo || overdue || triageFilter);
  const clearFilters = () => {
    setStageFilter(""); setTriageFilter(""); setCreatedFrom(""); setCreatedTo("");
    setDueFrom(""); setDueTo(""); setOverdue(false);
  };

  const toggleSort = (col: "createdAt" | "dueDate") => {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  const filterInputStyle: React.CSSProperties = {
    padding: "6px 8px",
    fontSize: 11,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 5,
    color: "#fff",
    outline: "none",
  };

  const deleteMut = useMutation({
    mutationFn: async (orderId: string) => {
      const r = await apiRequest("DELETE", `/api/admin/orders/${orderId}`);
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] }),
  });

  const duplicateMut = useMutation({
    mutationFn: async (orderId: string) => {
      const r = await apiRequest("POST", `/api/admin/orders/${orderId}/duplicate`);
      return r.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      if (data?.order?.id) navigate(`/admin/orders/${data.order.id}`);
    },
  });

  const TRIAGE_BUTTONS: Array<{ key: TriageState | ""; label: string; color: string }> = [
    { key: "",                 label: "All",       color: "rgba(255,255,255,0.4)" },
    { key: "overdue",          label: "Overdue",   color: "#fca5a5" },
    { key: "at_risk",          label: "At risk",   color: "#fdba74" },
    { key: "awaiting_kickoff", label: "Kickoff",   color: "#93c5fd" },
    { key: "on_track",         label: "On track",  color: "#86efac" },
  ];

  return (
    <AdminLayout>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Orders</h1>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2, marginBottom: 0 }}>
            {filteredOrders.length}{filteredOrders.length !== (data?.total ?? 0) ? ` of ${data?.total ?? 0}` : ""} {filteredOrders.length === 1 ? "order" : "orders"}
            {visibleUsdCents > 0 && (
              <>{" · "}<span style={{ color: "#86efac" }}>NZD ${(visibleUsdCents * FX_USD_TO_NZD / 100).toFixed(0)}</span> supplier cost</>
            )}
            {visiblePendingLines > 0 && <span style={{ color: "#fb923c" }}>{" · "}{visiblePendingLines} lines pending quote</span>}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)" }} />
            <input
              type="text"
              placeholder="Search orders…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setSearch(searchInput); }}
              onBlur={() => setSearch(searchInput)}
              style={{
                padding: "7px 10px 7px 30px",
                fontSize: 12,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6,
                color: "#fff",
                outline: "none",
                width: 220,
              }}
            />
          </div>

          <Link href="/admin/orders/create-po">
            <button style={{
              padding: "8px 14px", fontSize: 12, fontWeight: 600,
              background: "#fff", color: "#000", border: "none", borderRadius: 6,
              cursor: "pointer",
            }}>+ New PO</button>
          </Link>
        </div>
      </div>

      {/* Triage segment selector — quick filter by overdue/at-risk/etc. */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {TRIAGE_BUTTONS.map((b) => {
          const count = b.key === "" ? enrichedOrders.length : triageCounts[b.key as TriageState] || 0;
          const active = triageFilter === b.key;
          return (
            <button
              key={b.key || "all"}
              onClick={() => setTriageFilter(b.key)}
              style={{
                padding: "5px 11px",
                fontSize: 11,
                fontWeight: 600,
                background: active ? "rgba(255,255,255,0.08)" : "transparent",
                color: active ? "#fff" : b.color,
                border: `1px solid ${active ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 5,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>{b.label}</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{count}</span>
            </button>
          );
        })}
        <div style={{ width: 1, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />
        {/* Inline filter compact bar */}
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          style={{ ...filterInputStyle, minWidth: 140 }}
          title="Filter by pipeline stage"
        >
          <option value="" style={{ background: "#111" }}>All stages</option>
          {ALL_ORDER_STAGES.map((s) => (
            <option key={s} value={s} style={{ background: "#111" }}>{s}</option>
          ))}
        </select>
        <input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} title="Created from" style={filterInputStyle} />
        <input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} title="Created to" style={filterInputStyle} />
        <input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} title="Due from" style={filterInputStyle} />
        <input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} title="Due to" style={filterInputStyle} />
        <button
          onClick={() => setOverdue(!overdue)}
          style={{
            padding: "5px 10px",
            fontSize: 11,
            fontWeight: 600,
            background: overdue ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.04)",
            color: overdue ? "#ef4444" : "rgba(255,255,255,0.5)",
            border: `1px solid ${overdue ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)"}`,
            borderRadius: 5,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          title="Open orders past their due date (server-filtered)"
        >
          Overdue (server)
        </button>
        {filtersActive && (
          <button
            onClick={clearFilters}
            style={{ padding: "5px 10px", fontSize: 11, background: "transparent", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, cursor: "pointer" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Selection tally bar */}
      {filteredOrders.length > 0 && selectedOrderIds.size > 0 && (() => {
        const selected = filteredOrders.filter(o => selectedOrderIds.has(o.id));
        const usdCents = selected.reduce((s, o) => s + (o.supplierUsdCents || 0), 0);
        const pendingLines = selected.reduce((s, o) => s + (o.pendingCostLines || 0), 0);
        const usd = usdCents / 100;
        const nzd = usd * FX_USD_TO_NZD;
        return (
          <div style={{ marginBottom: 10, padding: "8px 14px", background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 6, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", color: "#C9A84C", fontWeight: 700 }}>
              {selectedOrderIds.size} selected
            </div>
            <div style={{ flex: 1, display: "flex", gap: 18, fontSize: 12, color: "#fff", flexWrap: "wrap" }}>
              <span><span style={{ color: "rgba(255,255,255,0.5)" }}>Cost:</span> <b style={{ color: "#22c55e" }}>NZD ${nzd.toFixed(0)}</b></span>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>USD ${usd.toFixed(0)}</span>
              {pendingLines > 0 && <span style={{ color: "#fb923c", fontSize: 11 }}>{pendingLines} pending</span>}
            </div>
            <button
              onClick={() => setSelectedOrderIds(new Set())}
              style={{ fontSize: 10, padding: "3px 8px", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 600 }}
            >
              Clear
            </button>
          </div>
        );
      })()}

      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Loading…</div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>No orders match the current filters</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" }}>
                  {[
                    { label: "select", noPad: true },
                    { label: "Order", sticky: true },
                    { label: "Status" },
                    { label: "Customer" },
                    { label: "Cost" },
                    { label: "Due", sortKey: "dueDate" as const },
                    { label: "Created", sortKey: "createdAt" as const },
                    { label: "" },
                  ].map((h: any) => {
                    if (h.label === "select") {
                      const visibleIds = filteredOrders.map((o) => o.id);
                      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedOrderIds.has(id));
                      const someSelected = visibleIds.some((id) => selectedOrderIds.has(id));
                      return (
                        <th key="select" style={{ padding: "8px 8px 8px 14px", width: 28, position: "sticky", left: 0, background: "rgba(255,255,255,0.015)" }}>
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                            onChange={() => {
                              setSelectedOrderIds((prev) => {
                                const next = new Set(prev);
                                if (allSelected) visibleIds.forEach((id) => next.delete(id));
                                else visibleIds.forEach((id) => next.add(id));
                                return next;
                              });
                            }}
                            title="Select all visible"
                            style={{ cursor: "pointer" }}
                          />
                        </th>
                      );
                    }
                    const isSorted = h.sortKey && sortBy === h.sortKey;
                    return (
                      <th
                        key={h.label || "actions"}
                        onClick={() => h.sortKey && toggleSort(h.sortKey)}
                        style={{
                          padding: "8px 14px",
                          textAlign: "left",
                          fontSize: 10,
                          fontWeight: 600,
                          color: isSorted ? "#fff" : "rgba(255,255,255,0.4)",
                          textTransform: "uppercase",
                          letterSpacing: 0.6,
                          cursor: h.sortKey ? "pointer" : "default",
                          userSelect: "none",
                          whiteSpace: "nowrap",
                          ...(h.sticky ? { position: "sticky", left: 28, background: "rgba(255,255,255,0.015)", zIndex: 1 } : {}),
                        }}
                      >
                        {h.label}
                        {isSorted && (sortDir === "asc"
                          ? <ArrowUp size={10} style={{ marginLeft: 4, verticalAlign: "middle" }} />
                          : <ArrowDown size={10} style={{ marginLeft: 4, verticalAlign: "middle" }} />)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const rowBg = selectedOrderIds.has(order.id) ? "rgba(201,168,76,0.05)" : "transparent";
                  return (
                  <tr
                    key={order.id}
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      cursor: "pointer",
                      background: rowBg,
                      boxShadow: `inset 3px 0 0 ${TRIAGE_BORDER[order.triage.state]}`,
                    }}
                    onMouseEnter={(e) => { if (!selectedOrderIds.has(order.id)) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = selectedOrderIds.has(order.id) ? "rgba(201,168,76,0.05)" : "transparent"; }}
                  >
                    <td style={{ padding: "8px 8px 8px 14px", position: "sticky", left: 0, background: rowBg || "#111" }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedOrderIds.has(order.id)}
                        onChange={() => {
                          setSelectedOrderIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(order.id)) next.delete(order.id);
                            else next.add(order.id);
                            return next;
                          });
                        }}
                        style={{ cursor: "pointer" }}
                      />
                    </td>
                    <td style={{ padding: "8px 14px", position: "sticky", left: 28, background: rowBg || "#111", zIndex: 1 }}>
                      <Link href={`/admin/orders/${order.id}`}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                          <OrderTypeBadge type={order.orderType} />
                          <span style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>{order.poReference || order.orderNumber}</span>
                        </div>
                      </Link>
                      {order.accountName && (
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{order.accountName}</div>
                      )}
                    </td>
                    <td style={{ padding: "8px 14px" }}>
                      <StatusPill stage={order.pipelineStage} design={order.designStatus} />
                    </td>
                    <td style={{ padding: "8px 14px", fontSize: 11, color: "rgba(255,255,255,0.65)" }}>
                      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>
                        {order.customerName || order.customerEmail || "—"}
                      </div>
                    </td>
                    <td style={{ padding: "8px 14px", fontSize: 12, color: "#fff", fontWeight: 500 }}>
                      {order.supplierUsdCents > 0 ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span title={`USD $${(order.supplierUsdCents / 100).toFixed(2)} × ${FX_USD_TO_NZD} FX`}>
                            ${(order.supplierUsdCents * FX_USD_TO_NZD / 100).toFixed(0)}
                          </span>
                          {order.pendingCostLines > 0 && (
                            <span style={{ fontSize: 9, color: "#fb923c", padding: "1px 5px", border: "1px solid rgba(251,146,60,0.3)", borderRadius: 3 }}>
                              {order.pendingCostLines} pending
                            </span>
                          )}
                          {order.supplierInvoicePaidAt && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.35)", color: "#22c55e", borderRadius: 3, letterSpacing: 0.3 }} title={`Paid ${new Date(order.supplierInvoicePaidAt).toLocaleDateString()}`}>
                              PAID
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: 10, color: order.pendingCostLines > 0 ? "#fb923c" : "rgba(255,255,255,0.3)" }}>
                          {order.pendingCostLines > 0 ? `${order.pendingCostLines} pending` : "—"}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px 14px", fontSize: 11, whiteSpace: "nowrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ color: order.triage.state === "overdue" ? "#ef4444" : "rgba(255,255,255,0.7)" }}>
                          {order.dueDate || "—"}
                        </span>
                        <TriageChip state={order.triage.state} daysUntilDue={order.triage.daysUntilDue} />
                      </div>
                    </td>
                    <td style={{ padding: "8px 14px", fontSize: 11, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
                      {new Date(order.createdAt).toLocaleDateString("en-NZ", { day: "2-digit", month: "short" })}
                    </td>
                    <td style={{ padding: "8px 14px", textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "inline-flex", gap: 3 }}>
                        <Link href={`/admin/orders/${order.id}/po`}>
                          <button title="Open PO preview" style={iconBtnStyle}>
                            <FileText size={12} />
                          </button>
                        </Link>
                        <button
                          title="Duplicate as new order"
                          onClick={() => { if (window.confirm(`Duplicate ${order.orderNumber}? A new draft will be created with the same product lines.`)) duplicateMut.mutate(order.id); }}
                          disabled={duplicateMut.isPending}
                          style={iconBtnStyle}
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          title="Delete order"
                          onClick={() => { if (window.confirm(`Delete ${order.orderNumber}?\n\nThis removes the order and all associated items, designs, and history. The Drive folder will remain.`)) deleteMut.mutate(order.id); }}
                          disabled={deleteMut.isPending}
                          style={{ ...iconBtnStyle, color: "#ef4444", borderColor: "rgba(239,68,68,0.2)" }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
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
