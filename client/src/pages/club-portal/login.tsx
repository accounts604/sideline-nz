import { useState } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { SidelineLogo } from "@/components/sideline-logo";
import { ArrowRight } from "lucide-react";

export default function ClubPortalLogin() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await apiRequest("POST", "/api/club-portal/login", { email, password });
      if (res.ok) {
        navigate("/club-portal/dashboard");
      } else {
        const data = await res.json();
        setError(data.error || "Invalid email or password");
      }
    } catch (err) {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: "#000",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          background: "#111",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "6px",
          padding: "32px 24px",
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: "32px", display: "flex", justifyContent: "center" }}>
          <div style={{ width: "120px" }}>
            <SidelineLogo />
          </div>
        </div>

        {/* Tagline */}
        <h1
          style={{
            fontSize: "16px",
            fontWeight: 700,
            textAlign: "center",
            color: "#fff",
            marginBottom: "8px",
            fontFamily: "var(--font-heading, monospace)",
            letterSpacing: "1px",
            textTransform: "uppercase",
          }}
        >
          Your Club Hub
        </h1>
        <p
          style={{
            fontSize: "13px",
            textAlign: "center",
            color: "rgba(255,255,255,0.6)",
            marginBottom: "32px",
          }}
        >
          Track your kit from mockup to delivery
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Email */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 500,
                color: "#fff",
                marginBottom: "6px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "#000",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "6px",
                color: "#fff",
                fontSize: "13px",
                fontFamily: "inherit",
              }}
              onFocus={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.3)")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.12)")}
              placeholder="your@email.com"
            />
          </div>

          {/* Password */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 500,
                color: "#fff",
                marginBottom: "6px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "#000",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "6px",
                color: "#fff",
                fontSize: "13px",
                fontFamily: "inherit",
              }}
              onFocus={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.3)")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.12)")}
              placeholder="••••••••"
            />
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                padding: "10px 12px",
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: "4px",
                fontSize: "12px",
                color: "#ef4444",
              }}
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "10px 16px",
              background: loading ? "rgba(255,255,255,0.1)" : "#fff",
              color: loading ? "rgba(255,255,255,0.3)" : "#000",
              border: "none",
              borderRadius: "4px",
              fontSize: "13px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              marginTop: "8px",
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.background = "rgba(255,255,255,0.9)";
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.background = "#fff";
              }
            }}
          >
            {loading ? "Signing in..." : "Sign in to your club hub"}
            {!loading && <ArrowRight size={14} />}
          </button>
        </form>

        {/* Footer */}
        <div
          style={{
            marginTop: "24px",
            paddingTop: "24px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: "8px" }}>
            Need access?
          </p>
          <a
            href="mailto:info@sidelinenz.com"
            style={{
              fontSize: "12px",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 500,
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#fff")}
          >
            Email info@sidelinenz.com
          </a>
        </div>
      </div>
    </div>
  );
}
