// Supplier dashboard — lists orders assigned to the current supplier.
// Navy + gold theme. Reads from GET /api/supplier/orders (supplier-scoped).

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Loader2, LogOut, HelpCircle, X, ArrowLeft } from "lucide-react";
import { useState } from "react";

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
  const qc = useQueryClient();
  const [helpOpen, setHelpOpen] = useState(false);

  const { data, isLoading, error } = useQuery<{ orders: SupplierOrder[] }>({
    queryKey: ["/api/supplier/orders"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const endImpersonation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/auth/end-impersonation", {});
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      navigate("/admin");
    },
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
      {/* Impersonation banner — shown when an admin is viewing as this supplier */}
      {user?.impersonating && (
        <div style={{
          background: "#7c2d12", color: "#fff", padding: "10px 32px",
          fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
        }}>
          <span>
            <strong>Viewing as {user.teamName || user.email}</strong> — actions you take here will write to real orders.
          </span>
          <button
            onClick={() => endImpersonation.mutate()}
            disabled={endImpersonation.isPending}
            style={{
              background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 4, padding: "5px 12px", fontSize: 12, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <ArrowLeft size={12} /> {endImpersonation.isPending ? "Returning…" : "Return to admin"}
          </button>
        </div>
      )}

      {/* Help drawer — slides in from the right */}
      {helpOpen && (
        <div onClick={() => setHelpOpen(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            position: "absolute", right: 0, top: 0, bottom: 0, width: 420, maxWidth: "92vw",
            background: NAVY_LIGHT, borderLeft: `2px solid ${GOLD}`, padding: "24px 28px",
            overflowY: "auto", color: "#fff",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>How the portal works</div>
              <button onClick={() => setHelpOpen(false)} style={{ background: "transparent", border: 0, color: "rgba(255,255,255,0.7)", cursor: "pointer" }}><X size={18} /></button>
            </div>

            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>
              This is your live order board for Sideline NZ. Every PO we send you appears here automatically.
            </p>

            <div style={{ fontSize: 11, color: GOLD, textTransform: "uppercase", letterSpacing: 1.2, marginTop: 22, marginBottom: 6 }}>What to do</div>
            <ol style={{ fontSize: 13, lineHeight: 1.7, paddingLeft: 20, color: "rgba(255,255,255,0.85)" }}>
              <li>Open a PO to see the production sheet, mockups, size run, and the shared Google Drive folder.</li>
              <li>Tap <b style={{ color: GOLD }}>Files Received</b> once the artwork pack is in hand — this tells us production can start.</li>
              <li>Tap <b style={{ color: GOLD }}>Dispatched</b> when goods leave you. Add the courier + tracking number. This triggers our customer notification.</li>
            </ol>

            <div style={{ fontSize: 11, color: GOLD, textTransform: "uppercase", letterSpacing: 1.2, marginTop: 22, marginBottom: 6 }}>If something's wrong</div>
            <ul style={{ fontSize: 13, lineHeight: 1.7, paddingLeft: 20, color: "rgba(255,255,255,0.85)" }}>
              <li>Artwork unclear or files missing → reply to the PO email, don't guess.</li>
              <li>Sizing or quantity looks off → flag it before cutting.</li>
              <li>Login won't work → email <a href="mailto:orders@sidelinenz.com" style={{ color: GOLD }}>orders@sidelinenz.com</a> or WhatsApp Romero.</li>
            </ul>

            <div style={{ fontSize: 11, color: GOLD, textTransform: "uppercase", letterSpacing: 1.2, marginTop: 22, marginBottom: 6 }}>Stages explained</div>
            <ul style={{ fontSize: 12, lineHeight: 1.7, paddingLeft: 20, color: "rgba(255,255,255,0.75)" }}>
              <li><b>PO Raised</b> — order is yours, waiting on files-received confirmation.</li>
              <li><b>In Production</b> — you've confirmed files, garments are being made.</li>
              <li><b>Dispatched</b> — goods have left you; tracking is on the order.</li>
            </ul>

            <div style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
              Need a hand? <a href="mailto:orders@sidelinenz.com" style={{ color: GOLD }}>orders@sidelinenz.com</a>
            </div>
          </div>
        </div>
      )}

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
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          onClick={() => setHelpOpen(true)}
          aria-label="How the portal works"
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.7)",
            borderRadius: 6,
            padding: "8px 10px",
            cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6, fontSize: 13,
          }}
        >
          <HelpCircle className="w-4 h-4" /> Help
        </button>
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
        </div>
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

