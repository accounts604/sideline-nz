import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ClubPortalLayout } from "@/components/club-portal-layout";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Loader2, ExternalLink } from "lucide-react";

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  kitItems: string;
  quantity: number;
  trackingNumber: string | null;
  trackingUrl: string | null;
  estimatedDeliveryDate: string | null;
}

interface ClubMe {
  clubName: string;
  email: string;
}

const STAGES = [
  {
    key: "brief_received",
    label: "Brief received",
    description: "We've received your brief and are preparing your design concept.",
  },
  {
    key: "mockup_in_progress",
    label: "Mockup in progress",
    description: "Our design team is working on your custom concept.",
  },
  {
    key: "mockup_ready",
    label: "Mockup ready",
    description: "Your mockup is ready. Please log in to review and approve.",
  },
  {
    key: "revision_in_progress",
    label: "Revision in progress",
    description: "We're making the changes you requested.",
  },
  {
    key: "design_approved",
    label: "Design approved",
    description: "Your design is locked and ready for production.",
  },
  {
    key: "in_production",
    label: "In production",
    description: "Your order is being manufactured.",
  },
  {
    key: "shipped",
    label: "Shipped",
    description: "Your order is on its way.",
  },
  {
    key: "delivered",
    label: "Delivered",
    description: "Your order has been delivered. Enjoy your kit!",
  },
];

export default function OrderTrackingPage() {
  const [, navigate] = useLocation();

  const { data: me } = useQuery<ClubMe>({
    queryKey: ["/api/club-portal/me"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: order, isLoading: orderLoading } = useQuery<Order>({
    queryKey: ["/api/club-portal/order"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const handleLogout = async () => {
    await apiRequest("POST", "/api/club-portal/logout");
    navigate("/club-portal/login");
  };

  if (orderLoading) {
    return (
      <ClubPortalLayout
        clubName={me?.clubName || "Club"}
        clubEmail={me?.email}
        onLogout={handleLogout}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#fff" }} />
        </div>
      </ClubPortalLayout>
    );
  }

  const currentStatus = order?.status || "brief_received";
  const currentStageIndex = STAGES.findIndex(s => s.key === currentStatus);
  const currentStage = STAGES[currentStageIndex];

  return (
    <ClubPortalLayout
      clubName={me?.clubName || "Club"}
      clubEmail={me?.email}
      onLogout={handleLogout}
    >
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
        Order Tracking
      </h1>

      {/* Large Stage Tracker */}
      <div style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "32px" }}>
          {STAGES.map((stage, idx) => (
            <div key={stage.key} style={{ display: "flex", alignItems: "flex-start", gap: "12px", flex: 1, minWidth: "80px" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    background: idx <= currentStageIndex ? "#fff" : "rgba(255,255,255,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: idx <= currentStageIndex ? "#000" : "rgba(255,255,255,0.2)",
                    animation: idx === currentStageIndex ? "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" : "none",
                  }}
                >
                  {idx <= currentStageIndex ? "✓" : ""}
                </div>
                {idx < STAGES.length - 1 && (
                  <div
                    style={{
                      width: "2px",
                      height: "40px",
                      background: idx < currentStageIndex ? "#fff" : "rgba(255,255,255,0.2)",
                    }}
                  />
                )}
              </div>
              <div style={{ paddingTop: "2px" }}>
                <p
                  style={{
                    fontSize: "11px",
                    fontWeight: idx === currentStageIndex ? 600 : 500,
                    color: idx <= currentStageIndex ? "#fff" : "rgba(255,255,255,0.4)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    lineHeight: "1.2",
                  }}
                >
                  {stage.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Current Stage Details */}
      <div
        style={{
          padding: "24px",
          background: "#111",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "6px",
          marginBottom: "32px",
        }}
      >
        <h2
          style={{
            fontSize: "16px",
            fontWeight: 600,
            color: "#fff",
            marginBottom: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {currentStage?.label}
        </h2>

        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", marginBottom: "16px" }}>
          {currentStage?.description}
        </p>

        {order?.estimatedDeliveryDate && (
          <div
            style={{
              padding: "12px",
              background: "#000",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "4px",
              fontSize: "12px",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            <p style={{ marginBottom: "4px" }}>Estimated date for this stage:</p>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
              {new Date(order.estimatedDeliveryDate).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>

      {/* Tracking Number */}
      {order?.trackingNumber && (
        <div
          style={{
            padding: "24px",
            background: "#111",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "6px",
            marginBottom: "32px",
          }}
        >
          <h3
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "rgba(255,255,255,0.5)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: "12px",
            }}
          >
            Shipping Tracking
          </h3>

          <div
            style={{
              padding: "12px",
              background: "#000",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "4px" }}>
                Tracking Number
              </p>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "#fff", fontFamily: "monospace" }}>
                {order.trackingNumber}
              </p>
            </div>

            <a
              href={order.trackingUrl || `https://www.nzpost.co.nz/tracking?number=${order.trackingNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
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
                textDecoration: "none",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.9)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            >
              View Tracking
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      )}

      {/* Order Summary */}
      <div
        style={{
          padding: "24px",
          background: "#111",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "6px",
        }}
      >
        <h3
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "rgba(255,255,255,0.5)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: "16px",
          }}
        >
          Order Summary
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          <div>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "4px" }}>
              Order Number
            </p>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
              {order?.orderNumber}
            </p>
          </div>

          <div>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "4px" }}>
              Kit Items
            </p>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
              {order?.kitItems}
            </p>
          </div>

          <div>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "4px" }}>
              Total Quantity
            </p>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
              {order?.quantity} pieces
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </ClubPortalLayout>
  );
}
