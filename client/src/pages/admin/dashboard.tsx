import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Link, useLocation } from "wouter";
import { ShoppingCart, Users, Palette, Clock, ArrowRight, Package, Store, FlaskConical, Truck, Trash2, Copy, FileText } from "lucide-react";
import { SIDELINE_PIPELINE_STAGES } from "@shared/pipeline";
import { apiRequest } from "@/lib/queryClient";

const iconBtnStyle: React.CSSProperties = {
  padding: "4px 7px",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.6)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "5px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
};

interface DashboardStats {
  totalOrders: number;
  pendingOrders: number;
  pendingDesigns: number;
  totalCustomers: number;
  bulkOrders: number;
  teamStoreOrders: number;
  sampleRuns: number;
  totalSuppliers: number;
  byStage: Record<string, number>;
}

interface Order {
  id: string;
  orderNumber: string;
  customerEmail: string | null;
  customerName: string | null;
  accountName: string | null;
  status: string;
  designStatus: string | null;
  orderType: string | null;
  pipelineStage: string | null;
  dueDate: string | null;
  total: number;
  createdAt: string;
}

const ORDER_TYPE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  "bulk-order": { bg: "rgba(168,85,247,0.15)", color: "#a855f7", label: "Bulk" },
  "team-store": { bg: "rgba(59,130,246,0.15)", color: "#3b82f6", label: "Store" },
  "sample-run": { bg: "rgba(234,179,8,0.15)", color: "#eab308", label: "Sample" },
};

function StatCard({ label, value, icon: Icon, href, color }: {
  label: string; value: number; icon: React.ElementType; href: string; color: string;
}) {
  return (
    <Link href={href}>
      <div
        style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px", cursor: "pointer", transition: "border-color 0.15s" }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: color, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={18} color="#fff" />
          </div>
          <ArrowRight size={14} color="rgba(255,255,255,0.2)" />
        </div>
        <p style={{ fontSize: "24px", fontWeight: 700, color: "#fff", marginBottom: "2px" }}>{value}</p>
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>{label}</p>
      </div>
    </Link>
  );
}

function Badge({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: "10px", fontWeight: 600, padding: "3px 7px", borderRadius: "4px", background: bg, color, textTransform: "uppercase", letterSpacing: "0.3px", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/admin/dashboard"],
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery<{ orders: Order[]; total: number }>({
    queryKey: ["/api/admin/orders?limit=8"],
  });

  const deleteMut = useMutation({
    mutationFn: async (orderId: string) => {
      const r = await apiRequest("DELETE", `/api/admin/orders/${orderId}`);
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/orders?limit=8"] }),
  });

  const duplicateMut = useMutation({
    mutationFn: async (orderId: string) => {
      const r = await apiRequest("POST", `/api/admin/orders/${orderId}/duplicate`);
      return r.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders?limit=8"] });
      if (data?.order?.id) navigate(`/admin/orders/${data.order.id}`);
    },
  });

  const byStage = stats?.byStage || {};

  return (
    <AdminLayout>
      <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>Dashboard</h1>
      <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", marginBottom: "28px" }}>Sideline NZ operations overview</p>

      {/* ──── Top stat cards ──── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "28px" }}>
        <StatCard label="Total Orders" value={stats?.totalOrders ?? 0} icon={ShoppingCart} href="/admin/orders" color="rgba(59,130,246,0.8)" />
        <StatCard label="Bulk Orders" value={stats?.bulkOrders ?? 0} icon={Package} href="/admin/orders" color="rgba(168,85,247,0.8)" />
        <StatCard label="Team Stores" value={stats?.teamStoreOrders ?? 0} icon={Store} href="/admin/orders" color="rgba(59,130,246,0.8)" />
        <StatCard label="Sample Runs" value={stats?.sampleRuns ?? 0} icon={FlaskConical} href="/admin/orders" color="rgba(234,179,8,0.8)" />
        <StatCard label="Pending Designs" value={stats?.pendingDesigns ?? 0} icon={Palette} href="/admin/designs" color="rgba(168,85,247,0.8)" />
        <StatCard label="Customers" value={stats?.totalCustomers ?? 0} icon={Users} href="/admin/customers" color="rgba(34,197,94,0.8)" />
        <StatCard label="Suppliers" value={stats?.totalSuppliers ?? 0} icon={Truck} href="/admin/orders" color="rgba(249,115,22,0.8)" />
        <StatCard label="Pending Orders" value={stats?.pendingOrders ?? 0} icon={Clock} href="/admin/orders?status=pending" color="rgba(234,179,8,0.8)" />
      </div>

      {/* ──── Pipeline stage breakdown ──── */}
      {Object.keys(byStage).length > 0 && (
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "18px 20px", marginBottom: "28px" }}>
          <h2 style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "14px" }}>Pipeline</h2>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {SIDELINE_PIPELINE_STAGES.map((stage) => {
              const count = byStage[stage] || 0;
              return (
                <div key={stage} style={{
                  flex: "1 1 100px", textAlign: "center", padding: "10px 8px", borderRadius: "8px",
                  background: count > 0 ? "rgba(249,115,22,0.06)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${count > 0 ? "rgba(249,115,22,0.2)" : "rgba(255,255,255,0.04)"}`,
                }}>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: count > 0 ? "#f97316" : "rgba(255,255,255,0.2)" }}>{count}</div>
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", marginTop: "2px", lineHeight: "1.3" }}>{stage}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ──── Recent Orders ──── */}
      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 style={{ fontSize: "14px", fontWeight: 600, color: "#fff" }}>Recent Orders</h2>
          <Link href="/admin/orders"><span style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)", cursor: "pointer" }}>View all &rarr;</span></Link>
        </div>

        {ordersLoading || statsLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>Loading...</div>
        ) : !ordersData?.orders?.length ? (
          <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>No orders yet</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Order", "Type", "Company", "Stage", "Status", "Due", "Date", ""].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "10px", fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordersData.orders.map((order) => {
                  const typeStyle = ORDER_TYPE_STYLE[order.orderType || "bulk-order"] || ORDER_TYPE_STYLE["bulk-order"];
                  return (
                    <tr key={order.id}
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <Link href={`/admin/orders/${order.id}`}>
                          <span style={{ fontSize: "13px", color: "#fff", fontWeight: 600, cursor: "pointer", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                            {order.orderNumber}
                          </span>
                        </Link>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <Badge bg={typeStyle.bg} color={typeStyle.color}>{typeStyle.label}</Badge>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: "12px", color: "rgba(255,255,255,0.65)" }}>
                        {order.accountName || order.customerName || order.customerEmail || "—"}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {order.pipelineStage ? (
                          <Badge bg="rgba(249,115,22,0.12)" color="#f97316">{order.pipelineStage}</Badge>
                        ) : (
                          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <Badge
                          bg={order.status === "processing" ? "rgba(59,130,246,0.15)" : order.status === "delivered" ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.15)"}
                          color={order.status === "processing" ? "#3b82f6" : order.status === "delivered" ? "#22c55e" : "#eab308"}
                        >
                          {order.status}
                        </Badge>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: "11px", color: "rgba(255,255,255,0.5)", fontFamily: "ui-monospace, Menlo, monospace" }}>
                        {order.dueDate || "—"}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>
                        {new Date(order.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "inline-flex", gap: "4px" }}>
                          <Link href={`/admin/orders/${order.id}/po`}>
                            <button title="Open PO preview" style={iconBtnStyle}>
                              <FileText size={12} />
                            </button>
                          </Link>
                          <button
                            title="Duplicate as new order"
                            onClick={() => { if (window.confirm(`Duplicate ${order.orderNumber}?`)) duplicateMut.mutate(order.id); }}
                            disabled={duplicateMut.isPending}
                            style={iconBtnStyle}
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            title="Delete order"
                            onClick={() => { if (window.confirm(`Delete ${order.orderNumber}?\n\nThis removes the order and all associated data. Cannot be undone.`)) deleteMut.mutate(order.id); }}
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
