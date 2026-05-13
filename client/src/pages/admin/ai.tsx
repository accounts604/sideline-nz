// Admin AI worker — operator console.
//
// Phase 1: paste an asset URL + optional context → get the canonical name
// back. Below the form: live feed of recent AI calls (integration_events
// filtered system=ai) with timestamps, provider, status, and output.
//
// As phases 2-4 ship, add more tiles below the name-asset card —
// match-logo-placement, draft-po-from-orders, reconcile-po.

import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { apiRequest } from "@/lib/queryClient";
import { Wand2, CheckCircle2, XCircle, Copy, ImageIcon, Upload, X } from "lucide-react";

// Read a File into a base64 string (no data: prefix).
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:<mime>;base64,<payload>"
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

type NameAssetResponse = {
  canonicalName: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
};

type IntegrationEvent = {
  id: string;
  createdAt: string;
  system: string;
  action: string;
  status: "success" | "failed";
  orderId: string | null;
  durationMs: number | null;
  error: string | null;
  meta: Record<string, any> | null;
};

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function confidenceColor(c: NameAssetResponse["confidence"]) {
  if (c === "high") return "#22c55e";
  if (c === "medium") return "#C9A84C";
  return "#ef4444";
}

type LookupsResponse = {
  clubs: { id: string; name: string; tag: string | null }[];
  products: { id: string; name: string; category: string }[];
};

const OTHER = "__other__";

function NameAssetCard() {
  const [assetUrl, setAssetUrl] = useState("");
  const [orderId, setOrderId] = useState("");
  const [clubAccountId, setClubAccountId] = useState("");        // selected club id, or OTHER, or ""
  const [clubNameOverride, setClubNameOverride] = useState("");  // free-text when OTHER
  const [productHintSel, setProductHintSel] = useState("");      // selected product name, or OTHER, or ""
  const [productHintFree, setProductHintFree] = useState("");    // free-text when OTHER
  const [side, setSide] = useState<"" | "front" | "back">("");
  const [result, setResult] = useState<NameAssetResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [zoneFocused, setZoneFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lookups = useQuery<LookupsResponse>({
    queryKey: ["/api/admin/ai/lookups"],
    staleTime: 5 * 60_000, // 5 min — these change rarely
  });

  async function uploadFile(file: File) {
    setUploadError("");
    setUploading(true);
    try {
      const dataBase64 = await fileToBase64(file);
      const r = await apiRequest("POST", "/api/uploads/blob", {
        filename: file.name,
        contentType: file.type || "image/png",
        dataBase64,
      });
      const j = await r.json();
      if (!j?.url) throw new Error(j?.error || "Upload returned no url");
      setAssetUrl(j.url);
      setResult(null);
    } catch (e: any) {
      setUploadError(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleClipboardRead() {
    setUploadError("");
    if (!navigator.clipboard?.read) {
      setUploadError("Clipboard access not available in this browser");
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          const ext = type.split("/")[1] || "png";
          await uploadFile(new File([blob], `pasted-${Date.now()}.${ext}`, { type }));
          return;
        }
      }
      // Fallback — clipboard had a URL (Telegram macOS "Copy" puts URLs, not bitmaps)
      const text = await navigator.clipboard.readText();
      const trimmed = text?.trim();
      if (trimmed && /^https?:\/\//i.test(trimmed)) {
        setUploading(true);
        try {
          const r = await apiRequest("POST", "/api/uploads/from-url", { url: trimmed });
          const j = await r.json();
          if (j?.url) { setAssetUrl(j.url); setResult(null); }
          else setUploadError(j?.error || "Upload from URL failed");
        } finally { setUploading(false); }
        return;
      }
      setUploadError("No image on clipboard. On Telegram: right-click → Copy Image (not 'Copy').");
    } catch (e: any) {
      setUploadError(e?.message || "Clipboard read failed");
    }
  }

  const productHint =
    productHintSel === OTHER ? productHintFree.trim() : productHintSel.trim();
  const clubNameFinal =
    clubAccountId === OTHER ? clubNameOverride.trim() : "";
  const clubAccountIdFinal =
    clubAccountId && clubAccountId !== OTHER ? clubAccountId : "";

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        assetUrl,
        context: {
          ...(orderId ? { orderId } : {}),
          ...(clubAccountIdFinal ? { clubAccountId: clubAccountIdFinal } : {}),
          ...(clubNameFinal ? { clubName: clubNameFinal } : {}),
          ...(productHint ? { productHint } : {}),
          ...(side ? { side } : {}),
        },
      };
      const r = await apiRequest("POST", "/api/admin/ai/name-asset", body);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      return j as NameAssetResponse;
    },
    onSuccess: (r) => setResult(r),
  });

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <Wand2 size={16} color="#C9A84C" />
        <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", margin: 0 }}>Name an asset</h2>
      </div>
      <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)", marginTop: 0, marginBottom: "16px" }}>
        Paste an image URL (Vercel Blob, Shopify CDN, Drive — any public link). Returns the canonical
        name <code style={{ fontSize: "11px" }}>&lt;year&gt; &lt;club&gt; &lt;product&gt; [- &lt;side&gt;]</code>.
      </p>

      <div style={{ display: "grid", gap: "10px", marginBottom: "12px" }}>
        {/* Drop / paste / click upload zone */}
        <div
          tabIndex={0}
          onFocus={() => setZoneFocused(true)}
          onBlur={() => setZoneFocused(false)}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) void uploadFile(f);
          }}
          onPaste={(e) => {
            if (!e.clipboardData) return;
            for (const item of Array.from(e.clipboardData.items)) {
              if (item.type.startsWith("image/")) {
                const f = item.getAsFile();
                if (f) { e.preventDefault(); void uploadFile(f); return; }
              }
            }
            const f = e.clipboardData.files[0];
            if (f && f.type.startsWith("image/")) { e.preventDefault(); void uploadFile(f); }
          }}
          style={{
            border: `1px dashed ${uploadError ? "rgba(239,68,68,0.45)" : dragOver || zoneFocused ? "rgba(201,168,76,0.5)" : "rgba(255,255,255,0.18)"}`,
            borderRadius: "8px",
            padding: "20px",
            minHeight: assetUrl ? "auto" : "140px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            background: uploading ? "rgba(201,168,76,0.06)" : dragOver ? "rgba(201,168,76,0.05)" : "rgba(255,255,255,0.02)",
            outline: "none",
            position: "relative",
            transition: "all 0.15s",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f); if (fileInputRef.current) fileInputRef.current.value = ""; }}
          />
          {uploading ? (
            <span style={{ fontSize: "12px", color: "#C9A84C" }}>Uploading…</span>
          ) : assetUrl ? (
            <div style={{ position: "relative", width: "100%", display: "flex", alignItems: "center", gap: "12px" }}>
              <img src={assetUrl} alt="asset" style={{ maxHeight: "120px", maxWidth: "180px", objectFit: "contain", borderRadius: "4px", background: "rgba(255,255,255,0.04)", padding: "4px" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: 0, textTransform: "uppercase", letterSpacing: "0.4px" }}>Asset ready</p>
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", margin: "4px 0 0", wordBreak: "break-all", fontFamily: "monospace" }}>{assetUrl.length > 60 ? assetUrl.slice(0, 60) + "…" : assetUrl}</p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setAssetUrl(""); setResult(null); setUploadError(""); }}
                title="Clear"
                style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)", borderRadius: "4px", padding: "4px", cursor: "pointer", display: "flex", alignItems: "center" }}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
              <Upload size={20} style={{ marginBottom: "6px" }} />
              <p style={{ fontSize: "13px", margin: 0, color: "rgba(255,255,255,0.7)" }}>Drop an image, click to pick, or {zoneFocused ? <strong style={{ color: "#C9A84C" }}>paste (⌘V)</strong> : "focus + ⌘V"}</p>
              <p style={{ fontSize: "11px", margin: "4px 0 0", color: "rgba(255,255,255,0.35)" }}>or paste a URL below</p>
            </div>
          )}
        </div>
        {!uploading && !assetUrl && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void handleClipboardRead(); }}
            title="Paste an image from clipboard"
            style={{ padding: "6px 10px", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px", background: "rgba(201,168,76,0.08)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.25)", borderRadius: "4px", cursor: "pointer" }}
          >
            📋 Paste from clipboard
          </button>
        )}
        {uploadError && <p style={{ fontSize: "11px", color: "#ef4444", margin: "0" }}>{uploadError}</p>}

        <input
          type="url"
          placeholder="Or paste an asset URL (https://…)"
          value={assetUrl}
          onChange={(e) => setAssetUrl(e.target.value)}
          style={inputStyle}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <input type="text" placeholder="Order ID (optional)" value={orderId} onChange={(e) => setOrderId(e.target.value)} style={inputStyle} />
          <select value={clubAccountId} onChange={(e) => setClubAccountId(e.target.value)} style={inputStyle}>
            <option value="">Club (optional) — pick one</option>
            {(lookups.data?.clubs ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.tag ? ` (${c.tag})` : ""}</option>
            ))}
            <option value={OTHER}>+ Other (type below)</option>
          </select>
        </div>
        {clubAccountId === OTHER && (
          <input
            type="text"
            placeholder="New club name (will be used as-is in the canonical name)"
            value={clubNameOverride}
            onChange={(e) => setClubNameOverride(e.target.value)}
            style={inputStyle}
            autoFocus
          />
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <select value={productHintSel} onChange={(e) => setProductHintSel(e.target.value)} style={inputStyle}>
            <option value="">Product hint (optional) — pick one</option>
            {(lookups.data?.products ?? []).map((p) => (
              <option key={p.id} value={p.name}>{p.name}{p.category ? ` — ${p.category}` : ""}</option>
            ))}
            <option value={OTHER}>+ Other (type below)</option>
          </select>
          <select value={side} onChange={(e) => setSide(e.target.value as any)} style={inputStyle}>
            <option value="">Side (optional)</option>
            <option value="front">Front</option>
            <option value="back">Back</option>
          </select>
        </div>
        {productHintSel === OTHER && (
          <input
            type="text"
            placeholder="Product name (e.g. windbreaker jacket)"
            value={productHintFree}
            onChange={(e) => setProductHintFree(e.target.value)}
            style={inputStyle}
            autoFocus
          />
        )}
      </div>

      <button
        type="button"
        onClick={() => { setResult(null); setCopied(false); mutation.mutate(); }}
        disabled={!assetUrl || mutation.isPending}
        style={{
          padding: "10px 16px",
          background: !assetUrl || mutation.isPending ? "rgba(201,168,76,0.2)" : "#C9A84C",
          color: !assetUrl || mutation.isPending ? "rgba(255,255,255,0.4)" : "#0a0a0a",
          border: "none",
          borderRadius: "6px",
          fontSize: "13px",
          fontWeight: 600,
          cursor: !assetUrl || mutation.isPending ? "not-allowed" : "pointer",
          letterSpacing: "0.3px",
        }}
      >
        {mutation.isPending ? "Thinking…" : "Suggest canonical name"}
      </button>

      {mutation.isError && (
        <div style={{ marginTop: "12px", padding: "10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "6px" }}>
          <p style={{ fontSize: "12px", color: "#ef4444", margin: 0 }}>
            {(mutation.error as any)?.message || "Request failed"}
          </p>
        </div>
      )}

      {result && (
        <div style={{ marginTop: "16px", padding: "14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.5px", color: confidenceColor(result.confidence), fontWeight: 700 }}>
              {result.confidence} confidence
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <code style={{ fontSize: "14px", color: "#fff", fontWeight: 600, flex: 1, wordBreak: "break-all" }}>{result.canonicalName}</code>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(result.canonicalName); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              title="Copy to clipboard"
              style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.6)", borderRadius: "4px", padding: "4px 8px", cursor: "pointer", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}
            >
              <Copy size={12} /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginTop: "8px", marginBottom: 0 }}>{result.reasoning}</p>
        </div>
      )}
    </div>
  );
}

function ActivityFeed() {
  const { data, isLoading } = useQuery<{ events: IntegrationEvent[] }>({
    queryKey: ["/api/admin/integration-events?system=ai&limit=50"],
    refetchInterval: 30_000,
  });

  const events = data?.events || [];

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", margin: 0, marginBottom: "12px" }}>Recent AI calls</h2>
      {isLoading && <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Loading…</p>}
      {!isLoading && events.length === 0 && (
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", margin: 0 }}>No AI activity yet. Try the form above.</p>
      )}
      {events.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {events.map((e) => (
            <div key={e.id} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "6px", fontSize: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#fff", fontWeight: 600 }}>
                  {e.status === "success" ? <CheckCircle2 size={14} color="#22c55e" /> : <XCircle size={14} color="#ef4444" />}
                  <span>{e.action}</span>
                  <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>
                    {e.meta?.provider || "?"} · {e.meta?.model || ""} · {e.durationMs ?? "?"}ms
                  </span>
                </div>
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>{relativeTime(e.createdAt)}</span>
              </div>
              {e.status === "failed" && e.error && (
                <p style={{ fontSize: "11px", color: "#ef4444", margin: "6px 0 0", fontFamily: "monospace" }}>{e.error}</p>
              )}
              {e.orderId && (
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: "4px 0 0" }}>
                  order: <a href={`/admin/orders/${e.orderId}`} style={{ color: "#C9A84C", textDecoration: "none" }}>{e.orderId}</a>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminAi() {
  return (
    <AdminLayout>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "10px", margin: 0 }}>
          <ImageIcon size={20} /> AI Worker
        </h1>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", marginTop: "4px", marginBottom: 0 }}>
          In-app worker that handles the judgment calls Ezra used to misfire on. Phase 1: image naming.
        </p>
      </div>
      <div style={{ display: "grid", gap: "20px", gridTemplateColumns: "1fr", maxWidth: "920px" }}>
        <NameAssetCard />
        <ActivityFeed />
      </div>
    </AdminLayout>
  );
}

const cardStyle: React.CSSProperties = {
  padding: "20px",
  background: "#111",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "10px",
};

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "13px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};
