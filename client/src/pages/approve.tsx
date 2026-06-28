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
const SIZE_OPTIONS = ["OS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
const brandLabel: React.CSSProperties = { display: "block", fontSize: "12px", color: "rgba(255,255,255,0.55)", marginBottom: "8px" };
const brandInput: React.CSSProperties = { width: "100%", padding: "12px", fontSize: "14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: "#fff", outline: "none" };

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
  const [sizes, setSizes] = useState<Record<string, Record<string, number>>>({});
  const setSize = (itemId: string, size: string, n: number) =>
    setSizes((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] || {}), [size]: Math.max(0, n || 0) } }));

  // Design elements the customer provides in the same step.
  const [colours, setColours] = useState<string[]>(["", "", ""]);
  const [sponsors, setSponsors] = useState("");
  const [logos, setLogos] = useState<{ name: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  async function uploadLogo(file: File) {
    setUploadErr(null);
    if (!/^image\/(png|jpeg|svg\+xml|webp)$|^application\/pdf$/.test(file.type)) { setUploadErr("PNG, JPG, SVG, WEBP or PDF only"); return; }
    setUploading(true);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] || "");
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(file);
      });
      const r = await apiRequest("POST", `/api/approve/${token}/upload`, { filename: file.name, contentType: file.type, dataBase64 });
      const j = await r.json();
      if (j.url) setLogos((p) => [...p, { name: file.name, url: j.url }]);
      else setUploadErr(j.error || "Upload failed");
    } catch (e: any) { setUploadErr(e?.message || "Upload failed"); } finally { setUploading(false); }
  }

  const { data, isLoading, error } = useQuery<ApprovalHydrateResponse>({
    queryKey: [`/api/approve/${token}`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!token,
    retry: false,
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!decision) throw new Error("Pick a decision first");
      const sizesPayload = (data?.items || [])
        .map((i) => ({
          itemId: i.id,
          rows: Object.entries(sizes[i.id] || {})
            .filter(([, q]) => q > 0)
            .map(([size, quantity]) => ({ size, quantity })),
        }))
        .filter((g) => g.rows.length);
      const res = await apiRequest("POST", `/api/approve/${token}`, {
        decision,
        changesNotes: changesNotes.trim() || undefined,
        sizes: sizesPayload,
        colours: colours.map((c) => c.trim()).filter(Boolean),
        sponsors: sponsors.trim() || undefined,
        brandLogoUrls: logos.map((l) => l.url),
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
              ? "Thanks — we've let the Sideline team know. They'll follow up with your invoice shortly."
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
          Sideline NZ — Order Approval &amp; Sizing
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
          Check your mockups, add your sizes, logos, colours and sponsors, then approve to lock it in.
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

        {/* Sizing */}
        <Card title="Your sizes">
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", marginBottom: "16px" }}>
            Enter how many of each size you need per item. Leave a size at 0 if you don't need it.
          </p>
          {items.map((i) => {
            const itemSizes = sizes[i.id] || {};
            const assigned = Object.values(itemSizes).reduce((a, b) => a + (b || 0), 0);
            return (
              <div key={i.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "16px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ fontWeight: 500, fontSize: "14px" }}>{i.productName}</div>
                  <div style={{ fontSize: "13px", color: assigned === i.quantity ? "#4ade80" : "rgba(255,255,255,0.6)" }}>
                    {assigned} / {i.quantity}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))", gap: "8px" }}>
                  {SIZE_OPTIONS.map((sz) => (
                    <div key={sz} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", marginBottom: "4px" }}>{sz}</div>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={itemSizes[sz] || ""}
                        onChange={(e) => setSize(i.id, sz, parseInt(e.target.value, 10) || 0)}
                        style={{ width: "100%", padding: "8px 4px", textAlign: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: "#fff", outline: "none", fontSize: "14px" }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </Card>

        {/* Brand elements */}
        <Card title="Your brand elements">
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", marginBottom: "16px" }}>
            Send us your logos, colours and sponsors so we can lock the artwork, all in one go.
          </p>

          <label style={brandLabel}>Logos / design files</label>
          <label style={{ display: "block", border: "1.5px dashed rgba(255,255,255,0.25)", borderRadius: "6px", padding: "16px", textAlign: "center", cursor: uploading ? "wait" : "pointer", fontSize: "13px", color: "rgba(255,255,255,0.65)", marginBottom: "10px" }}>
            {uploading ? "Uploading…" : "Tap to upload a logo (PNG, SVG, PDF…)"}
            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,application/pdf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.currentTarget.value = ""; }} />
          </label>
          {uploadErr && <div style={{ color: "#ef4444", fontSize: "12px", marginBottom: "8px" }}>{uploadErr}</div>}
          {logos.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "18px" }}>
              {logos.map((l, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(255,255,255,0.06)", padding: "6px 10px", borderRadius: "6px", fontSize: "12px" }}>
                  <span style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                  <button onClick={() => setLogos((p) => p.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: "#fca5a5", cursor: "pointer", fontSize: "15px", lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          )}

          <label style={brandLabel}>Team colours</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "18px" }}>
            {["Primary", "Secondary", "Accent"].map((ph, i) => (
              <input key={i} value={colours[i] || ""} onChange={(e) => setColours((p) => { const n = [...p]; n[i] = e.target.value; return n; })} placeholder={ph} style={brandInput} />
            ))}
          </div>

          <label style={brandLabel}>Sponsors + placement</label>
          <textarea value={sponsors} onChange={(e) => setSponsors(e.target.value)} rows={3} placeholder="e.g. Main sponsor: ACME (front centre); left sleeve: XYZ" style={{ ...brandInput, resize: "vertical", fontFamily: "inherit" }} />
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

          <label style={{ display: "block", fontSize: "12px", color: "rgba(255,255,255,0.55)", marginBottom: "8px" }}>
            Comments, requests or notes (optional)
          </label>
          <textarea
            placeholder={decision === "changes_requested" ? "Tell us what to change..." : "Anything you'd like us to know? (optional)"}
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
