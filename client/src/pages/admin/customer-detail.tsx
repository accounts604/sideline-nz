import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { useParams, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Edit2 } from "lucide-react";

interface Customer {
  id: string;
  email: string | null;
  teamName: string | null;
  contactPhone: string | null;
  emailVerified: boolean | null;
  createdAt: string;
  inviteToken: string | null;
  inviteExpiresAt: string | null;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  designStatus: string | null;
  total: number;
  storeSlug: string;
  createdAt: string;
}

interface CustomerDetail {
  customer: Customer;
  orders: Order[];
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

export default function AdminCustomerDetail() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [phone, setPhone] = useState("");

  const { data, isLoading } = useQuery<CustomerDetail>({
    queryKey: [`/api/admin/customers/${params.id}`],
    enabled: !!params.id,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { teamName?: string; contactPhone?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/customers/${params.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/customers/${params.id}`] });
      setEditing(false);
    },
  });

  if (isLoading) {
    return <AdminLayout><div style={{ color: "rgba(255,255,255,0.3)", padding: "40px", textAlign: "center" }}>Loading...</div></AdminLayout>;
  }

  if (!data) {
    return <AdminLayout><div style={{ color: "rgba(255,255,255,0.5)", padding: "40px", textAlign: "center" }}>Customer not found</div></AdminLayout>;
  }

  const { customer, orders } = data;

  return (
    <AdminLayout>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <Link href="/admin/customers">
          <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "16px" }}>
            <ArrowLeft size={14} /> Back to Customers
          </span>
        </Link>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff" }}>
          {customer.teamName || customer.email || "Customer"}
        </h1>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
          {customer.email} &middot; Joined {new Date(customer.createdAt).toLocaleDateString()}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: "24px" }}>
        {/* Profile card */}
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>Profile</h3>
            <button
              onClick={() => {
                if (!editing) {
                  setTeamName(customer.teamName || "");
                  setPhone(customer.contactPhone || "");
                }
                setEditing(!editing);
              }}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}
            >
              <Edit2 size={16} />
            </button>
          </div>

          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "4px" }}>Team Name</label>
                <input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", fontSize: "13px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff", outline: "none" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "4px" }}>Phone</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", fontSize: "13px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff", outline: "none" }}
                />
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => updateMutation.mutate({ teamName, contactPhone: phone })}
                  disabled={updateMutation.isPending}
                  style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 600, background: "#fff", color: "#000", border: "none", borderRadius: "6px", cursor: "pointer" }}
                >
                  Save
                </button>
                <button
                  onClick={() => setEditing(false)}
                  style={{ padding: "8px 16px", fontSize: "13px", color: "rgba(255,255,255,0.5)", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>Email</p>
                <p style={{ fontSize: "14px", color: "#fff" }}>{customer.email || "—"}</p>
              </div>
              <div>
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>Team</p>
                <p style={{ fontSize: "14px", color: "#fff" }}>{customer.teamName || "—"}</p>
              </div>
              <div>
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>Phone</p>
                <p style={{ fontSize: "14px", color: "#fff" }}>{customer.contactPhone || "—"}</p>
              </div>
              <div>
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>Verified</p>
                <span style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: "4px",
                  background: customer.emailVerified ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.15)",
                  color: customer.emailVerified ? "#22c55e" : "#eab308",
                }}>
                  {customer.emailVerified ? "Yes" : "Pending"}
                </span>
              </div>
              {customer.inviteToken && (
                <div>
                  <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>Invite</p>
                  <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", wordBreak: "break-all" }}>
                    Token: {customer.inviteToken.substring(0, 16)}...
                    {customer.inviteExpiresAt && <><br />Expires: {new Date(customer.inviteExpiresAt).toLocaleString()}</>}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Orders */}
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "hidden" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            Orders ({orders.length})
          </h3>
          {orders.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>No orders yet</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {["Order", "Store", "Status", "Total", "Date"].map((h) => (
                      <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "14px 20px" }}>
                        <Link href={`/admin/orders/${order.id}`}>
                          <span style={{ fontSize: "14px", color: "#fff", cursor: "pointer", fontWeight: 500 }}>{order.orderNumber}</span>
                        </Link>
                      </td>
                      <td style={{ padding: "14px 20px", fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>{order.storeSlug}</td>
                      <td style={{ padding: "14px 20px" }}><StatusBadge status={order.status} /></td>
                      <td style={{ padding: "14px 20px", fontSize: "14px", color: "#fff", fontWeight: 500 }}>${(order.total / 100).toFixed(2)}</td>
                      <td style={{ padding: "14px 20px", fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>{new Date(order.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          div[style*="grid-template-columns: 360px 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </AdminLayout>
  );
}
