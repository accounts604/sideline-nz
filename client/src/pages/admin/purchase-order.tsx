import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { poBaseName } from "@shared/po-filename";
import { useParams, Link } from "wouter";
import { ArrowLeft, Printer } from "lucide-react";
import { computeMilestones } from "@shared/po-milestones";
import { suggestSizeChart, getSizeChartTables, SIZE_CHART_LABELS, SIZE_CHART_DIAGRAMS, type SizeChartType, type SizeTable } from "@shared/size-charts";
import { LOGO_POSITIONS, type LogoElement, type LogoPosition } from "@shared/schema";
import { getDesignPrints, getMockups, type DesignAsset } from "@shared/design-assets";

// Pull a sensible filename out of a Vercel-Blob / Drive / CDN URL when the
// admin hasn't typed an explicit artworkFile reference. Falls back to the
// last path segment, URL-decoded, with any random-suffix trimmed off if it
// looks like Vercel Blob's `name-AbCdEfG123.ext` pattern.
function filenameFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const seg = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
    if (!seg) return null;
    // Vercel Blob: <name>-<random>.<ext>  →  <name>.<ext>
    const m = seg.match(/^(.+)-[A-Za-z0-9]{10,}(\.[a-zA-Z0-9]+)$/);
    return m ? `${m[1]}${m[2]}` : seg;
  } catch {
    return null;
  }
}

// Checkerboard background so white/light logos stay visible against the
// PO's white paper. Same pattern Photoshop/Figma use for transparency.
const CHECKERBOARD_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "2px 3px",
  borderRadius: "3px",
  backgroundColor: "#e5e5e5",
  backgroundImage:
    "linear-gradient(45deg, #d4d4d4 25%, transparent 25%)," +
    "linear-gradient(-45deg, #d4d4d4 25%, transparent 25%)," +
    "linear-gradient(45deg, transparent 75%, #d4d4d4 75%)," +
    "linear-gradient(-45deg, transparent 75%, #d4d4d4 75%)",
  backgroundSize: "8px 8px",
  backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
};

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
  elementUrls: LogoElement[] | null;
  designPrints: DesignAsset[] | null;
  mockupImages: DesignAsset[] | null;
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
  namePlacement: string | null;
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
  orderType: string | null;
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

// Labelled strip of design assets (2D prints or 3D mockups). Mirrors
// renderAssetStrip() in server/po-pdf.ts. Returns null if empty — tightens
// the PO when a product has no mockups or no design prints yet.
function AssetStrip({ title, assets }: { title: string; assets: DesignAsset[] }) {
  if (!assets.length) return null;
  return (
    <div style={{ pageBreakInside: "avoid" }}>
      <div style={{ background: "#000", color: "#fff", padding: "6px 16px", fontSize: "12px", fontWeight: 700, textAlign: "center", letterSpacing: "0.3px" }}>
        {title}
      </div>
      <div style={{ display: "flex", border: "1px solid #eee", borderTop: "none", minHeight: "240px" }}>
        {assets.map((a, i) => (
          <div key={i} style={{ flex: 1, padding: "14px 10px", textAlign: "center", display: "flex", flexDirection: "column", borderRight: i < assets.length - 1 ? "1px solid #eee" : undefined }}>
            <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "8px", color: "#555" }}>{a.label || "—"}</div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
              <img src={a.url} alt={a.label} style={{ maxWidth: "100%", maxHeight: "260px", objectFit: "contain" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Logo Placement Grid — mirrors the PDF renderer (server/po-pdf.ts).
// 9 position columns × 5 data rows. Positions with no assigned logo render as em-dashes.
function LogoPlacementGrid({ elements }: { elements: LogoElement[] }) {
  // Multi-logo-per-position + custom placements supported. See server/po-pdf.ts.
  const presetSet = new Set<string>(LOGO_POSITIONS);
  const byPosition = new Map<LogoPosition, LogoElement[]>();
  const custom: LogoElement[] = [];
  const unassigned: LogoElement[] = [];
  for (const el of elements) {
    if (!el.position) {
      if (el.url) unassigned.push(el);
    } else if (presetSet.has(el.position)) {
      const key = el.position as LogoPosition;
      const list = byPosition.get(key) || [];
      list.push(el);
      byPosition.set(key, list);
    } else {
      custom.push(el);
    }
  }

  const th = (isFirst = false): React.CSSProperties => ({
    padding: "6px 4px", background: "#000", color: "#fff",
    fontSize: "8.5px", fontWeight: 700, textAlign: isFirst ? "left" : "center",
    letterSpacing: "0.2px", border: "1px solid #000", lineHeight: 1.2,
  });
  const tdStyle: React.CSSProperties = {
    padding: "6px 4px", fontSize: "9.5px", textAlign: "center",
    border: "1px solid #ccc", verticalAlign: "middle",
  };
  const lblStyle: React.CSSProperties = {
    padding: "6px 8px", fontSize: "9px", fontWeight: 700, background: "#f3f3f3",
    textAlign: "left", letterSpacing: "0.2px", border: "1px solid #ccc",
  };

  return (
    <div>
      <div style={{ background: "#000", color: "#fff", padding: "6px 16px", fontSize: "12px", fontWeight: 700, textAlign: "center", letterSpacing: "0.3px" }}>
        Logo Placement Grid
      </div>
      {unassigned.length > 0 && (
        <div style={{ background: "#fff7ed", borderLeft: "1px solid #fed7aa", borderRight: "1px solid #fed7aa", padding: "8px 12px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "9px", fontWeight: 700, color: "#c2410c", textTransform: "uppercase", letterSpacing: "0.4px", marginRight: "4px" }}>
            Unassigned ({unassigned.length}) — set position in admin
          </span>
          {unassigned.map((el, i) => (
            <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 8px 3px 3px", background: "#fff", border: "1px solid #fdba74", borderRadius: "4px" }}>
              <span style={CHECKERBOARD_STYLE}>
                <img src={el.url} alt={el.name} style={{ height: "22px", maxWidth: "40px", objectFit: "contain", display: "block" }} />
              </span>
              <span style={{ fontSize: "10px", color: "#555" }}>{el.name || "Logo"}</span>
            </div>
          ))}
        </div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "13%" }} />
          {LOGO_POSITIONS.map((p) => <col key={p} style={{ width: "9.67%" }} />)}
        </colgroup>
        <thead>
          <tr>
            <th style={th(true)}>POSITION</th>
            {LOGO_POSITIONS.map((p) => <th key={p} style={th()}>{p.toUpperCase()}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr style={{ height: "90px" }}>
            <td style={lblStyle}>LOGO</td>
            {LOGO_POSITIONS.map((p) => {
              const specs = byPosition.get(p) || [];
              if (!specs.length) return <td key={p} style={tdStyle}><span style={{ color: "#ccc", fontSize: "16px" }}>—</span></td>;
              const maxH = specs.length === 1 ? 70 : 32;
              return <td key={p} style={tdStyle}>
                {specs.map((s, i) => (
                  <div key={i} style={{ margin: "1px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                    <span style={{ ...CHECKERBOARD_STYLE, padding: "3px 4px" }}>
                      <img src={s.url} alt={s.name} style={{ maxWidth: "88%", maxHeight: `${maxH}px`, objectFit: "contain", display: "block" }} />
                    </span>
                    {s.name && <span style={{ fontSize: "8px", color: "#555", textAlign: "center", lineHeight: 1.2, fontWeight: 600 }}>{s.name}</span>}
                  </div>
                ))}
              </td>;
            })}
          </tr>
          <tr>
            <td style={lblStyle}>APPLICATION</td>
            {LOGO_POSITIONS.map((p) => {
              const specs = byPosition.get(p) || [];
              if (!specs.length) return <td key={p} style={tdStyle}></td>;
              return <td key={p} style={tdStyle}>{specs.map((s, i) => <div key={i}>{s.application ? <strong>{s.application.toUpperCase()}</strong> : "—"}</div>)}</td>;
            })}
          </tr>
          <tr>
            <td style={lblStyle}>SIZE</td>
            {LOGO_POSITIONS.map((p) => {
              const specs = byPosition.get(p) || [];
              if (!specs.length) return <td key={p} style={tdStyle}></td>;
              return <td key={p} style={tdStyle}>{specs.map((s, i) => <div key={i}>{s.sizeMm || "—"}</div>)}</td>;
            })}
          </tr>
          <tr>
            <td style={lblStyle}>THREAD / PMS</td>
            {LOGO_POSITIONS.map((p) => {
              const specs = byPosition.get(p) || [];
              if (!specs.length) return <td key={p} style={tdStyle}></td>;
              return <td key={p} style={tdStyle}>
                {specs.map((s, si) => (
                  <div key={si} style={{ marginBottom: si < specs.length - 1 ? "4px" : 0 }}>
                    {s.threadColours?.length
                      ? s.threadColours.map((c, i) => (
                          <span key={i} style={{ display: "inline-block", fontSize: "8.5px", fontWeight: 700, color: "#b8932f", background: "#fdf6e3", border: "1px solid #e6d59a", borderRadius: "2px", padding: "0 4px", margin: "1px 1px", lineHeight: 1.4 }}>{c}</span>
                        ))
                      : "—"}
                  </div>
                ))}
              </td>;
            })}
          </tr>
          <tr>
            <td style={lblStyle}>ARTWORK FILE</td>
            {LOGO_POSITIONS.map((p) => {
              const specs = byPosition.get(p) || [];
              if (!specs.length) return <td key={p} style={tdStyle}></td>;
              return <td key={p} style={tdStyle}>{specs.map((s, i) => {
                const label = s.artworkFile || filenameFromUrl(s.url) || null;
                if (!label && !s.url) return <div key={i}>—</div>;
                return (
                  <div key={i}>
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "9px", color: "#0ea5e9", textDecoration: "underline", wordBreak: "break-all" }}
                      >
                        {label || "View file ↗"}
                      </a>
                    ) : (
                      <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "9px" }}>{label}</span>
                    )}
                  </div>
                );
              })}</td>;
            })}
          </tr>
        </tbody>
      </table>
      {custom.length > 0 && (
        <div style={{ background: "#eff6ff", borderLeft: "1px solid #bfdbfe", borderRight: "1px solid #bfdbfe", borderBottom: "1px solid #bfdbfe", padding: "10px 12px" }}>
          <div style={{ fontSize: "9px", fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "6px" }}>Custom Placements ({custom.length})</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9.5px" }}>
            <thead>
              <tr>
                {["POSITION", "LOGO", "APPLICATION", "SIZE", "THREAD / PMS", "ARTWORK"].map((h, i) => (
                  <th key={h} style={{ padding: "4px 6px", background: "#dbeafe", textAlign: i < 2 ? "left" : "center", fontSize: "8.5px", fontWeight: 700, letterSpacing: "0.3px", border: "1px solid #bfdbfe" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {custom.map((s, i) => (
                <tr key={i}>
                  <td style={{ padding: "5px 6px", fontWeight: 700, color: "#1d4ed8", border: "1px solid #bfdbfe" }}>{s.position || ""}</td>
                  <td style={{ padding: "5px 6px", border: "1px solid #bfdbfe" }}>
                    {s.url && <img src={s.url} alt={s.name} style={{ maxHeight: "32px", maxWidth: "56px", objectFit: "contain" }} />}
                  </td>
                  <td style={{ padding: "5px 6px", textAlign: "center", border: "1px solid #bfdbfe" }}><strong>{(s.application || "—").toUpperCase()}</strong></td>
                  <td style={{ padding: "5px 6px", textAlign: "center", border: "1px solid #bfdbfe" }}>{s.sizeMm || "—"}</td>
                  <td style={{ padding: "5px 6px", textAlign: "center", border: "1px solid #bfdbfe" }}>
                    {s.threadColours?.length
                      ? s.threadColours.map((c, j) => (
                          <span key={j} style={{ display: "inline-block", fontSize: "8.5px", fontWeight: 700, color: "#b8932f", background: "#fdf6e3", border: "1px solid #e6d59a", borderRadius: "2px", padding: "0 4px", margin: "1px 2px" }}>{c}</span>
                        ))
                      : "—"}
                  </td>
                  <td style={{ padding: "5px 6px", textAlign: "center", border: "1px solid #bfdbfe", fontFamily: "ui-monospace, Menlo, monospace" }}>
                    {(() => {
                      const label = s.artworkFile || filenameFromUrl(s.url) || null;
                      if (!label && !s.url) return "—";
                      return s.url ? (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "#0ea5e9", textDecoration: "underline", fontSize: "9px", wordBreak: "break-all" }}>{label || "View file ↗"}</a>
                      ) : (
                        <span style={{ fontSize: "9px" }}>{label}</span>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

  const elements = (item.elementUrls as LogoElement[] | null) ?? [];
  const designPrints = getDesignPrints(item as any);
  const mockups = getMockups(item as any);

  return (
    <div style={{ pageBreakInside: "avoid", marginBottom: "20px" }}>
      {/* Product header bar */}
      <div style={{ background: "#000", color: "#fff", padding: "8px 16px", fontSize: "13px", fontWeight: 700, textAlign: "center", letterSpacing: "0.3px" }}>
        {item.productName && item.gradeGroup
          ? `${item.productName.replace(/Rugby Jersey ?/i, "").trim() || "Jersey"} ${item.gradeGroup}`.replace(/^\s+|\s+$/g, "")
          : (item.gradeGroup || item.productName)}
      </div>

      {/* Product info row — LEFT: specs (wider) | RIGHT: size/count. Mockups moved to dedicated sections below. */}
      <div style={{ display: "flex" }}>
        <div style={{ flex: 1, padding: "14px 18px", fontSize: "12px", color: "#000" }}>
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                {(item.productColors as { hex: string; name?: string; pms?: string }[]).map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ width: "28px", height: "16px", background: c.hex, border: "1px solid #bbb", borderRadius: "2px", display: "inline-block" }} />
                    <span style={{ fontSize: "11px" }}>
                      <strong>{c.name || "Unnamed"}</strong>
                      <span style={{ color: "#888", marginLeft: "4px" }}>{c.hex}</span>
                      {c.pms && <span style={{ fontWeight: 700, color: "#b8932f", marginLeft: "6px" }}>{c.pms}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {item.designBrief && (
            <div style={{ marginBottom: "8px" }}>
              <div style={{ fontWeight: 700, marginBottom: "2px" }}>Design Brief</div>
              <div style={{ fontSize: "10px", color: "#666", lineHeight: "1.4" }}>{item.designBrief}</div>
            </div>
          )}
          {item.designNotes && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: "2px" }}>Notes</div>
              <div style={{ fontSize: "11px", color: "#555" }}>{item.designNotes}</div>
            </div>
          )}
        </div>

        <div style={{ width: "220px", padding: "14px 16px", borderLeft: "1px solid #eee" }}>
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

      {/* Customisation roster — only when any breakdown carries a name or
          number. Groups by size, lists names inline. Placement stated once
          at the top (it's almost always the same across the whole item). */}
      {(() => {
        const named = breakdowns.filter((b) => b.playerName || b.playerNumber);
        if (named.length === 0) return null;
        // Group by size, preserve first-seen size order
        const bySize = new Map<string, typeof breakdowns>();
        for (const b of named) {
          const list = bySize.get(b.size) || [];
          list.push(b);
          bySize.set(b.size, list);
        }
        // Placement: pick the most common one (usually one)
        const placementCounts = new Map<string, number>();
        for (const b of named) {
          if (b.namePlacement) placementCounts.set(b.namePlacement, (placementCounts.get(b.namePlacement) || 0) + 1);
        }
        let dominantPlacement: string | null = null;
        let bestCount = 0;
        Array.from(placementCounts.entries()).forEach(([p, c]) => {
          if (c > bestCount) { dominantPlacement = p; bestCount = c; }
        });
        // Surface any minority placements as a footnote
        const minoritySet = new Set<string>();
        for (const b of named) {
          if (b.namePlacement && b.namePlacement !== dominantPlacement) minoritySet.add(b.namePlacement);
        }
        return (
          <div style={{ pageBreakInside: "avoid", borderTop: "1px solid #eee", padding: "12px 18px", background: "#fafafa" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#000" }}>
                Customisation Roster ({named.length} {named.length === 1 ? "name" : "names"})
              </div>
              {dominantPlacement && (
                <div style={{ fontSize: "11px", color: "#444" }}>
                  Placement: <strong>{dominantPlacement}</strong>
                </div>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px" }}>
              {Array.from(bySize.entries()).map(([size, rows]) => {
                // Count duplicates of the same name within a size (e.g. Addenbrooke ×2)
                const tally = new Map<string, { row: typeof rows[number]; count: number }>();
                for (const r of rows) {
                  const key = `${r.playerName || ""}|${r.playerNumber || ""}`;
                  if (tally.has(key)) tally.get(key)!.count++;
                  else tally.set(key, { row: r, count: 1 });
                }
                const items = Array.from(tally.values()).map(({ row, count }) => {
                  const name = row.playerName || "(no name)";
                  const num = row.playerNumber ? ` #${row.playerNumber}` : "";
                  const mult = count > 1 ? ` ×${count}` : "";
                  return `${name}${num}${mult}`;
                });
                return (
                  <div key={size} style={{ fontSize: "11px", color: "#000", padding: "3px 0", breakInside: "avoid" }}>
                    <div>
                      <strong>{size}</strong>
                      <span style={{ color: "#888" }}> ({rows.length})</span>
                      <span style={{ color: "#222", marginLeft: "8px" }}>{items.join(" · ")}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {minoritySet.size > 0 && (
              <div style={{ fontSize: "10px", color: "#888", marginTop: "8px", fontStyle: "italic" }}>
                Mixed placements present: {Array.from(minoritySet).join(", ")} — see per-size detail in the order if precise location needed.
              </div>
            )}
          </div>
        );
      })()}

      {/* 2D Design Print — factory artwork, true colours */}
      <AssetStrip title="2D Design Print — Factory Artwork (true colours)" assets={designPrints} />

      {/* 3D Mockups — vendor render */}
      <AssetStrip title="3D Mockup — Vendor Render" assets={mockups} />

      {/* Logo Placement Grid — hidden when there are no logos */}
      {elements.length > 0 && <LogoPlacementGrid elements={elements} />}

      {/* Sizing Guide — hidden when chart is "none" (unknown/unverified) */}
      {(() => {
        const chartType = ((item as any).sizeChartType || suggestSizeChart(item.productType)) as SizeChartType;
        const tables = getSizeChartTables(chartType);
        if (tables.length === 0) return null;
        const diagramSrc = SIZE_CHART_DIAGRAMS[chartType];
        return (
          <>
            <div style={{ background: "#000", color: "#fff", padding: "6px 16px", fontSize: "12px", fontWeight: 700, textAlign: "center", letterSpacing: "0.3px" }}>
              Sizing Guide — {SIZE_CHART_LABELS[chartType] || chartType}
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", padding: "12px 16px" }}>
              {diagramSrc && (
                <div style={{ width: "220px", flexShrink: 0, textAlign: "center" }}>
                  <img src={diagramSrc} alt={`${SIZE_CHART_LABELS[chartType]} measurement diagram`} style={{ width: "100%", maxHeight: "280px", objectFit: "contain" }} />
                  <p style={{ fontSize: "9px", color: "#888", marginTop: "4px" }}>Measurement reference</p>
                </div>
              )}
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

  // Set document.title to the proper naming convention so Chrome's
  // "Save as PDF" dialog pre-fills the filename. Restored on unmount.
  useEffect(() => {
    if (!data?.order) return;
    const previous = document.title;
    document.title = poBaseName({
      poReference: data.order.poReference,
      orderNumber: data.order.orderNumber,
      accountName: data.order.accountName,
      customerName: data.order.customerName,
      createdAt: data.order.createdAt,
    });
    return () => { document.title = previous; };
  }, [data?.order?.id, data?.order?.poReference, data?.order?.accountName, data?.order?.createdAt]);

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
          <div style={{ textAlign: "right", minWidth: "420px", display: "flex", gap: "14px", alignItems: "flex-start", justifyContent: "flex-end" }}>
            <div>
              <h2 style={{ fontSize: "15px", fontWeight: 800, margin: "0 0 12px 0", letterSpacing: "0.5px" }}>PRODUCTION SHEET</h2>
              <table style={{ fontSize: "12px", marginLeft: "auto", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 700, padding: "4px 12px 4px 0", textAlign: "right" }}>DATE</td>
                    <td style={{ background: "#f2f2f2", padding: "4px 10px", minWidth: "180px", textAlign: "left" }}>{dateStr}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700, padding: "4px 12px 4px 0", textAlign: "right" }}>ORDER REF</td>
                    <td style={{ background: "#f2f2f2", padding: "4px 10px", textAlign: "left" }}>{order.poReference || order.orderNumber}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700, padding: "4px 12px 4px 0", textAlign: "right" }}>ACCOUNT</td>
                    <td style={{ background: "#f2f2f2", padding: "4px 10px", textAlign: "left" }}>{order.accountName || ""}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700, padding: "4px 12px 4px 0", textAlign: "right" }}>TYPE</td>
                    <td style={{ background: "#f2f2f2", padding: "4px 10px", textAlign: "left" }}>
                      {order.orderType === "team-store" ? "Team Store" : order.orderType === "sample-run" ? "Sample Run" : "Bulk Order"}
                      {order.isRepeatOrder ? " (Repeat)" : ""}
                    </td>
                  </tr>
                  {order.dueDate && (
                    <tr>
                      <td style={{ fontWeight: 700, padding: "4px 12px 4px 0", textAlign: "right" }}>DUE</td>
                      <td style={{ background: "#f2f2f2", padding: "4px 10px", textAlign: "left" }}>{order.dueDate}</td>
                    </tr>
                  )}
                  {order.poComments && (
                    <tr>
                      <td style={{ fontWeight: 700, padding: "4px 12px 4px 0", textAlign: "right" }}>COMMENTS</td>
                      <td style={{ background: "#f2f2f2", padding: "4px 10px", textAlign: "left" }}>{order.poComments}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ textAlign: "center" }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&margin=2&data=${encodeURIComponent((typeof window !== "undefined" ? window.location.origin : "https://sidelinenz.com") + `/admin/orders/${order.id}`)}`}
                alt="Scan for live order"
                style={{ width: "88px", height: "88px", border: "1px solid #ddd", padding: "4px", background: "#fff" }}
              />
              <div style={{ fontSize: "8px", color: "#888", marginTop: "4px", letterSpacing: "0.3px" }}>SCAN FOR LIVE ORDER</div>
            </div>
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

        {/* Artwork Approval band — STATUS / APPROVED BY / DATE / REFERENCE */}
        {(() => {
          const approved = (order as any).artworkApproved === true;
          const approvedBy = (order as any).artworkApprovedBy || order.customerName || "";
          const approvedDate = (order as any).artworkApprovedAt
            ? new Date((order as any).artworkApprovedAt).toISOString().slice(0, 10)
            : dateStr;
          return (
            <div style={{ marginBottom: "18px" }}>
              <div style={{ background: "#000", color: "#fff", padding: "6px 16px", fontSize: "12px", fontWeight: 700, textAlign: "center", letterSpacing: "0.3px" }}>
                Artwork Approval
              </div>
              <div style={{ display: "flex", border: "1px solid #eee", borderTop: "none", fontSize: "11px" }}>
                <div style={{ flex: 1, padding: "10px 14px", borderRight: "1px solid #eee" }}>
                  <div style={{ fontWeight: 700, fontSize: "10px", color: "#555", letterSpacing: "0.4px", marginBottom: "3px" }}>STATUS</div>
                  <div>
                    <span style={{ display: "inline-block", padding: "3px 10px", background: approved ? "#16a34a" : "#f59e0b", color: "#fff", borderRadius: "3px", fontWeight: 700, fontSize: "10px", letterSpacing: "0.3px" }}>
                      {approved ? "APPROVED" : "PENDING"}
                    </span>
                  </div>
                </div>
                <div style={{ flex: 1, padding: "10px 14px", borderRight: "1px solid #eee" }}>
                  <div style={{ fontWeight: 700, fontSize: "10px", color: "#555", letterSpacing: "0.4px", marginBottom: "3px" }}>APPROVED BY</div>
                  <div>{approved ? approvedBy : "—"}</div>
                </div>
                <div style={{ flex: 1, padding: "10px 14px", borderRight: "1px solid #eee" }}>
                  <div style={{ fontWeight: 700, fontSize: "10px", color: "#555", letterSpacing: "0.4px", marginBottom: "3px" }}>DATE</div>
                  <div style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{approved ? approvedDate : "—"}</div>
                </div>
                <div style={{ flex: 1.3, padding: "10px 14px" }}>
                  <div style={{ fontWeight: 700, fontSize: "10px", color: "#555", letterSpacing: "0.4px", marginBottom: "3px" }}>REFERENCE</div>
                  <div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "10px" }}>{order.poReference || order.orderNumber || ""}</div>
                </div>
              </div>
            </div>
          );
        })()}

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

