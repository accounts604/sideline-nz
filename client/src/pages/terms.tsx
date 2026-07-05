import Layout from "@/components/layout";
import Seo from "@/components/seo";

const LAST_UPDATED = "25 May 2026";

export default function Terms() {
  return (
    <Layout>
      <Seo title="Terms & Conditions" description="Sideline NZ terms and conditions for custom apparel orders, team stores and supporter campaigns." path="/terms" />
      <section style={{ background: "#fff", paddingTop: "120px", paddingBottom: "40px" }}>
        <div style={{ maxWidth: "780px", margin: "0 auto", padding: "0 20px", textAlign: "center" }}>
          <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "12px" }}>
            Terms &amp; Conditions
          </h1>
          <p style={{ fontSize: "13px", color: "#999" }}>
            Last updated {LAST_UPDATED}
          </p>
        </div>
      </section>

      <section style={{ background: "#fff", borderTop: "1px solid #e5e5e5", paddingBottom: "80px" }}>
        <div style={{ maxWidth: "780px", margin: "0 auto", padding: "40px 20px", color: "#333", lineHeight: 1.7, fontSize: "16px" }}>

          <p style={{ marginBottom: "32px" }}>
            These terms apply to every order placed with Sideline NZ Ltd (&quot;Sideline&quot;, &quot;we&quot;, &quot;us&quot;) — bulk
            team orders, supporter-campaign drops, sample runs, and one-off custom apparel. Placing an order
            means you accept these terms.
          </p>

          <SectionAnchor id="timeframes" title="1. Production timeframes" />
          <p>
            All timeframes published on this site or quoted by our team are <strong>estimates, not guarantees.</strong>
            We work hard to hit them, but custom apparel runs depend on factory queues, freight, fabric availability,
            and design sign-off — any of which can move dates by days or weeks. We will never confirm a delivery on
            a specific calendar date.
          </p>

          <h3 style={subheadingStyle}>Supporter campaigns (preorder drops)</h3>
          <p>
            Production starts <strong>after the drop&apos;s cut-off date</strong> — the date the store closes for new
            orders. Typical production time is <strong>3–5 weeks from the cut-off date</strong>, plus shipping.
            Orders placed before the cut-off ship together once production completes. The cut-off date is published
            on each drop&apos;s store page.
          </p>

          <h3 style={subheadingStyle}>Bulk team orders</h3>
          <p>
            Typical production time is <strong>a few weeks from approved design</strong>, plus shipping. Exact
            timing depends on the garment mix, decoration method, and current factory queue. If you have a hard
            in-hand date (tournament, prizegiving, season opener) tell us up front so we can confirm whether it&apos;s
            achievable before you place the order.
          </p>

          <h3 style={subheadingStyle}>Sample runs</h3>
          <p>
            Samples typically dispatch within 2–3 weeks of design approval. Bulk production only begins after you
            sign off the sample.
          </p>

          <SectionAnchor id="design" title="2. Design approval &amp; sign-off" />
          <p>
            Every order goes through a mockup approval stage. Once you approve a mockup or sample in writing
            (email or portal), production proceeds against that approved version. Changes requested after sign-off
            may incur revision fees or push the timeframe — we&apos;ll quote both before doing the work.
          </p>
          <p>
            You are responsible for checking spelling, sizing, names, numbers, colours, and placement before
            approving. We will produce exactly what was approved.
          </p>

          <SectionAnchor id="deposits" title="3. Payment &amp; pricing" />
          <p>
            Bulk team orders are paid in full upfront before production
            unless other terms are agreed in writing. Supporter-campaign orders are paid in full at checkout via
            our Shopify storefront.
          </p>
          <p>
            Prices are quoted in NZD, GST-inclusive unless stated otherwise. Quotes are valid for 30 days; pricing
            can move with fabric, freight, or FX changes after that.
          </p>

          <SectionAnchor id="returns" title="4. Custom apparel — returns &amp; refunds" />
          <p>
            Because every item is made to order with your specific design, club, names, numbers, and sizes,
            <strong> we don&apos;t accept returns or refunds for change of mind, ordered-wrong-size, or
            misspelled names that were approved at mockup stage.</strong>
          </p>
          <p>We will replace or refund items that are:</p>
          <ul style={listStyle}>
            <li>Faulty (manufacturing defect, not normal wear)</li>
            <li>Materially different from the approved mockup (wrong colour, wrong logo, wrong garment)</li>
            <li>Damaged in transit (please report within 7 days of receipt with photos)</li>
          </ul>
          <p>
            Email <a href="mailto:orders@sidelinenz.com" style={linkStyle}>orders@sidelinenz.com</a> with your
            order number and clear photos to start a claim.
          </p>

          <SectionAnchor id="cancellations" title="5. Cancellations" />
          <p>
            You can cancel a bulk team order any time before we raise the production PO (the point at which the
            design is sent to the factory). Once the PO is raised, the order cannot be cancelled because production
            costs are already committed.
          </p>
          <p>
            Supporter-campaign orders can be cancelled or refunded any time before the drop&apos;s cut-off date.
            After cut-off, the order is locked into the production run and can only be refunded for the reasons
            in section&nbsp;4.
          </p>

          <SectionAnchor id="shipping" title="6. Shipping &amp; delivery" />
          <p>
            We ship via NZ Post, CourierPost, or similar couriers. Once a parcel leaves our facility, transit
            time is in the courier&apos;s hands — we&apos;ll provide a tracking link and stay across any delays, but
            courier-side delays aren&apos;t something we can guarantee against.
          </p>
          <p>
            For supporter campaigns, individual supporter orders are dispatched to each supporter&apos;s nominated
            shipping address once the full run completes.
          </p>

          <SectionAnchor id="ip" title="7. Intellectual property" />
          <p>
            You confirm you own or have permission to use any logos, club crests, sponsor marks, or artwork you
            supply for your order. We don&apos;t check ownership — that&apos;s on you. If we receive a credible IP
            complaint from a rights-holder, we may pause or cancel production while we investigate.
          </p>
          <p>
            Designs we create on your behalf (custom artwork, layouts, mockups) remain Sideline&apos;s property until
            your order is paid in full, at which point use rights for that specific design transfer to you.
          </p>

          <SectionAnchor id="liability" title="8. Liability" />
          <p>
            Our liability for any order is limited to the value of that order. We&apos;re not liable for indirect or
            consequential losses (missed games, missed prizegivings, lost sponsorship value, etc.) — please plan
            order timing with buffer accordingly.
          </p>
          <p>
            Nothing in these terms limits any rights you have under the Consumer Guarantees Act 1993 or Fair
            Trading Act 1986 (NZ), where those Acts apply.
          </p>

          <SectionAnchor id="law" title="9. Governing law" />
          <p>
            These terms are governed by New Zealand law. Any dispute will be resolved in the New Zealand courts.
          </p>

          <SectionAnchor id="contact" title="10. Contact" />
          <p>
            Questions about these terms or about your order: <a href="mailto:orders@sidelinenz.com" style={linkStyle}>orders@sidelinenz.com</a>.
          </p>

          <p style={{ marginTop: "48px", fontSize: "13px", color: "#999", borderTop: "1px solid #e5e5e5", paddingTop: "20px" }}>
            Sideline NZ Ltd · Auckland, New Zealand
          </p>
        </div>
      </section>
    </Layout>
  );
}

function SectionAnchor({ id, title }: { id: string; title: string }) {
  return (
    <h2
      id={id}
      style={{
        fontSize: "20px",
        fontWeight: 700,
        color: "#111",
        textTransform: "uppercase",
        letterSpacing: "1px",
        marginTop: "40px",
        marginBottom: "16px",
        scrollMarginTop: "120px",
      }}
      dangerouslySetInnerHTML={{ __html: title }}
    />
  );
}

const subheadingStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
  color: "#111",
  marginTop: "24px",
  marginBottom: "8px",
};

const listStyle: React.CSSProperties = {
  paddingLeft: "24px",
  marginTop: "8px",
  marginBottom: "16px",
};

const linkStyle: React.CSSProperties = {
  color: "#1554d4",
  textDecoration: "underline",
};
