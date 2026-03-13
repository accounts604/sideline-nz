import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ArrowLeft, Printer } from "lucide-react";

interface OrderItem {
  id: string;
  productName: string;
  productImage: string | null;
  size: string | null;
  quantity: number;
  unitAmount: number;
  currency: string;
  productColors: { hex: string; name?: string }[] | null;
  brandingMethod: string | null;
  frontDesignUrl: string | null;
  backDesignUrl: string | null;
  elementUrls: { name: string; url: string }[] | null;
  gradeGroup: string | null;
  designNotes: string | null;
}

interface OrderSizeBreakdown {
  id: string;
  orderItemId: string;
  size: string;
  quantity: number;
  playerName: string | null;
  playerNumber: string | null;
}

interface Order {
  id: string;
  orderNumber: string;
  customerEmail: string | null;
  customerName: string | null;
  storeSlug: string;
  status: string;
  total: number;
  currency: string;
  createdAt: string;
  poReference: string | null;
  accountName: string | null;
  isRepeatOrder: boolean | null;
  poComments: string | null;
  deliveryAttention: string | null;
  deliveryAddress: string | null;
  deliveryEmail: string | null;
  deliveryPhone: string | null;
}

interface OrderDetail {
  order: Order;
  items: OrderItem[];
  sizeBreakdowns: OrderSizeBreakdown[];
  [key: string]: any;
}

// Sizing guide for jerseys (from PO screenshots)
const JERSEY_SIZING_GUIDE = {
  headers: ["Y4", "Y6", "Y8", "Y10", "Y12", "Y14", "Y16/XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL"],
  measurements: [
    { label: "A. Length", values: [50, 54, 58, 62, 66, 70, 72, 74, 76, 78, 80, 82, 84, 86, 88, 90, 92] },
    { label: "B. 1/2 Chest", values: [35, 37, 39, 41, 43, 45, 43.5, 46, 48.5, 51, 53.5, 56, 58.5, 61, 63.5, 66, 68.5] },
    { label: "C. 1/2 Waist", values: [34, 35.5, 37, 38.5, 40, 41.5, 40, 42.5, 45, 47.5, 50, 52.5, 55, 57.5, 60, 62.5, 65] },
    { label: "D. 1/2 Hem", values: [36, 37.5, 39, 40.5, 42, 43.5, 42, 44.5, 47, 49.5, 52, 54.5, 57, 59.5, 62, 64.5, 67] },
    { label: "E. Sleeve Length", values: [21, 23, 25, 27, 29, 31, 30, 31.5, 33, 34.5, 36, 37.5, 39, 40.5, 42, 43.5, 45] },
    { label: "F. 1/2 Arm", values: [17.5, 18.5, 19.5, 20.5, 21.5, 22.5, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32] },
    { label: "G. 1/2 Cuff", values: [11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26] },
    { label: "H. Neck Width", values: [18, 18.5, 19, 19.5, 20, 20.5, 20, 20.5, 21, 21.5, 22, 22.5, 23, 23.5, 24, 24.5, 25] },
    { label: "I. Hem Drop", values: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5] },
    { label: "J. Sleeve Length (Seam to Cuff)", values: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30] },
  ],
};

function ProductLineSection({ item, breakdowns }: { item: OrderItem; breakdowns: OrderSizeBreakdown[] }) {
  // Group breakdowns by size for summary
  const sizeSummary = new Map<string, number>();
  for (const b of breakdowns) {
    sizeSummary.set(b.size, (sizeSummary.get(b.size) || 0) + b.quantity);
  }
  const totalQty = Array.from(sizeSummary.values()).reduce((a, b) => a + b, 0) || item.quantity;

  return (
    <div style={{ pageBreakInside: "avoid", marginBottom: "24px" }}>
      {/* Product header bar */}
      <div style={{ background: "#1a1a1a", color: "#fff", padding: "8px 16px", fontSize: "13px", fontWeight: 700, textAlign: "center" }}>
        {item.gradeGroup ? `${item.productName} ${item.gradeGroup}` : item.productName}
      </div>

      {/* Product info row */}
      <div style={{ display: "flex", border: "1px solid #ddd", borderTop: "none" }}>
        {/* Left: product details */}
        <div style={{ flex: 1, padding: "12px 16px", fontSize: "12px", borderRight: "1px solid #ddd" }}>
          <div style={{ marginBottom: "8px" }}>
            <span style={{ fontWeight: 600 }}>Product Name</span>
            <span style={{ marginLeft: "12px" }}>{item.productName}</span>
          </div>
          {item.productColors && item.productColors.length > 0 && (
            <div style={{ marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontWeight: 600 }}>Product Colours</span>
              {(item.productColors as { hex: string; name?: string }[]).map((c, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ width: "16px", height: "16px", background: c.hex, border: "1px solid #ccc", display: "inline-block" }} />
                  <span style={{ fontSize: "11px" }}>{c.hex}</span>
                </span>
              ))}
            </div>
          )}
          {item.brandingMethod && (
            <div>
              <span style={{ fontWeight: 600 }}>Branding Method</span>
              <br />
              <span style={{ fontWeight: 600 }}>Customisation</span>
              <span style={{ marginLeft: "12px", color: "#0ea5e9" }}>{item.brandingMethod}</span>
            </div>
          )}
        </div>

        {/* Center: product images */}
        <div style={{ width: "300px", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", padding: "8px", borderRight: "1px solid #ddd" }}>
          {item.frontDesignUrl && <img src={item.frontDesignUrl} alt="Front" style={{ maxHeight: "120px", maxWidth: "130px", objectFit: "contain" }} />}
          {item.backDesignUrl && <img src={item.backDesignUrl} alt="Back" style={{ maxHeight: "120px", maxWidth: "130px", objectFit: "contain" }} />}
        </div>

        {/* Right: size/count breakdown */}
        <div style={{ width: "180px", padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 600, borderBottom: "1px solid #ddd", paddingBottom: "4px", marginBottom: "4px" }}>
            <span>Size</span>
            <span>Count</span>
          </div>
          {Array.from(sizeSummary.entries()).map(([size, qty]) => (
            <div key={size} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "2px 0" }}>
              <span>{size}</span>
              <span>{qty}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700, borderTop: "1px solid #ddd", paddingTop: "4px", marginTop: "4px" }}>
            <span>Total</span>
            <span>{totalQty}</span>
          </div>
        </div>
      </div>

      {/* Design Specifications */}
      {(item.frontDesignUrl || item.backDesignUrl || (item.elementUrls && (item.elementUrls as any[]).length > 0)) && (
        <>
          <div style={{ background: "#1a1a1a", color: "#fff", padding: "6px 16px", fontSize: "12px", fontWeight: 600, textAlign: "center" }}>
            Design Specifications
          </div>
          <div style={{ display: "flex", border: "1px solid #ddd", borderTop: "none", minHeight: "200px" }}>
            {/* Front Design */}
            <div style={{ flex: 1, padding: "8px", textAlign: "center", borderRight: "1px solid #ddd" }}>
              <p style={{ fontSize: "11px", fontWeight: 600, marginBottom: "8px" }}>Front Design</p>
              {item.frontDesignUrl && <img src={item.frontDesignUrl} alt="Front Design" style={{ maxHeight: "180px", maxWidth: "100%", objectFit: "contain" }} />}
            </div>
            {/* Back Design */}
            <div style={{ flex: 1, padding: "8px", textAlign: "center", borderRight: "1px solid #ddd" }}>
              <p style={{ fontSize: "11px", fontWeight: 600, marginBottom: "8px" }}>Back Design</p>
              {item.backDesignUrl && <img src={item.backDesignUrl} alt="Back Design" style={{ maxHeight: "180px", maxWidth: "100%", objectFit: "contain" }} />}
            </div>
            {/* Elements */}
            <div style={{ width: "200px", padding: "8px", textAlign: "center" }}>
              <p style={{ fontSize: "11px", fontWeight: 600, marginBottom: "8px" }}>Elements</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
                {item.elementUrls && (item.elementUrls as { name: string; url: string }[]).map((el, i) => (
                  <img key={i} src={el.url} alt={el.name} title={el.name} style={{ maxHeight: "50px", maxWidth: "160px", objectFit: "contain" }} />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Sizing Guide */}
      <div style={{ background: "#1a1a1a", color: "#fff", padding: "6px 16px", fontSize: "12px", fontWeight: 600, textAlign: "center" }}>
        Sizing Guide
      </div>
      <div style={{ border: "1px solid #ddd", borderTop: "none", overflowX: "auto" }}>
        <p style={{ fontSize: "12px", fontWeight: 700, padding: "8px 16px" }}>JERSEY</p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #ddd", background: "#f5f5f5" }}></th>
              {JERSEY_SIZING_GUIDE.headers.map(h => (
                <th key={h} style={{ padding: "4px 4px", borderBottom: "1px solid #ddd", background: "#f5f5f5", textAlign: "center", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {JERSEY_SIZING_GUIDE.measurements.map(row => (
              <tr key={row.label}>
                <td style={{ padding: "3px 8px", borderBottom: "1px solid #eee", fontWeight: 500, whiteSpace: "nowrap" }}>{row.label}</td>
                {row.values.map((v, i) => (
                  <td key={i} style={{ padding: "3px 4px", borderBottom: "1px solid #eee", textAlign: "center" }}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: "9px", color: "#888", padding: "4px 16px" }}>Measurements in cm &nbsp;&nbsp;&nbsp; Tolerance +/- 2cm</p>
      </div>
    </div>
  );
}

export default function PurchaseOrderView() {
  const params = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<OrderDetail>({
    queryKey: [`/api/admin/orders/${params.id}`],
    enabled: !!params.id,
  });

  if (isLoading) return <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>Loading...</div>;
  if (!data) return <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>Order not found</div>;

  const { order, items, sizeBreakdowns } = data;
  const date = new Date(order.createdAt);
  const dateStr = `${date.getDate().toString().padStart(2, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getFullYear().toString().slice(2)}`;

  // Group breakdowns by item
  const breakdownsByItem = new Map<string, OrderSizeBreakdown[]>();
  for (const b of sizeBreakdowns || []) {
    const list = breakdownsByItem.get(b.orderItemId) || [];
    list.push(b);
    breakdownsByItem.set(b.orderItemId, list);
  }

  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      {/* Print controls (hidden in print) */}
      <div className="no-print" style={{ padding: "16px 24px", background: "#111", display: "flex", alignItems: "center", gap: "16px" }}>
        <Link href={`/admin/orders/${order.id}`}>
          <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <ArrowLeft size={14} /> Back to Order
          </span>
        </Link>
        <button
          onClick={() => window.print()}
          style={{
            padding: "8px 20px", fontSize: "13px", fontWeight: 600,
            background: "#fff", color: "#000", border: "none", borderRadius: "6px",
            cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
          }}
        >
          <Printer size={14} /> Print / Save PDF
        </button>
      </div>

      {/* PO Document */}
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 40px", fontFamily: "'Segoe UI', Arial, sans-serif", color: "#000" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: 800, margin: 0, letterSpacing: "-0.5px", fontFamily: "'Bebas Neue', sans-serif" }}>
              <span style={{ color: "#f97316" }}>S</span>IDELINE
            </h1>
            <div style={{ fontSize: "11px", color: "#555", marginTop: "8px", lineHeight: "1.6" }}>
              Sideline NZ (Sideline Custom Goods Ltd)<br />
              Unit 2, 66 Cavendish Drive Manukau<br />
              Auckland, 2104<br />
              022 412 7205<br />
              info@sidelinenz.com<br />
              www.sidelinenz.com
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 12px 0" }}>PURCHASE ORDER</h2>
            <table style={{ fontSize: "12px", marginLeft: "auto" }}>
              <tbody>
                <tr><td style={{ fontWeight: 600, padding: "2px 12px 2px 0", textAlign: "right" }}>DATE</td><td style={{ border: "1px solid #ddd", padding: "2px 8px" }}>{dateStr}</td></tr>
                <tr><td style={{ fontWeight: 600, padding: "2px 12px 2px 0", textAlign: "right" }}>PO/Order Reference:</td><td style={{ border: "1px solid #ddd", padding: "2px 8px" }}>{order.poReference || order.orderNumber}</td></tr>
                <tr><td style={{ fontWeight: 600, padding: "2px 12px 2px 0", textAlign: "right" }}>Account</td><td style={{ border: "1px solid #ddd", padding: "2px 8px" }}>{order.accountName || "—"}</td></tr>
                <tr><td style={{ fontWeight: 600, padding: "2px 12px 2px 0", textAlign: "right" }}>New or Repeat Order:</td><td style={{ border: "1px solid #ddd", padding: "2px 8px" }}>{order.isRepeatOrder ? "Repeat" : "New"}</td></tr>
                <tr><td style={{ fontWeight: 600, padding: "2px 12px 2px 0", textAlign: "right" }}>Comments:</td><td style={{ border: "1px solid #ddd", padding: "2px 8px" }}>{order.poComments || "—"}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Customer / Delivery row */}
        <div style={{ display: "flex", gap: "0", marginBottom: "24px", border: "1px solid #ddd" }}>
          <div style={{ flex: 1, padding: "10px 16px", borderRight: "1px solid #ddd" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, background: "#f5f5f5", margin: "-10px -16px 8px", padding: "6px 16px" }}>Customer</div>
            <p style={{ fontSize: "12px", margin: "2px 0" }}>{order.customerName || "—"}</p>
            <p style={{ fontSize: "12px", margin: "2px 0", color: "#555" }}>{order.customerEmail || ""}</p>
          </div>
          <div style={{ flex: 1, padding: "10px 16px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, background: "#f5f5f5", margin: "-10px -16px 8px", padding: "6px 16px" }}>Delivery Address</div>
            {order.deliveryAttention && <p style={{ fontSize: "12px", margin: "2px 0" }}>Attention: {order.deliveryAttention}</p>}
            {order.deliveryAddress ? (
              <p style={{ fontSize: "12px", margin: "2px 0", color: "#555", whiteSpace: "pre-line" }}>{order.deliveryAddress}</p>
            ) : (
              <>
                <p style={{ fontSize: "12px", margin: "2px 0", color: "#555" }}>Sideline NZ (Sideline Custom Goods Ltd)</p>
                <p style={{ fontSize: "12px", margin: "2px 0", color: "#555" }}>41 Oakland Rd Karaka, Auckland New Zealand</p>
              </>
            )}
            {order.deliveryEmail && <p style={{ fontSize: "12px", margin: "2px 0", color: "#555" }}>{order.deliveryEmail}</p>}
            {order.deliveryPhone && <p style={{ fontSize: "12px", margin: "2px 0", color: "#555" }}>{order.deliveryPhone}</p>}
          </div>
        </div>

        {/* Product Lines */}
        {items.map((item) => (
          <ProductLineSection
            key={item.id}
            item={item}
            breakdowns={breakdownsByItem.get(item.id) || []}
          />
        ))}

        {/* Disclaimer */}
        <div style={{ marginTop: "32px", borderTop: "3px solid #1a1a1a", paddingTop: "16px" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, textAlign: "center", marginBottom: "12px" }}>Disclaimer: Final Design Proof Approval</p>
          <div style={{ fontSize: "10px", color: "#555", lineHeight: "1.6", textAlign: "center" }}>
            <p>This design proof is the intellectual property of Sideline NZ (Sideline Custom Goods Ltd) and is provided solely for the purpose of final client approval. By approving this proof, the customer confirms that all design elements — including colors, logos, placement, spelling, and sizing — are correct. Once approved, this version is final. Any changes requested after approval may result in added costs and/or production delays.</p>
            <p style={{ marginTop: "8px" }}>The customer is fully responsible for the approved design. Sideline NZ (Sideline Custom Goods Ltd) will not be liable for any errors, omissions, or design changes after approval, nor for any delays in production or fulfillment caused by suppliers, freight partners, or other external factors beyond our control.</p>
            <p style={{ marginTop: "8px" }}>All designs, mockups, and associated materials remain the exclusive property of Sideline NZ (Sideline Custom Goods Ltd). No part of this design may be copied, reproduced, distributed, or repurposed — in full or in part — without prior written consent.</p>
            <p style={{ marginTop: "12px", fontWeight: 600 }}>&copy; {new Date().getFullYear()} Sideline NZ (Sideline Custom Goods Ltd). All rights reserved.</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 10mm; }
        }
      `}</style>
    </div>
  );
}
