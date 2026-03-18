import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ClubPortalLayout } from "@/components/club-portal-layout";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { ArrowRight, Loader2 } from "lucide-react";

interface ClubMe {
  id: string;
  clubName: string;
  email: string;
  shopifyStoreUrl?: string;
  currentOrderStatus: string | null;
  currentOrderId: string | null;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  kitItems: string;
  quantity: number;
  mockupUrl: string | null;
  trackingNumber: string | null;
  estimatedDeliveryDate: string | null;
}

const STAGES = [
  { key: "brief_received", label: "Brief received" },
  { key: "mockup_in_progress", label: "Mockup in progress" },
  { key: "mockup_ready", label: "Mockup ready — action required" },
  { key: "revision_in_progress", label: "Revision in progress" },
  { key: "design_approved", label: "Design approved" },
  { key: "in_production", label: "In production" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
];

function StageTracker({ currentStatus }: { currentStatus: string }) {
  const currentIndex = STAGES.findIndex(s => s.key === currentStatus);

  return (
    <div style={{ marginBottom: "32px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        {STAGES.map((stage, idx) => (
          <div key={stage.key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: idx <= currentIndex ? "#fff" : "rgba(255,255,255,0.2)",
                animation: idx === currentIndex ? "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" : "none",
              }}
            />
            {idx < STAGES.length - 1 && (
              <div
                style={{
                  width: "16px",
                  height: "1px",
                  background: idx < currentIndex ? "#fff" : "rgba(255,255,255,0.2)",
                }}
              />
            )}
          </div>
        ))}
      </div>
      <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>
        {STAGES[currentIndex]?.label}
      </p>
    </div>
  );
}

export default function ClubPortalDashboard() {
  const [, navigate] = useLocation();

  const { data: me, isLoading: meLoading } = useQuery<ClubMe>({
    queryKey: ["/api/club-portal/me"],
    queryFn: getQueryFn(),
    retry: 1,
  });

  const { data: order, isLoading: orderLoading } = useQuery<Order>({
    queryKey: ["/api/club-portal/order"],
    queryFn: getQueryFn(),
    enabled: !!me?.currentOrderId,
    retry: 1,
  });

  const handleLogout = async () => {
    await apiRequest("POST", "/api/club-portal/logout");
    navigate("/club-portal/login");
  };

  if (meLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#fff" }} />
      </div>
    );
  }

  const currentStatus = order?.status || me?.currentOrderStatus || "brief_received";
  const showMockupBanner = currentStatus === "mockup_ready";
  const showProductionBanner = ["design_approved", "in_production", "shipped", "delivered"].includes(currentStatus);

  return (
    <ClubPortalLayout
      clubName={me?.clubName || "Club"}
      clubEmail={me?.email}
      shopifyStoreUrl={me?.shopifyStoreUrl}
      onLogout={handleLogout}
    >
      {/* Welcome Heading */}
      <h1
        style={{
          fontSize: "28px",
          fontWeight: 700,
          color: "#fff",
          marginBottom: "32px",
          fontFamily: "var(--font-heading, monospace)",
          letterSpacing: "1px",
          textTransform: "uppercase",
        }}
      >
        Welcome back, {me?.clubName}
      </h1>

      {/* Mockup Ready Banner */}
      {showMockupBanner && (
        <div
          style={{
            padding: "16px",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "6px",
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>
              Your mockup is ready. Please review and approve.
            </p>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
              Approve to move to production or request changes.
            </p>
          </div>
          <button
            onClick={() => navigate("/club-portal/mockup-review")}
            style={{
              padding: "8px 16px",
              background: "#fff",
              color: "#000",
              border: "none",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              cursor: "pointer",
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginLeft: "16px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.9)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
          >
            Review mockup
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Production Banner */}
      {showProductionBanner && (
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: "6px",
            marginBottom: "24px",
          }}
        >
          <p style={{ fontSize: "13px", color: "#22c55e", fontWeight: 500 }}>
            Design locked. Your order is in production.
          </p>
        </div>
      )}

      {/* Order Status Card */}
      <div
        style={{
          background: "#111",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "6px",
          padding: "24px",
          marginBottom: "24px",
        }}
      >
        <h2
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "rgba(255,255,255,0.5)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: "16px",
          }}
        >
          Current Order Status
        </h2>

        {orderLoading ? (
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#fff" }} />
        ) : (
          <>
            <StageTracker currentStatus={currentStatus} />

            {/* Summary Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "16px",
                marginTop: "24px",
              }}
            >
              <div
                style={{
                  padding: "12px",
                  background: "#000",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "4px",
                }}
              >
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "4px" }}>
                  Order Reference
                </p>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "#fff" }}>
                  {order?.orderNumber || "—"}
                </p>
              </div>

              <div
                style={{
                  padding: "12px",
                  background: "#000",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "4px",
                }}
              >
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "4px" }}>
                  Kit Items
                </p>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "#fff" }}>
                  {order?.kitItems || "—"}
                </p>
              </div>

              <div
                style={{
                  padding: "12px",
                  background: "#000",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "4px",
                }}
              >
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "4px" }}>
                  Quantity
                </p>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "#fff" }}>
                  {order?.quantity || "—"}
                </p>
              </div>

              <div
                style={{
                  padding: "12px",
                  background: "#000",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "4px",
                }}
              >
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "4px" }}>
                  Est. Delivery
                </p>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "#fff" }}>
                  {order?.estimatedDeliveryDate
                    ? new Date(order.estimatedDeliveryDate).toLocaleDateString()
                    : "TBD"}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Quick Actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
        <button
          onClick={() => navigate("/club-portal/order-tracking")}
          style={{
            padding: "12px 16px",
            background: "#111",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "6px",
            color: "#fff",
            fontSize: "12px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#111";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
          }}
        >
          Track Order
        </button>

        {order?.trackingNumber && (
          <a
            href={order.trackingUrl || `https://www.nzpost.co.nz/tracking?number=${order.trackingNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "12px 16px",
              background: "#111",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "6px",
              color: "#fff",
              fontSize: "12px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              cursor: "pointer",
              transition: "all 0.15s ease",
              textDecoration: "none",
              textAlign: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.08)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#111";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
            }}
          >
            View Tracking
          </a>
        )}
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </ClubPortalLayout>
  );
}
