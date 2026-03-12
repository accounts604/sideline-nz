import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ArrowLeft, Printer } from "lucide-react";

interface InvoiceData {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    subtotal: number;
    shipping: number;
    tax: number;
    total: number;
    currency: string;
    createdAt: string;
    paidAt: string | null;
    customerEmail: string | null;
    customerName: string | null;
    shippingAddress: any;
  };
  items: {
    id: string;
    productName: string;
    size: string | null;
    quantity: number;
    unitAmount: number;
    currency: string;
  }[];
  customer: {
    email: string | null;
    teamName: string | null;
    contactPhone: string | null;
  } | null;
  company: {
    name: string;
    address: string;
    email: string;
    website: string;
  };
}

export default function PortalInvoice() {
  const params = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<InvoiceData>({
    queryKey: [`/api/portal/orders/${params.id}/invoice`],
    enabled: !!params.id,
  });

  if (isLoading) {
    return <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>Loading invoice...</div>;
  }

  if (!data) {
    return <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>Invoice not found</div>;
  }

  const { order, items, customer, company } = data;

  return (
    <>
      {/* Print-hide controls */}
      <div className="no-print" style={{ padding: "16px 32px", background: "#0a0a0a", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: "16px", alignItems: "center" }}>
        <Link href={`/portal/orders/${order.id}`}>
          <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
            <ArrowLeft size={14} /> Back to Order
          </span>
        </Link>
        <button
          onClick={() => window.print()}
          style={{
            padding: "8px 16px",
            fontSize: "13px",
            fontWeight: 600,
            background: "#fff",
            color: "#000",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <Printer size={14} /> Print Invoice
        </button>
      </div>

      {/* Invoice body */}
      <div style={{ maxWidth: "800px", margin: "32px auto", padding: "48px", background: "#fff", color: "#000", fontFamily: "'Inter', sans-serif", fontSize: "14px", lineHeight: 1.6 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "48px" }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: "2px" }}>
              SIDELINE
            </h1>
            <p style={{ fontSize: "11px", color: "#888", marginTop: "4px", letterSpacing: "1px", textTransform: "uppercase" }}>
              Custom Sportswear NZ
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 600, margin: 0, color: "#333" }}>INVOICE</h2>
            <p style={{ color: "#666", marginTop: "4px" }}>{order.orderNumber}</p>
          </div>
        </div>

        {/* Dates + addresses */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px", marginBottom: "40px" }}>
          <div>
            <p style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Bill To</p>
            <p style={{ fontWeight: 600 }}>{customer?.teamName || order.customerName || "Customer"}</p>
            <p style={{ color: "#666" }}>{customer?.email || order.customerEmail}</p>
            {customer?.contactPhone && <p style={{ color: "#666" }}>{customer.contactPhone}</p>}
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>From</p>
            <p style={{ fontWeight: 600 }}>{company.name}</p>
            <p style={{ color: "#666" }}>{company.address}</p>
            <p style={{ color: "#666" }}>{company.email}</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px", marginBottom: "40px" }}>
          <div>
            <p style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Date</p>
            <p>{new Date(order.createdAt).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
          {order.paidAt && (
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Paid</p>
              <p>{new Date(order.paidAt).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}</p>
            </div>
          )}
        </div>

        {/* Items table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "32px" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #000" }}>
              <th style={{ textAlign: "left", padding: "8px 0", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", color: "#888" }}>Item</th>
              <th style={{ textAlign: "center", padding: "8px 0", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", color: "#888" }}>Size</th>
              <th style={{ textAlign: "center", padding: "8px 0", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", color: "#888" }}>Qty</th>
              <th style={{ textAlign: "right", padding: "8px 0", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", color: "#888" }}>Unit Price</th>
              <th style={{ textAlign: "right", padding: "8px 0", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", color: "#888" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "12px 0" }}>{item.productName}</td>
                <td style={{ padding: "12px 0", textAlign: "center", color: "#666" }}>{item.size || "—"}</td>
                <td style={{ padding: "12px 0", textAlign: "center" }}>{item.quantity}</td>
                <td style={{ padding: "12px 0", textAlign: "right" }}>${(item.unitAmount / 100).toFixed(2)}</td>
                <td style={{ padding: "12px 0", textAlign: "right", fontWeight: 500 }}>
                  ${((item.unitAmount * item.quantity) / 100).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div style={{ width: "280px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", color: "#666" }}>
              <span>Subtotal</span>
              <span>${(order.subtotal / 100).toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", color: "#666" }}>
              <span>Shipping</span>
              <span>${(order.shipping / 100).toFixed(2)}</span>
            </div>
            {order.tax > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", color: "#666" }}>
                <span>GST</span>
                <span>${(order.tax / 100).toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "2px solid #000", marginTop: "8px", fontSize: "16px", fontWeight: 700 }}>
              <span>Total ({order.currency?.toUpperCase()})</span>
              <span>${(order.total / 100).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: "48px", paddingTop: "24px", borderTop: "1px solid #eee", textAlign: "center", fontSize: "12px", color: "#999" }}>
          <p>{company.name} &middot; {company.website} &middot; {company.email}</p>
          <p style={{ marginTop: "4px" }}>Thank you for your business!</p>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>
    </>
  );
}
