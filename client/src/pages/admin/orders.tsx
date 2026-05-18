import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Link, useLocation } from "wouter";
import { Search, Trash2, Copy, FileText, ArrowDown, ArrowUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { ALL_ORDER_STAGES } from "@shared/order-stages";

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
}

// Matches shared/product-catalog.ts PUFFIN_USD_TO_NZD; inlined to avoid a new import.
const FX_USD_TO_NZD = 1.72;

const iconBtnStyle: React.CSSProperties = {
  padding: "5px 8px",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.6)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "5px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
};

// Stage colour map — applied to the table badge AND the dropdown swatches.
// Mirrors the cockpit StageBadge palette used on the order detail page.
const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  "Lead Received":        { bg: "rgba(148,163,184,0.15)", text: "#94a3b8" },
  "Brief Sent":           { bg: "rgba(59,130,246,0.15)",  text: "#3b82f6" },
  "Mockup In Progress":   { bg: "rgba(234,179,8,0.15)",   text: "#eab308" },
  "Mockup Sent":          { bg: "rgba(168,85,247,0.15)",  text: "#a855f7" },
  "Deposit Paid":         { bg: "rgba(34,197,94,0.15)",   text: "#22c55e" },
  "PO Raised":            { bg: "rgba(249,115,22,0.15)",  text: "#f97316" },
  "Delivered":            { bg: "rgba(20,184,166,0.15)",  text: "#14b8a6" },
  "Invoice Sent":         { bg: "rgba(99,102,241,0.15)",  text: "#6366f1" },
  "Paid":                 { bg: "rgba(34,197,94,0.18)",   text: "#22c55e" },
  "Completed":            { bg: "rgba(16,185,129,0.18)",  text: "#10b981" },
  "Cancelled":            { bg: "rgba(239,68,68,0.15)",   text: "#ef4444" },
};

function StageBadge({ stage }: { stage: string | null | undefined }) {
  if (!stage) return <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>—</span>;
  const c = STAGE_COLORS[stage] || { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.5)" };
  return (
    <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px", background: c.bg, color: c.text, textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
      {stage}
    </span>
  );
}

function StatusBadge({ status, type = "order" }: { status: string; type?: "order" | "design" }) {
  const orderColors: Record<string, { bg: string; text: string }> = {
    pending: { bg: "rgba(234,179,8,0.15)", text: "#eab308" },
    paid: { bg: "rgba(34,197,94,0.15)", text: "#22c55e" },
    processing: { bg: "rgba(59,130,246,0.15)", text: "#3b82f6" },
    shipped: { bg: "rgba(168,85,247,0.15)", text: "#a855f7" },
    delivered: { bg: "rgba(34,197,94,0.15)", text: "#22c55e" },
    cancelled: { bg: "rgba(239,68,68,0.15)", text: "#ef4444" },
  };
  const designColors: Record<string, { bg: string; text: string }> = {
    not_started: { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.4)" },
    pending_review: { bg: "rgba(234,179,8,0.15)", text: "#eab308" },
    approved: { bg: "rgba(34,197,94,0.15)", text: "#22c55e" },
    needs_revision: { bg: "rgba(239,68,68,0.15)", text: "#ef4444" },
  };
  const colors = type === "design" ? designColors : orderColors;
  const c = colors[status] || { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.5)" };
  return (
    <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px", background: c.bg, color: c.text, textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function AdminOrders() {
  const [stageFilter, setStageFilter] = useState("");
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

  const filtersActive = !!(stageFilter || createdFrom || createdTo || dueFrom || dueTo || overdue);
  const clearFilters = () => {
    setStageFilter(""); setCreatedFrom(""); setCreatedTo("");
    setDueFrom(""); setDueTo(""); setOverdue(false);
  };

  const toggleSort = (col: "createdAt" | "dueDate") => {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  const filterInputStyle: React.CSSProperties = {
    padding: "8px 10px",
    fontSize: "12px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "6px",
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

  return (
    <AdminLayout>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff" }}>Orders</h1>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
            {data?.total ?? 0} total orders
          </p>
        </div>

        <Link href="/admin/orders/create-po">
          <button style={{
            padding: "10px 20px", fontSize: "13px", fontWeight: 600,
            background: "#fff", color: "#000", border: "none", borderRadius: "6px",
            cursor: "pointer",
          }}>+ New PO</button>
        </Link>

        {/* Search */}
        <div style={{ position: "relative" }}>
          <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)" }} />
          <input
            type="text"
            placeholder="Search orders..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setSearch(searchInput); }}
            onBlur={() => setSearch(searchInput)}
            style={{
              padding: "10px 12px 10px 36px",
              fontSize: "13px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              color: "#fff",
              outline: "none",
              width: "240px",
            }}
          />
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", marginBottom: "16px" }}>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          style={{ ...filterInputStyle, minWidth: "160px" }}
          title="Filter by pipeline stage"
        >
          <option value="" style={{ background: "#111" }}>All stages</option>
          {ALL_ORDER_STAGES.map((s) => (
            <option key={s} value={s} style={{ background: "#111" }}>{s}</option>
          ))}
        </select>
        <label style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
          Created
          <input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} style={filterInputStyle} />
          <span style={{ color: "rgba(255,255,255,0.3)" }}>→</span>
          <input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} style={filterInputStyle} />
        </label>
        <label style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
          Due
          <input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} style={filterInputStyle} />
          <span style={{ color: "rgba(255,255,255,0.3)" }}>→</span>
          <input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} style={filterInputStyle} />
        </label>
        <button
          onClick={() => setOverdue(!overdue)}
          style={{
            padding: "8px 14px",
            fontSize: "12px",
            fontWeight: 600,
            background: overdue ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.04)",
            color: overdue ? "#ef4444" : "rgba(255,255,255,0.5)",
            border: `1px solid ${overdue ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)"}`,
            borderRadius: "6px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          title="Open orders past their due date"
        >
          Overdue only
        </button>
        {filtersActive && (
          <button
            onClick={clearFilters}
            style={{ padding: "8px 14px", fontSize: "12px", background: "transparent", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", cursor: "pointer" }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Orders table */}
      {/* Selection tally bar — sums supplier cost across selected orders.
          Sits above the table so it stays put as you scroll the rows. */}
      {data?.orders && selectedOrderIds.size > 0 && (() => {
        const selected = data.orders.filter(o => selectedOrderIds.has(o.id));
        const usdCents = selected.reduce((s, o) => s + (o.supplierUsdCents || 0), 0);
        const pendingLines = selected.reduce((s, o) => s + (o.pendingCostLines || 0), 0);
        const usd = usdCents / 100;
        const nzd = usd * FX_USD_TO_NZD;
        return (
          <div style={{ marginBottom: "12px", padding: "14px 18px", background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: "10px", display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
            <div style={{ fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", color: "#C9A84C", fontWeight: 700 }}>
              Selected · {selectedOrderIds.size} order{selectedOrderIds.size === 1 ? "" : "s"}
            </div>
            <div style={{ flex: 1, display: "flex", gap: "24px", fontSize: "13px", color: "#fff", flexWrap: "wrap" }}>
              <span><span style={{ color: "rgba(255,255,255,0.5)" }}>Supplier cost:</span> <b style={{ color: "#22c55e" }}>NZD ${nzd.toFixed(2)}</b></span>
              <span style={{ color: "rgba(255,255,255,0.5)" }}>USD ${usd.toFixed(2)} · FX {FX_USD_TO_NZD}</span>
              {pendingLines > 0 && <span style={{ color: "#fb923c", fontSize: "12px" }}>⚠ {pendingLines} line{pendingLines === 1 ? "" : "s"} quote-pending (not counted)</span>}
            </div>
            <button
              onClick={() => setSelectedOrderIds(new Set())}
              style={{ fontSize: "10px", padding: "5px 10px", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "5px", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.4px", fontWeight: 600 }}
            >
              Clear
            </button>
          </div>
        );
      })()}

      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Loading...</div>
        ) : !data?.orders?.length ? (
          <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>No orders found</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {[
                    { label: "select", noPad: true },
                    { label: "Order" },
                    { label: "Type" },
                    { label: "Customer" },
                    { label: "Stage" },
                    { label: "Design" },
                    { label: "Supplier Cost" },
                    { label: "Due", sortKey: "dueDate" as const },
                    { label: "Created", sortKey: "createdAt" as const },
                    { label: "" },
                  ].map((h) => {
                    if (h.label === "select") {
                      const visibleIds = data.orders.map(o => o.id);
                      const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedOrderIds.has(id));
                      const someSelected = visibleIds.some(id => selectedOrderIds.has(id));
                      return (
                        <th key="select" style={{ padding: "12px 12px 12px 20px", width: "32px" }}>
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
                            onChange={() => {
                              setSelectedOrderIds(prev => {
                                const next = new Set(prev);
                                if (allSelected) visibleIds.forEach(id => next.delete(id));
                                else visibleIds.forEach(id => next.add(id));
                                return next;
                              });
                            }}
                            title="Select all on this page"
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
                          padding: "12px 20px",
                          textAlign: "left",
                          fontSize: "11px",
                          fontWeight: 600,
                          color: isSorted ? "#fff" : "rgba(255,255,255,0.35)",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          cursor: h.sortKey ? "pointer" : "default",
                          userSelect: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h.label}
                        {isSorted && (sortDir === "asc"
                          ? <ArrowUp size={11} style={{ marginLeft: 4, verticalAlign: "middle" }} />
                          : <ArrowDown size={11} style={{ marginLeft: 4, verticalAlign: "middle" }} />)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {data.orders.map((order) => (
                  <tr
                    key={order.id}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", background: selectedOrderIds.has(order.id) ? "rgba(201,168,76,0.05)" : "transparent" }}
                    onMouseEnter={(e) => { if (!selectedOrderIds.has(order.id)) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = selectedOrderIds.has(order.id) ? "rgba(201,168,76,0.05)" : "transparent"; }}
                  >
                    <td style={{ padding: "14px 12px 14px 20px" }} onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedOrderIds.has(order.id)}
                        onChange={() => {
                          setSelectedOrderIds(prev => {
                            const next = new Set(prev);
                            if (next.has(order.id)) next.delete(order.id);
                            else next.add(order.id);
                            return next;
                          });
                        }}
                        style={{ cursor: "pointer" }}
                      />
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <Link href={`/admin/orders/${order.id}`}>
                        <span style={{ fontSize: "14px", color: "#fff", fontWeight: 500, cursor: "pointer" }}>{order.poReference || order.orderNumber}</span>
                      </Link>
                      {order.accountName && (
                        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>{order.accountName}</div>
                      )}
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{
                        fontSize: "10px", fontWeight: 600, padding: "3px 7px", borderRadius: "4px",
                        textTransform: "uppercase", letterSpacing: "0.3px",
                        background: order.orderType === "team-store" ? "rgba(59,130,246,0.15)" : order.orderType === "sample-run" ? "rgba(234,179,8,0.15)" : "rgba(168,85,247,0.15)",
                        color: order.orderType === "team-store" ? "#3b82f6" : order.orderType === "sample-run" ? "#eab308" : "#a855f7",
                      }}>
                        {order.orderType === "team-store" ? "Store" : order.orderType === "sample-run" ? "Sample" : "Bulk"}
                      </span>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>
                      {order.customerName || order.customerEmail || "—"}
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <StageBadge stage={order.pipelineStage} />
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <StatusBadge status={order.designStatus || "not_started"} type="design" />
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: "14px", color: "#fff", fontWeight: 500 }}>
                      {order.supplierUsdCents > 0 ? (
                        <>
                          <div title={`Supplier cost: USD $${(order.supplierUsdCents / 100).toFixed(2)} × ${FX_USD_TO_NZD} FX`}>
                            NZD ${(order.supplierUsdCents * FX_USD_TO_NZD / 100).toFixed(2)}
                          </div>
                          <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)", marginTop: "2px", letterSpacing: "0.2px" }}>
                            USD ${(order.supplierUsdCents / 100).toFixed(2)}
                            {order.pendingCostLines > 0 && <span style={{ color: "#fb923c", marginLeft: 6 }}>· {order.pendingCostLines} pending</span>}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: "11px", color: order.pendingCostLines > 0 ? "#fb923c" : "rgba(255,255,255,0.3)" }}>
                          {order.pendingCostLines > 0 ? `${order.pendingCostLines} line${order.pendingCostLines === 1 ? "" : "s"} pending` : "—"}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: "13px", color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                      {order.dueDate
                        ? (() => {
                            const today = new Date().toISOString().slice(0, 10);
                            const isOverdue = order.dueDate < today &&
                              !["Delivered", "Invoice Sent", "Paid", "Completed", "Cancelled"].includes(order.pipelineStage || "");
                            return <span style={{ color: isOverdue ? "#ef4444" : "rgba(255,255,255,0.7)" }}>{order.dueDate}</span>;
                          })()
                        : "—"}
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: "13px", color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "14px 20px", textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "inline-flex", gap: "4px" }}>
                        <Link href={`/admin/orders/${order.id}/po`}>
                          <button title="Open PO preview" style={iconBtnStyle}>
                            <FileText size={13} />
                          </button>
                        </Link>
                        <button
                          title="Duplicate as new order"
                          onClick={() => { if (window.confirm(`Duplicate ${order.orderNumber}? A new draft will be created with the same product lines.`)) duplicateMut.mutate(order.id); }}
                          disabled={duplicateMut.isPending}
                          style={iconBtnStyle}
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          title="Delete order"
                          onClick={() => { if (window.confirm(`Delete ${order.orderNumber}?\n\nThis removes the order and all associated items, designs, and history. The Drive folder will remain.`)) deleteMut.mutate(order.id); }}
                          disabled={deleteMut.isPending}
                          style={{ ...iconBtnStyle, color: "#ef4444", borderColor: "rgba(239,68,68,0.2)" }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
