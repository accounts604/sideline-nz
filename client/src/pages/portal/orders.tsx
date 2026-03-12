import { useQuery } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal-layout";
import { Link } from "wouter";

interface Order {
  id: string;
  orderNumber: string;
  storeSlug: string;
  status: string;
  designStatus: string | null;
  total: number;
  currency: string;
  createdAt: string;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    pending: { bg: "rgba(234,179,8,0.15)", text: "#eab308" },
    paid: { bg: "rgba(34,197,94,0.15)", text: "#22c55e" },
    processing: { bg: "rgba(59,130,246,0.15)", text: "#3b82f6" },
    shipped: { bg: "rgba(168,85,247,0.15)", text: "#a855f7" },
    delivered: { bg: "rgba(34,197,94,0.15)", text: "#22c55e" },
    cancelled: { bg: "rgba(239,68,68,0.15)", text: "#ef4444" },
    approved: { bg: "rgba(34,197,94,0.15)", text: "#22c55e" },
    rejected: { bg: "rgba(239,68,68,0.15)", text: "#ef4444" },
    not_started: { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.4)" },
    pending_review: { bg: "rgba(234,179,8,0.15)", text: "#eab308" },
    needs_revision: { bg: "rgba(239,68,68,0.15)", text: "#ef4444" },
  };
  const c = colors[status] || { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.5)" };
  return (
    <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px", background: c.bg, color: c.text, textTransform: "uppercase", letterSpacing: "0.5px" }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function PortalOrders() {
  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ["/api/portal/orders"],
  });

  return (
    <PortalLayout>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff" }}>My Orders</h1>
        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>
          View your order history and upload design files
        </p>
      </div>

      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: "32px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>Loading...</div>
        ) : !orders || orders.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center" }}>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px" }}>No orders yet</p>
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "13px", marginTop: "8px" }}>
              Once you place an order through a team store, it will appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Header row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 100px 100px", gap: "16px", padding: "12px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: "11px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              <span>Order</span>
              <span>Date</span>
              <span>Status</span>
              <span>Design</span>
              <span style={{ textAlign: "right" }}>Total</span>
            </div>

            {orders.map((order) => (
              <Link key={order.id} href={`/portal/orders/${order.id}`}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 100px 100px", gap: "16px", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", transition: "background 0.1s" }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <div>
                    <p style={{ fontSize: "14px", color: "#fff", fontWeight: 500 }}>{order.orderNumber}</p>
                    <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>{order.storeSlug}</p>
                  </div>
                  <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>
                    {new Date(order.createdAt).toLocaleDateString()}
                  </span>
                  <StatusBadge status={order.status} />
                  <StatusBadge status={order.designStatus || "not_started"} />
                  <p style={{ fontSize: "14px", color: "#fff", fontWeight: 500, textAlign: "right" }}>
                    ${(order.total / 100).toFixed(2)}
                  </p>
                </div>
              </Link>
            ))}
          </>
        )}
      </div>
    </PortalLayout>
  );
}
