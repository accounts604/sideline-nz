import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ClubPortalLayout } from "@/components/club-portal-layout";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Loader2, Download, AlertTriangle } from "lucide-react";

interface ClubMe {
  id: string;
  clubName: string;
  email: string;
  shopifyStoreUrl?: string;
  shopifyOrderTag?: string | null;
  profitShareTierBps?: number;
  hasSupporterCampaign?: boolean;
}

interface SupporterOrderRow {
  id: string;
  number: string;
  customerName: string | null;
  customerEmail: string | null;
  totalCents: number;
  currency: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  createdAt: string;
  items: string;
  unitCount: number;
}

interface SupporterSummary {
  orderCount: number;
  unitsSold: number;
  revenueCents: number;
  currency: string;
  profitShareCents: number;
  topSupporters: Array<{ name: string; email: string | null; spendCents: number }>;
}

interface OrdersResponse {
  orders: SupporterOrderRow[];
  summary: SupporterSummary;
}

function fmtMoney(cents: number, currency = "NZD"): string {
  const symbol = currency === "NZD" ? "$" : currency + " ";
  return symbol + (cents / 100).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusBadge(label: string | null, kind: "financial" | "fulfillment") {
  if (!label) return null;
  const positive = kind === "financial" ? label === "PAID" : label === "FULFILLED";
  const color = positive ? "#22c55e" : "rgba(255,255,255,0.6)";
  const bg = positive ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.06)";
  return (
    <span style={{
      padding: "2px 8px",
      background: bg,
      color,
      borderRadius: "3px",
      fontSize: "10px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
    }}>{label.replace(/_/g, " ")}</span>
  );
}

export default function ClubSupporterDashboard() {
  const [, navigate] = useLocation();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: me, isLoading: meLoading } = useQuery<ClubMe>({
    queryKey: ["/api/club-portal/me"],
    queryFn: getQueryFn({ on401: "throw" }),
    retry: 1,
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [from, to]);

  const ordersUrl = `/api/club-portal/supporter-orders${queryString}`;
  const csvUrl = `/api/club-portal/supporter-orders.csv${queryString}`;

  const { data, isLoading: ordersLoading, error } = useQuery<OrdersResponse>({
    queryKey: [ordersUrl],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!me?.hasSupporterCampaign,
    retry: 0,
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

  return (
    <ClubPortalLayout
      clubName={me?.clubName || "Club"}
      clubEmail={me?.email}
      shopifyStoreUrl={me?.shopifyStoreUrl}
      onLogout={handleLogout}
    >
      <h1 style={{
        fontSize: "28px",
        fontWeight: 700,
        color: "#fff",
        marginBottom: "8px",
        fontFamily: "var(--font-heading, monospace)",
        letterSpacing: "1px",
        textTransform: "uppercase",
      }}>
        Supporter Drop
      </h1>
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", marginBottom: "32px" }}>
        Live orders from your supporter campaign on Sideline.
      </p>

      {!me?.hasSupporterCampaign && (
        <div style={{
          padding: "20px",
          background: "rgba(255,200,0,0.06)",
          border: "1px solid rgba(255,200,0,0.2)",
          borderRadius: "6px",
          color: "rgba(255,255,255,0.85)",
          fontSize: "13px",
          display: "flex",
          gap: "12px",
          alignItems: "flex-start",
        }}>
          <AlertTriangle size={16} style={{ color: "#facc15", flexShrink: 0, marginTop: "2px" }} />
          <div>
            <strong>Supporter campaign not configured yet.</strong>
            <div style={{ marginTop: "4px", color: "rgba(255,255,255,0.5)", fontSize: "12px" }}>
              Sideline links your Shopify orders to this dashboard via a club tag. Reach out to <a href="mailto:info@sidelinenz.com" style={{ color: "#fff" }}>info@sidelinenz.com</a> and we'll wire it up.
            </div>
          </div>
        </div>
      )}

      {me?.hasSupporterCampaign && (
        <>
          {/* Date range + export */}
          <div style={{
            display: "flex",
            gap: "12px",
            alignItems: "flex-end",
            flexWrap: "wrap",
            marginBottom: "24px",
            padding: "16px",
            background: "#0c0c0c",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "6px",
          }}>
            <div>
              <label style={{ display: "block", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: "6px" }}>From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                style={{
                  background: "#000",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#fff",
                  padding: "8px 10px",
                  borderRadius: "4px",
                  fontSize: "13px",
                  colorScheme: "dark",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: "6px" }}>To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                style={{
                  background: "#000",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#fff",
                  padding: "8px 10px",
                  borderRadius: "4px",
                  fontSize: "13px",
                  colorScheme: "dark",
                }}
              />
            </div>
            {(from || to) && (
              <button
                onClick={() => { setFrom(""); setTo(""); }}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.7)",
                  padding: "8px 14px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >Clear</button>
            )}
            <div style={{ flex: 1 }} />
            <a
              href={csvUrl}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "#fff",
                color: "#000",
                padding: "9px 14px",
                borderRadius: "4px",
                textDecoration: "none",
                fontSize: "12px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              <Download size={14} /> Export CSV
            </a>
          </div>

          {/* Headline stats */}
          {ordersLoading && (
            <div style={{ padding: "60px", textAlign: "center" }}>
              <Loader2 className="animate-spin" style={{ color: "#fff" }} />
            </div>
          )}

          {error && (
            <div style={{
              padding: "20px",
              background: "rgba(239,68,68,0.06)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: "6px",
              color: "#fca5a5",
              fontSize: "13px",
            }}>
              Couldn't load orders. {String((error as Error).message)}
            </div>
          )}

          {data && (
            <>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "12px",
                marginBottom: "32px",
              }}>
                <StatCard label="Orders" value={data.summary.orderCount.toString()} sub={`${data.summary.unitsSold} units sold`} />
                <StatCard label="Revenue" value={fmtMoney(data.summary.revenueCents, data.summary.currency)} sub={`${data.summary.currency} incl. GST`} />
                <StatCard
                  label="Profit Share Owed"
                  value={fmtMoney(data.summary.profitShareCents, data.summary.currency)}
                  sub={`${((me?.profitShareTierBps ?? 800) / 100).toFixed(0)}% of revenue`}
                  highlight
                />
              </div>

              {/* Top supporters */}
              {data.summary.topSupporters.length > 0 && (
                <SectionLabel>Top supporters by spend</SectionLabel>
              )}
              {data.summary.topSupporters.length > 0 && (
                <div style={{
                  background: "#0c0c0c",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "6px",
                  marginBottom: "32px",
                  overflow: "hidden",
                }}>
                  {data.summary.topSupporters.map((s, i) => (
                    <div key={i} style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "12px 16px",
                      borderBottom: i < data.summary.topSupporters.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                    }}>
                      <span style={{ width: 28, color: "rgba(255,255,255,0.4)", fontSize: 12 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: "#fff", fontSize: 13, fontWeight: 500 }}>{s.name}</div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{s.email}</div>
                      </div>
                      <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
                        {fmtMoney(s.spendCents, data.summary.currency)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Order list */}
              <SectionLabel>All orders ({data.orders.length})</SectionLabel>
              <div style={{
                background: "#0c0c0c",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "6px",
                overflow: "hidden",
              }}>
                {data.orders.length === 0 ? (
                  <div style={{ padding: "32px", textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                    No orders in this date range yet.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#111" }}>
                          <Th>Order</Th>
                          <Th>Date</Th>
                          <Th>Supporter</Th>
                          <Th>Items</Th>
                          <Th align="right">Qty</Th>
                          <Th align="right">Total</Th>
                          <Th>Status</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.orders.map((o) => (
                          <tr key={o.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                            <Td>{o.number}</Td>
                            <Td>{new Date(o.createdAt).toLocaleDateString("en-NZ")}</Td>
                            <Td>
                              <div>{o.customerName || "—"}</div>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{o.customerEmail}</div>
                            </Td>
                            <Td>
                              <div style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.items}>
                                {o.items || "—"}
                              </div>
                            </Td>
                            <Td align="right">{o.unitCount}</Td>
                            <Td align="right">{fmtMoney(o.totalCents, o.currency)}</Td>
                            <Td>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {statusBadge(o.financialStatus, "financial")}
                                {statusBadge(o.fulfillmentStatus, "fulfillment")}
                              </div>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </ClubPortalLayout>
  );
}

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div style={{
      background: "#0c0c0c",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "6px",
      padding: "20px",
    }}>
      <div style={{ fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "26px", fontWeight: 700, color: highlight ? "#22c55e" : "#fff", letterSpacing: "-0.5px" }}>{value}</div>
      {sub && <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "6px" }}>{sub}</div>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: "10px",
      letterSpacing: "1.5px",
      textTransform: "uppercase",
      color: "rgba(255,255,255,0.4)",
      marginBottom: "10px",
    }}>{children}</div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th style={{
      padding: "10px 14px",
      textAlign: align,
      fontSize: "10px",
      fontWeight: 600,
      letterSpacing: "1px",
      textTransform: "uppercase",
      color: "rgba(255,255,255,0.4)",
    }}>{children}</th>
  );
}

function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <td style={{
      padding: "12px 14px",
      fontSize: "13px",
      color: "rgba(255,255,255,0.85)",
      textAlign: align,
      verticalAlign: "top",
    }}>{children}</td>
  );
}
