import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { apiRequest } from "@/lib/queryClient";

// Drag-and-drop logo upload — the bottleneck-killer. Drop a PNG/JPG/SVG/WEBP,
// it goes straight to blob storage and becomes the club's primary logo. No
// Canva URL, no page numbers, no preview-URL hunting.
function LogoDropZone({ clubId, onDone, compact, kind = "primary" }: { clubId: string; onDone: () => void; compact?: boolean; kind?: "primary" | "secondary" | "sponsor" }) {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setErr(null);
    if (!/^image\/(png|jpeg|svg\+xml|webp|gif)$/.test(file.type)) {
      setErr("PNG, JPG, SVG or WEBP only");
      return;
    }
    setBusy(true);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] || "");
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(file);
      });
      const up = await apiRequest("POST", "/api/uploads/blob", { filename: file.name, contentType: file.type, dataBase64 });
      const { url } = await up.json();
      await apiRequest("POST", `/api/admin/clubs/${clubId}/logos`, { imageUrl: url, kind, displayLabel: file.name.replace(/\.[^.]+$/, "") });
      onDone();
    } catch (e: any) {
      setErr(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
        style={{
          border: `1.5px dashed ${over ? "#93c5fd" : "rgba(255,255,255,0.22)"}`,
          background: over ? "rgba(147,197,253,0.08)" : "rgba(255,255,255,0.02)",
          borderRadius: 6, padding: compact ? "8px 12px" : "16px 14px",
          textAlign: "center", cursor: busy ? "wait" : "pointer",
          fontSize: compact ? 11 : 12, color: "rgba(255,255,255,0.6)", transition: "all .12s",
        }}
      >
        {busy ? "Uploading…" : (<><b style={{ color: "#93c5fd" }}>Drop logo</b>{compact ? "" : " here"} or click to browse</>)}
      </div>
      <input
        ref={inputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      {err && <div style={{ color: "#fca5a5", fontSize: 10, marginTop: 4 }}>{err}</div>}
    </div>
  );
}

interface ClubRow {
  id: string;
  clubName: string;
  shopifyOrderTag: string | null;
}

interface LogoRow {
  id: string;
  kind: "primary" | "secondary" | "sponsor";
  displayLabel: string | null;
  canvaDesignId: string;
  canvaPageIndex: number | null;
  previewUrl: string | null;
  lastSyncedAt: string | null;
}

interface ClubLogosResponse {
  ok: boolean;
  club: { id: string; clubName: string };
  logos: LogoRow[];
}

function canvaUrlOf(designId: string, pageIndex: number | null): string {
  const base = `https://www.canva.com/design/${designId}/edit`;
  return pageIndex && pageIndex > 1 ? `${base}?page=${pageIndex}` : base;
}

function ClubRowEditor({ club, isMissing }: { club: ClubRow; isMissing: boolean }) {
  const qc = useQueryClient();
  const onLogoChanged = () => {
    qc.invalidateQueries({ queryKey: [`/api/admin/clubs/${club.id}/logos`] });
    qc.invalidateQueries({ queryKey: ["/api/admin/clubs-missing-logos"] });
  };
  const [expanded, setExpanded] = useState(false);
  const [canvaUrl, setCanvaUrl] = useState("");
  const [pageIndex, setPageIndex] = useState<string>("");
  const [label, setLabel] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dropKind, setDropKind] = useState<"primary" | "secondary" | "sponsor">("primary");

  const { data, isLoading } = useQuery<ClubLogosResponse>({
    queryKey: [`/api/admin/clubs/${club.id}/logos`],
    enabled: expanded,
  });

  const renameLogo = useMutation({
    mutationFn: async ({ logoId, displayLabel }: { logoId: string; displayLabel: string }) => {
      const r = await apiRequest("PATCH", `/api/admin/clubs/${club.id}/logos/${logoId}`, { displayLabel });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/admin/clubs/${club.id}/logos`] }),
  });

  const addLogo = useMutation({
    mutationFn: async () => {
      setError(null);
      const body: any = { canvaUrl, kind: dropKind };
      if (pageIndex.trim()) body.canvaPageIndex = parseInt(pageIndex.trim(), 10);
      if (label.trim()) body.displayLabel = label.trim();
      if (previewUrl.trim()) body.previewUrl = previewUrl.trim();
      const r = await apiRequest("POST", `/api/admin/clubs/${club.id}/logos`, body);
      return r.json();
    },
    onSuccess: () => {
      setCanvaUrl(""); setPageIndex(""); setLabel(""); setPreviewUrl("");
      qc.invalidateQueries({ queryKey: [`/api/admin/clubs/${club.id}/logos`] });
      qc.invalidateQueries({ queryKey: ["/api/admin/clubs-missing-logos"] });
    },
    onError: (e: any) => setError(e?.message || "Add failed"),
  });

  const setPrimary = useMutation({
    mutationFn: async (logoId: string) => {
      const r = await apiRequest("PATCH", `/api/admin/clubs/${club.id}/logos/${logoId}`, { kind: "primary" });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/admin/clubs/${club.id}/logos`] });
      qc.invalidateQueries({ queryKey: ["/api/admin/clubs-missing-logos"] });
    },
  });

  const deleteLogo = useMutation({
    mutationFn: async (logoId: string) => {
      const r = await apiRequest("DELETE", `/api/admin/clubs/${club.id}/logos/${logoId}`, undefined);
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/admin/clubs/${club.id}/logos`] });
      qc.invalidateQueries({ queryKey: ["/api/admin/clubs-missing-logos"] });
    },
  });

  const primary = data?.logos.find((l) => l.kind === "primary") || null;

  return (
    <>
      <tr style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <td style={tdStyle}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{club.clubName}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{club.shopifyOrderTag || "—"}</div>
        </td>
        <td style={tdStyle}>
          {primary ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {primary.previewUrl ? (
                <img src={primary.previewUrl} alt="" style={{ width: 36, height: 36, objectFit: "contain", background: "#fff", padding: 2, borderRadius: 4 }} />
              ) : (
                <div style={{ width: 36, height: 36, background: "rgba(255,255,255,0.05)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                  no img
                </div>
              )}
              <div style={{ fontSize: 12 }}>
                <a href={canvaUrlOf(primary.canvaDesignId, primary.canvaPageIndex)} target="_blank" rel="noreferrer" style={{ color: "#93c5fd" }}>
                  {primary.displayLabel || primary.canvaDesignId}
                </a>
                {primary.canvaPageIndex ? <span style={{ color: "rgba(255,255,255,0.4)" }}> · p.{primary.canvaPageIndex}</span> : null}
              </div>
            </div>
          ) : isMissing ? (
            <div style={{ maxWidth: 280 }}>
              <LogoDropZone clubId={club.id} compact onDone={onLogoChanged} />
            </div>
          ) : (
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>✓ logo on file</span>
          )}
        </td>
        <td style={{ ...tdStyle, textAlign: "right" }}>
          <button
            onClick={() => setExpanded((s) => !s)}
            style={{ padding: "4px 10px", fontSize: 11, background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4, cursor: "pointer" }}
          >
            {expanded ? "Close" : "Manage"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={3} style={{ padding: "12px 16px 20px", background: "rgba(255,255,255,0.02)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Add a logo</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  {(["primary", "secondary", "sponsor"] as const).map((k) => (
                    <button key={k} onClick={() => setDropKind(k)} style={{ ...(dropKind === k ? btnPrimary : btnGhost), textTransform: "capitalize", flex: 1 }}>{k}</button>
                  ))}
                </div>
                <LogoDropZone clubId={club.id} kind={dropKind} onDone={onLogoChanged} />
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textAlign: "center", margin: "10px 0 8px" }}>— or paste a Canva URL —</div>
                <input value={canvaUrl} onChange={(e) => setCanvaUrl(e.target.value)} placeholder="Canva URL — https://www.canva.com/design/…" style={inputStyle} />
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <input value={pageIndex} onChange={(e) => setPageIndex(e.target.value)} placeholder="Page # (multi-page decks only)" style={{ ...inputStyle, width: 200 }} />
                  <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Display label (optional)" style={inputStyle} />
                </div>
                <input value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} placeholder="Preview image URL (optional — Canva CDN thumb)" style={{ ...inputStyle, marginTop: 6 }} />
                <button
                  disabled={!canvaUrl.trim() || addLogo.isPending}
                  onClick={() => addLogo.mutate()}
                  style={{ ...btnPrimary, marginTop: 10, opacity: (!canvaUrl.trim() || addLogo.isPending) ? 0.5 : 1 }}
                >
                  {addLogo.isPending ? "Saving…" : `Add Canva logo as ${dropKind}`}
                </button>
                {error && <div style={{ color: "#fca5a5", fontSize: 11, marginTop: 6 }}>{error}</div>}
              </div>
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>All assets{data ? ` (${data.logos.length})` : ""} — rename inline</div>
                {isLoading && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Loading…</div>}
                {data && data.logos.length === 0 && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>No logos assigned yet.</div>
                )}
                {data && data.logos.map((l) => (
                  <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    {l.previewUrl ? (
                      <img src={l.previewUrl} alt="" style={{ width: 32, height: 32, objectFit: "contain", background: "#fff", padding: 2, borderRadius: 3 }} />
                    ) : (
                      <div style={{ width: 32, height: 32, background: "rgba(255,255,255,0.04)", borderRadius: 3 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input
                        defaultValue={l.displayLabel || ""}
                        placeholder="Name this asset…"
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== (l.displayLabel || "")) renameLogo.mutate({ logoId: l.id, displayLabel: v }); }}
                        style={{ ...inputStyle, padding: "4px 8px", fontSize: 12 }}
                      />
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
                        <span style={{ textTransform: "capitalize" }}>{l.kind}</span>
                        {l.canvaDesignId.startsWith("upload:")
                          ? " · uploaded file"
                          : <> · <a href={canvaUrlOf(l.canvaDesignId, l.canvaPageIndex)} target="_blank" rel="noreferrer" style={{ color: "#93c5fd" }}>open in Canva</a>{l.canvaPageIndex ? ` · p.${l.canvaPageIndex}` : ""}</>}
                      </div>
                    </div>
                    {l.kind !== "primary" && (
                      <button onClick={() => setPrimary.mutate(l.id)} style={btnGhost}>Make primary</button>
                    )}
                    <button onClick={() => deleteLogo.mutate(l.id)} style={{ ...btnGhost, color: "#fca5a5" }}>Remove</button>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminClubLogos() {
  const { data: clubsResp, isLoading } = useQuery<{ ok: boolean; clubs: ClubRow[] }>({
    queryKey: ["/api/admin/clubs"],
  });
  const { data: missingResp } = useQuery<{ ok: boolean; clubs: ClubRow[] }>({
    queryKey: ["/api/admin/clubs-missing-logos"],
  });
  const [filter, setFilter] = useState<"all" | "missing">("all");

  const missingIds = new Set((missingResp?.clubs || []).map((c) => c.id));
  const clubs = (clubsResp?.clubs || []).slice().sort((a, b) => a.clubName.localeCompare(b.clubName));
  const visible = filter === "missing" ? clubs.filter((c) => missingIds.has(c.id)) : clubs;

  return (
    <AdminLayout>
      <div style={{ padding: "32px 36px", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.4px" }}>Club Logos</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "6px 0 0", maxWidth: 640 }}>
              <b style={{ color: "rgba(255,255,255,0.75)" }}>Drop a logo file on any club below</b> to set it instantly — no Canva needed. The primary logo auto-attaches to every order item on PO raise.
              {missingResp ? <> · <b style={{ color: "#fca5a5" }}>{missingResp.clubs.length}</b> clubs still need a logo.</> : null}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setFilter("all")} style={filter === "all" ? btnPrimary : btnGhost}>All</button>
            <button onClick={() => setFilter("missing")} style={filter === "missing" ? btnPrimary : btnGhost}>Missing only</button>
          </div>
        </div>

        {isLoading && <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>}

        {visible.length > 0 && (
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                  <Th>Club</Th>
                  <Th>Primary logo</Th>
                  <Th right>Action</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => <ClubRowEditor key={c.id} club={c} isMissing={missingIds.has(c.id)} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

const tdStyle: React.CSSProperties = { padding: "10px 16px", fontSize: 13, verticalAlign: "middle" };
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", fontSize: 12, background: "#000", color: "#fff",
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4,
};
const btnPrimary: React.CSSProperties = {
  padding: "6px 14px", fontSize: 11, fontWeight: 600,
  background: "#fff", color: "#000", border: 0, borderRadius: 4, cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  padding: "5px 10px", fontSize: 11,
  background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)",
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4, cursor: "pointer",
};

function Th({ children, right }: { children: any; right?: boolean }) {
  return (
    <th style={{ padding: "10px 16px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, color: "rgba(255,255,255,0.5)", textAlign: right ? "right" : "left" }}>
      {children}
    </th>
  );
}
