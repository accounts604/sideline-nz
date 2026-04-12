import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ArrowLeft, Printer } from "lucide-react";
import { SidelineMark } from "@/components/sideline-logo";

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

  const elements = (item.elementUrls as { name: string; url: string }[] | null) ?? [];
  const hasDesignSpecs = !!(item.frontDesignUrl || item.backDesignUrl || elements.length > 0);

  return (
    <div style={{ pageBreakInside: "avoid", marginBottom: "20px" }}>
      {/* Product header bar */}
      <div style={{ background: "#000", color: "#fff", padding: "8px 16px", fontSize: "13px", fontWeight: 700, textAlign: "center", letterSpacing: "0.3px" }}>
        {item.productName && item.gradeGroup
          ? `${item.productName.replace(/Rugby Jersey ?/i, "").trim() || "Jersey"} ${item.gradeGroup}`.replace(/^\s+|\s+$/g, "")
          : (item.gradeGroup || item.productName)}
      </div>

      {/* Product info row — LEFT: details | CENTER: mockups together | RIGHT: size/count */}
      <div style={{ display: "flex" }}>
        {/* Left: product details */}
        <div style={{ width: "220px", padding: "14px 16px", fontSize: "12px", color: "#000" }}>
          <div style={{ marginBottom: "10px" }}>
            <div style={{ fontWeight: 700, marginBottom: "2px" }}>Product Name</div>
            <div>{item.productName}</div>
          </div>
          {item.productColors && item.productColors.length > 0 && (
            <div style={{ marginBottom: "10px" }}>
              <div style={{ fontWeight: 700, marginBottom: "4px" }}>Product Colours</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {(item.productColors as { hex: string; name?: string }[]).map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ width: "28px", height: "14px", background: c.hex, border: "1px solid #999", display: "inline-block" }} />
                    <span style={{ fontSize: "11px" }}>{c.hex}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {item.brandingMethod && (
            <div>
              <div style={{ fontWeight: 700 }}>Branding Method</div>
              <div style={{ fontWeight: 700, marginBottom: "2px" }}>Customisation</div>
              <div style={{ color: "#0ea5e9" }}>{item.brandingMethod}</div>
            </div>
          )}
        </div>

        {/* Center: mockup designs together — front + back side by side, filling the space */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: "20px", padding: "16px 12px", minHeight: "260px" }}>
          {item.frontDesignUrl && (
            <img src={item.frontDesignUrl} alt="Front mockup" style={{ maxHeight: "280px", flex: 1, minWidth: 0, objectFit: "contain" }} />
          )}
          {item.backDesignUrl && (
            <img src={item.backDesignUrl} alt="Back mockup" style={{ maxHeight: "280px", flex: 1, minWidth: 0, objectFit: "contain" }} />
          )}
        </div>

        {/* Right: size/count breakdown */}
        <div style={{ width: "200px", padding: "14px 16px", borderLeft: "1px solid #eee" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
            <span>Size</span>
            <span>Count</span>
          </div>
          {Array.from(sizeSummary.entries()).map(([size, qty]) => (
            <div key={size} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "3px 0", color: "#000" }}>
              <span>{size}</span>
              <span>{qty}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700, marginTop: "10px" }}>
            <span>Total</span>
            <span>{totalQty}</span>
          </div>
        </div>
      </div>

      {/* Design Specifications — big mockups + elements column, sits flush below */}
      {hasDesignSpecs && (
        <>
          <div style={{ background: "#000", color: "#fff", padding: "6px 16px", fontSize: "12px", fontWeight: 700, textAlign: "center", letterSpacing: "0.3px" }}>
            Design Specifications
          </div>
          <div style={{ display: "flex", minHeight: "300px", alignItems: "stretch" }}>
            <div style={{ flex: 1, padding: "16px 12px", textAlign: "center", display: "flex", flexDirection: "column" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, marginBottom: "8px" }}>Front Design</p>
              {item.frontDesignUrl && (
                <img src={item.frontDesignUrl} alt="Front Design" style={{ flex: 1, minHeight: 0, objectFit: "contain", width: "100%" }} />
              )}
            </div>
            <div style={{ flex: 1, padding: "16px 12px", textAlign: "center", display: "flex", flexDirection: "column" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, marginBottom: "8px" }}>Back Design</p>
              {item.backDesignUrl && (
                <img src={item.backDesignUrl} alt="Back Design" style={{ flex: 1, minHeight: 0, objectFit: "contain", width: "100%" }} />
              )}
            </div>
            <div style={{ width: "200px", padding: "12px 8px", textAlign: "center", borderLeft: "1px solid #eee" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, marginBottom: "8px" }}>Elements</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
                {elements.map((el, i) => (
                  <img key={i} src={el.url} alt={el.name} title={el.name} style={{ maxHeight: "55px", maxWidth: "170px", objectFit: "contain" }} />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Sizing Guide — flush below design specs */}
      <div style={{ background: "#000", color: "#fff", padding: "6px 16px", fontSize: "12px", fontWeight: 700, textAlign: "center", letterSpacing: "0.3px" }}>
        Sizing Guide
      </div>
      <div style={{ overflowX: "auto" }}>
        <p style={{ fontSize: "12px", fontWeight: 800, padding: "8px 16px 4px", margin: 0 }}>JERSEY</p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "4px 8px", background: "#fff" }}></th>
              {JERSEY_SIZING_GUIDE.headers.map(h => (
                <th key={h} style={{ padding: "4px 4px", background: "#c9d9ea", textAlign: "center", fontWeight: 700, border: "1px solid #ddd" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {JERSEY_SIZING_GUIDE.measurements.map(row => (
              <tr key={row.label}>
                <td style={{ padding: "3px 8px", fontWeight: 600, whiteSpace: "nowrap", border: "1px solid #ddd" }}>{row.label}</td>
                {row.values.map((v, i) => (
                  <td key={i} style={{ padding: "3px 4px", textAlign: "center", border: "1px solid #ddd" }}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#666", padding: "4px 16px" }}>
          <span>Measurements in cm</span>
          <span>Tolerance +/- 2cm</span>
        </div>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            <div style={{ marginBottom: "12px" }}>
              <SidelineMark size={60} color="#000" />
            </div>
            <div style={{ fontSize: "11px", color: "#333", lineHeight: "1.6" }}>
              Sideline NZ (Sideline Custom Goods Ltd)<br />
              Unit 2, 66 Cavendish Drive Manukau<br />
              Auckland, 2104<br />
              022 412 7205<br />
              info@sidelinenz.com<br />
              <span style={{ color: "#0ea5e9" }}>www.sidelinenz.com</span>
            </div>
          </div>
          <div style={{ textAlign: "right", minWidth: "360px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 800, margin: "0 0 16px 0", letterSpacing: "0.5px" }}>PURCHASE ORDER</h2>
            <table style={{ fontSize: "12px", marginLeft: "auto", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 700, padding: "4px 12px 4px 0", textAlign: "right" }}>DATE</td>
                  <td style={{ background: "#f2f2f2", padding: "4px 10px", minWidth: "200px", textAlign: "left" }}>{dateStr}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700, padding: "4px 12px 4px 0", textAlign: "right" }}>PO/Order Reference:</td>
                  <td style={{ background: "#f2f2f2", padding: "4px 10px", textAlign: "left" }}>{order.poReference || order.orderNumber}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700, padding: "4px 12px 4px 0", textAlign: "right" }}>Account</td>
                  <td style={{ background: "#f2f2f2", padding: "4px 10px", textAlign: "left" }}>{order.accountName || ""}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700, padding: "4px 12px 4px 0", textAlign: "right" }}>New or Repeat Order:</td>
                  <td style={{ background: "#f2f2f2", padding: "4px 10px", textAlign: "left" }}>{order.isRepeatOrder ? "Repeat" : "New"}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700, padding: "4px 12px 4px 0", textAlign: "right" }}>Comments:</td>
                  <td style={{ background: "#f2f2f2", padding: "4px 10px", textAlign: "left" }}>{order.poComments || ""}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Customer / Delivery row — black bar headers match the PDF */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex" }}>
            <div style={{ flex: 1, background: "#000", color: "#fff", padding: "6px 16px", fontSize: "12px", fontWeight: 700 }}>Customer</div>
            <div style={{ flex: 1, background: "#000", color: "#fff", padding: "6px 16px", fontSize: "12px", fontWeight: 700 }}>Delivery Address</div>
          </div>
          <div style={{ display: "flex" }}>
            <div style={{ flex: 1, padding: "10px 16px", fontSize: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                <span style={{ color: "#000" }}>{order.customerName || ""}</span>
                <span style={{ color: "#0ea5e9" }}>{order.customerEmail || ""}</span>
              </div>
            </div>
            <div style={{ flex: 1, padding: "10px 16px", fontSize: "12px" }}>
              {order.deliveryAttention && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <span>Attention: {order.deliveryAttention}</span>
                  {order.deliveryEmail && <span style={{ color: "#0ea5e9" }}>{order.deliveryEmail}</span>}
                </div>
              )}
              {order.deliveryAddress ? (
                <p style={{ margin: "2px 0", whiteSpace: "pre-line" }}>{order.deliveryAddress}</p>
              ) : (
                <>
                  <p style={{ margin: "2px 0" }}>Sideline NZ (Sideline Custom Goods Ltd)</p>
                  <p style={{ margin: "2px 0" }}>41 Oakland Rd Karaka, Auckland New Zealand 2580</p>
                </>
              )}
              {order.deliveryPhone && <p style={{ margin: "2px 0" }}>{order.deliveryPhone}</p>}
            </div>
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
