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

export function LeagueJersey({ activeZone, onZoneHover, onZoneClick, zones }: JerseySvgProps) {
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
      {/* League jersey — similar to rugby but tighter fit, V-neck */}
      <path
        d="M125 55 L105 60 L58 80 L28 125 L18 175 L22 205 L38 215 L58 205 L68 192 L68 360 L73 370 L327 370 L332 360 L332 192 L342 205 L362 215 L378 205 L382 175 L372 125 L342 80 L295 60 L275 55 L258 47 Q238 40 200 38 Q162 40 142 47 Z"
        fill="#1a1a1a"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1.5"
      />

      {/* V-neck collar */}
      <path
        d="M142 47 Q162 40 200 38 Q238 40 258 47 L240 72 L200 82 L160 72 Z"
        {...zoneProps("collar")}
      />
      <text x="200" y="62" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">COLLAR</text>

      {/* Front chest */}
      <rect x="103" y="100" width="194" height="120" rx="4" {...zoneProps("front-chest")} />
      <text x="200" y="165" textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.4)" fontFamily="sans-serif" fontWeight="600">FRONT CHEST</text>

      {/* Left sleeve */}
      <path
        d="M28 125 L58 80 L105 60 L108 72 L82 92 L58 132 L42 175 L38 200 L25 192 L18 175 Z"
        {...zoneProps("left-sleeve")}
      />
      <text x="56" y="138" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif" transform="rotate(-25 56 138)">SLEEVE</text>

      {/* Right sleeve */}
      <path
        d="M372 125 L342 80 L295 60 L292 72 L318 92 L342 132 L358 175 L362 200 L375 192 L382 175 Z"
        {...zoneProps("right-sleeve")}
      />
      <text x="344" y="138" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif" transform="rotate(25 344 138)">SLEEVE</text>

      {/* Upper back */}
      <rect x="103" y="230" width="194" height="58" rx="4" {...zoneProps("upper-back")} />
      <text x="200" y="263" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">UPPER BACK</text>

      {/* Lower back */}
      <rect x="103" y="296" width="194" height="62" rx="4" {...zoneProps("lower-back")} />
      <text x="200" y="332" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">LOWER BACK</text>

      {/* Shorts silhouette */}
      <path
        d="M88 390 L83 395 L65 500 L85 505 L145 505 L172 420 L200 414 L228 420 L255 505 L315 505 L335 500 L317 395 L312 390 Z"
        fill="#1a1a1a"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1.5"
      />

      {/* Shorts front */}
      <rect x="118" y="418" width="164" height="55" rx="4" {...zoneProps("shorts-front")} />
      <text x="200" y="450" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">SHORTS</text>
    </svg>
  );
}
