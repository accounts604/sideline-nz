import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Link, useParams } from "wouter";
import { ArrowLeft, Send, CheckCircle, XCircle, FileText, Copy, ExternalLink, RefreshCw } from "lucide-react";

export default function AdminQuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/admin/quotes/${id}`],
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/quotes/${id}/send`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/admin/quotes/${id}`] }),
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/quotes/${id}/convert`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/quotes/${id}`] });
      if (data.orderId) window.location.href = `/admin/orders/${data.orderId}`;
    },
  });

  if (isLoading) return <AdminLayout><div style={{ color: "rgba(255,255,255,0.3)", padding: "40px" }}>Loading...</div></AdminLayout>;
  if (!data?.quote) return <AdminLayout><div style={{ color: "#ef4444", padding: "40px" }}>Quote not found</div></AdminLayout>;

  const { quote, items } = data;
  const baseUrl = window.location.origin;
  const publicUrl = `${baseUrl}/quote-view/${quote.accessToken}`;

  const statusColors: Record<string, string> = {
    draft: "rgba(255,255,255,0.5)", sent: "#3b82f6", viewed: "#a855f7",
    accepted: "#22c55e", rejected: "#ef4444", expired: "rgba(255,255,255,0.3)",
  };

  const labelStyle: React.CSSProperties = { fontSize: "11px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px" };
  const valueStyle: React.CSSProperties = { fontSize: "14px", color: "#fff", marginTop: "2px" };

  return (
    <AdminLayout>
      <div style={{ marginBottom: "24px" }}>
        <Link href="/admin/quotes">
          <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "16px" }}>
            <ArrowLeft size={14} /> Back to Quotes
          </span>
        </Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "12px" }}>
              <FileText size={24} /> {quote.quoteNumber}
            </h1>
            <span style={{
              display: "inline-block", marginTop: "8px", padding: "4px 12px", borderRadius: "6px",
              fontSize: "12px", fontWeight: 600, color: statusColors[quote.status] || "#fff",
              background: `${statusColors[quote.status] || "#fff"}18`,
            }}>
              {quote.status.toUpperCase()}
            </span>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            {quote.status === "draft" && (
              <button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}
                style={{
                  padding: "10px 20px", fontSize: "13px", fontWeight: 600,
                  background: "#3b82f6", color: "#fff", border: "none",
                  borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
                }}>
                <Send size={14} /> {sendMutation.isPending ? "Sending..." : "Send to Customer"}
              </button>
            )}
            {(quote.status === "accepted" || quote.status === "viewed") && !quote.convertedToOrderId && (
              <button onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending}
                style={{
                  padding: "10px 20px", fontSize: "13px", fontWeight: 600,
                  background: "#22c55e", color: "#fff", border: "none",
                  borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
                }}>
                <RefreshCw size={14} /> {convertMutation.isPending ? "Converting..." : "Convert to PO"}
              </button>
            )}
            {quote.convertedToOrderId && (
              <Link href={`/admin/orders/${quote.convertedToOrderId}`}>
                <button style={{
                  padding: "10px 20px", fontSize: "13px", fontWeight: 600,
                  background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)",
                  borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
                }}>
                  <CheckCircle size={14} /> View Order
                </button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "24px", maxWidth: "1100px" }}>
        {/* Main content */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Customer */}
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px" }}>
            <h3 style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "16px" }}>Customer</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div><div style={labelStyle}>Name</div><div style={valueStyle}>{quote.customerName}</div></div>
              <div><div style={labelStyle}>Email</div><div style={valueStyle}>{quote.customerEmail}</div></div>
              {quote.teamName && <div><div style={labelStyle}>Team</div><div style={valueStyle}>{quote.teamName}</div></div>}
              {quote.sport && <div><div style={labelStyle}>Sport</div><div style={valueStyle}>{quote.sport}</div></div>}
              {quote.customerPhone && <div><div style={labelStyle}>Phone</div><div style={valueStyle}>{quote.customerPhone}</div></div>}
            </div>
          </div>

          {/* Line Items */}
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Line Items</h3>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Product", "Sizes", "Branding", "Qty", "Unit", "Total"].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "11px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items?.map((item: any) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontSize: "13px", color: "#fff" }}>{item.productName}</div>
                      {item.description && <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>{item.description}</div>}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>{item.sizes || "—"}</td>
                    <td style={{ padding: "12px 16px", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>{item.brandingMethod || "—"}</td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "#fff" }}>{item.quantity}</td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>${(item.unitPrice / 100).toFixed(2)}</td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "#22c55e", fontWeight: 600 }}>${(item.totalPrice / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Notes */}
          {(quote.customerNotes || quote.adminNotes) && (
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px" }}>
              {quote.customerNotes && (
                <div style={{ marginBottom: quote.adminNotes ? "16px" : "0" }}>
                  <div style={labelStyle}>Customer Notes</div>
                  <div style={{ ...valueStyle, color: "rgba(255,255,255,0.7)" }}>{quote.customerNotes}</div>
                </div>
              )}
              {quote.adminNotes && (
                <div>
                  <div style={labelStyle}>Internal Notes</div>
                  <div style={{ ...valueStyle, color: "rgba(255,255,255,0.5)", fontStyle: "italic" }}>{quote.adminNotes}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Totals */}
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px" }}>
            <h3 style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>Pricing</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                <span style={{ color: "rgba(255,255,255,0.4)" }}>Subtotal</span>
                <span style={{ color: "rgba(255,255,255,0.7)" }}>${(quote.subtotal / 100).toFixed(2)}</span>
              </div>
              {quote.discount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                  <span style={{ color: "#22c55e" }}>{quote.discountLabel || "Discount"}</span>
                  <span style={{ color: "#22c55e" }}>-${(quote.discount / 100).toFixed(2)}</span>
                </div>
              )}
              {(quote.shipping || 0) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>Shipping</span>
                  <span style={{ color: "rgba(255,255,255,0.7)" }}>${(quote.shipping / 100).toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                <span style={{ color: "rgba(255,255,255,0.4)" }}>GST (15%)</span>
                <span style={{ color: "rgba(255,255,255,0.7)" }}>${(quote.tax / 100).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "18px", fontWeight: 700, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "8px", marginTop: "4px" }}>
                <span style={{ color: "#fff" }}>Total</span>
                <span style={{ color: "#f97316" }}>${(quote.total / 100).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px" }}>
            <h3 style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>Timeline</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" }}>
              <div style={{ color: "rgba(255,255,255,0.6)" }}>Created: {new Date(quote.createdAt).toLocaleString("en-NZ")}</div>
              {quote.sentAt && <div style={{ color: "#3b82f6" }}>Sent: {new Date(quote.sentAt).toLocaleString("en-NZ")}</div>}
              {quote.viewedAt && <div style={{ color: "#a855f7" }}>Viewed: {new Date(quote.viewedAt).toLocaleString("en-NZ")}</div>}
              {quote.acceptedAt && <div style={{ color: "#22c55e" }}>Accepted: {new Date(quote.acceptedAt).toLocaleString("en-NZ")}</div>}
              {quote.rejectedAt && <div style={{ color: "#ef4444" }}>Rejected: {new Date(quote.rejectedAt).toLocaleString("en-NZ")}</div>}
              {quote.validUntil && <div style={{ color: "rgba(255,255,255,0.4)" }}>Valid until: {new Date(quote.validUntil).toLocaleDateString("en-NZ")}</div>}
            </div>
          </div>

          {/* Share Link */}
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px" }}>
            <h3 style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>Customer Link</h3>
            <div style={{ display: "flex", gap: "8px" }}>
              <input readOnly value={publicUrl} style={{
                flex: 1, padding: "8px 10px", fontSize: "11px",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "6px", color: "rgba(255,255,255,0.5)", outline: "none",
              }} />
              <button onClick={() => navigator.clipboard.writeText(publicUrl)} style={{
                padding: "8px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "6px", cursor: "pointer", color: "rgba(255,255,255,0.5)",
              }}>
                <Copy size={14} />
              </button>
              <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={{
                padding: "8px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "6px", cursor: "pointer", color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center",
              }}>
                <ExternalLink size={14} />
              </a>
            </div>
          </div>

          {quote.rejectionReason && (
            <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: "12px", padding: "16px 20px" }}>
              <div style={{ fontSize: "11px", color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Rejection Reason</div>
              <div style={{ fontSize: "13px", color: "rgba(239,68,68,0.8)" }}>{quote.rejectionReason}</div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
