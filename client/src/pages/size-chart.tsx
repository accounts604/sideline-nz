import { useState } from "react";
import Layout from "@/components/layout";
import { SIZE_CHART_DATA, SIZE_CHART_DIAGRAMS, type SizeTable } from "@shared/size-charts";
import Seo from "@/components/seo";

// The garments shown on the public page, in display order. Data comes from
// shared/size-charts.ts — the same source the PO PDF and supplier dispatch
// render from, so the site can never drift from what production is told.
const GARMENTS = [
  "tshirt",
  "hoodie",
  "singlet",
  "shorts",
  "trackpants",
  "jacket",
  "stadium-jacket",
  "rugby-jersey",
  "rugby-jersey-supporters",
  "baseball-jersey",
  "socks",
  "beanie",
] as const;

type GarmentType = (typeof GARMENTS)[number];

const GARMENT_LABELS: Record<GarmentType, string> = {
  tshirt: "T-Shirts & Polos",
  hoodie: "Hoodies",
  singlet: "Singlets",
  shorts: "Shorts",
  trackpants: "Trackpants",
  jacket: "Jackets",
  "stadium-jacket": "Stadium Jacket",
  "rugby-jersey": "Rugby Kit — Playing",
  "rugby-jersey-supporters": "Rugby Kit — Supporters",
  "baseball-jersey": "Baseball Jersey",
  socks: "Socks",
  beanie: "Beanie",
};

const DIAGRAM_IMAGES: Record<GarmentType, string> = SIZE_CHART_DIAGRAMS;

// Chart data lives in shared/size-charts.ts — the single source of truth
// shared with the admin PO PDF and supplier dispatch. This page just picks
// which public garment tabs to show.
const SIZE_DATA: Record<GarmentType, SizeTable[]> = Object.fromEntries(
  (Object.keys(GARMENT_LABELS) as GarmentType[]).map((k) => [k, SIZE_CHART_DATA[k] ?? []])
) as Record<GarmentType, SizeTable[]>;

// Short fit descriptions shown under the tab row where a garment has a
// deliberate cut philosophy the customer should know before choosing sizes.
const FIT_NOTES: Partial<Record<GarmentType, string>> = {
  jacket: "One chart for all Sideline jacket styles — the same size fits the same whether it's a softshell, shell, windbreaker or quarter-zip.",
  "stadium-jacket": "Longline sideline coat — cut to sit below the knee.",
  "rugby-jersey": "Sports fit — snug chest and shorter athletic body, made for on-field play. For a fuller fit see the Supporters cut.",
  "rugby-jersey-supporters": "Relaxed fit — longer body and fuller cut, made for wearing on the sideline. For match gear see the Playing cut.",
};

function SizeTableComponent({ table }: { table: SizeTable }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "1px" }}>
          {table.title}
        </h4>
        <span style={{ fontSize: "11px", color: "#999" }}>Measurements in cm</span>
      </div>
      <div className="overflow-x-auto -mx-5 px-5 md:mx-0 md:px-0">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "500px" }}>
          <thead>
            <tr>
              {table.headers.map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: "10px 8px",
                    textAlign: i === 0 ? "left" : "center",
                    fontWeight: 600,
                    fontSize: "11px",
                    color: "#111",
                    borderBottom: "2px solid #111",
                    whiteSpace: "nowrap",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? "#fafafa" : "#fff" }}>
                <td style={{ padding: "9px 8px", fontWeight: 600, color: "#333", whiteSpace: "nowrap", borderBottom: "1px solid #eee" }}>
                  {row.label}
                </td>
                {row.values.map((v, vi) => (
                  <td key={vi} style={{ padding: "9px 8px", textAlign: "center", color: "#444", borderBottom: "1px solid #eee" }}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: "11px", color: "#999", marginTop: "8px", textAlign: "right" }}>
        Tolerance {table.tolerance}
      </p>
    </div>
  );
}

export default function SizeChartPage() {
  const [activeGarment, setActiveGarment] = useState<GarmentType>("tshirt");

  const diagramSrc = DIAGRAM_IMAGES[activeGarment];
  const tables = SIZE_DATA[activeGarment];

  return (
    <Layout>
      <Seo title="Size Chart" description="Sideline NZ size charts for jerseys, shorts, hoodies and teamwear. Find the right fit for kids and adults before you order." path="/size-chart" />
      <section style={{ background: "#fff", paddingTop: "120px", paddingBottom: "40px" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "0 20px", textAlign: "center" }}>
          <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "12px" }}>
            Size Chart
          </h1>
          <p style={{ fontSize: "15px", color: "#666", maxWidth: "560px", margin: "0 auto 8px" }}>
            All measurements in centimetres. Measure a garment you already own and compare to find your best fit.
          </p>
          <p style={{ fontSize: "13px", color: "#999" }}>
            Tall sizing adds 3–5cm to length. Additional sizes available on request.
          </p>
        </div>
      </section>

      <section style={{ background: "#fff", borderTop: "1px solid #e5e5e5" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "0 20px" }}>
          {/* Garment Type Tabs */}
          <div className="flex overflow-x-auto gap-1 py-4 -mx-5 px-5 md:mx-0 md:px-0" style={{ borderBottom: "1px solid #e5e5e5" }}>
            {(Object.keys(GARMENT_LABELS) as GarmentType[]).map((key) => (
              <button
                key={key}
                onClick={() => setActiveGarment(key)}
                style={{
                  padding: "10px 16px",
                  fontSize: "12px",
                  fontWeight: activeGarment === key ? 700 : 500,
                  color: activeGarment === key ? "#111" : "#999",
                  background: activeGarment === key ? "#f5f5f5" : "transparent",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  transition: "all 0.2s",
                }}
              >
                {GARMENT_LABELS[key]}
              </button>
            ))}
          </div>

          {FIT_NOTES[activeGarment] && (
            <p style={{ fontSize: "13px", color: "#666", padding: "12px 0 0", fontStyle: "italic" }}>
              {FIT_NOTES[activeGarment]}
            </p>
          )}

          {/* Diagram + How to Measure */}
          <div className="grid md:grid-cols-2 gap-8 py-10" style={{ borderBottom: "1px solid #e5e5e5" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#fafafa", borderRadius: "8px", padding: "24px" }}>
              <img
                src={diagramSrc}
                alt={GARMENT_LABELS[activeGarment] + " measurement diagram"}
                style={{ width: "100%", height: "auto", maxHeight: "500px", objectFit: "contain", display: "block" }}
              />
            </div>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#111", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "1px" }}>
                How to Measure
              </h3>
              <ol style={{ fontSize: "14px", color: "#444", lineHeight: 1.8, paddingLeft: "20px" }}>
                <li>Take a garment you own that fits well.</li>
                <li>Lay it flat on a smooth surface — don't stretch it.</li>
                <li>Measure ½ chest from left to right, 1cm underneath the arm pit.</li>
                <li>Measure the length from the top of the shoulder to the bottom of the hem.</li>
                <li>Match your measurements against the chart below to find your size.</li>
              </ol>
              <div style={{ marginTop: "20px", padding: "16px", background: "#fffbeb", borderRadius: "8px", border: "1px solid #fde68a" }}>
                <p style={{ fontSize: "13px", color: "#92400e", fontWeight: 600, marginBottom: "4px" }}>Important</p>
                <p style={{ fontSize: "13px", color: "#92400e", lineHeight: 1.6 }}>
                  All garments are made to order. Please double-check your size before ordering — we cannot swap or refund for incorrect sizing.
                </p>
              </div>
            </div>
          </div>

          {/* Size Tables */}
          <div className="py-10">
            {tables.map((table, i) => (
              <SizeTableComponent key={activeGarment + "-" + i} table={table} />
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
