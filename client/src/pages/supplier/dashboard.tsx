// Supplier dashboard — lists orders assigned to the current supplier.
// Navy + gold theme. Reads from GET /api/supplier/orders (supplier-scoped).

import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { getQueryFn } from "@/lib/queryClient";
import { Loader2, LogOut } from "lucide-react";

const NAVY = "#0A1628";
const NAVY_LIGHT = "#122239";
const GOLD = "#C9A84C";

type SupplierOrder = {
  id: string;
  orderNumber: string | null;
  poReference: string | null;
  accountName: string | null;
  customerName: string | null;
  pipelineStage: string | null;
  deliveryAddress: string | null;
  deliveryAttention: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export default function SupplierDashboard() {
  const { logout, user } = useAuth();
  const [, navigate] = useLocation();

  const { data, isLoading, error } = useQuery<{ orders: SupplierOrder[] }>({
    queryKey: ["/api/supplier/orders"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  async function handleLogout() {
    try {
      await logout();
    } finally {
      navigate("/supplier/login");
    }
  }

  const orders = data?.orders ?? [];

  return (
    <div style={{ minHeight: "100vh", background: NAVY, color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "20px 32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "18px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "2px",
              fontFamily: "'Bebas Neue', sans-serif",
              color: "#fff",
            }}
          >
            Sideline — Supplier Portal
          </div>
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", marginTop: "2px" }}>
            {user?.teamName || user?.email}
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.7)",
            borderRadius: "6px",
            padding: "8px 14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
          }}
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </header>

      {/* Content */}
      <main style={{ padding: "40px 32px", maxWidth: "1100px", margin: "0 auto" }}>
        <h1
          style={{
            fontSize: "24px",
            fontWeight: 700,
            marginBottom: "4px",
            fontFamily: "'Bebas Neue', sans-serif",
            letterSpacing: "1px",
          }}
        >
          Assigned Orders
        </h1>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "14px", marginBottom: "24px" }}>
          Orders currently raised to you. Click an order to download tech-pack files.
        </p>

        {isLoading && (
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: GOLD, margin: "0 auto" }} />
          </div>
        )}

        {error && (
          <p style={{ color: "#ef4444", fontSize: "13px" }}>
            Failed to load orders. Try signing out and back in.
          </p>
        )}

        {!isLoading && !error && orders.length === 0 && (
          <div
            style={{
              background: NAVY_LIGHT,
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "8px",
              padding: "40px",
              textAlign: "center",
              color: "rgba(255,255,255,0.55)",
              fontSize: "14px",
            }}
          >
            No orders assigned yet. New orders will appear here when Sideline raises them to you.
          </div>
        )}

        {orders.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {orders.map((o) => (
              <Link key={o.id} href={`/supplier/orders/${o.id}`}>
                <div
                  style={{
                    background: NAVY_LIGHT,
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "8px",
                    padding: "20px 24px",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = GOLD)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
                >
                  <div>
                    <div style={{ fontSize: "15px", fontWeight: 600, marginBottom: "4px" }}>
                      {o.orderNumber || "(no PO number)"}
                    </div>
                    <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.65)" }}>
                      {o.poReference || o.accountName || o.customerName || "—"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        color: GOLD,
                        border: `1px solid ${GOLD}`,
                        borderRadius: "4px",
                        padding: "4px 10px",
                      }}
                    >
                      {o.pipelineStage || "Assigned"}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

