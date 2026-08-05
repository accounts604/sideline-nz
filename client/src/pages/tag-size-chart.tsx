import Layout from "@/components/layout";
import { SIZE_CHART_DATA, SIZE_CHART_DIAGRAMS } from "@shared/size-charts";
import { SizeTableComponent } from "@/pages/size-chart";
import Seo from "@/components/seo";

// A single linkable page for the whole tag set, built so a competition organiser can
// send one URL to every team instead of three separate charts. Data comes from
// shared/size-charts.ts — the same source the PO PDF and supplier dispatch render
// from, so what a player reads here is what the factory is told to cut.
const TAG_GARMENTS = [
  {
    key: "tshirt" as const,
    name: "Dri-Fit Tee",
    blurb:
      "Our standard dri-fit tee — the same cut we run for every club. Measure a tee you already own across the chest and match it to the table.",
  },
  {
    key: "singlet" as const,
    name: "Reversible Singlet",
    blurb:
      "Sized off our singlet chart. The reversible is a double-layer garment, so it sits a touch firmer than a single-layer singlet. If you are between sizes, take the larger one.",
  },
  {
    key: "shorts" as const,
    name: "Shorts",
    blurb:
      "Measured at the half waist, laid flat and unstretched. Waistbands are elasticated, so there is give either side of the number shown.",
  },
];

export default function TagSizeChartPage() {
  return (
    <Layout>
      <Seo
        title="Tag Set Size Chart"
        description="Sideline NZ tag rugby size charts — dri-fit tee, reversible singlet and shorts. Full measurements in centimetres for kids and adults."
        path="/size-chart/tag"
      />

      <section style={{ background: "#fff", paddingTop: "120px", paddingBottom: "40px" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "0 20px", textAlign: "center" }}>
          <p style={{ fontSize: "12px", fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "10px" }}>
            Sideline NZ
          </p>
          <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "12px" }}>
            Tag Set Size Chart
          </h1>
          <p style={{ fontSize: "15px", color: "#666", maxWidth: "600px", margin: "0 auto 8px" }}>
            Everything in the tag set on one page — dri-fit tee, reversible singlet and shorts.
            All measurements are the garment laid flat, in centimetres.
          </p>
          <p style={{ fontSize: "13px", color: "#999" }}>
            Sizes run Y2 through to 7XL. Tall sizing adds 3–5cm to the body length on request.
          </p>
        </div>
      </section>

      {/* How to measure — stated once, applies to all three */}
      <section style={{ background: "#fafafa", borderTop: "1px solid #e5e5e5", borderBottom: "1px solid #e5e5e5" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "36px 20px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#111", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "1px" }}>
            How to Measure
          </h2>
          <ol style={{ fontSize: "14px", color: "#444", lineHeight: 1.8, paddingLeft: "20px", maxWidth: "700px" }}>
            <li>Take a garment you already own that fits the way you want the new one to fit.</li>
            <li>Lay it flat on a table. Do not stretch it.</li>
            <li>Measure the half chest from side to side, 1cm below the armhole.</li>
            <li>Measure the length down the centre back, from the neck seam to the hem.</li>
            <li>For shorts, measure the half waist flat across the top of the waistband.</li>
            <li>Find the closest number in the tables below. If you are between two sizes, take the larger one.</li>
          </ol>
          <div style={{ marginTop: "24px", padding: "16px", background: "#fffbeb", borderRadius: "8px", border: "1px solid #fde68a", maxWidth: "700px" }}>
            <p style={{ fontSize: "13px", color: "#92400e", fontWeight: 600, marginBottom: "4px" }}>Please check twice</p>
            <p style={{ fontSize: "13px", color: "#92400e", lineHeight: 1.6 }}>
              Every garment is made to order against the numbers on this page. We cannot swap or
              refund a size that was entered incorrectly, so confirm each player's size before the
              order goes in.
            </p>
          </div>
        </div>
      </section>

      {/* One block per garment */}
      {TAG_GARMENTS.map((g, gi) => {
        const tables = SIZE_CHART_DATA[g.key] ?? [];
        const diagram = SIZE_CHART_DIAGRAMS[g.key];
        return (
          <section
            key={g.key}
            style={{ background: "#fff", borderBottom: gi < TAG_GARMENTS.length - 1 ? "1px solid #e5e5e5" : "none" }}
          >
            <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "48px 20px" }}>
              <h2 style={{ fontSize: "22px", fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px" }}>
                {g.name}
              </h2>
              <p style={{ fontSize: "14px", color: "#666", lineHeight: 1.7, maxWidth: "640px", marginBottom: "28px" }}>
                {g.blurb}
              </p>

              <div className="grid md:grid-cols-[280px_1fr] gap-8 items-start">
                {diagram && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#fafafa", borderRadius: "8px", padding: "20px" }}>
                    <img
                      src={diagram}
                      alt={g.name + " measurement diagram"}
                      style={{ width: "100%", height: "auto", maxHeight: "320px", objectFit: "contain", display: "block" }}
                    />
                  </div>
                )}
                <div>
                  {tables.map((table, i) => (
                    <SizeTableComponent key={g.key + "-" + i} table={table} />
                  ))}
                </div>
              </div>
            </div>
          </section>
        );
      })}

      <section style={{ background: "#111" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "40px 20px", textAlign: "center" }}>
          <p style={{ fontSize: "14px", color: "#ddd", lineHeight: 1.7, maxWidth: "620px", margin: "0 auto" }}>
            Need a size that is not on the chart, or a tall cut? We make to order, so tell us the
            measurement you need and we will cut to it.
          </p>
          <a
            href="/contact"
            style={{ display: "inline-block", marginTop: "20px", padding: "12px 28px", background: "#fff", color: "#111", fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", borderRadius: "6px", textDecoration: "none" }}
          >
            Ask us
          </a>
        </div>
      </section>
    </Layout>
  );
}
