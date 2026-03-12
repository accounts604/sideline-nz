import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRight } from "lucide-react";

export default function AcceptInvitePage() {
  const { acceptInvite, user } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    navigate(user.role === "admin" ? "/admin" : "/portal");
    return null;
  }

  if (!token) {
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
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "16px", marginBottom: "16px" }}>
            Invalid or missing invite link.
          </p>
          <Link href="/login">
            <span style={{ color: "#fff", textDecoration: "underline", cursor: "pointer" }}>
              Go to login
            </span>
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);

    try {
      const result = await acceptInvite(token, password);
      navigate(result.role === "admin" ? "/admin" : "/portal");
    } catch (err: any) {
      const msg = err.message || "Failed to accept invite";
      try {
        const parsed = JSON.parse(msg.split(": ").slice(1).join(": "));
        setError(parsed.error || msg);
      } catch {
        setError("Failed to accept invite. The link may have expired.");
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
          Set your password to activate your account
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
            <input
              type="password"
              placeholder="New password (min 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
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
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
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
                Activate Account
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
