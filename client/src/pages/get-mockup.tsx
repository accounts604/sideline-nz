import { useState } from "react";
import { SidelineMark } from "@/components/sideline-logo";
import { Wand2, CheckCircle, Loader2, ArrowRight } from "lucide-react";

const SPORTS = [
  "Rugby",
  "Rugby League",
  "Netball",
  "Cricket",
  "Basketball",
  "Hockey",
  "Football",
  "Touch",
  "Volleyball",
];

const PRESET_COLORS = [
  "#000000", "#ffffff", "#1e3a5f", "#333561", "#0ea5e9",
  "#dc2626", "#16a34a", "#f59e0b", "#7c3aed", "#ec4899",
  "#f97316", "#14b8a6", "#6b7280", "#92400e", "#4f46e5",
];

type FormState = "form" | "submitting" | "success";

export default function GetMockupPage() {
  const [state, setState] = useState<FormState>("form");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Form fields
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [teamName, setTeamName] = useState("");
  const [sport, setSport] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1e3a5f");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setState("submitting");

    try {
      const res = await fetch("/api/mockups/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactName,
          contactEmail,
          contactPhone: contactPhone || undefined,
          teamName,
          sport,
          primaryColor,
          secondaryColor: secondaryColor || undefined,
          accentColor: accentColor || undefined,
          notes: notes || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Request failed");
      }

      const data = await res.json();
      setRequestId(data.id);
      setState("success");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setState("form");
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "14px 16px",
    fontSize: "15px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "8px",
    color: "#fff",
    outline: "none",
    transition: "border-color 0.15s",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 500,
    color: "rgba(255,255,255,0.6)",
    marginBottom: "6px",
    display: "block",
  };

  // Success screen
  if (state === "success") {
    return (
      <div style={{ minHeight: "100vh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div style={{ width: "100%", maxWidth: "500px", textAlign: "center" }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%", background: "rgba(34,197,94,0.1)",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px",
          }}>
            <CheckCircle size={32} color="#22c55e" />
          </div>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#fff", marginBottom: "12px", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "2px" }}>
            Mockups on the Way!
          </h1>
          <p style={{ fontSize: "16px", color: "rgba(255,255,255,0.6)", lineHeight: 1.6, marginBottom: "8px" }}>
            Our AI is generating <strong style={{ color: "#f97316" }}>4 custom {sport.toLowerCase()} uniform designs</strong> for {teamName}.
          </p>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
            Check your email at <strong style={{ color: "#fff" }}>{contactEmail}</strong> in a few minutes.
            You'll receive your mockups along with a presentation video.
          </p>

          {requestId && (
            <div style={{ marginTop: "24px", padding: "16px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>
                Request ID: {requestId}
              </p>
            </div>
          )}

          <a
            href="/"
            style={{
              display: "inline-flex", alignItems: "center", gap: "8px", marginTop: "32px",
              padding: "14px 28px", background: "#f97316", color: "#fff", borderRadius: "8px",
              fontSize: "15px", fontWeight: 600, textDecoration: "none",
            }}
          >
            Back to Sideline <ArrowRight size={16} />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#000" }}>
      {/* Hero banner */}
      <div style={{ padding: "48px 20px 40px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "inline-block", marginBottom: "16px" }}>
          <SidelineMark size={40} />
        </div>
        <h1 style={{
          fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 700, color: "#fff",
          fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "3px", lineHeight: 1.1,
        }}>
          Get Your Custom Mockups
        </h1>
        <p style={{ fontSize: "16px", color: "rgba(255,255,255,0.5)", marginTop: "12px", maxWidth: "500px", margin: "12px auto 0", lineHeight: 1.6 }}>
          Tell us about your team and we'll generate <strong style={{ color: "#f97316" }}>4 unique uniform designs</strong> with
          AI — delivered to your inbox in under 5 minutes.
        </p>
      </div>

      {/* Form */}
      <div style={{ maxWidth: "580px", margin: "0 auto", padding: "40px 20px 60px" }}>
        <form onSubmit={handleSubmit}>
          {/* Contact info */}
          <div style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#fff", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#f97316", color: "#fff", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>1</span>
              Your Details
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input style={inputStyle} value={contactName} onChange={(e) => setContactName(e.target.value)} required placeholder="Your full name" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Email *</label>
                  <input style={inputStyle} type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required placeholder="you@email.com" />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input style={inputStyle} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="022 XXX XXXX" />
                </div>
              </div>
            </div>
          </div>

          {/* Team info */}
          <div style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#fff", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#f97316", color: "#fff", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>2</span>
              Team Info
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Team / Club Name *</label>
                <input style={inputStyle} value={teamName} onChange={(e) => setTeamName(e.target.value)} required placeholder="e.g. Onewhero Rugby Club" />
              </div>
              <div>
                <label style={labelStyle}>Sport *</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {SPORTS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSport(s)}
                      style={{
                        padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 500,
                        background: sport === s ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.04)",
                        border: sport === s ? "1px solid #f97316" : "1px solid rgba(255,255,255,0.08)",
                        color: sport === s ? "#f97316" : "rgba(255,255,255,0.6)",
                        cursor: "pointer", transition: "all 0.15s",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Colors */}
          <div style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#fff", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#f97316", color: "#fff", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>3</span>
              Team Colours
            </h2>

            {/* Primary */}
            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Primary Colour *</label>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setPrimaryColor(c)}
                      style={{
                        width: 28, height: 28, borderRadius: "6px", background: c, cursor: "pointer",
                        border: primaryColor === c ? "2px solid #f97316" : "1px solid rgba(255,255,255,0.15)",
                        outline: primaryColor === c ? "2px solid rgba(249,115,22,0.3)" : "none",
                      }}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  style={{ width: 36, height: 36, borderRadius: "6px", border: "none", cursor: "pointer", background: "none" }}
                />
              </div>
            </div>

            {/* Secondary */}
            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Secondary Colour</label>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSecondaryColor(secondaryColor === c ? "" : c)}
                      style={{
                        width: 28, height: 28, borderRadius: "6px", background: c, cursor: "pointer",
                        border: secondaryColor === c ? "2px solid #f97316" : "1px solid rgba(255,255,255,0.15)",
                        outline: secondaryColor === c ? "2px solid rgba(249,115,22,0.3)" : "none",
                      }}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={secondaryColor || "#ffffff"}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  style={{ width: 36, height: 36, borderRadius: "6px", border: "none", cursor: "pointer", background: "none" }}
                />
              </div>
            </div>

            {/* Preview */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>Preview:</span>
              <div style={{ width: 32, height: 32, borderRadius: "6px", background: primaryColor, border: "1px solid rgba(255,255,255,0.1)" }} />
              {secondaryColor && <div style={{ width: 32, height: 32, borderRadius: "6px", background: secondaryColor, border: "1px solid rgba(255,255,255,0.1)" }} />}
              {accentColor && <div style={{ width: 32, height: 32, borderRadius: "6px", background: accentColor, border: "1px solid rgba(255,255,255,0.1)" }} />}
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: "32px" }}>
            <label style={labelStyle}>Additional Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any specific requirements, sponsors to include, style preferences..."
              rows={3}
              style={{
                ...inputStyle,
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </div>

          {error && (
            <p style={{ fontSize: "13px", color: "#ef4444", marginBottom: "16px" }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={state === "submitting" || !sport || !teamName || !contactName || !contactEmail}
            style={{
              width: "100%", padding: "18px 32px", fontSize: "16px", fontWeight: 700,
              background: "#f97316", color: "#fff", border: "none", borderRadius: "10px",
              cursor: state === "submitting" ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
              opacity: (!sport || !teamName || !contactName || !contactEmail) ? 0.5 : 1,
              transition: "opacity 0.15s",
              fontFamily: "'Bebas Neue', sans-serif",
              letterSpacing: "2px",
              textTransform: "uppercase",
            }}
          >
            {state === "submitting" ? (
              <>
                <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
                Generating...
              </>
            ) : (
              <>
                <Wand2 size={20} />
                Generate My Mockups
              </>
            )}
          </button>

          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", textAlign: "center", marginTop: "16px" }}>
            Free — no obligation. Your designs will arrive by email in under 5 minutes.
          </p>
        </form>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
