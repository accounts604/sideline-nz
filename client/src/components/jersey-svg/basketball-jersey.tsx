import type { SponsorZone } from "@/data/sponsor-zones";
import { getTierInfo } from "@/data/sponsor-zones";

interface JerseySvgProps {
  activeZone: string | null;
  onZoneHover: (zoneId: string | null) => void;
  onZoneClick: (zoneId: string) => void;
  zones: SponsorZone[];
}

function getZoneFill(zoneId: string, activeZone: string | null, zones: SponsorZone[]) {
  if (activeZone === zoneId) {
    const zone = zones.find((z) => z.id === zoneId);
    if (zone) return getTierInfo(zone.tier).color + "40";
  }
  return "rgba(255,255,255,0.04)";
}

function getZoneStroke(zoneId: string, activeZone: string | null) {
  return activeZone === zoneId ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.15)";
}

export function BasketballJersey({ activeZone, onZoneHover, onZoneClick, zones }: JerseySvgProps) {
  const zoneProps = (id: string) => ({
    fill: getZoneFill(id, activeZone, zones),
    stroke: getZoneStroke(id, activeZone),
    strokeWidth: activeZone === id ? 1.5 : 1,
    strokeDasharray: activeZone === id ? "none" : "4 3",
    style: { cursor: "pointer", transition: "fill 0.2s, stroke 0.2s" } as React.CSSProperties,
    onMouseEnter: () => onZoneHover(id),
    onMouseLeave: () => onZoneHover(null),
    onClick: () => onZoneClick(id),
  });

  return (
    <svg viewBox="0 0 400 580" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "auto" }}>
      {/* Singlet body */}
      <path
        d="M115 50 L95 55 L70 75 L60 110 L65 130 L80 125 L85 110 L85 360 L90 370 L310 370 L315 360 L315 110 L320 125 L335 130 L340 110 L330 75 L305 55 L285 50 L265 42 Q240 35 200 33 Q160 35 135 42 Z"
        fill="#1a1a1a"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1.5"
      />

      {/* Front chest */}
      <rect x="115" y="95" width="170" height="120" rx="4" {...zoneProps("front-chest")} />
      <text x="200" y="160" textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.4)" fontFamily="sans-serif" fontWeight="600">FRONT CHEST</text>

      {/* Left side panel */}
      <rect x="88" y="135" width="30" height="160" rx="3" {...zoneProps("side-panel-left")} />
      <text x="103" y="220" textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif" transform="rotate(-90 103 220)">SIDE PANEL</text>

      {/* Right side panel */}
      <rect x="282" y="135" width="30" height="160" rx="3" {...zoneProps("side-panel-right")} />
      <text x="297" y="220" textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif" transform="rotate(90 297 220)">SIDE PANEL</text>

      {/* Upper back */}
      <rect x="115" y="225" width="170" height="60" rx="4" {...zoneProps("upper-back")} />
      <text x="200" y="259" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">UPPER BACK</text>

      {/* Lower back */}
      <rect x="115" y="293" width="170" height="65" rx="4" {...zoneProps("lower-back")} />
      <text x="200" y="330" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">LOWER BACK</text>

      {/* Shorts silhouette */}
      <path
        d="M90 390 L85 395 L65 510 L85 515 L150 515 L175 425 L200 418 L225 425 L250 515 L315 515 L335 510 L315 395 L310 390 Z"
        fill="#1a1a1a"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1.5"
      />

      {/* Shorts waistband */}
      <rect x="95" y="392" width="210" height="22" rx="3" {...zoneProps("shorts-waistband")} />
      <text x="200" y="407" textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">WAISTBAND</text>

      {/* Shorts front */}
      <rect x="120" y="425" width="160" height="55" rx="4" {...zoneProps("shorts-front")} />
      <text x="200" y="457" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">SHORTS</text>
    </svg>
  );
}
