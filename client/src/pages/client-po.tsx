// Client-facing PO view. Public route /client-po/:token — gated by the same
// approval_tokens table the design proof flow uses. The buyer/client gets
// a link, hits this page, sees:
//   - product details (name, material, branding, mockups, colours)
//   - sizes + per-player customisation (name, number, placement)
//   - logo placement grid (positions, application method, sizes)
//   - design brief
//   - estimated delivery date
// Hidden:
//   - all financial data (no unit cost, no totals)
//   - supplier identity
//   - production schedule (just the delivery date)
//   - internal Drive links

import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Printer, Loader2 } from "lucide-react";
import { LOGO_POSITIONS, type LogoElement, type LogoPosition } from "@shared/schema";
import { suggestSizeChart, getSizeChartTables, SIZE_CHART_LABELS, SIZE_CHART_DIAGRAMS, type SizeChartType } from "@shared/size-charts";
import { getDesignPrints, getMockups, type DesignAsset } from "@shared/design-assets";

type Item = {
  id: string;
  productName: string;
  productType: string | null;
  gradeGroup: string | null;
  material: string | null;
  brandingMethod: string | null;
  productColors: { hex: string; name?: string; pms?: string }[] | null;
  designNotes: string | null;
  designBrief: string | null;
  frontDesignUrl: string | null;
  backDesignUrl: string | null;
  designPrints: DesignAsset[] | null;
  mockupImages: DesignAsset[] | null;
  elementUrls: LogoElement[] | null;
  sizeChartType: string | null;
};

type Breakdown = {
  id: string;
  orderItemId: string;
  size: string;
  quantity: number;
  playerName: string | null;
  playerNumber: string | null;
  namePlacement: string | null;
};

type ClientPoResponse = {
  order: {
    id: string;
    poReference: string | null;
    orderNumber: string;
    accountName: string | null;
    customerName: string | null;
    customerEmail: string | null;
    customerFirstName: string | null;
    customerLastName: string | null;
    dueDate: string | null;
    deliveryAttention: string | null;
    deliveryAddress: string | null;
    artworkApproved: boolean | null;
    artworkApprovedBy: string | null;
    artworkApprovedAt: string | null;
    createdAt: string;
  };
  items: Item[];
  sizeBreakdowns: Breakdown[];
};

export default function ClientPo() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = useQuery<ClientPoResponse>({
    queryKey: [`/api/approve/${token}/po`],
    queryFn: async () => {
      const r = await fetch(`/api/approve/${token}/po`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      return r.json();
    },
    retry: 0,
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#000" }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px", background: "#fff" }}>
        <div style={{ maxWidth: "480px", textAlign: "center", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
          <p style={{ fontSize: "14px", color: "#b91c1c" }}>{(error as any)?.message || "Couldn't load this PO."}</p>
          <p style={{ fontSize: "12px", color: "#666", marginTop: "10px" }}>Contact Sideline NZ for a fresh link.</p>
        </div>
      </div>
    );
  }

  const { order, items, sizeBreakdowns } = data;
  const contact = [order.customerFirstName, order.customerLastName].filter(Boolean).join(" ") || order.customerName || "";
  const dueDateStr = order.dueDate ? new Date(order.dueDate).toLocaleDateString("en-NZ", { year: "numeric", month: "long", day: "numeric" }) : "TBC";
  const breakdownsByItem = new Map<string, Breakdown[]>();
  for (const b of sizeBreakdowns) {
    const list = breakdownsByItem.get(b.orderItemId) || [];
    list.push(b);
    breakdownsByItem.set(b.orderItemId, list);
  }

  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      <div className="no-print" style={{ padding: "16px 24px", background: "#111", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
        <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>Sideline NZ — Order Confirmation</div>
        <button
          onClick={() => window.print()}
          style={{ padding: "8px 20px", fontSize: "13px", fontWeight: 600, background: "#fff", color: "#000", border: "none", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}
        >
          <Printer size={14} /> Print / Save PDF
        </button>
      </div>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 40px", fontFamily: "'Segoe UI', Arial, sans-serif", color: "#000" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            <div style={{ marginBottom: "12px" }}>
              <img src="/sideline-logo-vertical.png" alt="Sideline NZ" style={{ height: "70px", objectFit: "contain" }} />
            </div>
            <div style={{ fontSize: "11px", color: "#333", lineHeight: 1.6 }}>
              Sideline NZ (Sideline Custom Goods Ltd)<br />
              Unit 2, 66 Cavendish Drive Manukau<br />
              Auckland, 2104<br />
              022 412 7205<br />
              info@sidelinenz.com<br />
              <span style={{ color: "#0ea5e9" }}>www.sidelinenz.com</span>
            </div>
          </div>
          <div style={{ textAlign: "right", minWidth: "320px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 800, margin: "0 0 12px 0", letterSpacing: "0.5px" }}>ORDER CONFIRMATION</h2>
            <table style={{ fontSize: "12px", marginLeft: "auto", borderCollapse: "collapse" }}>
              <tbody>
                <tr><td style={{ fontWeight: 700, padding: "4px 12px 4px 0", textAlign: "right" }}>REFERENCE</td><td style={{ background: "#f2f2f2", padding: "4px 10px", minWidth: "180px", textAlign: "left" }}>{order.poReference || order.orderNumber}</td></tr>
                <tr><td style={{ fontWeight: 700, padding: "4px 12px 4px 0", textAlign: "right" }}>CLIENT</td><td style={{ background: "#f2f2f2", padding: "4px 10px", textAlign: "left" }}>{order.accountName || contact || "—"}</td></tr>
                {contact && <tr><td style={{ fontWeight: 700, padding: "4px 12px 4px 0", textAlign: "right" }}>CONTACT</td><td style={{ background: "#f2f2f2", padding: "4px 10px", textAlign: "left" }}>{contact}</td></tr>}
                {order.deliveryAddress && <tr><td style={{ fontWeight: 700, padding: "4px 12px 4px 0", textAlign: "right" }}>DELIVERY</td><td style={{ background: "#f2f2f2", padding: "4px 10px", textAlign: "left" }}>{order.deliveryAttention ? `${order.deliveryAttention} — ` : ""}{order.deliveryAddress}</td></tr>}
                <tr><td style={{ fontWeight: 700, padding: "4px 12px 4px 0", textAlign: "right" }}>EST. DELIVERY</td><td style={{ background: "#fff8e1", padding: "4px 10px", textAlign: "left", fontWeight: 700 }}>{dueDateStr}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Items */}
        {items.map((item) => {
          const bds = breakdownsByItem.get(item.id) || [];
          const totalQty = bds.length ? bds.reduce((s, b) => s + b.quantity, 0) : 0;
          const sizeSummary = new Map<string, number>();
          for (const b of bds) sizeSummary.set(b.size, (sizeSummary.get(b.size) || 0) + b.quantity);

          const named = bds.filter((b) => b.playerName || b.playerNumber);
          const dominantPlacement = named.find((b) => b.namePlacement)?.namePlacement || null;
          const namedBySize = new Map<string, Breakdown[]>();
          for (const b of named) {
            const list = namedBySize.get(b.size) || [];
            list.push(b);
            namedBySize.set(b.size, list);
          }

          const designPrints = getDesignPrints(item as any);
          const mockups = getMockups(item as any);
          const elements = (item.elementUrls || []) as LogoElement[];

          return (
            <div key={item.id} style={{ pageBreakInside: "avoid", marginBottom: "20px" }}>
              <div style={{ background: "#000", color: "#fff", padding: "8px 16px", fontSize: "13px", fontWeight: 700, textAlign: "center", letterSpacing: "0.3px" }}>
                {item.productName}{item.gradeGroup ? ` — ${item.gradeGroup}` : ""}
              </div>

              <div style={{ display: "flex" }}>
                <div style={{ flex: 1, padding: "14px 18px", fontSize: "12px", color: "#000" }}>
                  <div style={{ marginBottom: "10px" }}><div style={{ fontWeight: 700, marginBottom: "2px" }}>Product</div><div>{item.productName}</div></div>
                  {item.material && <div style={{ marginBottom: "10px" }}><div style={{ fontWeight: 700, marginBottom: "2px" }}>Material</div><div>{item.material}</div></div>}
                  {item.brandingMethod && <div style={{ marginBottom: "10px" }}><div style={{ fontWeight: 700, marginBottom: "2px" }}>Branding</div><div style={{ color: "#0ea5e9" }}>{item.brandingMethod}</div></div>}
                  {item.productColors && item.productColors.length > 0 && (
                    <div style={{ marginBottom: "10px" }}>
                      <div style={{ fontWeight: 700, marginBottom: "4px" }}>Colour Palette</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                        {item.productColors.map((c, i) => (
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
                  {item.designBrief && (
                    <div style={{ marginBottom: "10px" }}>
                      <div style={{ fontWeight: 700, marginBottom: "2px" }}>Design Brief</div>
                      <div style={{ fontSize: "10px", color: "#666", lineHeight: 1.4 }}>{item.designBrief}</div>
                    </div>
                  )}
                  {item.designNotes && (
                    <div><div style={{ fontWeight: 700, marginBottom: "2px" }}>Notes</div><div style={{ fontSize: "11px", color: "#555" }}>{item.designNotes}</div></div>
                  )}
                </div>

                <div style={{ width: "220px", padding: "14px 16px", borderLeft: "1px solid #eee" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}><span>Size</span><span>Count</span></div>
                  {Array.from(sizeSummary.entries()).map(([size, qty]) => (
                    <div key={size} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "3px 0" }}><span>{size}</span><span>{qty}</span></div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700, marginTop: "10px" }}><span>Total</span><span>{totalQty}</span></div>
                </div>
              </div>

              {/* Customisation roster — only if any */}
              {named.length > 0 && (
                <div style={{ pageBreakInside: "avoid", borderTop: "1px solid #eee", padding: "12px 18px", background: "#fafafa" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700 }}>Customisation Roster ({named.length} {named.length === 1 ? "name" : "names"})</div>
                    {dominantPlacement && <div style={{ fontSize: "11px", color: "#444" }}>Placement: <strong>{dominantPlacement}</strong></div>}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px" }}>
                    {Array.from(namedBySize.entries()).map(([size, rows]) => {
                      const tally = new Map<string, { row: Breakdown; count: number }>();
                      for (const r of rows) {
                        const k = `${r.playerName || ""}|${r.playerNumber || ""}`;
                        if (tally.has(k)) tally.get(k)!.count++;
                        else tally.set(k, { row: r, count: 1 });
                      }
                      const items = Array.from(tally.values()).map(({ row, count }) => {
                        const n = row.playerName || "(no name)";
                        const num = row.playerNumber ? ` #${row.playerNumber}` : "";
                        const mult = count > 1 ? ` ×${count}` : "";
                        return `${n}${num}${mult}`;
                      });
                      return (
                        <div key={size} style={{ fontSize: "11px", padding: "3px 0" }}>
                          <strong>{size}</strong>
                          <span style={{ color: "#888" }}> ({rows.length})</span>
                          <span style={{ marginLeft: "8px" }}>{items.join(" · ")}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Mockup strips */}
              {mockups.length > 0 && (
                <div style={{ pageBreakInside: "avoid" }}>
                  <div style={{ background: "#000", color: "#fff", padding: "6px 16px", fontSize: "12px", fontWeight: 700, textAlign: "center" }}>3D Mockup</div>
                  <div style={{ display: "flex", border: "1px solid #eee", borderTop: "none", minHeight: "240px" }}>
                    {mockups.map((a, i) => (
                      <div key={i} style={{ flex: 1, padding: "14px 10px", textAlign: "center", display: "flex", flexDirection: "column", borderRight: i < mockups.length - 1 ? "1px solid #eee" : undefined }}>
                        <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px", color: "#555" }}>{a.label || "—"}</div>
                        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
                          <img src={a.url} alt={a.label} style={{ maxWidth: "100%", maxHeight: "260px", objectFit: "contain" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Logo placement summary — name + position only (no PMS / artwork file paths) */}
              {elements.length > 0 && (
                <div style={{ pageBreakInside: "avoid", padding: "12px 18px", borderTop: "1px solid #eee" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Logo Placement</div>
                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    {elements.map((el, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", background: "#fff", border: "1px solid #eee", borderRadius: "4px" }}>
                        <div style={{ width: "40px", height: "40px", background: "#e5e5e5", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "3px" }}>
                          <img src={el.url} alt={el.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: "11px", fontWeight: 600 }}>{el.name}</div>
                          <div style={{ fontSize: "10px", color: "#666" }}>{el.position || "—"}{el.application ? ` · ${el.application}` : ""}{el.sizeMm ? ` · ${el.sizeMm}` : ""}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Footer — confirmation note */}
        <div style={{ marginTop: "28px", padding: "16px", background: "#f9f9f9", border: "1px solid #eee", borderRadius: "6px", textAlign: "center", fontSize: "11px", color: "#666", lineHeight: 1.55 }}>
          This is your order confirmation. Please review the products, sizes, customisation roster, and logo placement above.
          The estimated delivery date is <strong>{dueDateStr}</strong>. Any production updates will be shared via Sideline NZ.
          <br /><br />
          Questions? Reach us at <strong>info@sidelinenz.com</strong> or 022 412 7205.
        </div>
      </div>

      <style>{`@media print { .no-print { display: none !important; } body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } @page { margin: 10mm; } }`}</style>
    </div>
  );
}
