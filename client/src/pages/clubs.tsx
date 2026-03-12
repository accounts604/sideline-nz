import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { MessageSquare, ShoppingBag, Truck } from "lucide-react";
import heroImage from "@assets/500099664_1162305082363258_1517772351045028970_n_1767527012780.jpg";

export default function Clubs() {
  return (
    <Layout>
      {/* Hero */}
      <section style={{ position: "relative", height: "clamp(400px, 55vh, 620px)", display: "flex", alignItems: "flex-end", overflow: "hidden", background: "#000" }}>
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          <img
            src={heroImage}
            alt="Rugby team huddle"
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.5 }}
          />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #000 0%, rgba(0,0,0,0.5) 40%, transparent 70%)" }} />
        </div>
        <div style={{ position: "relative", zIndex: 10, padding: "0 52px 48px" }} className="clubs-hero-text">
          <h1 style={{ fontFamily: "'Bebas Neue', 'Oswald', sans-serif", fontSize: "clamp(52px, 7vw, 96px)", color: "#f0f0f0", lineHeight: 1, margin: 0, textTransform: "uppercase" }}>
            FOR CLUBS
          </h1>
          <p style={{ fontSize: "18px", color: "rgba(255,255,255,0.55)", marginTop: "16px", maxWidth: "520px", fontWeight: 300 }}>
            Your club deserves gear that represents who you are.
          </p>
        </div>
      </section>

      {/* Stat Band */}
      <section style={{ padding: "80px 52px", background: "#000", borderTop: "1px solid rgba(255,255,255,0.08)" }} className="clubs-stat-section">
        <div style={{ maxWidth: "1200px", margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontFamily: "'Bebas Neue', 'Oswald', sans-serif", fontSize: "clamp(64px, 8vw, 96px)", color: "#fff", lineHeight: 1, margin: 0 }}>
            Est. 2021
          </p>
          <p style={{ fontSize: "14px", letterSpacing: "2.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginTop: "12px" }}>
            Club Growth Partner
          </p>
        </div>
      </section>

      {/* Section 1 — More than a uniform supplier */}
      <section style={{ padding: "80px 52px", background: "#000" }} className="clubs-content-section">
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "64px", alignItems: "center" }} className="clubs-split-grid">
            <div>
              <h2 className="font-heading" style={{ fontSize: "clamp(28px, 3.5vw, 44px)", color: "#f0f0f0", lineHeight: 1.1, marginBottom: "24px", textTransform: "uppercase", fontWeight: "normal", letterSpacing: "0.05em" }}>
                More than a uniform supplier.
              </h2>
              <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "16px", lineHeight: 1.7, fontWeight: 300 }}>
                Most apparel companies send you a price list and wait for an order. We sit down with your club, understand your identity, and build a kit system that works for your budget, your sponsors, and your people. We've been doing this since 2021 and we understand how grassroots clubs actually operate.
              </p>
            </div>
            <div style={{ background: "#111", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", padding: "48px", display: "flex", flexDirection: "column", gap: "32px" }}>
              <div style={{ display: "flex", gap: "16px" }}>
                <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "6px", padding: "12px", height: "fit-content" }}>
                  <MessageSquare size={24} color="#f0f0f0" />
                </div>
                <div>
                  <h3 className="font-heading" style={{ fontSize: "20px", color: "#f0f0f0", marginBottom: "8px", textTransform: "uppercase", fontWeight: "normal", letterSpacing: "0.05em" }}>Fast Communication</h3>
                  <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "14px", lineHeight: 1.6, fontWeight: 300 }}>No more chasing suppliers. We reply quickly and keep you updated every step of the way.</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: "16px" }}>
                <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "6px", padding: "12px", height: "fit-content" }}>
                  <ShoppingBag size={24} color="#f0f0f0" />
                </div>
                <div>
                  <h3 className="font-heading" style={{ fontSize: "20px", color: "#f0f0f0", marginBottom: "8px", textTransform: "uppercase", fontWeight: "normal", letterSpacing: "0.05em" }}>Simple Ordering</h3>
                  <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "14px", lineHeight: 1.6, fontWeight: 300 }}>Easy-to-use order forms and team store options. We handle the sizes and money collection so you don't have to.</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: "16px" }}>
                <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "6px", padding: "12px", height: "fit-content" }}>
                  <Truck size={24} color="#f0f0f0" />
                </div>
                <div>
                  <h3 className="font-heading" style={{ fontSize: "20px", color: "#f0f0f0", marginBottom: "8px", textTransform: "uppercase", fontWeight: "normal", letterSpacing: "0.05em" }}>Reliable Delivery</h3>
                  <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "14px", lineHeight: 1.6, fontWeight: 300 }}>We hit our deadlines. If we say it'll be there for the first game, it will be.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2 — Your jersey can fund itself */}
      <section style={{ padding: "80px 52px", background: "#000", borderTop: "1px solid rgba(255,255,255,0.08)" }} className="clubs-content-section">
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "64px", alignItems: "center" }} className="clubs-split-grid">
            <div style={{ background: "#111", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", aspectRatio: "4/3", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              <img
                src={heroImage}
                alt="Club jerseys with sponsor logos"
                style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.7 }}
              />
            </div>
            <div>
              <h2 className="font-heading" style={{ fontSize: "clamp(28px, 3.5vw, 44px)", color: "#f0f0f0", lineHeight: 1.1, marginBottom: "24px", textTransform: "uppercase", fontWeight: "normal", letterSpacing: "0.05em" }}>
                Your jersey can fund itself.
              </h2>
              <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "16px", lineHeight: 1.7, fontWeight: 300 }}>
                We help clubs structure sponsor placement on their kit so the apparel pays for itself. Front chest, sleeves, back, training gear — every panel is a sponsorship asset. We'll show you how to approach local businesses and what to charge them.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3 — Your own online store */}
      <section style={{ padding: "80px 52px", background: "#000", borderTop: "1px solid rgba(255,255,255,0.08)" }} className="clubs-content-section">
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "64px", alignItems: "center" }} className="clubs-split-grid">
            <div>
              <h2 className="font-heading" style={{ fontSize: "clamp(28px, 3.5vw, 44px)", color: "#f0f0f0", lineHeight: 1.1, marginBottom: "24px", textTransform: "uppercase", fontWeight: "normal", letterSpacing: "0.05em" }}>
                Your own online store.
              </h2>
              <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "16px", lineHeight: 1.7, fontWeight: 300 }}>
                Every club we work with gets their own branded online store. Members order direct, choose their size, add their name and number. No cash handling, no bulk guessing, no leftover stock.
              </p>
            </div>
            <div style={{ background: "#111", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", aspectRatio: "4/3", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.25)" }}>
                <p style={{ fontFamily: "'Bebas Neue', 'Oswald', sans-serif", fontSize: "24px", marginBottom: "8px" }}>Team Store Preview</p>
                <p style={{ fontSize: "14px" }}>Online ordering made simple</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ position: "relative", padding: "0", background: "#000", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ position: "relative", minHeight: "400px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0 }}>
            <img
              src={heroImage}
              alt="Club team on field"
              style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.3 }}
            />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #000 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.8) 100%)" }} />
          </div>
          <div style={{ position: "relative", zIndex: 10, textAlign: "center", padding: "80px 52px" }} className="clubs-cta-inner">
            <h2 style={{ fontFamily: "'Bebas Neue', 'Oswald', sans-serif", fontSize: "clamp(32px, 5vw, 56px)", color: "#f0f0f0", lineHeight: 1.1, marginBottom: "16px", textTransform: "uppercase" }}>
              READY TO GEAR UP YOUR CLUB?
            </h2>
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "16px", marginBottom: "32px", fontWeight: 300 }}>
              Get a free mockup within 48 hours. No commitment required.
            </p>
            <Link href="/quote">
              <Button
                size="lg"
                data-testid="button-club-quote"
                style={{ background: "#fff", color: "#000", borderRadius: "4px", fontFamily: "'Bebas Neue', 'Oswald', sans-serif", fontSize: "16px", letterSpacing: "1px", textTransform: "uppercase", padding: "14px 40px" }}
              >
                Start Your Quote
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <style>{`
        @media (max-width: 768px) {
          .clubs-hero-text {
            padding: 0 20px 32px !important;
          }
          .clubs-stat-section {
            padding: 44px 20px !important;
          }
          .clubs-content-section {
            padding: 44px 20px !important;
          }
          .clubs-split-grid {
            grid-template-columns: 1fr !important;
            gap: 32px !important;
          }
          .clubs-cta-inner {
            padding: 44px 20px !important;
          }
        }
      `}</style>
    </Layout>
  );
}
