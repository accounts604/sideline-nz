import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { CheckCircle, XCircle, FileText, Clock } from "lucide-react";

export default function QuoteViewPage() {
  const { token } = useParams<{ token: string }>();
  const [rejectionReason, setRejectionReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<any>({
    queryKey: [`/api/quotes/${token}`],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/${token}`);
      if (!res.ok) throw new Error("Quote not found");
      return res.json();
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/quotes/${token}/accept`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => refetch(),
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/quotes/${token}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectionReason || undefined }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { refetch(); setShowReject(false); },
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#fafafa", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#666" }}>Loading quote...</div>
      </div>
    );
  }

  if (error || !data?.quote) {
    return (
      <div style={{ minHeight: "100vh", background: "#fafafa", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <FileText size={48} color="#ccc" />
          <h2 style={{ marginTop: "16px", color: "#333" }}>Quote Not Found</h2>
          <p style={{ color: "#666" }}>This quote link may have expired or is invalid.</p>
        </div>
      </div>
    );
  }

  const { quote, items } = data;
  const isExpired = quote.validUntil && new Date(quote.validUntil) < new Date();
  const canRespond = !isExpired && !["accepted", "rejected", "expired"].includes(quote.status);

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa" }}>
      {/* Header */}
      <div style={{ background: "#111", padding: "20px 0", borderBottom: "3px solid #f97316" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto", padding: "0 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "24px", letterSpacing: "3px", color: "#fff" }}>
              <span style={{ color: "#f97316" }}>S</span>IDELINE
            </span>
          </div>
          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>{quote.quoteNumber}</span>
        </div>
      </div>

      {/* Status Banner */}
      {quote.status === "accepted" && (
        <div style={{ background: "#22c55e", padding: "12px 0", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", color: "#fff", fontWeight: 600 }}>
            <CheckCircle size={18} /> Quote Accepted
          </div>
        </div>
      )}
      {quote.status === "rejected" && (
        <div style={{ background: "#ef4444", padding: "12px 0", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", color: "#fff", fontWeight: 600 }}>
            <XCircle size={18} /> Quote Declined
          </div>
        </div>
      )}
      {isExpired && quote.status !== "accepted" && (
        <div style={{ background: "#f59e0b", padding: "12px 0", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", color: "#fff", fontWeight: 600 }}>
            <Clock size={18} /> This quote has expired
          </div>
        </div>
      )}

      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "32px 24px" }}>
        {/* Quote Header */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "32px" }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#111", margin: "0 0 4px 0" }}>Quote {quote.quoteNumber}</h1>
            <p style={{ color: "#666", fontSize: "14px", margin: 0 }}>
              Prepared for {quote.customerName}{quote.teamName ? ` — ${quote.teamName}` : ""}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            {quote.validUntil && (
              <p style={{ color: "#666", fontSize: "13px", margin: "0 0 4px 0" }}>
                Valid until {new Date(quote.validUntil).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
            <p style={{ color: "#999", fontSize: "12px", margin: 0 }}>
              {new Date(quote.createdAt).toLocaleDateString("en-NZ")}
            </p>
          </div>
        </div>

        {/* Customer notes */}
        {quote.customerNotes && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "16px 20px", marginBottom: "24px" }}>
            <p style={{ color: "#333", fontSize: "14px", margin: 0, lineHeight: 1.6 }}>{quote.customerNotes}</p>
          </div>
        )}

        {/* Line Items */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", overflow: "hidden", marginBottom: "24px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                {["Product", "Sizes", "Method", "Qty", "Unit Price", "Total"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", color: "#666", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items?.map((item: any, i: number) => (
                <tr key={item.id} style={{ borderBottom: i < items.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ fontSize: "14px", color: "#111", fontWeight: 500 }}>{item.productName}</div>
                    {item.description && <div style={{ fontSize: "12px", color: "#999", marginTop: "2px" }}>{item.description}</div>}
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: "13px", color: "#666" }}>{item.sizes || "—"}</td>
                  <td style={{ padding: "14px 16px", fontSize: "13px", color: "#666" }}>{item.brandingMethod || "—"}</td>
                  <td style={{ padding: "14px 16px", fontSize: "14px", color: "#111" }}>{item.quantity}</td>
                  <td style={{ padding: "14px 16px", fontSize: "14px", color: "#666" }}>${(item.unitPrice / 100).toFixed(2)}</td>
                  <td style={{ padding: "14px 16px", fontSize: "14px", color: "#111", fontWeight: 600 }}>${(item.totalPrice / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "32px" }}>
          <div style={{ width: "280px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "14px" }}>
              <span style={{ color: "#666" }}>Subtotal</span>
              <span style={{ color: "#111" }}>${(quote.subtotal / 100).toFixed(2)}</span>
            </div>
            {quote.discount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "14px" }}>
                <span style={{ color: "#22c55e" }}>{quote.discountLabel || "Discount"}</span>
                <span style={{ color: "#22c55e" }}>-${(quote.discount / 100).toFixed(2)}</span>
              </div>
            )}
            {(quote.shipping || 0) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "14px" }}>
                <span style={{ color: "#666" }}>Shipping</span>
                <span style={{ color: "#111" }}>${(quote.shipping / 100).toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "14px" }}>
              <span style={{ color: "#666" }}>GST (15%)</span>
              <span style={{ color: "#111" }}>${(quote.tax / 100).toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0 0", marginTop: "8px", borderTop: "2px solid #111", fontSize: "20px", fontWeight: 700 }}>
              <span style={{ color: "#111" }}>Total</span>
              <span style={{ color: "#f97316" }}>${(quote.total / 100).toFixed(2)} NZD</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        {canRespond && (
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginBottom: "32px" }}>
            <button
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending}
              style={{
                padding: "16px 48px", fontSize: "16px", fontWeight: 700,
                background: "#22c55e", color: "#fff", border: "none",
                borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px",
              }}
            >
              <CheckCircle size={20} /> {acceptMutation.isPending ? "Accepting..." : "Accept Quote"}
            </button>
            <button
              onClick={() => setShowReject(!showReject)}
              style={{
                padding: "16px 32px", fontSize: "16px", fontWeight: 500,
                background: "#fff", color: "#ef4444", border: "1px solid #fecaca",
                borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px",
              }}
            >
              <XCircle size={20} /> Decline
            </button>
          </div>
        )}

        {showReject && (
          <div style={{ maxWidth: "500px", margin: "0 auto 32px auto", background: "#fff", border: "1px solid #fecaca", borderRadius: "10px", padding: "20px" }}>
            <p style={{ fontSize: "14px", color: "#333", marginBottom: "12px" }}>Let us know why (optional):</p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Budget too high, went with another supplier, need different products..."
              rows={3}
              style={{
                width: "100%", padding: "10px 12px", fontSize: "14px",
                border: "1px solid #e5e7eb", borderRadius: "8px", resize: "vertical",
                outline: "none",
              }}
            />
            <button
              onClick={() => rejectMutation.mutate()}
              disabled={rejectMutation.isPending}
              style={{
                marginTop: "12px", padding: "10px 24px", fontSize: "14px", fontWeight: 600,
                background: "#ef4444", color: "#fff", border: "none",
                borderRadius: "8px", cursor: "pointer",
              }}
            >
              {rejectMutation.isPending ? "Submitting..." : "Confirm Decline"}
            </button>
          </div>
        )}

        {/* Terms */}
        {quote.terms && (
          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "24px" }}>
            <h3 style={{ fontSize: "12px", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Terms & Conditions</h3>
            <p style={{ fontSize: "13px", color: "#666", lineHeight: 1.6 }}>{quote.terms}</p>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: "48px", paddingTop: "24px", borderTop: "1px solid #e5e7eb" }}>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "18px", letterSpacing: "2px", color: "#ccc" }}>
            <span style={{ color: "#f97316" }}>S</span>IDELINE
          </span>
          <p style={{ fontSize: "12px", color: "#999", marginTop: "4px" }}>Custom Sportswear NZ</p>
        </div>
      </div>
    </div>
  );
}
