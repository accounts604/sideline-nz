// Public client approval page — no login required.
// Reached via /approve/:token (link emailed to client from admin).
// Shows order summary + mockup images + two buttons: Approve / Request Changes.

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Loader2, CheckCircle2, MessageSquareWarning } from "lucide-react";

const NAVY = "#0A1628";
const NAVY_LIGHT = "#122239";
const GOLD = "#C9A84C";

type ApprovalHydrateResponse = {
  order: {
    id: string;
    orderNumber: string | null;
    poReference: string | null;
    accountName: string | null;
    customerName: string | null;
  };
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    size: string | null;
    brandingMethod: string | null;
    gradeGroup: string | null;
  }>;
  mockups: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    mimeType: string | null;
  }>;
  expiresAt: string;
};

export default function ApprovePage() {
  const [, params] = useRoute("/approve/:token");
  const token = params?.token;
  const [decision, setDecision] = useState<"approved" | "changes_requested" | null>(null);
  const [changesNotes, setChangesNotes] = useState("");
  const [submitted, setSubmitted] = useState<"approved" | "changes_requested" | null>(null);

  const { data, isLoading, error } = useQuery<ApprovalHydrateResponse>({
    queryKey: [`/api/approve/${token}`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!token,
    retry: false,
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!decision) throw new Error("Pick a decision first");
      const res = await apiRequest("POST", `/api/approve/${token}`, {
        decision,
        changesNotes: decision === "changes_requested" ? changesNotes : undefined,
      });
      return res.json();
    },
    onSuccess: (res: any) => {
      setSubmitted(res.decision);
    },
  });

  // Loading
  if (isLoading) {
    return (
      <FullPageNavy>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
      </FullPageNavy>
    );
  }

  // Error / expired / already-used / not found
  if (error || !data) {
    return (
      <FullPageNavy>
        <div style={{ textAlign: "center", maxWidth: "500px" }}>
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "32px", letterSpacing: "2px", marginBottom: "12px" }}>
            Link not available
          </h1>
          <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "15px", lineHeight: 1.6 }}>
            This approval link is invalid, expired, or has already been used.
            Contact <a href="mailto:info@sidelinenz.com" style={{ color: GOLD }}>info@sidelinenz.com</a> for a new one.
          </p>
        </div>
      </FullPageNavy>
    );
  }

  // Success — post-submit confirmation
  if (submitted) {
    const approved = submitted === "approved";
    return (
      <FullPageNavy>
        <div style={{ textAlign: "center", maxWidth: "520px" }}>
          {approved ? (
            <CheckCircle2 className="w-16 h-16" style={{ color: GOLD, margin: "0 auto 20px" }} />
          ) : (
            <MessageSquareWarning className="w-16 h-16" style={{ color: GOLD, margin: "0 auto 20px" }} />
          )}
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "36px", letterSpacing: "2px", marginBottom: "12px" }}>
            {approved ? "Mockup approved" : "Changes requested"}
          </h1>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "15px", lineHeight: 1.6 }}>
            {approved
              ? "Thanks — we've let the Sideline team know. They'll follow up with a deposit invoice shortly."
              : "Thanks — the Sideline team has been notified. They'll get back to you with an updated mockup."}
          </p>
        </div>
      </FullPageNavy>
    );
  }

  // Main approval UI
  const { order, items, mockups } = data;

  return (
    <div style={{ minHeight: "100vh", background: NAVY, color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      <header
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "20px 32px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: "18px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "3px",
            fontFamily: "'Bebas Neue', sans-serif",
          }}
        >
          Sideline NZ — Mockup Approval
        </div>
      </header>

      <main style={{ padding: "40px 20px", maxWidth: "900px", margin: "0 auto" }}>
        <h1
          style={{
            fontSize: "clamp(24px, 4vw, 32px)",
            fontFamily: "'Bebas Neue', sans-serif",
            letterSpacing: "1px",
            marginBottom: "4px",
          }}
        >
          {order.poReference || order.accountName || order.orderNumber || "Your order"}
        </h1>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "14px", marginBottom: "32px" }}>
          Review the mockup below and let us know if it's good to go.
        </p>

        {/* Garment summary */}
        <Card title="What you're approving">
          {items.length === 0 && (
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>No line items listed.</p>
          )}
          {items.map((i) => (
            <div
              key={i.id}
              style={{
                borderTop: "1px solid rgba(255,255,255,0.08)",
                padding: "14px 0",
                fontSize: "14px",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontWeight: 500 }}>{i.productName}</div>
                {(i.gradeGroup || i.brandingMethod) && (
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)" }}>
                    {[i.gradeGroup, i.brandingMethod].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <div style={{ color: "rgba(255,255,255,0.75)" }}>Qty: {i.quantity}</div>
            </div>
          ))}
        </Card>

        {/* Mockups */}
        <Card title="Mockup">
          {mockups.length === 0 && (
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>
              No mockup images on this order yet. Something's off — contact info@sidelinenz.com.
            </p>
          )}
          <div style={{ display: "grid", gap: "16px" }}>
            {mockups.map((m) => {
              const isImage = m.mimeType?.startsWith("image/");
              return (
                <div
                  key={m.id}
                  style={{
                    borderRadius: "6px",
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "#000",
                  }}
                >
                  {isImage ? (
                    <img
                      src={m.fileUrl}
                      alt={m.fileName}
                      style={{ width: "100%", height: "auto", display: "block" }}
                    />
                  ) : (
                    <a
                      href={m.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "block",
                        padding: "20px",
                        color: GOLD,
                        textDecoration: "none",
                        fontSize: "14px",
                      }}
                    >
                      Download {m.fileName}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Decision */}
        <Card title="Your decision">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
            <button
              onClick={() => setDecision("approved")}
              style={{
                padding: "18px",
                background: decision === "approved" ? GOLD : "transparent",
                color: decision === "approved" ? NAVY : "#fff",
                border: `1px solid ${GOLD}`,
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "14px",
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Approve design
            </button>
            <button
              onClick={() => setDecision("changes_requested")}
              style={{
                padding: "18px",
                background: decision === "changes_requested" ? GOLD : "transparent",
                color: decision === "changes_requested" ? NAVY : "#fff",
                border: `1px solid ${GOLD}`,
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "14px",
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Request changes
            </button>
          </div>

          {decision === "changes_requested" && (
            <textarea
              placeholder="Tell us what to change..."
              value={changesNotes}
              onChange={(e) => setChangesNotes(e.target.value)}
              rows={4}
              style={{
                width: "100%",
                padding: "14px",
                fontSize: "14px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "6px",
                color: "#fff",
                outline: "none",
                fontFamily: "inherit",
                resize: "vertical",
                marginBottom: "16px",
              }}
            />
          )}

          <button
            onClick={() => submitMut.mutate()}
            disabled={!decision || submitMut.isPending || (decision === "changes_requested" && !changesNotes.trim())}
            style={{
              width: "100%",
              padding: "16px",
              background: !decision || submitMut.isPending || (decision === "changes_requested" && !changesNotes.trim())
                ? "rgba(255,255,255,0.08)"
                : "#fff",
              color: !decision || submitMut.isPending || (decision === "changes_requested" && !changesNotes.trim())
                ? "rgba(255,255,255,0.3)"
                : NAVY,
              border: "none",
              borderRadius: "6px",
              fontWeight: 700,
              fontSize: "14px",
              textTransform: "uppercase",
              letterSpacing: "1px",
              cursor: !decision || submitMut.isPending ? "not-allowed" : "pointer",
            }}
          >
            {submitMut.isPending ? "Submitting…" : "Submit decision"}
          </button>

          {submitMut.isError && (
            <p style={{ color: "#ef4444", fontSize: "13px", marginTop: "12px", textAlign: "center" }}>
              Failed to submit. Try again or email info@sidelinenz.com.
            </p>
          )}
        </Card>
      </main>
    </div>
  );
}

// --- helpers ---

function FullPageNavy({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: NAVY,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {children}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: NAVY_LIGHT,
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "8px",
        padding: "24px",
        marginBottom: "20px",
      }}
    >
      <h2
        style={{
          fontSize: "12px",
          textTransform: "uppercase",
          letterSpacing: "2px",
          color: GOLD,
          marginBottom: "16px",
          fontWeight: 600,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
