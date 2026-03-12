import { useState, useRef } from "react";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { HeroCarousel } from "@/components/hero-carousel";
import { HubSection } from "@/components/hub-section";
import { CustomerLogos } from "@/components/customer-logos";
import { TeamStoreExplainerModal } from "@/components/team-store-explainer-modal";
import { CASE_STUDIES } from "@/data/case-studies";
import { useCollections, useFeaturedProducts } from "@/hooks/use-shopify";
import { formatPrice } from "@/lib/shopify";

import clubsImg from "@assets/Marist_Samoa_NZ_RFC_November_2025_1767430285399.png";
import schoolsImg from "@assets/Manurewa_Womens_Rugby_June_2025_1767430285397.png";
import lockerRoomStore from "@assets/generated_images/virtual_locker_room_store.png";


export default function Home() {
  const [isTeamStoreModalOpen, setIsTeamStoreModalOpen] = useState(false);
  const [, navigate] = useLocation();
  const storesScrollRef = useRef<HTMLDivElement>(null);
  const productsScrollRef = useRef<HTMLDivElement>(null);
  const { data: shopifyCollections } = useCollections();
  const { data: shopifyProducts } = useFeaturedProducts();
  const collections = (shopifyCollections || []).slice(0, 6);
  const featuredProducts = shopifyProducts || [];

  const handleTeamStoreInclude = () => {
    navigate("/quote?teamStore=yes");
  };

  const scroll = (ref: React.RefObject<HTMLDivElement | null>, direction: "left" | "right") => {
    if (!ref.current) return;
    ref.current.scrollBy({ left: direction === "left" ? -280 : 280, behavior: "smooth" });
  };

  return (
    <Layout>
      <TeamStoreExplainerModal
        isOpen={isTeamStoreModalOpen}
        onClose={() => setIsTeamStoreModalOpen(false)}
        onInclude={handleTeamStoreInclude}
        context="homepage"
      />

      {/* ── HERO ── */}
      <HeroCarousel />

      {/* ── TICKER STRIP ── */}
      <div style={{ overflow: "hidden", borderTop: "1px solid rgba(255,255,255,0.07)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "16px 0", background: "#111" }}>
        <div style={{
          display: "flex", gap: "56px", width: "max-content",
          animation: "ticker 26s linear infinite", whiteSpace: "nowrap",
        }}>
          {[
            "Serving Clubs Since 2021", "Worldwide Service", "Free Quote Within 48 Hours",
            "Fully Sublimated Printing", "Sponsor Integration Built-In", "School & Club Ready",
            "Fast Turnaround Guaranteed", "Your Kit. Your Identity.",
            "Serving Clubs Since 2021", "Worldwide Service", "Free Quote Within 48 Hours",
            "Fully Sublimated Printing", "Sponsor Integration Built-In", "School & Club Ready",
            "Fast Turnaround Guaranteed", "Your Kit. Your Identity.",
          ].map((item, i) => (
            <span key={i} style={{ fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", fontWeight: 500 }}>
              {item}
            </span>
          ))}
        </div>
        <style>{`@keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
      </div>

      {/* ── TEAM STORES CAROUSEL ── */}
      <section id="team-stores" style={{ paddingTop: "72px", paddingBottom: "16px", background: "#000" }}>
        {/* Row header */}
        <div className="home-row-header" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 52px", marginBottom: "18px" }}>
          <div>
            <p style={{ fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: "8px" }}>Browse</p>
            <h2 style={{ fontSize: "17px", fontWeight: 600, color: "#f0f0f0" }}>Team Stores</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <Link href="/team-stores">
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", cursor: "pointer", letterSpacing: "0.5px" }}
                className="hover:text-white transition-colors">See all</span>
            </Link>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => scroll(storesScrollRef, "left")}
                data-testid="button-stores-prev"
                style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}
                className="hover:bg-white/10 hover:text-white"
              ><ChevronLeft size={13} /></button>
              <button
                onClick={() => scroll(storesScrollRef, "right")}
                data-testid="button-stores-next"
                style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}
                className="hover:bg-white/10 hover:text-white"
              ><ChevronRight size={13} /></button>
            </div>
          </div>
        </div>

        {/* Track with fade edges */}
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "72px", zIndex: 2, background: "linear-gradient(to right, #000, transparent)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "72px", zIndex: 2, background: "linear-gradient(to left, #000, transparent)", pointerEvents: "none" }} />
          <div
            ref={storesScrollRef}
            style={{ display: "flex", gap: "10px", overflowX: "auto", padding: "4px 52px 24px", scrollSnapType: "x mandatory" }}
            className="hide-scrollbar home-scroll-track"
          >
            {collections.map((col, i) => (
              <Link key={col.handle} href={"/team-stores/" + col.handle}>
                <div
                  data-testid={"card-store-" + i}
                  style={{
                    minWidth: "280px", width: "280px", height: "420px", borderRadius: "6px", overflow: "hidden",
                    cursor: "pointer", scrollSnapAlign: "start", position: "relative", flexShrink: 0,
                    transition: "transform .35s",
                  }}
                  className="group hover:scale-105 hover:z-20"
                >
                  {col.image ? (
                    <img
                      src={col.image.url}
                      alt={col.image.altText || col.title}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", filter: "brightness(0.85)", transition: "filter .35s, transform .35s" }}
                      className="group-hover:brightness-100 group-hover:scale-105"
                    />
                  ) : (
                    <div style={{ position: "absolute", inset: 0, background: "#222" }} />
                  )}
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 35%, transparent 65%)" }} />
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "18px 16px" }}>
                    <p style={{ fontSize: "14px", fontWeight: 600, color: "#f0f0f0" }}>{col.title}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── CLUBS FEATURE ── */}
      <section style={{ position: "relative", minHeight: "520px", overflow: "hidden", background: "#000" }} data-testid="photo-clubs">
        <img src={clubsImg} alt="Rugby club" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.45 }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #000 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.3) 100%)" }} />
        <div className="home-overlay-content" style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", justifyContent: "flex-end", minHeight: "520px", padding: "60px 52px" }}>
          <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(64px, 10vw, 96px)", color: "#fff", lineHeight: 1, marginBottom: "4px" }}>Est. 2021</p>
          <p style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: "28px" }}>Club Growth Partner</p>
          <h2 style={{ fontSize: "22px", fontWeight: 600, color: "#f0f0f0", marginBottom: "14px" }}>Built for clubs that are time-poor.</h2>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", fontWeight: 300, lineHeight: 1.8, marginBottom: "32px", maxWidth: "480px" }}>
            Fast replies, simple ordering, and gear that arrives on time. We handle the heavy lifting so your committee doesn't have to. From first mockup to final delivery — we've got it covered.
          </p>
          <Link href="/clubs">
            <Button
              data-testid="button-club-solutions"
              style={{ background: "#fff", color: "#000", border: "none", padding: "14px 36px", borderRadius: "4px", fontSize: "12px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", width: "fit-content", height: "auto" }}
              className="hover:opacity-90 transition-opacity"
            >
              View Club Solutions
            </Button>
          </Link>
        </div>
      </section>

      {/* ── SCHOOLS FEATURE ── */}
      <section style={{ position: "relative", minHeight: "520px", overflow: "hidden", background: "#000" }}>
        <img src={schoolsImg} alt="Schools sport" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.45 }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #000 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.3) 100%)" }} />
        <div className="home-overlay-content" style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", justifyContent: "flex-end", minHeight: "520px", padding: "60px 52px" }}>
          <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(64px, 10vw, 96px)", color: "#fff", lineHeight: 1, marginBottom: "4px" }}>100%</p>
          <p style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: "28px" }}>School Safe Process</p>
          <h2 style={{ fontSize: "22px", fontWeight: 600, color: "#f0f0f0", marginBottom: "14px" }}>SLT-safe. Stress-free. On time.</h2>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", fontWeight: 300, lineHeight: 1.8, marginBottom: "32px", maxWidth: "480px" }}>
            Designed around how schools actually work. Clear quoting process, organised delivery, and designs that go through the right approvals. Less admin for you. Better gear for your students.
          </p>
          <Link href="/schools">
            <Button
              variant="outline"
              style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", padding: "14px 36px", borderRadius: "4px", fontSize: "12px", fontWeight: 500, letterSpacing: "0.5px", cursor: "pointer", width: "fit-content", height: "auto" }}
              className="hover:bg-white/10 transition-colors"
            >
              View School Solutions
            </Button>
          </Link>
        </div>
      </section>

      {/* Fade: black → white */}
      <div style={{ height: "120px", background: "linear-gradient(to bottom, #000, #fff)" }} />

      {/* ── PRODUCTS CAROUSEL (white) ── */}
      <section style={{ paddingTop: "48px", paddingBottom: "48px", background: "#fff" }}>
        <div className="home-row-header" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 52px", marginBottom: "18px" }}>
          <div>
            <p style={{ fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "rgba(0,0,0,0.35)", marginBottom: "8px" }}>Shop</p>
            <h2 style={{ fontSize: "17px", fontWeight: 600, color: "#111" }}>Products</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <Link href="/team-stores">
              <span style={{ fontSize: "12px", color: "rgba(0,0,0,0.35)", cursor: "pointer" }} className="hover:text-black transition-colors">See all</span>
            </Link>
            <div style={{ display: "flex", gap: "6px" }}>
              <button onClick={() => scroll(productsScrollRef, "left")} data-testid="button-products-prev"
                style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.1)", color: "rgba(0,0,0,0.4)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                className="hover:bg-black/10 hover:text-black transition-all"
              ><ChevronLeft size={13} /></button>
              <button onClick={() => scroll(productsScrollRef, "right")} data-testid="button-products-next"
                style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.1)", color: "rgba(0,0,0,0.4)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                className="hover:bg-black/10 hover:text-black transition-all"
              ><ChevronRight size={13} /></button>
            </div>
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "72px", zIndex: 2, background: "linear-gradient(to right, #fff, transparent)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "72px", zIndex: 2, background: "linear-gradient(to left, #fff, transparent)", pointerEvents: "none" }} />
          <div
            ref={productsScrollRef}
            style={{ display: "flex", gap: "14px", overflowX: "auto", padding: "4px 52px 24px", scrollSnapType: "x mandatory" }}
            className="hide-scrollbar home-scroll-track"
          >
            {featuredProducts.map((product, i) => (
              <Link key={product.id} href="/team-stores">
                <div
                  data-testid={"card-product-" + i}
                  style={{ minWidth: "200px", width: "200px", borderRadius: "6px", overflow: "hidden", cursor: "pointer", scrollSnapAlign: "start", flexShrink: 0, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", transition: "transform .3s, box-shadow .3s" }}
                  className="group hover:scale-105 hover:shadow-lg"
                >
                  <div style={{ height: "220px", overflow: "hidden", position: "relative", background: "#f5f5f5" }}>
                    {product.featuredImage ? (
                      <img
                        src={product.featuredImage.url}
                        alt={product.featuredImage.altText || product.title}
                        style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform .3s" }}
                        className="group-hover:scale-105"
                      />
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: "#eee" }} />
                    )}
                  </div>
                  <div style={{ padding: "14px 14px 16px", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                    <p style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px", color: "#111" }}>{product.title}</p>
                    <p style={{ fontSize: "12px", color: "rgba(0,0,0,0.4)", marginBottom: "14px" }}>
                      {formatPrice(product.priceRange.minVariantPrice.amount, product.priceRange.minVariantPrice.currencyCode)}
                    </p>
                    <button
                      data-testid={"button-add-to-cart-" + i}
                      style={{ width: "100%", padding: "9px", borderRadius: "4px", background: "#111", color: "#fff", border: "1px solid #111", cursor: "pointer", fontSize: "10px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", fontFamily: "inherit", transition: "all .2s" }}
                      className="group-hover:bg-black group-hover:border-black"
                    >
                      View
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Fade: white → black */}
      <div style={{ height: "120px", background: "linear-gradient(to bottom, #fff, #000)" }} />

      {/* ── TESTIMONIAL ── */}
      <section className="home-testimonial" style={{ padding: "80px 52px", background: "#000", textAlign: "center" }}>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "180px", color: "rgba(255,255,255,0.04)", lineHeight: 0.8, display: "block", marginBottom: "-50px", userSelect: "none" }}>&ldquo;</span>
        <blockquote
          data-testid="card-hub-testimonial"
          style={{ fontSize: "clamp(20px, 3vw, 32px)", fontWeight: 300, fontStyle: "italic", lineHeight: 1.5, maxWidth: "740px", margin: "0 auto 28px", color: "rgba(255,255,255,0.82)", position: "relative", zIndex: 1 }}
        >
          &ldquo;The whole process was straightforward from start to finish. The kit arrived on time, the quality was exactly what we needed, and our members were stoked. Would recommend Sideline to any club.&rdquo;
        </blockquote>
        <p style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>Club Manager</p>
        <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "5px" }}>Rugby Club, Auckland</p>
      </section>

      {/* ── OUR WORK GRID ── */}
      <section style={{ paddingBottom: "80px", background: "#000" }}>
        <div className="home-row-header" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 52px", marginBottom: "20px" }}>
          <div>
            <p style={{ fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: "8px" }}>Portfolio</p>
            <h2 style={{ fontSize: "17px", fontWeight: 600, color: "#f0f0f0" }}>Our Work</h2>
          </div>
          <Link href="/our-work">
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }} className="hover:text-white transition-colors">
              View All <ArrowRight size={13} />
            </span>
          </Link>
        </div>

        <div className="home-work-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridAutoRows: "260px", gap: "4px", padding: "0 52px" }}>
          {CASE_STUDIES.slice(0, 4).map((study, i) => (
            <Link key={study.slug} href={`/our-work/${study.slug}`}>
              <div
                data-testid={`featured-work-${study.slug}`}
                style={{ position: "relative", overflow: "hidden", cursor: "pointer", borderRadius: "6px", height: "100%" }}
                className="group"
              >
                <img
                  src={study.coverImage}
                  alt={study.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.85)", transition: "filter .35s, transform .35s" }}
                  className="group-hover:brightness-100 group-hover:scale-105"
                />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 55%)", opacity: 0, transition: "opacity .3s" }} className="group-hover:opacity-100" />
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "18px", opacity: 0, transition: "opacity .3s" }} className="group-hover:opacity-100">
                  <p style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>{study.name}</p>
                  <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "3px" }}>{study.sport} · {study.location}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── HUB / MOCKUP FORM ── */}
      <HubSection />

      {/* ── CUSTOMER LOGOS ── */}
      <CustomerLogos />

      {/* ── CTA BAND ── */}
      <section style={{ position: "relative", height: "420px", overflow: "hidden" }}>
        <img
          src={lockerRoomStore}
          alt="Virtual locker room store"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.35)" }}
        />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0.2) 100%)" }} />
        <div className="home-cta-content" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 72px" }}>
          <h2 style={{ fontFamily: "'Peloric', 'Bebas Neue', sans-serif", fontSize: "clamp(36px, 5vw, 56px)", lineHeight: 0.95, color: "#fff", marginBottom: "20px", letterSpacing: "1px" }}>
            READY TO BUILD<br />YOUR TEAM STORE?
          </h2>
          <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.45)", fontWeight: 300, marginBottom: "40px", maxWidth: "420px", lineHeight: 1.7 }}>
            Get your club set up with its own online store. Members order direct, you manage nothing. Get started with a free mockup.
          </p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <Link href="/quote">
              <Button
                data-testid="button-request-quote"
                style={{ background: "#fff", color: "#000", border: "none", padding: "14px 36px", borderRadius: "4px", fontSize: "12px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", height: "auto" }}
                className="hover:opacity-88 transition-opacity"
              >
                Start a Project
              </Button>
            </Link>
            <Button
              variant="outline"
              style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", padding: "14px 36px", borderRadius: "4px", fontSize: "12px", fontWeight: 500, cursor: "pointer", height: "auto" }}
              className="hover:bg-white/16 transition-colors"
              onClick={() => setIsTeamStoreModalOpen(true)}
              data-testid="button-whats-team-store"
            >
              Learn More
            </Button>
          </div>
        </div>
      </section>

      <style>{`
        @media (max-width: 768px) {
          .home-overlay-content {
            padding: 44px 20px !important;
          }
          .home-row-header {
            padding-left: 20px !important;
            padding-right: 20px !important;
          }
          .home-scroll-track {
            padding-left: 20px !important;
            padding-right: 20px !important;
          }
          .home-testimonial {
            padding: 44px 20px !important;
          }
          .home-work-grid {
            padding-left: 20px !important;
            padding-right: 20px !important;
            grid-template-columns: 1fr !important;
            grid-auto-rows: 220px !important;
          }
          .home-cta-content {
            padding: 0 20px !important;
          }
        }
      `}</style>
    </Layout>
  );
}
