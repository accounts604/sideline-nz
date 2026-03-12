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

export function NetballJersey({ activeZone, onZoneHover, onZoneClick, zones }: JerseySvgProps) {
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
      {/* Netball dress silhouette */}
      <path
        d="M130 55 L105 62 L65 85 L35 130 L28 175 L35 200 L55 208 L75 195 L80 180 L80 250 L75 340 L70 420 L72 480 L85 490 L160 495 L200 498 L240 495 L315 490 L328 480 L330 420 L325 340 L320 250 L320 180 L325 195 L345 208 L372 200 L375 175 L368 130 L335 85 L295 62 L270 55 L255 48 Q235 40 200 38 Q165 40 145 48 Z"
        fill="#1a1a1a"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1.5"
      />

      {/* Front chest */}
      <rect x="110" y="100" width="180" height="110" rx="4" {...zoneProps("front-chest")} />
      <text x="200" y="160" textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.4)" fontFamily="sans-serif" fontWeight="600">FRONT CHEST</text>

      {/* Left sleeve cap */}
      <path
        d="M35 130 L65 85 L105 62 L110 75 L85 95 L65 130 L50 170 L42 190 L35 185 L28 175 Z"
        {...zoneProps("left-sleeve")}
      />
      <text x="62" y="132" textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif" transform="rotate(-30 62 132)">SLEEVE</text>

      {/* Right sleeve cap */}
      <path
        d="M368 130 L335 85 L295 62 L290 75 L315 95 L335 130 L350 170 L358 190 L365 185 L375 175 Z"
        {...zoneProps("right-sleeve")}
      />
      <text x="338" y="132" textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif" transform="rotate(30 338 132)">SLEEVE</text>

      {/* Upper back */}
      <rect x="110" y="220" width="180" height="55" rx="4" {...zoneProps("upper-back")} />
      <text x="200" y="252" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">UPPER BACK</text>

      {/* Lower back */}
      <rect x="110" y="283" width="180" height="55" rx="4" {...zoneProps("lower-back")} />
      <text x="200" y="315" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">LOWER BACK</text>

      {/* Skirt / hem panel */}
      <rect x="95" y="420" width="210" height="45" rx="4" {...zoneProps("skirt-hem")} />
      <text x="200" y="447" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">SKIRT / HEM</text>
    </svg>
  );
}
