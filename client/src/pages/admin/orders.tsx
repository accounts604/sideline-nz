import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Link } from "wouter";
import { Search } from "lucide-react";

interface Order {
  id: string;
  orderNumber: string;
  customerEmail: string | null;
  customerName: string | null;
  storeSlug: string;
  status: string;
  designStatus: string | null;
  total: number;
  createdAt: string;
}

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Paid", value: "paid" },
  { label: "Processing", value: "processing" },
  { label: "Shipped", value: "shipped" },
  { label: "Delivered", value: "delivered" },
];

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
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const queryParams = new URLSearchParams();
  if (statusFilter) queryParams.set("status", statusFilter);
  if (search) queryParams.set("search", search);
  const queryString = queryParams.toString();

  const { data, isLoading } = useQuery<{ orders: Order[]; total: number }>({
    queryKey: [`/api/admin/orders${queryString ? `?${queryString}` : ""}`],
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

      {/* Status tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "24px", overflowX: "auto", paddingBottom: "4px" }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: statusFilter === tab.value ? 600 : 400,
              color: statusFilter === tab.value ? "#fff" : "rgba(255,255,255,0.5)",
              background: statusFilter === tab.value ? "rgba(255,255,255,0.1)" : "transparent",
              border: "1px solid",
              borderColor: statusFilter === tab.value ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)",
              borderRadius: "6px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Orders table */}
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
                  {["Order", "Customer", "Store", "Status", "Design", "Total", "Date"].map((h) => (
                    <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.orders.map((order) => (
                  <tr
                    key={order.id}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ padding: "14px 20px" }}>
                      <Link href={`/admin/orders/${order.id}`}>
                        <span style={{ fontSize: "14px", color: "#fff", fontWeight: 500, cursor: "pointer" }}>{order.orderNumber}</span>
                      </Link>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>
                      {order.customerName || order.customerEmail || "—"}
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>
                      {order.storeSlug}
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <StatusBadge status={order.status} />
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <StatusBadge status={order.designStatus || "not_started"} type="design" />
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: "14px", color: "#fff", fontWeight: 500 }}>
                      ${(order.total / 100).toFixed(2)}
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>
                      {new Date(order.createdAt).toLocaleDateString()}
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
