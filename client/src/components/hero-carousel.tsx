import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

import backgroundImage from "@assets/generated_images/dark_moody_locker_room_background.png";
import rugbyModel from "@assets/sideline_models/Rugby.png";
import basketballModel from "@assets/sideline_models/bball.png";
import netballModel from "@assets/033bc3b2-e50c-47a4-88ec-2847fbf755c0_removalai_preview_1772635049351.png";
import tracksuitModel from "@assets/sideline_models/Tracksuit.png";
import gridironModel from "@assets/sideline_models/Gridion.png";
import windbreakerModel from "@assets/sideline_models/windbreaker jacket.png";
import accessoriesModel from "@assets/sideline_models/accessories.png";

const slides: { image: string; headline: string[]; sub: string; imgClass?: string }[] = [
  {
    image: rugbyModel,
    headline: ["ONE PARTNER.", "EVERY CODE."],
    sub: "Custom kits for clubs and schools across every major sport, wherever you play.",
  },
  {
    image: basketballModel,
    headline: ["YOUR JERSEY.", "PAYS FOR ITSELF."],
    sub: "We help clubs turn their kit into a sponsorship asset. Your apparel earns revenue, not just respect.",
  },
  {
    image: netballModel,
    headline: ["GRASSROOTS.", "ELITE LOOK."],
    sub: "Professional-grade gear built around your identity. Look elite without the elite budget.",
    imgClass: "hero-img-netball",
  },
  {
    image: tracksuitModel,
    headline: ["MATCH DAY.", "SORTED."],
    sub: "Full tracksuit sets that travel as well as your team. Custom-branded from zip to cuff.",
  },
  {
    image: gridironModel,
    headline: ["EVERY SPORT.", "COVERED."],
    sub: "Flag football, gridiron, tag \u2014 whatever you play, we design gear that fits your code.",
  },
  {
    image: windbreakerModel,
    headline: ["BEYOND THE.", "JERSEY."],
    sub: "Windbreakers, jackets, and sideline gear. Keep your team warm and your brand visible.",
  },
  {
    image: accessoriesModel,
    headline: ["COMPLETE THE.", "LOOK."],
    sub: "Beanies, caps, and accessories that finish the kit. Branded head to toe, no detail missed.",
    imgClass: "hero-img-accessories",
  },
];

export function HeroCarousel() {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(true);
  const startX = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleChange = (newIndex: number) => {
    if (newIndex === active) return;
    setVisible(false);
    setTimeout(() => {
      setActive(newIndex);
      setVisible(true);
    }, 220);
  };

  useEffect(() => {
    timerRef.current = setInterval(() => {
      handleChange((active + 1) % slides.length);
    }, 4500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [active]);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const diff = startX.current - e.changedTouches[0].clientX;
    if (diff > 50) handleChange((active + 1) % slides.length);
    else if (diff < -50) handleChange(active === 0 ? slides.length - 1 : active - 1);
    startX.current = null;
  };

  const slide = slides[active];

  return (
    <section
      className="relative overflow-hidden bg-black"
      style={{ height: "92vh", minHeight: "680px", maxHeight: "980px" }}
      data-testid="hero-carousel"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Background photo */}
      <img
        src={backgroundImage}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{ filter: "brightness(0.4)" }}
        draggable={false}
      />

      {/* Left side vignette */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(to right, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 40%, transparent 60%)" }} />

      {/* Model image — right side, full height, bottom-anchored */}
      <div className="hero-mockup-wrap" style={{
        position: "absolute", right: 0, top: 0, bottom: 0, width: "55%",
        overflow: "hidden", zIndex: 1,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}>
        <img
          key={active}
          src={slide.image}
          alt="Sideline kit mockup"
          draggable={false}
          className={`hero-mockup-img ${slide.imgClass || ""}`}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "bottom right",
            transition: "opacity 0.5s ease, transform 0.5s ease",
            opacity: visible ? 1 : 0,
            transform: visible ? "scale(1) translateY(0)" : "scale(0.95) translateY(14px)",
          }}
        />
      </div>

      {/* Gradient overlay — fades bottom into black */}
      <div className="hero-gradient-overlay" style={{
        position: "absolute", bottom: 0, left: 0, width: "100%", height: "45%",
        background: "linear-gradient(to top, #000000 0%, #000000 15%, rgba(0,0,0,0.6) 45%, rgba(0,0,0,0) 100%)",
        pointerEvents: "none", zIndex: 2,
      }} />

      {/* Text content — vertically centered left side */}
      <div
        className="hero-text-block absolute flex flex-col"
        style={{
          top: "50%", left: "0", transform: "translateY(-50%)",
          maxWidth: "45%",
          paddingLeft: "clamp(2.5rem, 6vw, 7rem)",
          zIndex: 3,
        }}
      >
        <p style={{
          fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase",
          color: "rgba(255,255,255,0.6)", marginBottom: "24px",
        }}>
          Sideline NZ &nbsp;&middot;&nbsp; Custom Teamwear Worldwide
        </p>

        <h1 style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: "clamp(3.5rem, 6.5vw, 6.5rem)",
          lineHeight: 0.92, fontWeight: 900, letterSpacing: "1px", color: "#fff", marginBottom: "1.25rem",
          transition: "opacity 0.22s, transform 0.22s",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(10px)",
        }}>
          {slide.headline[0]}<br />{slide.headline[1]}
        </h1>

        <p style={{
          fontSize: "clamp(0.875rem, 1.2vw, 1rem)", color: "rgba(255,255,255,0.75)", fontWeight: 300,
          lineHeight: 1.7, maxWidth: "340px", marginBottom: "2rem",
          transition: "opacity 0.3s", opacity: visible ? 1 : 0,
        }}>
          {slide.sub}
        </p>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link href="/quote">
            <Button
              data-testid="button-start-project"
              style={{
                background: "#fff", color: "#000", border: "none",
                padding: "14px 36px", borderRadius: "4px", height: "auto",
                fontSize: "12px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase",
              }}
              className="hover:opacity-88 transition-opacity"
            >
              Start a Project
            </Button>
          </Link>
          <Link href="/team-stores">
            <Button
              data-testid="button-browse-stores"
              variant="outline"
              style={{
                background: "rgba(255,255,255,0.08)", color: "#fff",
                border: "1px solid rgba(255,255,255,0.2)",
                padding: "14px 36px", borderRadius: "4px", height: "auto",
                fontSize: "12px", fontWeight: 500, letterSpacing: "0.5px",
              }}
              className="hover:bg-white/15 transition-colors"
            >
              Browse Stores
            </Button>
          </Link>
        </div>
      </div>

      {/* Slide dots */}
      <div
        className="absolute flex items-center"
        style={{ bottom: "44px", left: "clamp(2.5rem, 6vw, 7rem)", gap: "8px", zIndex: 4 }}
      >
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => handleChange(i)}
            data-testid={`carousel-indicator-${i}`}
            aria-label={`Slide ${i + 1}`}
            style={{
              height: "2px", border: "none", padding: 0, cursor: "pointer",
              borderRadius: "2px", transition: "all 0.4s ease",
              width: i === active ? "28px" : "8px",
              background: i === active ? "#fff" : "rgba(255,255,255,0.2)",
            }}
          />
        ))}
      </div>

      <style>{`
        .hero-img-accessories {
          transform: scale(1.4);
          transform-origin: bottom center;
        }
        .hero-img-netball {
          object-position: center top !important;
          transform: scale(1.1);
          transform-origin: center top;
        }
        @media (max-width: 768px) {
          .hero-text-block {
            top: auto !important;
            bottom: 45% !important;
            left: 0 !important;
            right: 0 !important;
            transform: none !important;
            max-width: none !important;
            padding: 2rem 1.5rem !important;
          }
          .hero-mockup-wrap {
            width: 100% !important;
            height: 55vh !important;
            top: auto !important;
            bottom: 0 !important;
          }
          .hero-img-accessories {
            transform: scale(1.3) !important;
          }
        }
      `}</style>
    </section>
  );
}
