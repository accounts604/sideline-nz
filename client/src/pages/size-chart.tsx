import { useState } from "react";
import Layout from "@/components/layout";
import { Ruler, ChevronDown } from "lucide-react";

type GarmentType = "tshirt" | "hoodie" | "shorts" | "trackpants" | "singlet";

const GARMENT_LABELS: Record<GarmentType, string> = {
  tshirt: "T-Shirts",
  hoodie: "Hoodies",
  shorts: "Football Shorts",
  trackpants: "Trackpants",
  singlet: "Singlets",
};

/* ------------------------------------------------------------------ */
/*  SVG measurement diagrams — clean, no branding                      */
/* ------------------------------------------------------------------ */

function TShirtDiagram() {
  return (
    <svg viewBox="0 0 340 260" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[320px] mx-auto">
      {/* Front */}
      <text x="80" y="16" fontSize="11" fill="#666" textAnchor="middle" fontWeight="500">Front</text>
      <path d="M40 30 L20 60 L40 70 L40 180 L120 180 L120 70 L140 60 L120 30 L100 40 L80 42 L60 40 Z" stroke="#111" strokeWidth="1.5" fill="#f9f9f9" />
      {/* A — 1/2 Chest */}
      <line x1="42" y1="80" x2="118" y2="80" stroke="#2563eb" strokeWidth="1.2" strokeDasharray="4 2" />
      <text x="80" y="74" fontSize="10" fill="#2563eb" textAnchor="middle" fontWeight="600">A</text>
      {/* B — Centre back length */}
      <line x1="130" y1="32" x2="130" y2="180" stroke="#dc2626" strokeWidth="1.2" strokeDasharray="4 2" />
      <text x="136" y="110" fontSize="10" fill="#dc2626" fontWeight="600">B</text>

      {/* Back */}
      <text x="250" y="16" fontSize="11" fill="#666" textAnchor="middle" fontWeight="500">Back</text>
      <path d="M210 30 L190 60 L210 70 L210 180 L290 180 L290 70 L310 60 L290 30 L270 40 L250 42 L230 40 Z" stroke="#111" strokeWidth="1.5" fill="#f9f9f9" />
      {/* A — 1/2 Chest */}
      <line x1="212" y1="80" x2="288" y2="80" stroke="#2563eb" strokeWidth="1.2" strokeDasharray="4 2" />
      <text x="250" y="74" fontSize="10" fill="#2563eb" textAnchor="middle" fontWeight="600">A</text>
      {/* B — Centre back */}
      <line x1="300" y1="32" x2="300" y2="180" stroke="#dc2626" strokeWidth="1.2" strokeDasharray="4 2" />
      <text x="306" y="110" fontSize="10" fill="#dc2626" fontWeight="600">B</text>

      {/* Legend */}
      <rect x="30" y="200" width="12" height="3" fill="#2563eb" rx="1" />
      <text x="46" y="204" fontSize="9" fill="#444">A — ½ Chest (underarm to underarm)</text>
      <rect x="30" y="216" width="12" height="3" fill="#dc2626" rx="1" />
      <text x="46" y="220" fontSize="9" fill="#444">B — Centre Back Length (shoulder to hem)</text>
    </svg>
  );
}

function HoodieDiagram() {
  return (
    <svg viewBox="0 0 340 280" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[320px] mx-auto">
      {/* Front */}
      <text x="80" y="16" fontSize="11" fill="#666" textAnchor="middle" fontWeight="500">Front</text>
      {/* Hood */}
      <path d="M60 30 Q80 18 100 30" stroke="#111" strokeWidth="1.5" fill="none" />
      {/* Body */}
      <path d="M40 30 L10 70 L40 80 L40 190 L120 190 L120 80 L150 70 L120 30 Z" stroke="#111" strokeWidth="1.5" fill="#f9f9f9" />
      {/* A — Centre back length */}
      <line x1="130" y1="32" x2="130" y2="190" stroke="#dc2626" strokeWidth="1.2" strokeDasharray="4 2" />
      <text x="136" y="115" fontSize="10" fill="#dc2626" fontWeight="600">A</text>
      {/* B — 1/2 Chest */}
      <line x1="42" y1="100" x2="118" y2="100" stroke="#2563eb" strokeWidth="1.2" strokeDasharray="4 2" />
      <text x="80" y="94" fontSize="10" fill="#2563eb" textAnchor="middle" fontWeight="600">B</text>

      {/* Back */}
      <text x="250" y="16" fontSize="11" fill="#666" textAnchor="middle" fontWeight="500">Back</text>
      <path d="M230 30 Q250 18 270 30" stroke="#111" strokeWidth="1.5" fill="none" />
      <path d="M210 30 L180 70 L210 80 L210 190 L290 190 L290 80 L320 70 L290 30 Z" stroke="#111" strokeWidth="1.5" fill="#f9f9f9" />
      {/* C — Sleeve (neck to cuff) */}
      <line x1="250" y1="30" x2="320" y2="70" stroke="#16a34a" strokeWidth="1.2" strokeDasharray="4 2" />
      <text x="290" y="42" fontSize="10" fill="#16a34a" fontWeight="600">C</text>

      {/* Legend */}
      <rect x="30" y="210" width="12" height="3" fill="#dc2626" rx="1" />
      <text x="46" y="214" fontSize="9" fill="#444">A — Centre Back Length</text>
      <rect x="30" y="226" width="12" height="3" fill="#2563eb" rx="1" />
      <text x="46" y="230" fontSize="9" fill="#444">B — ½ Chest (underarm to underarm)</text>
      <rect x="30" y="242" width="12" height="3" fill="#16a34a" rx="1" />
      <text x="46" y="246" fontSize="9" fill="#444">C — Sleeve (neck to cuff)</text>
    </svg>
  );
}

function ShortsDiagram() {
  return (
    <svg viewBox="0 0 340 280" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[320px] mx-auto">
      {/* Front */}
      <text x="80" y="16" fontSize="11" fill="#666" textAnchor="middle" fontWeight="500">Front</text>
      <path d="M40 30 L40 160 L70 160 L80 80 L90 160 L120 160 L120 30 Z" stroke="#111" strokeWidth="1.5" fill="#f9f9f9" />
      {/* A — 1/2 Waist */}
      <line x1="42" y1="32" x2="118" y2="32" stroke="#2563eb" strokeWidth="1.2" strokeDasharray="4 2" />
      <text x="80" y="27" fontSize="10" fill="#2563eb" textAnchor="middle" fontWeight="600">A</text>
      {/* D — Front Rise */}
      <line x1="130" y1="30" x2="130" y2="80" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="4 2" />
      <text x="136" y="58" fontSize="10" fill="#f59e0b" fontWeight="600">D</text>
      {/* F — Inseam */}
      <line x1="80" y1="82" x2="80" y2="158" stroke="#8b5cf6" strokeWidth="1.2" strokeDasharray="4 2" />
      <text x="86" y="125" fontSize="10" fill="#8b5cf6" fontWeight="600">F</text>

      {/* Back */}
      <text x="250" y="16" fontSize="11" fill="#666" textAnchor="middle" fontWeight="500">Back</text>
      <path d="M210 30 L210 160 L240 160 L250 80 L260 160 L290 160 L290 30 Z" stroke="#111" strokeWidth="1.5" fill="#f9f9f9" />
      {/* B — 1/2 Hip */}
      <line x1="206" y1="60" x2="294" y2="60" stroke="#dc2626" strokeWidth="1.2" strokeDasharray="4 2" />
      <text x="250" y="54" fontSize="10" fill="#dc2626" textAnchor="middle" fontWeight="600">B</text>
      {/* C — Leg Opening */}
      <line x1="212" y1="158" x2="238" y2="158" stroke="#16a34a" strokeWidth="1.2" strokeDasharray="4 2" />
      <text x="225" y="172" fontSize="10" fill="#16a34a" textAnchor="middle" fontWeight="600">C</text>
      {/* E — Back Rise */}
      <line x1="300" y1="30" x2="300" y2="80" stroke="#ea580c" strokeWidth="1.2" strokeDasharray="4 2" />
      <text x="306" y="58" fontSize="10" fill="#ea580c" fontWeight="600">E</text>

      {/* Legend */}
      <rect x="20" y="190" width="12" height="3" fill="#2563eb" rx="1" />
      <text x="36" y="194" fontSize="9" fill="#444">A — ½ Waist</text>
      <rect x="20" y="204" width="12" height="3" fill="#dc2626" rx="1" />
      <text x="36" y="208" fontSize="9" fill="#444">B — ½ Hip</text>
      <rect x="20" y="218" width="12" height="3" fill="#16a34a" rx="1" />
      <text x="36" y="222" fontSize="9" fill="#444">C — Leg Opening</text>
      <rect x="170" y="190" width="12" height="3" fill="#f59e0b" rx="1" />
      <text x="186" y="194" fontSize="9" fill="#444">D — Front Rise</text>
      <rect x="170" y="204" width="12" height="3" fill="#ea580c" rx="1" />
      <text x="186" y="208" fontSize="9" fill="#444">E — Back Rise</text>
      <rect x="170" y="218" width="12" height="3" fill="#8b5cf6" rx="1" />
      <text x="186" y="222" fontSize="9" fill="#444">F — Inseam</text>
    </svg>
  );
}

function TrackpantsDiagram() {
  return (
    <svg viewBox="0 0 200 280" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[200px] mx-auto">
      <path d="M50 20 L50 240 L80 240 L100 100 L120 240 L150 240 L150 20 Z" stroke="#111" strokeWidth="1.5" fill="#f9f9f9" />
      {/* A — 1/2 Waist */}
      <line x1="52" y1="22" x2="148" y2="22" stroke="#2563eb" strokeWidth="1.2" strokeDasharray="4 2" />
      <text x="100" y="16" fontSize="10" fill="#2563eb" textAnchor="middle" fontWeight="600">A</text>
      {/* B — Outside leg */}
      <line x1="160" y1="20" x2="160" y2="240" stroke="#dc2626" strokeWidth="1.2" strokeDasharray="4 2" />
      <text x="166" y="130" fontSize="10" fill="#dc2626" fontWeight="600">B</text>
      {/* C — Leg opening */}
      <line x1="52" y1="238" x2="78" y2="238" stroke="#16a34a" strokeWidth="1.2" strokeDasharray="4 2" />
      <text x="65" y="254" fontSize="10" fill="#16a34a" textAnchor="middle" fontWeight="600">C</text>

      {/* Legend */}
      <rect x="10" y="266" width="10" height="3" fill="#2563eb" rx="1" />
      <text x="24" y="270" fontSize="8" fill="#444">A — ½ Waist</text>
      <rect x="80" y="266" width="10" height="3" fill="#dc2626" rx="1" />
      <text x="94" y="270" fontSize="8" fill="#444">B — Outside Leg</text>
      <rect x="152" y="266" width="10" height="3" fill="#16a34a" rx="1" />
      <text x="166" y="270" fontSize="8" fill="#444">C — Leg Opening</text>
    </svg>
  );
}

function SingletDiagram() {
  return (
    <svg viewBox="0 0 340 260" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[320px] mx-auto">
      {/* Front */}
      <text x="80" y="16" fontSize="11" fill="#666" textAnchor="middle" fontWeight="500">Front</text>
      <path d="M50 30 L50 180 L110 180 L110 30 L95 25 L80 35 L65 25 Z" stroke="#111" strokeWidth="1.5" fill="#f9f9f9" />
      {/* A — 1/2 Chest */}
      <line x1="52" y1="60" x2="108" y2="60" stroke="#2563eb" strokeWidth="1.2" strokeDasharray="4 2" />
      <text x="80" y="54" fontSize="10" fill="#2563eb" textAnchor="middle" fontWeight="600">A</text>

      {/* Back */}
      <text x="250" y="16" fontSize="11" fill="#666" textAnchor="middle" fontWeight="500">Back</text>
      <path d="M220 30 L220 180 L280 180 L280 30 L265 28 L250 30 L235 28 Z" stroke="#111" strokeWidth="1.5" fill="#f9f9f9" />
      {/* B — Back Length */}
      <line x1="290" y1="30" x2="290" y2="180" stroke="#dc2626" strokeWidth="1.2" strokeDasharray="4 2" />
      <text x="296" y="110" fontSize="10" fill="#dc2626" fontWeight="600">B</text>

      {/* Legend */}
      <rect x="30" y="200" width="12" height="3" fill="#2563eb" rx="1" />
      <text x="46" y="204" fontSize="9" fill="#444">A — ½ Chest (underarm to underarm)</text>
      <rect x="30" y="216" width="12" height="3" fill="#dc2626" rx="1" />
      <text x="46" y="220" fontSize="9" fill="#444">B — Back Length (shoulder to hem)</text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Size data tables                                                   */
/* ------------------------------------------------------------------ */

interface SizeRow {
  label: string;
  values: (string | number)[];
}
interface SizeTable {
  title: string;
  headers: string[];
  rows: SizeRow[];
  tolerance: string;
}

const SIZE_DATA: Record<GarmentType, SizeTable[]> = {
  tshirt: [
    {
      title: "Youth / Adult Unisex",
      headers: ["", "Y2", "Y4", "Y6", "Y8", "Y10", "Y12", "Y14", "Y16", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
      rows: [
        { label: "A. ½ Chest", values: [32,34,36,38,40,42,44,46,49,51,53,56,58,61,64,67,70] },
        { label: "B. Centre Back", values: [42,46,50,54,57,62,66,70,66,68,70,73,75,77,79,80,81] },
        { label: "B. Centre Back (Tall)", values: [45,49,53,57,60,65,69,73,71,73,75,78,80,82,84,85,86] },
      ],
      tolerance: "± 1.0cm",
    },
    {
      title: "Women",
      headers: ["", "WXXS", "WXS", "WS", "WM", "WL", "WXL", "W2XL", "W3XL", "W4XL"],
      rows: [
        { label: "A. ½ Chest", values: [40,42,45,48,51,53,55,56,59] },
        { label: "B. Centre Back", values: [58,60,62,64,67,69,71,73,74] },
        { label: "B. Centre Back (Tall)", values: [63,65,67,69,72,74,76,78,79] },
      ],
      tolerance: "± 1.0cm",
    },
  ],
  hoodie: [
    {
      title: "Youth / Adult Unisex",
      headers: ["", "Y4", "Y6", "Y8", "Y10", "Y12", "Y14", "Y16", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
      rows: [
        { label: "A. Centre Back Length", values: [46,49,52,55,58,61,64,66,68,70,72,74,76,78,80,82] },
        { label: "B. ½ Chest", values: [38,40,42,44,46,48,50,52,55,58,61,64,67,70,73,76] },
        { label: "C. Sleeve (neck to cuff)", values: [58,61,64,65,68,70,72,74,76,78,80,82,84,86,88,"—"] },
      ],
      tolerance: "± 2.0cm",
    },
    {
      title: "Women",
      headers: ["", "W3XS", "WXXS", "WXS", "WS", "WM", "WL", "WXL", "W2XL", "W3XL", "W4XL", "W5XL"],
      rows: [
        { label: "A. Centre Back Length", values: [56,59,62,65,68,71,74,77,80,83,86] },
        { label: "B. ½ Chest", values: [43,45.5,48,50.5,54.5,58.5,62.5,66.5,70.5,74.5,78.5] },
        { label: "C. Sleeve (neck to cuff)", values: [65,68,71,73,75,77,79,82,85,88,91] },
      ],
      tolerance: "± 2.0cm",
    },
  ],
  shorts: [
    {
      title: "Adult Football Shorts",
      headers: ["", "XS", "S", "M", "L", "XL", "2XL", "3XL"],
      rows: [
        { label: "A. ½ Waist", values: [32.5,36.4,40.3,44.2,48.1,52.0,55.9] },
        { label: "B. ½ Hip", values: [41.2,45.0,48.8,52.6,56.4,60.2,64.0] },
        { label: "C. Leg Opening", values: [49.7,55.7,61.7,67.6,73.6,80.0,85.5] },
        { label: "D. Front Rise", values: [35.5,36.0,36.5,37.0,37.5,38.0,38.5] },
        { label: "E. Back Rise", values: [41.5,42.0,42.5,43.0,43.5,44.0,44.5] },
        { label: "F. Inseam", values: [14.0,14.0,14.0,14.0,14.0,14.0,14.0] },
      ],
      tolerance: "± 1.0cm",
    },
    {
      title: "Youth Football Shorts",
      headers: ["", "YS", "YM", "YL", "YXL"],
      rows: [
        { label: "A. ½ Waist", values: [30.0,32.5,35.1,37.7] },
        { label: "B. ½ Hip", values: [36.0,38.5,41.0,43.5] },
        { label: "C. Leg Opening", values: [45.9,49.8,53.7,57.6] },
        { label: "D. Front Rise", values: [25.9,30.0,34.0,38.0] },
        { label: "E. Back Rise", values: [29.9,34.0,38.0,42.0] },
        { label: "F. Inseam", values: [12.0,12.0,12.0,12.0] },
      ],
      tolerance: "± 1.0cm",
    },
  ],
  trackpants: [
    {
      title: "Youth / Adult Unisex",
      headers: ["", "Y4", "Y6", "Y8", "Y10", "Y12", "Y14", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
      rows: [
        { label: "A. ½ Waist", values: [23,25.5,28,30.5,33,35.5,38,40,43,45,48,50,53,55,58] },
        { label: "B. Outside Leg (incl W/B)", values: [70,75,80,85,90,95,99,100,101,102,103,104,105,106,107] },
        { label: "C. ½ Leg Opening (Regular)", values: [13,14,15,17,18,20,21,22,23,24,25,26,27,28,29] },
        { label: "C. ½ Leg Opening (Tapered)", values: [10,11,12,13,14,15,16,17,18,19,20,21,22,23,24] },
      ],
      tolerance: "± 1.5cm",
    },
    {
      title: "Women",
      headers: ["", "WXXS", "WXS", "WS", "WM", "WL", "WXL", "W2XL", "W3XL", "W4XL", "W5XL"],
      rows: [
        { label: "A. ½ Waist Relaxed", values: [32,34,36,38,40,42,44,46,48,50] },
        { label: "B. Outside Leg (incl W/B)", values: [96,98,100,102,104,106,108,110,112,114] },
        { label: "C. ½ Leg Opening (Regular)", values: [20,21,22,23,24,25,26,27,28,29] },
        { label: "C. ½ Leg Opening (Tapered)", values: [12.5,13,13.5,14,14.5,15,15,15.5,15.5,16] },
      ],
      tolerance: "± 1.5cm",
    },
  ],
  singlet: [
    {
      title: "Youth",
      headers: ["", "Y2", "Y3", "Y4", "Y6", "Y8", "Y10", "Y12", "Y14", "Y16"],
      rows: [
        { label: "A. ½ Chest", values: [33.5,35.5,37.5,39.5,41.5,43.5,45.5,47.5,49.5] },
        { label: "B. Back Length", values: [40.5,44.5,48.5,52.5,56.5,60.5,64.5,68.5,72.5] },
        { label: "B. Back Length (Tall)", values: [43.5,47.5,51.5,55.5,59.5,63.5,67.5,71.5,75.5] },
      ],
      tolerance: "± 1.0cm",
    },
    {
      title: "Adult Unisex",
      headers: ["", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
      rows: [
        { label: "A. ½ Chest", values: [52,54.5,57,59.5,62,64.5,67,69.5,72] },
        { label: "B. Back Length", values: [72.5,74.5,76.5,78.5,80.5,84.5,86,"—","—"] },
        { label: "B. Back Length (Tall)", values: [77.5,79.5,81.5,83.5,85.5,89.5,91,93,95] },
      ],
      tolerance: "± 1.0cm",
    },
  ],
};

const DIAGRAMS: Record<GarmentType, () => JSX.Element> = {
  tshirt: TShirtDiagram,
  hoodie: HoodieDiagram,
  shorts: ShortsDiagram,
  trackpants: TrackpantsDiagram,
  singlet: SingletDiagram,
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
                  <td
                    key={vi}
                    style={{ padding: "9px 8px", textAlign: "center", color: "#444", borderBottom: "1px solid #eee" }}
                  >
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

  const Diagram = DIAGRAMS[activeGarment];
  const tables = SIZE_DATA[activeGarment];

  return (
    <Layout>
      <section style={{ background: "#fff", paddingTop: "120px", paddingBottom: "40px" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "0 20px", textAlign: "center" }}>
          <h1
            style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "12px" }}
          >
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
          <div className="flex overflow-x-auto gap-1 py-4 -mx-5 px-5 md:mx-0 md:px-0 md:justify-center" style={{ borderBottom: "1px solid #e5e5e5" }}>
            {(Object.keys(GARMENT_LABELS) as GarmentType[]).map((key) => (
              <button
                key={key}
                onClick={() => setActiveGarment(key)}
                style={{
                  padding: "10px 20px",
                  fontSize: "13px",
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

          {/* Diagram + How to Measure */}
          <div className="grid md:grid-cols-2 gap-8 py-10" style={{ borderBottom: "1px solid #e5e5e5" }}>
            <div>
              <Diagram />
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
              <SizeTableComponent key={i} table={table} />
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
