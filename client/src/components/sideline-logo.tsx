/**
 * Sideline brand logo - SVG "S" mark inspired by the Sideline NZ identity.
 * Uses the brand orange (#f97316) by default with Bebas Neue wordmark.
 */
export function SidelineMark({ size = 32, color = "#f97316" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Stylised "S" block mark */}
      <rect x="4" y="4" width="14" height="14" rx="3" fill={color} />
      <rect x="22" y="4" width="14" height="14" rx="3" fill={color} />
      <rect x="4" y="22" width="14" height="14" rx="3" fill={color} />
      <rect x="22" y="22" width="14" height="14" rx="3" fill={color} opacity={0.35} />
    </svg>
  );
}

export function SidelineLogo({
  size = "default",
  subtitle,
}: {
  size?: "small" | "default" | "large";
  subtitle?: string;
}) {
  const markSize = size === "large" ? 36 : size === "small" ? 24 : 28;
  const textSize = size === "large" ? "28px" : size === "small" ? "18px" : "22px";
  const subSize = size === "large" ? "12px" : "11px";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <SidelineMark size={markSize} />
      <div>
        <span
          style={{
            fontSize: textSize,
            fontWeight: 700,
            color: "#fff",
            textTransform: "uppercase",
            letterSpacing: "3px",
            fontFamily: "'Bebas Neue', sans-serif",
            lineHeight: 1,
          }}
        >
          Sideline
        </span>
        {subtitle && (
          <p
            style={{
              fontSize: subSize,
              color: "rgba(255,255,255,0.35)",
              marginTop: "2px",
              letterSpacing: "1px",
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
