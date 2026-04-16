import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ArrowLeft, Printer } from "lucide-react";
import { computeMilestones } from "@shared/po-milestones";
import { suggestSizeChart, getSizeChartTables, SIZE_CHART_LABELS, SIZE_CHART_DIAGRAMS, type SizeChartType, type SizeTable } from "@shared/size-charts";

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
  material: string | null;
  productType: string | null;
  designBrief: string | null;
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
  dueDate: string | null;
  driveFolderUrl: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerPhone: string | null;
  companyEmail: string | null;
  companyPhone: string | null;
}

interface OrderDetail {
  order: Order;
  items: OrderItem[];
  sizeBreakdowns: OrderSizeBreakdown[];
  [key: string]: any;
}

// Size chart rendering helper for the PO PDF
function PdfSizeChart({ table }: { table: SizeTable }) {
  return (
    <div style={{ marginBottom: "6px" }}>
      <p style={{ fontSize: "12px", fontWeight: 800, padding: "6px 16px 3px", margin: 0 }}>{table.title}</p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
        <thead>
          <tr>
            {table.headers.map((h, i) => (
              <th key={i} style={{ padding: "4px 4px", background: i === 0 ? "#fff" : "#c9d9ea", textAlign: i === 0 ? "left" : "center", fontWeight: 700, border: "1px solid #ddd" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.label}>
              <td style={{ padding: "3px 8px", fontWeight: 600, whiteSpace: "nowrap", border: "1px solid #ddd" }}>{row.label}</td>
              {row.values.map((v, i) => (
                <td key={i} style={{ padding: "3px 4px", textAlign: "center", border: "1px solid #ddd" }}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#666", padding: "3px 16px" }}>
        <span>Measurements in cm</span>
        <span>Tolerance {table.tolerance}</span>
      </div>
    </div>
  );
}

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
        {/* Left: product specs */}
        <div style={{ width: "240px", padding: "14px 16px", fontSize: "12px", color: "#000" }}>
          <div style={{ marginBottom: "10px" }}>
            <div style={{ fontWeight: 700, marginBottom: "2px" }}>Product</div>
            <div>{item.productName}</div>
          </div>
          {item.material && (
            <div style={{ marginBottom: "10px" }}>
              <div style={{ fontWeight: 700, marginBottom: "2px" }}>Material / Spec</div>
              <div>{item.material}</div>
            </div>
          )}
          {item.brandingMethod && (
            <div style={{ marginBottom: "10px" }}>
              <div style={{ fontWeight: 700, marginBottom: "2px" }}>Branding Application</div>
              <div style={{ color: "#0ea5e9" }}>{item.brandingMethod}</div>
            </div>
          )}
          {item.productColors && item.productColors.length > 0 && (
            <div style={{ marginBottom: "10px" }}>
              <div style={{ fontWeight: 700, marginBottom: "4px" }}>Colour Palette</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {(item.productColors as { hex: string; name?: string }[]).map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ width: "28px", height: "16px", background: c.hex, border: "1px solid #bbb", borderRadius: "2px", display: "inline-block" }} />
                    <span style={{ fontSize: "11px" }}>
                      <strong>{c.name || "Unnamed"}</strong>
                      <span style={{ color: "#888", marginLeft: "4px" }}>{c.hex}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {item.designNotes && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: "2px" }}>Notes</div>
              <div style={{ fontSize: "11px", color: "#555" }}>{item.designNotes}</div>
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

      {/* AI Design Brief — powered by Gemini */}
      {item.designBrief && (
        <div style={{ pageBreakInside: "avoid" }}>
          <div style={{ background: "#000", color: "#fff", padding: "6px 16px", fontSize: "12px", fontWeight: 700, textAlign: "center" }}>
            Design Brief <span style={{ fontWeight: 400, fontSize: "9px", opacity: 0.6 }}>powered by AI</span>
          </div>
          <div style={{ padding: "12px 16px", fontSize: "11px", lineHeight: "1.6", color: "#333", whiteSpace: "pre-wrap" }}>
            {item.designBrief}
          </div>
        </div>
      )}

      {/* Sizing Guide — diagram + measurement tables */}
      {(() => {
        const chartType = ((item as any).sizeChartType || suggestSizeChart(item.productType)) as SizeChartType;
        const tables = getSizeChartTables(chartType);
        const diagramSrc = SIZE_CHART_DIAGRAMS[chartType];
        return (
          <>
            <div style={{ background: "#000", color: "#fff", padding: "6px 16px", fontSize: "12px", fontWeight: 700, textAlign: "center", letterSpacing: "0.3px" }}>
              Sizing Guide — {SIZE_CHART_LABELS[chartType] || chartType}
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", padding: "12px 16px" }}>
              {/* Left: measurement diagram */}
              {diagramSrc && (
                <div style={{ width: "220px", flexShrink: 0, textAlign: "center" }}>
                  <img src={diagramSrc} alt={`${SIZE_CHART_LABELS[chartType]} measurement diagram`} style={{ width: "100%", maxHeight: "280px", objectFit: "contain" }} />
                  <p style={{ fontSize: "9px", color: "#888", marginTop: "4px" }}>Measurement reference</p>
                </div>
              )}
              {/* Right: measurement tables */}
              <div style={{ flex: 1, overflowX: "auto" }}>
                {tables.map((t, i) => <PdfSizeChart key={i} table={t} />)}
              </div>
            </div>
          </>
        );
      })()}
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

  const { order, items, sizeBreakdowns, designs } = data;
  const date = new Date(order.createdAt);
  const dateStr = `${date.getDate().toString().padStart(2, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getFullYear().toString().slice(2)}`;
  // File vault images (used when items have no inline design URLs)
  const allDesigns = (designs ?? []) as any[];
  const mockupFiles = allDesigns.filter((f: any) => f.folder === "mockups" && f.mimeType?.startsWith("image/"));
  const logoFiles = allDesigns.filter((f: any) => f.folder === "logos" && f.mimeType?.startsWith("image/"));
  const hasItemDesigns = items.some((i) => i.frontDesignUrl || i.backDesignUrl);

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
              <img src="/sideline-logo-vertical.png" alt="Sideline NZ" style={{ height: "70px", objectFit: "contain" }} />
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

        {/* 35-day milestone schedule — shown when a due date is set */}
        {order.dueDate && (() => {
          const ms = computeMilestones(order.dueDate);
          if (!ms) return null;
          return (
            <div style={{ marginBottom: "20px", pageBreakInside: "avoid" }}>
              <div style={{ background: "#000", color: "#fff", padding: "6px 16px", fontSize: "12px", fontWeight: 700, textAlign: "center" }}>
                Production Schedule — 35-Day Build
              </div>
              <div style={{ display: "flex" }}>
                {ms.map((m) => (
                  <div key={m.key} style={{ flex: 1, textAlign: "center", padding: "10px 6px", borderRight: "1px solid #eee", fontSize: "10px" }}>
                    <div style={{ fontWeight: 700, marginBottom: "2px" }}>Day {m.dayNumber}</div>
                    <div style={{ fontWeight: 600, fontSize: "9px", marginBottom: "2px" }}>{m.label}</div>
                    <div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "9px", color: "#555" }}>{m.date}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Mockup + logo gallery — shown when items have no inline design URLs.
            Mirrors the PO layout: black header, mockups in center, logos/elements on the side. */}
        {mockupFiles.length > 0 && !hasItemDesigns && (
          <div style={{ pageBreakInside: "avoid", marginBottom: "20px" }}>
            {/* Product info row — structured like the Onewhero PO */}
            <div style={{ background: "#000", color: "#fff", padding: "8px 16px", fontSize: "13px", fontWeight: 700, textAlign: "center", letterSpacing: "0.3px" }}>
              {order.poReference || order.accountName || "Mockup Designs"}
            </div>
            <div style={{ display: "flex" }}>
              {/* Left: order-level details */}
              <div style={{ width: "200px", padding: "14px 16px", fontSize: "12px" }}>
                {order.poReference && (
                  <div style={{ marginBottom: "10px" }}>
                    <div style={{ fontWeight: 700, marginBottom: "2px" }}>PO Reference</div>
                    <div>{order.poReference}</div>
                  </div>
                )}
                {order.accountName && (
                  <div style={{ marginBottom: "10px" }}>
                    <div style={{ fontWeight: 700, marginBottom: "2px" }}>Account</div>
                    <div>{order.accountName}</div>
                  </div>
                )}
              </div>

              {/* Center: mockup images side by side */}
              <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: "20px", padding: "16px 12px", minHeight: "260px", flexWrap: "wrap" }}>
                {mockupFiles.map((f: any) => (
                  <img key={f.id} src={f.fileUrl} alt={f.fileName} style={{ maxHeight: "280px", maxWidth: "250px", objectFit: "contain" }} />
                ))}
              </div>
            </div>

            {/* Design Specifications — front/back mockups big + elements/logos */}
            {(mockupFiles.length > 0 || logoFiles.length > 0) && (
              <>
                <div style={{ background: "#000", color: "#fff", padding: "6px 16px", fontSize: "12px", fontWeight: 700, textAlign: "center" }}>
                  Design Specifications
                </div>
                <div style={{ display: "flex", minHeight: "300px", alignItems: "stretch" }}>
                  {/* Mockup images — each gets its own column */}
                  {mockupFiles.slice(0, 2).map((f: any) => (
                    <div key={f.id} style={{ flex: 1, padding: "16px 12px", textAlign: "center", display: "flex", flexDirection: "column" }}>
                      <p style={{ fontSize: "11px", fontWeight: 700, marginBottom: "8px" }}>{f.fileName.replace(/\.[^.]+$/, "")}</p>
                      <img src={f.fileUrl} alt={f.fileName} style={{ flex: 1, minHeight: 0, objectFit: "contain", width: "100%" }} />
                    </div>
                  ))}
                  {/* Elements/logos */}
                  {logoFiles.length > 0 && (
                    <div style={{ width: "220px", padding: "16px 12px", textAlign: "center", borderLeft: "1px solid #eee" }}>
                      <p style={{ fontSize: "11px", fontWeight: 700, marginBottom: "12px" }}>Elements</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "center" }}>
                        {logoFiles.map((f: any) => (
                          <img key={f.id} src={f.fileUrl} alt={f.fileName} title={f.fileName} style={{ maxHeight: "65px", maxWidth: "180px", objectFit: "contain" }} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

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
