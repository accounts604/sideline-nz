import { useState, useEffect } from "react";
import { Loader2, ShoppingBag, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const GATE_KEY = "sideline_store_unlocked";

export function isStoreUnlocked(): boolean {
  try {
    return localStorage.getItem(GATE_KEY) === "1";
  } catch {
    return false;
  }
}

function unlockStore() {
  try {
    localStorage.setItem(GATE_KEY, "1");
  } catch {
    // localStorage unavailable — gate won't persist but user can still proceed
  }
}

interface StoreGateProps {
  children: React.ReactNode;
  storeName?: string;
}

export function StoreGate({ children, storeName }: StoreGateProps) {
  const [unlocked, setUnlocked] = useState(() => isStoreUnlocked());

  if (unlocked) {
    return <>{children}</>;
  }

  return (
    <StoreGateOverlay
      storeName={storeName}
      onUnlock={() => {
        unlockStore();
        setUnlocked(true);
      }}
    />
  );
}

function StoreGateOverlay({
  storeName,
  onUnlock,
}: {
  storeName?: string;
  onUnlock: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [organization, setOrganization] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Prevent body scroll while gate is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/ghl/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          enquiry_type: "team-store-gate",
          message: organization.trim()
            ? `Organization: ${organization.trim()}`
            : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong");
      }

      onUnlock();
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
          textAlign: "center",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
          }}
        >
          <ShoppingBag size={24} style={{ color: "#fff" }} />
        </div>

        {/* Heading */}
        <h2
          style={{
            fontSize: "clamp(22px, 5vw, 28px)",
            fontWeight: 700,
            color: "#fff",
            textTransform: "uppercase",
            letterSpacing: "1px",
            margin: "0 0 8px",
            fontFamily: "'Bebas Neue', sans-serif",
          }}
        >
          {storeName ? `${storeName}` : "Team Store Access"}
        </h2>
        <p
          style={{
            fontSize: "14px",
            color: "rgba(255,255,255,0.5)",
            margin: "0 0 32px",
            lineHeight: 1.5,
          }}
        >
          Enter your details to browse pricing and place orders.
          <br />
          Takes 10 seconds — no spam, ever.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
            <input
              type="text"
              placeholder="Your name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
              data-testid="gate-input-name"
            />
            <input
              type="email"
              placeholder="Email address *"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              data-testid="gate-input-email"
            />
            <input
              type="tel"
              placeholder="Phone number *"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
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
              data-testid="gate-input-phone"
            />
            <input
              type="text"
              placeholder="Club / school name (optional)"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
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
              data-testid="gate-input-org"
            />
          </div>

          {error && (
            <p style={{ fontSize: "13px", color: "#ef4444", marginBottom: "16px" }}>{error}</p>
          )}

          <Button
            type="submit"
            disabled={submitting}
            data-testid="gate-submit"
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
                Browse Store
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        <p
          style={{
            fontSize: "12px",
            color: "rgba(255,255,255,0.25)",
            marginTop: "20px",
          }}
        >
          Your details are shared with Sideline NZ only.
        </p>
      </div>
    </div>
  );
}
