import { useState } from "react";
import { Link } from "wouter";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { ArrowRight, DollarSign, Target, Map, Paintbrush } from "lucide-react";
import {
  type SportId,
  type SponsorZone,
  SPORT_CONFIGS,
  PRICING_TIERS,
  getSportConfig,
  getTierInfo,
} from "@/data/sponsor-zones";
import { RugbyJersey } from "@/components/jersey-svg/rugby-jersey";
import { BasketballJersey } from "@/components/jersey-svg/basketball-jersey";
import { NetballJersey } from "@/components/jersey-svg/netball-jersey";
import { FootballJersey } from "@/components/jersey-svg/football-jersey";
import { LeagueJersey } from "@/components/jersey-svg/league-jersey";

/* ───── Sport toggle pill ───── */
function SportPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 22px",
        fontSize: "12px",
        fontWeight: 600,
        letterSpacing: "1.5px",
        textTransform: "uppercase" as const,
        border: active ? "1px solid #fff" : "1px solid rgba(255,255,255,0.15)",
        borderRadius: "100px",
        background: active ? "#fff" : "transparent",
        color: active ? "#000" : "rgba(255,255,255,0.5)",
        cursor: "pointer",
        transition: "all 0.2s",
        whiteSpace: "nowrap" as const,
      }}
      className={!active ? "hover:border-white/40 hover:text-white/80" : ""}
    >
      {label}
    </button>
  );
}

/* ───── Visibility dots ───── */
function VisibilityDots({ rating }: { rating: number }) {
  return (
    <span style={{ display: "inline-flex", gap: "4px" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: i <= rating ? "#fff" : "rgba(255,255,255,0.15)",
          }}
        />
      ))}
    </span>
  );
}

/* ───── Zone detail card ───── */
function ZoneDetailCard({ zone }: { zone: SponsorZone | null }) {
  if (!zone) {
    return (
      <div
        style={{
          background: "#111",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "6px",
          padding: "40px 32px",
          textAlign: "center",
          minHeight: "280px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Map size={32} style={{ color: "rgba(255,255,255,0.15)", marginBottom: "16px" }} />
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px", lineHeight: 1.6 }}>
          Hover or tap a zone on the jersey to see sponsor placement details.
        </p>
      </div>
    );
  }

  const tier = getTierInfo(zone.tier);

  return (
    <div
      style={{
        background: "#111",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "6px",
        padding: "32px",
        minHeight: "280px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <h3
          style={{
            fontSize: "18px",
            fontWeight: 700,
            color: "#f0f0f0",
            textTransform: "uppercase",
            letterSpacing: "1px",
            margin: 0,
          }}
          className="font-heading"
        >
          {zone.name}
        </h3>
        <span
          style={{
            padding: "3px 10px",
            borderRadius: "100px",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "1px",
            textTransform: "uppercase",
            background: tier.color + "22",
            color: tier.color,
            border: `1px solid ${tier.color}44`,
          }}
        >
          {tier.label}
        </span>
      </div>

      <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "14px", lineHeight: 1.7, marginBottom: "24px" }}>
        {zone.description}
      </p>

      <div style={{ display: "grid", gap: "16px" }}>
        <div>
          <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(255,255,255,0.3)" }}>
            Typical Size
          </span>
          <p style={{ fontSize: "14px", color: "#fff", fontWeight: 500, marginTop: "4px" }}>{zone.typicalSize}</p>
        </div>
        <div>
          <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(255,255,255,0.3)" }}>
            Visibility
          </span>
          <div style={{ marginTop: "6px" }}>
            <VisibilityDots rating={zone.visibilityRating} />
          </div>
        </div>
        <div>
          <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(255,255,255,0.3)" }}>
            Suggested Price Range
          </span>
          <p style={{ fontSize: "16px", color: tier.color, fontWeight: 700, marginTop: "4px" }}>{zone.suggestedPriceRange}</p>
        </div>
        {zone.notes && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" }}>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", fontStyle: "italic", lineHeight: 1.5 }}>{zone.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───── Jersey renderer per sport ───── */
function JerseyRenderer({
  sportId,
  activeZone,
  onZoneHover,
  onZoneClick,
  zones,
}: {
  sportId: SportId;
  activeZone: string | null;
  onZoneHover: (id: string | null) => void;
  onZoneClick: (id: string) => void;
  zones: SponsorZone[];
}) {
  const props = { activeZone, onZoneHover, onZoneClick, zones };
  switch (sportId) {
    case "rugby":
      return <RugbyJersey {...props} />;
    case "basketball":
      return <BasketballJersey {...props} />;
    case "netball":
      return <NetballJersey {...props} />;
    case "football":
      return <FootballJersey {...props} />;
    case "league":
      return <LeagueJersey {...props} />;
  }
}

/* ───── Page ───── */
export default function SponsorPlacementPage() {
  const [activeSport, setActiveSport] = useState<SportId>("rugby");
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  const sportConfig = getSportConfig(activeSport);
  const activeZoneId = selectedZone || hoveredZone;
  const activeZoneData = activeZoneId ? sportConfig.zones.find((z) => z.id === activeZoneId) || null : null;

  function handleSportChange(id: SportId) {
    setActiveSport(id);
    setSelectedZone(null);
    setHoveredZone(null);
  }

  function handleZoneClick(id: string) {
    setSelectedZone(selectedZone === id ? null : id);
  }

  const TIPS = [
    {
      icon: DollarSign,
      title: "Approach local businesses early",
      body: "Start conversations before the season. Businesses plan marketing budgets quarterly — give them time to say yes.",
    },
    {
      icon: Target,
      title: "Offer tiered packages",
      body: "Not every sponsor needs the chest panel. Create packages at different price points so more businesses can get involved.",
    },
    {
      icon: Map,
      title: "Show them the zone map",
      body: "Use our visual guide to show sponsors exactly where their logo will sit and how much visibility each zone gets.",
    },
    {
      icon: Paintbrush,
      title: "Let us handle placement",
      body: "Send us the logos and we'll design everything to look clean and professional. No awkward logo stretching.",
    },
  ];

  return (
    <Layout>
      {/* ─── Section 1: Hero ─── */}
      <section className="sponsor-hero" style={{
        background: "#000",
        minHeight: "clamp(280px, 35vh, 420px)",
        display: "flex",
        alignItems: "flex-end",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <div className="sponsor-hero-text" style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 52px 48px", width: "100%" }}>
          <p style={{ fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: "16px" }}>
            Sponsor Integration
          </p>
          <h1 className="font-display" style={{
            fontSize: "clamp(48px, 7vw, 88px)",
            lineHeight: 0.95,
            color: "#f0f0f0",
            textTransform: "uppercase",
            marginBottom: "16px",
          }}>
            Sponsor Placement Guide
          </h1>
          <p style={{ fontSize: "17px", color: "rgba(255,255,255,0.5)", maxWidth: "560px", lineHeight: 1.6 }}>
            Turn every panel of your kit into a revenue stream for your club or school. Explore sponsor zones, pricing tiers, and placement opportunities across every sport.
          </p>
        </div>
      </section>

      {/* ─── Section 2: Interactive Visualizer ─── */}
      <section style={{ background: "#000", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="sponsor-content-section" style={{ maxWidth: "1200px", margin: "0 auto", padding: "52px 52px 64px" }}>
          {/* Sport toggle */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "40px" }}>
            {SPORT_CONFIGS.map((sport) => (
              <SportPill
                key={sport.id}
                label={sport.label}
                active={activeSport === sport.id}
                onClick={() => handleSportChange(sport.id)}
              />
            ))}
          </div>

          {/* Two-column: jersey + detail */}
          <div className="sponsor-split-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px", alignItems: "start" }}>
            <div style={{ maxWidth: "420px", margin: "0 auto", width: "100%" }}>
              <JerseyRenderer
                sportId={activeSport}
                activeZone={activeZoneId}
                onZoneHover={setHoveredZone}
                onZoneClick={handleZoneClick}
                zones={sportConfig.zones}
              />
              <p style={{
                textAlign: "center",
                fontSize: "12px",
                color: "rgba(255,255,255,0.25)",
                marginTop: "16px",
                letterSpacing: "0.5px",
              }}>
                {sportConfig.garmentLabel} — {sportConfig.zones.length} sponsor zones
              </p>
            </div>

            <div style={{ position: "sticky", top: "100px" }}>
              <ZoneDetailCard zone={activeZoneData} />

              {/* Zone list below card */}
              <div style={{ marginTop: "24px" }}>
                <p style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(255,255,255,0.3)", marginBottom: "12px" }}>
                  All Zones
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {sportConfig.zones.map((zone) => {
                    const tier = getTierInfo(zone.tier);
                    const isActive = activeZoneId === zone.id;
                    return (
                      <button
                        key={zone.id}
                        onClick={() => handleZoneClick(zone.id)}
                        onMouseEnter={() => setHoveredZone(zone.id)}
                        onMouseLeave={() => setHoveredZone(null)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                          border: "1px solid",
                          borderColor: isActive ? "rgba(255,255,255,0.12)" : "transparent",
                          borderRadius: "4px",
                          cursor: "pointer",
                          transition: "all 0.15s",
                          textAlign: "left",
                          width: "100%",
                        }}
                        className={!isActive ? "hover:bg-white/[0.03]" : ""}
                      >
                        <span style={{ fontSize: "13px", color: isActive ? "#fff" : "rgba(255,255,255,0.5)", fontWeight: isActive ? 600 : 400 }}>
                          {zone.name}
                        </span>
                        <span style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: tier.color,
                          opacity: isActive ? 1 : 0.4,
                          flexShrink: 0,
                        }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section 3: Pricing Tiers ─── */}
      <section style={{ background: "#000", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="sponsor-content-section" style={{ maxWidth: "1200px", margin: "0 auto", padding: "64px 52px" }}>
          <p style={{ fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: "12px", textAlign: "center" }}>
            Pricing Guide
          </p>
          <h2 className="font-heading" style={{
            fontSize: "clamp(24px, 3.5vw, 36px)",
            color: "#f0f0f0",
            textTransform: "uppercase",
            textAlign: "center",
            letterSpacing: "1px",
            marginBottom: "8px",
          }}>
            Sponsor Tier Pricing
          </h2>
          <p style={{
            fontSize: "14px",
            color: "rgba(255,255,255,0.4)",
            textAlign: "center",
            maxWidth: "500px",
            margin: "0 auto 48px",
            lineHeight: 1.6,
          }}>
            Suggested pricing for New Zealand clubs and schools. Actual value depends on audience size, match exposure, and social media reach.
          </p>

          <div className="sponsor-tier-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }}>
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.tier}
                style={{
                  background: "#111",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "6px",
                  padding: "32px 28px",
                  borderTop: `3px solid ${tier.color}`,
                }}
              >
                <span style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  color: tier.color,
                }}>
                  {tier.label}
                </span>
                <p style={{ fontSize: "24px", fontWeight: 700, color: "#fff", margin: "12px 0 8px" }} className="font-heading">
                  {tier.priceGuidance}
                </p>
                <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
                  {tier.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Section 4: Sponsor Tips ─── */}
      <section style={{ background: "#000", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="sponsor-content-section" style={{ maxWidth: "1200px", margin: "0 auto", padding: "64px 52px" }}>
          <p style={{ fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: "12px", textAlign: "center" }}>
            Playbook
          </p>
          <h2 className="font-heading" style={{
            fontSize: "clamp(24px, 3.5vw, 36px)",
            color: "#f0f0f0",
            textTransform: "uppercase",
            textAlign: "center",
            letterSpacing: "1px",
            marginBottom: "48px",
          }}>
            How to Sell Sponsorships
          </h2>

          <div className="sponsor-tips-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "24px" }}>
            {TIPS.map((tip, i) => {
              const Icon = tip.icon;
              return (
                <div
                  key={i}
                  style={{
                    background: "#111",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "6px",
                    padding: "28px",
                    display: "flex",
                    gap: "16px",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.05)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Icon size={18} style={{ color: "rgba(255,255,255,0.5)" }} />
                  </div>
                  <div>
                    <h4 style={{ fontSize: "14px", fontWeight: 600, color: "#f0f0f0", marginBottom: "6px" }}>{tip.title}</h4>
                    <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>{tip.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Section 5: CTA ─── */}
      <section style={{ background: "#000" }}>
        <div className="sponsor-cta-inner" style={{ maxWidth: "700px", margin: "0 auto", padding: "80px 52px", textAlign: "center" }}>
          <p style={{ fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: "16px" }}>
            Get Started
          </p>
          <h2 className="font-heading" style={{
            fontSize: "clamp(24px, 4vw, 40px)",
            color: "#f0f0f0",
            textTransform: "uppercase",
            letterSpacing: "1px",
            marginBottom: "12px",
          }}>
            Ready to monetize your kit?
          </h2>
          <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.45)", lineHeight: 1.7, marginBottom: "32px" }}>
            Get a free mockup with sponsor zones mapped. We'll show you exactly how your kit can generate revenue for your club or school.
          </p>
          <Link href="/quote">
            <Button
              size="lg"
              data-testid="button-sponsor-cta"
              style={{
                background: "#fff",
                color: "#000",
                borderRadius: "4px",
                fontSize: "13px",
                fontWeight: 700,
                letterSpacing: "1px",
                textTransform: "uppercase",
                padding: "16px 36px",
                height: "auto",
              }}
              className="hover:bg-white/90"
            >
              Start Your Quote
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ─── Responsive overrides ─── */}
      <style>{`
        @media (max-width: 768px) {
          .sponsor-hero-text {
            padding: 0 20px 32px !important;
          }
          .sponsor-content-section {
            padding-left: 20px !important;
            padding-right: 20px !important;
          }
          .sponsor-split-grid {
            grid-template-columns: 1fr !important;
            gap: 32px !important;
          }
          .sponsor-tier-grid {
            grid-template-columns: 1fr !important;
          }
          .sponsor-tips-grid {
            grid-template-columns: 1fr !important;
          }
          .sponsor-cta-inner {
            padding: 56px 20px !important;
          }
        }
      `}</style>
    </Layout>
  );
}
