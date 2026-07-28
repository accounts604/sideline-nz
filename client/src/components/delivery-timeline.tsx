import { computeMilestones } from "@shared/po-milestones";
import type { CustomerVisibleEvent } from "@shared/customer-timeline";

/**
 * The customer's answer to "when does my gear arrive".
 *
 * Dates come from shared/po-milestones.ts: a 35-day build counted BACKWARDS from
 * the customer's due date. That matters, because the previous customer tracker
 * read from production_stages, which needs a human to tick nine boxes per order.
 * In practice almost nobody does: on 2026-07-28 every live in-production order
 * showed 0 of 9 complete, and two DELIVERED orders showed 2 of 9. Customers were
 * being shown something actively wrong, which is worse than showing nothing and
 * is why they emailed instead.
 *
 * Milestones are correct by construction. Nobody has to maintain them.
 */

const fmt = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-NZ", { day: "numeric", month: "short" });

const fmtLong = (d: Date) =>
  d.toLocaleDateString("en-NZ", { day: "numeric", month: "long" });

export function DeliveryTimeline({
  dueDate,
  events = [],
}: {
  dueDate: string | null | undefined;
  events?: CustomerVisibleEvent[];
}) {
  const milestones = computeMilestones(dueDate);

  if (!milestones) {
    return (
      <div style={card}>
        <h3 style={h3}>Delivery date not set yet</h3>
        <p style={{ ...muted, margin: 0 }}>
          We confirm your delivery date once your design is approved and production is booked.
          As soon as it is set, every step and date appears here.
        </p>
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(milestones[milestones.length - 1].date + "T00:00:00");
  const done = milestones.filter((m) => new Date(m.date + "T00:00:00") <= today).length;
  const next = milestones.find((m) => new Date(m.date + "T00:00:00") > today);
  const daysToGo = Math.round((due.getTime() - today.getTime()) / 86400000);
  const pct = Math.max(4, Math.round((done / milestones.length) * 100));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* ETA */}
      <div style={{ ...card, borderColor: "rgba(249,115,22,0.3)" }}>
        <p style={label}>Arriving</p>
        <div style={{ fontSize: "30px", fontWeight: 700, color: "#fff", lineHeight: 1.1, marginTop: "4px" }}>
          about {fmtLong(due)}
        </div>
        <p style={{ ...muted, margin: "6px 0 0", fontVariantNumeric: "tabular-nums" }}>
          {daysToGo > 0 ? `${daysToGo} days away` : daysToGo === 0 ? "due today" : "due date passed"}
          {" · "}
          {done} of {milestones.length} steps done
        </p>
        <div style={{ height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.08)", marginTop: "15px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "#f97316", borderRadius: "3px" }} />
        </div>
        {next && (
          <p style={{ ...muted, margin: "13px 0 0", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" }}>
            <strong style={{ color: "#fff" }}>Next:</strong> {next.label} on {fmt(next.date)}
          </p>
        )}
      </div>

      {/* Milestones */}
      <div style={card}>
        <h3 style={h3}>Your timeline</h3>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {milestones.map((m, i) => {
            const past = new Date(m.date + "T00:00:00") <= today;
            const isNext = next?.key === m.key;
            return (
              <div key={m.key} style={{ display: "flex", gap: "13px", padding: "11px 0", position: "relative" }}>
                {i < milestones.length - 1 && (
                  <span style={{ position: "absolute", left: "6px", top: "26px", bottom: "-11px", width: "1px", background: "rgba(255,255,255,0.08)" }} />
                )}
                <span
                  style={{
                    width: "13px", height: "13px", borderRadius: "50%", flex: "none", marginTop: "4px", zIndex: 1,
                    background: past ? "#22c55e" : isNext ? "#f97316" : "#000",
                    border: `2px solid ${past ? "#22c55e" : isNext ? "#f97316" : "rgba(255,255,255,0.15)"}`,
                    boxShadow: isNext ? "0 0 0 4px rgba(249,115,22,0.18)" : undefined,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: past || isNext ? 600 : 400, color: past || isNext ? "#fff" : "rgba(255,255,255,0.5)" }}>
                    {m.label}
                  </div>
                  {m.description && (
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", marginTop: "2px" }}>{m.description}</div>
                  )}
                </div>
                <span style={{
                  fontSize: "12px", whiteSpace: "nowrap", marginTop: "3px", fontVariantNumeric: "tabular-nums",
                  color: isNext ? "#f97316" : "rgba(255,255,255,0.5)", fontWeight: isNext ? 700 : 400,
                }}>
                  {fmt(m.date)}
                </span>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", margin: "14px 0 0", lineHeight: 1.5, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" }}>
          These dates come from a 35-day build counted back from your delivery date. If anything slips we
          update this page and email you, so you never have to chase us.
        </p>
      </div>

      {/* What actually happened */}
      {events.length > 0 && (
        <div style={card}>
          <h3 style={h3}>What has happened so far</h3>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {events.map((e, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "14px", padding: "9px 0", borderTop: i ? "1px solid rgba(255,255,255,0.06)" : undefined }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "13.5px", color: "#fff" }}>{e.label}</div>
                  {e.detail && <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", marginTop: "2px" }}>{e.detail}</div>}
                </div>
                <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                  {new Date(e.at).toLocaleDateString("en-NZ", { day: "numeric", month: "short" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const card = {
  background: "#111",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "12px",
  padding: "18px 20px",
} as const;
const h3 = { fontSize: "15px", fontWeight: 600, color: "#fff", margin: "0 0 12px" } as const;
const label = { fontSize: "11px", letterSpacing: "0.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", margin: 0, fontWeight: 700 } as const;
const muted = { fontSize: "13px", color: "rgba(255,255,255,0.5)" } as const;
