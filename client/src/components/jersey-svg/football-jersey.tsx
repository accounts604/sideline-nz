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

export function FootballJersey({ activeZone, onZoneHover, onZoneClick, zones }: JerseySvgProps) {
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
      {/* Football jersey silhouette — longer sleeves than rugby */}
      <path
        d="M125 58 L105 63 L60 82 L25 130 L10 185 L15 220 L30 235 L55 225 L70 210 L72 195 L75 360 L80 370 L320 370 L325 360 L328 195 L330 210 L345 225 L370 235 L385 220 L390 185 L375 130 L340 82 L295 63 L275 58 L258 50 Q238 42 200 40 Q162 42 142 50 Z"
        fill="#1a1a1a"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1.5"
      />

      {/* Front chest */}
      <rect x="108" y="100" width="184" height="120" rx="4" {...zoneProps("front-chest")} />
      <text x="200" y="165" textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.4)" fontFamily="sans-serif" fontWeight="600">FRONT CHEST</text>

      {/* Left sleeve */}
      <path
        d="M25 130 L60 82 L105 63 L108 78 L78 100 L52 145 L35 195 L30 218 L20 210 L10 185 Z"
        {...zoneProps("left-sleeve")}
      />
      <text x="55" y="148" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif" transform="rotate(-28 55 148)">SLEEVE</text>

      {/* Right sleeve */}
      <path
        d="M375 130 L340 82 L295 63 L292 78 L322 100 L348 145 L365 195 L370 218 L380 210 L390 185 Z"
        {...zoneProps("right-sleeve")}
      />
      <text x="345" y="148" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif" transform="rotate(28 345 148)">SLEEVE</text>

      {/* Upper back */}
      <rect x="108" y="230" width="184" height="55" rx="4" {...zoneProps("upper-back")} />
      <text x="200" y="262" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">UPPER BACK</text>

      {/* Lower back */}
      <rect x="108" y="293" width="184" height="65" rx="4" {...zoneProps("lower-back")} />
      <text x="200" y="330" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">LOWER BACK</text>

      {/* Shorts silhouette */}
      <path
        d="M90 390 L85 395 L70 490 L90 495 L150 495 L172 418 L200 412 L228 418 L250 495 L310 495 L330 490 L315 395 L310 390 Z"
        fill="#1a1a1a"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1.5"
      />

      {/* Shorts front */}
      <rect x="118" y="415" width="164" height="50" rx="4" {...zoneProps("shorts-front")} />
      <text x="200" y="444" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">SHORTS</text>

      {/* Socks indicator */}
      <rect x="115" y="520" width="170" height="28" rx="14" {...zoneProps("socks")} />
      <text x="200" y="538" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">SOCKS</text>
    </svg>
  );
}
