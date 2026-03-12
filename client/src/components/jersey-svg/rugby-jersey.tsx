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
    if (zone) {
      const tier = getTierInfo(zone.tier);
      return tier.color + "40"; // 25% opacity
    }
  }
  return "rgba(255,255,255,0.04)";
}

function getZoneStroke(zoneId: string, activeZone: string | null) {
  return activeZone === zoneId ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.15)";
}

export function RugbyJersey({ activeZone, onZoneHover, onZoneClick, zones }: JerseySvgProps) {
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
      {/* Jersey body silhouette */}
      <path
        d="M120 60 L100 65 L60 80 L30 120 L20 170 L25 200 L40 210 L60 200 L70 190 L70 360 L75 370 L325 370 L330 360 L330 190 L340 200 L360 210 L375 200 L380 170 L370 120 L340 80 L300 65 L280 60 L260 50 Q240 40 200 38 Q160 40 140 50 Z"
        fill="#1a1a1a"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1.5"
      />

      {/* Collar */}
      <path
        d="M140 50 Q160 42 200 40 Q240 42 260 50 L255 62 Q240 54 200 52 Q160 54 145 62 Z"
        {...zoneProps("collar")}
      />
      <text x="200" y="55" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">COLLAR</text>

      {/* Front chest */}
      <rect x="105" y="100" width="190" height="120" rx="4" {...zoneProps("front-chest")} />
      <text x="200" y="165" textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.4)" fontFamily="sans-serif" fontWeight="600">FRONT CHEST</text>

      {/* Left sleeve */}
      <path
        d="M30 120 L60 80 L100 65 L105 75 L80 95 L60 130 L50 170 L40 195 L25 185 L20 170 Z"
        {...zoneProps("left-sleeve")}
      />
      <text x="58" y="135" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif" transform="rotate(-25 58 135)">SLEEVE</text>

      {/* Right sleeve */}
      <path
        d="M370 120 L340 80 L300 65 L295 75 L320 95 L340 130 L350 170 L360 195 L375 185 L380 170 Z"
        {...zoneProps("right-sleeve")}
      />
      <text x="342" y="135" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif" transform="rotate(25 342 135)">SLEEVE</text>

      {/* Upper back indicator (shown as label since this is front-view; indicates placement exists) */}
      <rect x="105" y="230" width="190" height="60" rx="4" {...zoneProps("upper-back")} />
      <text x="200" y="264" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">UPPER BACK</text>

      {/* Lower back */}
      <rect x="105" y="298" width="190" height="62" rx="4" {...zoneProps("lower-back")} />
      <text x="200" y="333" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">LOWER BACK</text>

      {/* Shorts silhouette */}
      <path
        d="M85 390 L80 395 L60 500 L80 505 L140 505 L170 420 L200 415 L230 420 L260 505 L320 505 L340 500 L320 395 L315 390 Z"
        fill="#1a1a1a"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1.5"
      />

      {/* Shorts front */}
      <rect x="120" y="415" width="160" height="60" rx="4" {...zoneProps("shorts-front")} />
      <text x="200" y="450" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">SHORTS</text>
    </svg>
  );
}
