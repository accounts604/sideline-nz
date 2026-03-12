import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Link } from "wouter";
import { ShoppingCart, Users, Palette, Clock, ArrowRight } from "lucide-react";

interface DashboardStats {
  totalOrders: number;
  pendingOrders: number;
  pendingDesigns: number;
  totalCustomers: number;
}

interface Order {
  id: string;
  orderNumber: string;
  customerEmail: string | null;
  customerName: string | null;
  status: string;
  designStatus: string | null;
  total: number;
  createdAt: string;
}

function StatCard({ label, value, icon: Icon, href, color }: {
  label: string;
  value: number;
  icon: React.ElementType;
  href: string;
  color: string;
}) {
  return (
    <Link href={href}>
      <div
        style={{
          background: "#111",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "12px",
          padding: "24px",
          cursor: "pointer",
          transition: "border-color 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: color, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={20} color="#fff" />
          </div>
          <ArrowRight size={16} color="rgba(255,255,255,0.3)" />
        </div>
        <p style={{ fontSize: "28px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>{value}</p>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>{label}</p>
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    pending: { bg: "rgba(234,179,8,0.15)", text: "#eab308" },
    paid: { bg: "rgba(34,197,94,0.15)", text: "#22c55e" },
    processing: { bg: "rgba(59,130,246,0.15)", text: "#3b82f6" },
    shipped: { bg: "rgba(168,85,247,0.15)", text: "#a855f7" },
    delivered: { bg: "rgba(34,197,94,0.15)", text: "#22c55e" },
    cancelled: { bg: "rgba(239,68,68,0.15)", text: "#ef4444" },
  };
  const c = colors[status] || { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.5)" };
  return (
    <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px", background: c.bg, color: c.text, textTransform: "uppercase", letterSpacing: "0.5px" }}>
      {status}
    </span>
  );
}

export default function AdminDashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/admin/dashboard"],
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery<{ orders: Order[]; total: number }>({
    queryKey: ["/api/admin/orders?limit=5"],
  });

  return (
    <AdminLayout>
      <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", marginBottom: "8px" }}>Dashboard</h1>
      <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", marginBottom: "32px" }}>
        Overview of your Sideline NZ operations
      </p>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "40px" }}>
        <StatCard label="Total Orders" value={stats?.totalOrders ?? 0} icon={ShoppingCart} href="/admin/orders" color="rgba(59,130,246,0.8)" />
        <StatCard label="Pending Orders" value={stats?.pendingOrders ?? 0} icon={Clock} href="/admin/orders?status=pending" color="rgba(234,179,8,0.8)" />
        <StatCard label="Pending Designs" value={stats?.pendingDesigns ?? 0} icon={Palette} href="/admin/designs" color="rgba(168,85,247,0.8)" />
        <StatCard label="Customers" value={stats?.totalCustomers ?? 0} icon={Users} href="/admin/customers" color="rgba(34,197,94,0.8)" />
      </div>

      {/* Recent Orders */}
      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#fff" }}>Recent Orders</h2>
          <Link href="/admin/orders">
            <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>View all &rarr;</span>
          </Link>
        </div>

        {ordersLoading || statsLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Loading...</div>
        ) : !ordersData?.orders?.length ? (
          <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>No orders yet</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Order", "Customer", "Status", "Total", "Date"].map((h) => (
                    <th key={h} style={{ padding: "12px 24px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordersData.orders.map((order) => (
                  <tr key={order.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "14px 24px" }}>
                      <Link href={`/admin/orders/${order.id}`}>
                        <span style={{ fontSize: "14px", color: "#fff", cursor: "pointer", fontWeight: 500 }}>{order.orderNumber}</span>
                      </Link>
                    </td>
                    <td style={{ padding: "14px 24px", fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>
                      {order.customerName || order.customerEmail || "—"}
                    </td>
                    <td style={{ padding: "14px 24px" }}>
                      <StatusBadge status={order.status} />
                    </td>
                    <td style={{ padding: "14px 24px", fontSize: "14px", color: "#fff", fontWeight: 500 }}>
                      ${(order.total / 100).toFixed(2)}
                    </td>
                    <td style={{ padding: "14px 24px", fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>
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
