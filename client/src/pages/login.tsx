import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const { login, user } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Redirect if already logged in
  if (user) {
    navigate(user.role === "admin" ? "/admin" : "/portal");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const result = await login(email, password);
      navigate(result.role === "admin" ? "/admin" : "/portal");
    } catch (err: any) {
      const msg = err.message || "Login failed";
      // Extract JSON error if present
      try {
        const parsed = JSON.parse(msg.split(": ").slice(1).join(": "));
        setError(parsed.error || msg);
      } catch {
        setError(msg.includes("401") ? "Invalid email or password" : "Login failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "400px", textAlign: "center" }}>
        <Link href="/">
          <span
            style={{
              fontSize: "clamp(24px, 5vw, 32px)",
              fontWeight: 700,
              color: "#fff",
              textTransform: "uppercase",
              letterSpacing: "2px",
              fontFamily: "'Bebas Neue', sans-serif",
              cursor: "pointer",
              display: "inline-block",
              marginBottom: "8px",
            }}
          >
            Sideline
          </span>
        </Link>
        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", marginBottom: "32px" }}>
          Sign in to your account
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
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
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
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "6px",
                color: "#fff",
                outline: "none",
              }}
            />
          </div>

          {error && (
            <p style={{ fontSize: "13px", color: "#ef4444", marginBottom: "16px" }}>{error}</p>
          )}

          <Button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              background: "#fff",
              color: "#000",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: 600,
              letterSpacing: "0.5px",
              padding: "16px 32px",
              height: "auto",
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Sign In
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", marginTop: "24px" }}>
          Don't have an account?{" "}
          <Link href="/register">
            <span style={{ color: "#fff", cursor: "pointer", textDecoration: "underline" }}>
              Create one
            </span>
          </Link>
        </p>
      </div>
    </div>
  );
}
