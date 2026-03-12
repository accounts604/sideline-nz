import { useQuery } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal-layout";
import { Link } from "wouter";
import { ShoppingCart, Palette, Bell, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

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

export default function PortalDashboard() {
  const { user } = useAuth();
  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ["/api/portal/orders"],
  });

  const { data: notifications } = useQuery<any[]>({
    queryKey: ["/api/portal/notifications"],
  });

  const activeOrders = orders?.filter(o => !["delivered", "cancelled"].includes(o.status)) || [];
  const needsDesign = orders?.filter(o => o.designStatus === "needs_revision" || o.designStatus === "not_started") || [];
  const unreadNotifs = notifications?.filter((n: any) => !n.read) || [];

  return (
    <PortalLayout>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff" }}>
          Welcome{user?.teamName ? `, ${user.teamName}` : ""}
        </h1>
        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>
          Manage your orders and design files
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "32px" }}>
        {[
          { label: "Active Orders", value: activeOrders.length, icon: ShoppingCart, color: "#3b82f6" },
          { label: "Designs Needed", value: needsDesign.length, icon: Palette, color: "#eab308" },
          { label: "Unread Notifications", value: unreadNotifs.length, icon: Bell, color: "#a855f7" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <Icon size={18} color={color} />
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
            </div>
            <p style={{ fontSize: "28px", fontWeight: 700, color: "#fff" }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Recent orders */}
      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>Recent Orders</h2>
          <Link href="/portal/orders">
            <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
              View all <ArrowRight size={14} />
            </span>
          </Link>
        </div>

        {isLoading ? (
          <div style={{ padding: "32px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>Loading...</div>
        ) : !orders || orders.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>No orders yet</div>
        ) : (
          orders.slice(0, 5).map((order) => (
            <Link key={order.id} href={`/portal/orders/${order.id}`}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", transition: "background 0.1s", }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: "14px", color: "#fff", fontWeight: 500 }}>{order.orderNumber}</p>
                  <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge status={order.status} />
                <StatusBadge status={order.designStatus || "not_started"} />
                <p style={{ fontSize: "14px", color: "#fff", fontWeight: 500, minWidth: "80px", textAlign: "right" }}>
                  ${(order.total / 100).toFixed(2)}
                </p>
              </div>
            </Link>
          ))
        )}
      </div>
    </PortalLayout>
  );
}
