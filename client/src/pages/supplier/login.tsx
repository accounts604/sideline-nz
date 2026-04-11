// Supplier login page — scoped to /supplier/login.
// Navy + gold theme (the portal theme). Hits the same /api/auth/login endpoint
// as the marketing login but looks different and never links to /register.
// Suppliers bookmark THIS url, not /login.

import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Loader2, ArrowRight } from "lucide-react";

const NAVY = "#0A1628";
const GOLD = "#C9A84C";

export default function SupplierLoginPage() {
  const { login, user } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // If already logged in, route based on role
  if (user) {
    navigate(
      user.role === "supplier" ? "/supplier" : user.role === "admin" ? "/admin" : "/portal",
    );
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.role !== "supplier") {
        setError("This login is for suppliers only. Please use the main login.");
        setSubmitting(false);
        return;
      }
      navigate("/supplier");
    } catch (err: any) {
      const msg = err.message || "Login failed";
      try {
        const parsed = JSON.parse(msg.split(": ").slice(1).join(": "));
        setError(parsed.error || msg);
      } catch {
        setError(msg.includes("401") ? "Invalid email or password" : "Login failed. Please try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: NAVY,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "400px", textAlign: "center" }}>
        <div
          style={{
            fontSize: "clamp(22px, 4vw, 28px)",
            fontWeight: 700,
            color: "#fff",
            textTransform: "uppercase",
            letterSpacing: "3px",
            fontFamily: "'Bebas Neue', sans-serif",
            marginBottom: "4px",
          }}
        >
          Sideline — Supplier Portal
        </div>
        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.6)", marginBottom: "32px" }}>
          Sign in to view your assigned orders
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              style={{
                width: "100%",
                padding: "14px 16px",
                fontSize: "15px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "6px",
                color: "#fff",
                outline: "none",
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "14px 16px",
                fontSize: "15px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "6px",
                color: "#fff",
                outline: "none",
              }}
            />
          </div>

          {error && (
            <p style={{ fontSize: "13px", color: "#ef4444", marginBottom: "16px" }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              background: submitting ? "rgba(201,168,76,0.5)" : GOLD,
              color: NAVY,
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: 600,
              letterSpacing: "0.5px",
              padding: "16px 32px",
              cursor: submitting ? "not-allowed" : "pointer",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Sign In
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", marginTop: "28px" }}>
          Haven't received an invite? Contact info@sidelinenz.com
        </p>
      </div>
    </div>
  );
}
