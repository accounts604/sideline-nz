// Admin "Club Logos" — every club's logo/design assets at a glance, with typed
// drag-and-drop upload (Primary/Secondary/Front/Back/Sponsor + the sponsor
// prominence ladder). See docs/sideline-studio.md + reference_sideline_logo_asset_taxonomy.
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { apiRequest } from "@/lib/queryClient";

type AssetKind = "primary" | "secondary" | "front-design" | "back-design" | "sponsor";

interface LogoRow {
  id: string;
  kind: AssetKind;
  displayLabel: string | null;
  canvaDesignId: string;
  canvaPageIndex: number | null;
  previewUrl: string | null;
  defaultPosition: string | null;
  lastSyncedAt: string | null;
}

interface ClubWithLogos {
  id: string;
  clubName: string;
  shopifyOrderTag: string | null;
  logos: LogoRow[];
  currentPo: { id: string; poReference: string | null; status: string | null } | null;
}

// The five asset types + their default garment placement (Romero's taxonomy).
const ASSET_TYPES: { value: AssetKind; label: string; pos: string }[] = [
  { value: "primary", label: "Primary Logo", pos: "Left Chest" },
  { value: "secondary", label: "Secondary Logo", pos: "Center Back" },
  { value: "front-design", label: "Front Design", pos: "Front" },
  { value: "back-design", label: "Back Design", pos: "Back" },
  { value: "sponsor", label: "Sponsor", pos: "Front Center" },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(ASSET_TYPES.map((t) => [t.value, t.label]));
// Sponsor placement, most-prominent first (the confirmed ladder).
const SPONSOR_LADDER = ["Front Center", "Upper Back", "Left Sleeve 1", "Right Sleeve 1", "Lower Back", "Left Sleeve 2", "Right Sleeve 2"];
// Master placement list — every placement is chosen from this, never typed, so
// locations stay consistent across all assets.
const PLACEMENTS = [
  "Left Chest", "Right Chest", "Center Chest", "Front Center", "Front",
  "Back", "Upper Back", "Center Back", "Lower Back",
  "Left Sleeve", "Left Sleeve 1", "Left Sleeve 2",
  "Right Sleeve", "Right Sleeve 1", "Right Sleeve 2",
  "Collar / Nape", "Hem / Bottom",
];
const placementOptions = (kind: AssetKind) =>
  kind === "sponsor"
    ? SPONSOR_LADDER.map((s, i) => ({ value: s, label: `${i + 1}. ${s}` }))
    : PLACEMENTS.map((s) => ({ value: s, label: s }));

const OVERVIEW_KEY = "/api/admin/clubs/logos-overview";

function canvaUrlOf(designId: string, pageIndex: number | null): string {
  const base = `https://www.canva.com/design/${designId}/edit`;
  return pageIndex && pageIndex > 1 ? `${base}?page=${pageIndex}` : base;
}

// Drag-and-drop upload — drop a file, it goes to blob storage and becomes a
// logo asset of the chosen type + placement. No Canva URL needed.
function LogoDropZone({ clubId, onDone, compact, kind = "primary", position }: { clubId: string; onDone: () => void; compact?: boolean; kind?: AssetKind; position?: string }) {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setErr(null);
    if (!/^image\/(png|jpeg|svg\+xml|webp|gif)$/.test(file.type)) { setErr("PNG, JPG, SVG or WEBP only"); return; }
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
      await apiRequest("POST", `/api/admin/clubs/${clubId}/logos`, { imageUrl: url, kind, defaultPosition: position }); // name auto-derived server-side from club + type
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
          borderRadius: 6, padding: compact ? "8px 12px" : "14px",
          textAlign: "center", cursor: busy ? "wait" : "pointer",
          fontSize: compact ? 11 : 12, color: "rgba(255,255,255,0.6)", transition: "all .12s",
        }}
      >
        {busy ? "Uploading…" : (<><b style={{ color: "#93c5fd" }}>Drop file</b>{compact ? "" : " here"} or click</>)}
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      {err && <div style={{ color: "#fca5a5", fontSize: 10, marginTop: 4 }}>{err}</div>}
    </div>
  );
}

// One asset tile in the always-visible strip.
function AssetTile({ logo }: { logo: LogoRow }) {
  return (
    <div style={{ width: 92, textAlign: "center" }}>
      {logo.previewUrl ? (
        <img src={logo.previewUrl} alt="" style={{ width: 92, height: 72, objectFit: "contain", background: "#fff", padding: 4, borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)" }} />
      ) : (
        <div style={{ width: 92, height: 72, background: "rgba(255,255,255,0.04)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>no preview</div>
      )}
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.85)", marginTop: 4, fontWeight: 600, lineHeight: 1.2 }}>{TYPE_LABEL[logo.kind] || logo.kind}</div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{logo.defaultPosition || "—"}</div>
    </div>
  );
}

// One asset in the Manage list — read-only until you click Edit, then explicit
// Save / Cancel (no silent auto-save). Edit covers name, type, and placement.
function AssetManageRow({ clubId, logo, onChanged }: { clubId: string; logo: LogoRow; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(logo.displayLabel || "");
  const [kind, setKind] = useState<AssetKind>(logo.kind);
  const posDefault = ASSET_TYPES.find((t) => t.value === logo.kind)?.pos || "Left Chest";
  const [pos, setPos] = useState(logo.defaultPosition || posDefault);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function patch(body: any): Promise<boolean> {
    setBusy(true); setErr(null);
    try { await apiRequest("PATCH", `/api/admin/clubs/${clubId}/logos/${logo.id}`, body); onChanged(); return true; }
    catch (e: any) { setErr(e?.message || "Failed"); return false; }
    finally { setBusy(false); }
  }
  async function save() { if (await patch({ displayLabel: name.trim() || null, kind, defaultPosition: pos || null })) setEditing(false); }
  function cancel() { setName(logo.displayLabel || ""); setKind(logo.kind); setPos(logo.defaultPosition || posDefault); setErr(null); setEditing(false); }
  async function remove() {
    setBusy(true); setErr(null);
    try { await apiRequest("DELETE", `/api/admin/clubs/${clubId}/logos/${logo.id}`, undefined); onChanged(); }
    catch (e: any) { setErr(e?.message || "Failed"); } finally { setBusy(false); }
  }

  const thumb = logo.previewUrl
    ? <img src={logo.previewUrl} alt="" style={{ width: 34, height: 34, objectFit: "contain", background: "#fff", padding: 2, borderRadius: 3, flexShrink: 0 }} />
    : <div style={{ width: 34, height: 34, background: "rgba(255,255,255,0.04)", borderRadius: 3, flexShrink: 0 }} />;

  if (editing) {
    return (
      <div style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.04)", alignItems: "flex-start" }}>
        {thumb}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Asset name" style={{ ...inputStyle, padding: "5px 8px" }} />
          <select value={kind} onChange={(e) => { const k = e.target.value as AssetKind; setKind(k); setPos(k === "sponsor" ? "Front Center" : (ASSET_TYPES.find((t) => t.value === k)?.pos || "Left Chest")); }} style={{ ...inputStyle, padding: "5px 8px", cursor: "pointer" }}>
            {ASSET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={pos} onChange={(e) => setPos(e.target.value)} style={{ ...inputStyle, padding: "5px 8px", cursor: "pointer" }}>
            {placementOptions(kind).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={save} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.5 : 1 }}>{busy ? "Saving…" : "Save"}</button>
            <button onClick={cancel} disabled={busy} style={btnGhost}>Cancel</button>
          </div>
          {err && <div style={{ color: "#fca5a5", fontSize: 10 }}>{err}</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
      {thumb}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {logo.displayLabel || <span style={{ color: "rgba(255,255,255,0.4)" }}>(unnamed)</span>}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
          <span style={{ color: "rgba(255,255,255,0.6)" }}>{TYPE_LABEL[logo.kind] || logo.kind}</span>{logo.defaultPosition ? ` · ${logo.defaultPosition}` : ""}
          {logo.canvaDesignId.startsWith("upload:") ? " · uploaded" : <> · <a href={canvaUrlOf(logo.canvaDesignId, logo.canvaPageIndex)} target="_blank" rel="noreferrer" style={{ color: "#93c5fd" }}>Canva</a></>}
        </div>
      </div>
      <button onClick={() => setEditing(true)} disabled={busy} style={btnGhost}>Edit</button>
      {logo.kind !== "primary" && <button onClick={() => patch({ kind: "primary" })} disabled={busy} style={btnGhost}>Make primary</button>}
      <button onClick={remove} disabled={busy} style={{ ...btnGhost, color: "#fca5a5" }}>Remove</button>
    </div>
  );
}

function ClubCard({ club }: { club: ClubWithLogos }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: [OVERVIEW_KEY] });
  const [expanded, setExpanded] = useState(false);
  const [dropKind, setDropKind] = useState<AssetKind>("primary");
  const [dropPos, setDropPos] = useState("");
  const [canvaUrl, setCanvaUrl] = useState("");
  const [pageIndex, setPageIndex] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  const logos = club.logos;
  const hasPrimary = logos.some((l) => l.kind === "primary");

  async function applyLogos() {
    setApplying(true); setApplyMsg(null);
    try {
      const r = await apiRequest("POST", `/api/admin/clubs/${club.id}/apply-logos-to-current-po`, {});
      const j = await r.json();
      setApplyMsg(`✓ applied to ${j.itemsUpdated} item${j.itemsUpdated === 1 ? "" : "s"} on ${j.poReference || "the PO"}`);
    } catch (e: any) {
      setApplyMsg(e?.message || "Apply failed");
    } finally { setApplying(false); }
  }

  const usedSponsorSlots = new Set(logos.filter((l) => l.kind === "sponsor").map((l) => l.defaultPosition).filter(Boolean));
  const nextSponsorSlot = SPONSOR_LADDER.find((s) => !usedSponsorSlots.has(s)) || "Front Center";
  const typeDefaultPos = ASSET_TYPES.find((t) => t.value === dropKind)?.pos || "Left Chest";
  const effectivePos = dropPos || (dropKind === "sponsor" ? nextSponsorSlot : typeDefaultPos);

  const addCanva = useMutation({
    mutationFn: async () => {
      setError(null);
      const body: any = { canvaUrl, kind: dropKind, defaultPosition: effectivePos };
      if (pageIndex.trim()) body.canvaPageIndex = parseInt(pageIndex.trim(), 10);
      const r = await apiRequest("POST", `/api/admin/clubs/${club.id}/logos`, body);
      return r.json();
    },
    onSuccess: () => { setCanvaUrl(""); setPageIndex(""); refresh(); },
    onError: (e: any) => setError(e?.message || "Add failed"),
  });

  return (
    <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{club.clubName}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            {club.shopifyOrderTag || "—"} · {logos.length} asset{logos.length === 1 ? "" : "s"}
            {!hasPrimary && <span style={{ color: "#fca5a5" }}> · no primary logo</span>}
          </div>
        </div>
        <button onClick={() => setExpanded((s) => !s)} style={btnGhost}>{expanded ? "Close" : "Manage"}</button>
      </div>

      {/* Always-visible: every asset for this club */}
      {logos.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 14 }}>
          {logos.map((l) => <AssetTile key={l.id} logo={l} />)}
        </div>
      ) : (
        <div style={{ marginTop: 14, maxWidth: 320 }}>
          <LogoDropZone clubId={club.id} compact onDone={refresh} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>No assets yet — drop the primary logo to start.</div>
        </div>
      )}

      {/* Current PO link + apply logos to it */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 14, fontSize: 12 }}>
        {club.currentPo ? (
          <>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>Current PO:</span>
            <a href={`/admin/orders/${club.currentPo.id}`} style={{ color: "#93c5fd", fontWeight: 600 }}>{club.currentPo.poReference || "(draft order)"}</a>
            {club.currentPo.status && <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>· {club.currentPo.status}</span>}
            <button onClick={applyLogos} disabled={applying || !hasPrimary} title={!hasPrimary ? "Upload a primary logo first" : ""} style={{ ...btnGhost, opacity: (applying || !hasPrimary) ? 0.5 : 1 }}>
              {applying ? "Applying…" : "Apply logos to PO"}
            </button>
            {applyMsg && <span style={{ color: applyMsg.startsWith("✓") ? "#86efac" : "#fca5a5", fontSize: 11 }}>{applyMsg}</span>}
          </>
        ) : (
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>No PO yet for this club.</span>
        )}
      </div>

      {expanded && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {/* Add */}
          <div>
            <div style={labelStyle}>Add an asset</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select value={dropKind} onChange={(e) => { setDropKind(e.target.value as AssetKind); setDropPos(""); }} style={{ ...inputStyle, flex: 1, cursor: "pointer" }}>
                {ASSET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select value={effectivePos} onChange={(e) => setDropPos(e.target.value)} style={{ ...inputStyle, flex: 1, cursor: "pointer" }}>
                {placementOptions(dropKind).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <LogoDropZone clubId={club.id} kind={dropKind} position={effectivePos} onDone={refresh} />
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textAlign: "center", margin: "10px 0 8px" }}>— or paste a Canva URL —</div>
            <input value={canvaUrl} onChange={(e) => setCanvaUrl(e.target.value)} placeholder="Canva URL" style={inputStyle} />
            <input value={pageIndex} onChange={(e) => setPageIndex(e.target.value)} placeholder="Page # (multi-page only)" style={{ ...inputStyle, marginTop: 6 }} />
            <button disabled={!canvaUrl.trim() || addCanva.isPending} onClick={() => addCanva.mutate()} style={{ ...btnPrimary, marginTop: 10, opacity: (!canvaUrl.trim() || addCanva.isPending) ? 0.5 : 1 }}>
              {addCanva.isPending ? "Saving…" : `Add Canva asset as ${TYPE_LABEL[dropKind]}`}
            </button>
            {error && <div style={{ color: "#fca5a5", fontSize: 11, marginTop: 6 }}>{error}</div>}
          </div>
          {/* Manage existing */}
          <div>
            <div style={labelStyle}>Assets ({logos.length}) — Edit to rename / change type / placement</div>
            {logos.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>No assets yet.</div>}
            {logos.map((l) => <AssetManageRow key={l.id} clubId={club.id} logo={l} onChanged={refresh} />)}
          </div>
        </div>
      )}
    </div>
  );
}

interface PoStatus { id: string; poReference: string; accountName: string; status: string | null; clubAccountId: string | null; itemCount: number; logos: number; sized: number; fabric: number; branding: number; mockups: number; needs: string[]; complete: boolean; }

// Per-PO mockup upload — drops a front/back mockup image onto the PO.
function PoMockupUpload({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function handle(file: File) {
    setBusy(true);
    try {
      const dataBase64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(new Error("x")); r.readAsDataURL(file); });
      const up = await apiRequest("POST", "/api/uploads/blob", { filename: file.name, contentType: file.type, dataBase64 });
      const { url } = await up.json();
      await apiRequest("POST", `/api/admin/orders/${orderId}/mockup`, { imageUrl: url, fileName: file.name, mimeType: file.type, label: file.name.replace(/\.[^.]+$/, "") });
      onDone();
    } catch { /* */ } finally { setBusy(false); }
  }
  return (
    <>
      <button onClick={() => ref.current?.click()} disabled={busy} style={{ ...btnGhost, fontSize: 10, padding: "3px 8px", flexShrink: 0 }}>{busy ? "…" : "+ mockup"}</button>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); e.currentTarget.value = ""; }} />
    </>
  );
}

function Chip({ have, total, label }: { have: number; total: number; label: string }) {
  const ok = total > 0 && have >= total;
  return <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap", background: ok ? "rgba(134,239,172,0.12)" : "rgba(252,165,165,0.12)", color: ok ? "#86efac" : "#fca5a5", border: `1px solid ${ok ? "rgba(134,239,172,0.3)" : "rgba(252,165,165,0.3)"}` }}>{label} {have}/{total}</span>;
}

// Per-PO quick logo upload — attaches straight to the order's items (any PO).
function PoLogoUpload({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function handle(file: File) {
    setBusy(true);
    try {
      const dataBase64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(new Error("x")); r.readAsDataURL(file); });
      const up = await apiRequest("POST", "/api/uploads/blob", { filename: file.name, contentType: file.type, dataBase64 });
      const { url } = await up.json();
      await apiRequest("POST", `/api/admin/orders/${orderId}/attach-logo`, { imageUrl: url });
      onDone();
    } catch { /* surfaced by absence of change */ } finally { setBusy(false); }
  }
  return (
    <>
      <button onClick={() => ref.current?.click()} disabled={busy} style={{ ...btnGhost, fontSize: 10, padding: "3px 8px", flexShrink: 0 }}>{busy ? "…" : "+ logo"}</button>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); e.currentTarget.value = ""; }} />
    </>
  );
}

// Bulk worklist — every live PO (club or standalone) + what it still needs.
function LivePoWorklist() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/admin/orders/populate-status"] });
  const { data } = useQuery<{ ok: boolean; pos: PoStatus[] }>({ queryKey: ["/api/admin/orders/populate-status"] });
  const [onlyGaps, setOnlyGaps] = useState(true);
  const pos = data?.pos || [];
  const needCount = pos.filter((p) => !p.complete).length;
  const shown = onlyGaps ? pos.filter((p) => !p.complete) : pos;
  return (
    <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 16, marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Live POs to populate <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>· {needCount} of {pos.length} need work</span></div>
        <button onClick={() => setOnlyGaps((s) => !s)} style={onlyGaps ? btnPrimary : btnGhost}>{onlyGaps ? "Needs work" : "Show all"}</button>
      </div>
      {shown.map((p) => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 12 }}>
          <a href={`/admin/orders/${p.id}`} style={{ color: "#93c5fd", fontWeight: 600, width: 112, flexShrink: 0 }}>{p.poReference}</a>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.accountName}{!p.clubAccountId && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}> · standalone</span>}
          </span>
          <div style={{ display: "flex", gap: 5, flexShrink: 0, alignItems: "center" }}>
            {p.complete ? <span style={{ color: "#86efac", fontSize: 11 }}>✓ data</span> : (<>
              <Chip have={p.logos} total={p.itemCount} label="logos" />
              <Chip have={p.sized} total={p.itemCount} label="sizes" />
              <Chip have={p.fabric} total={p.itemCount} label="fabric" />
              <Chip have={p.branding} total={p.itemCount} label="brand" />
            </>)}
            <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap", background: p.mockups >= 2 ? "rgba(134,239,172,0.12)" : "rgba(252,165,165,0.12)", color: p.mockups >= 2 ? "#86efac" : "#fca5a5", border: `1px solid ${p.mockups >= 2 ? "rgba(134,239,172,0.3)" : "rgba(252,165,165,0.3)"}` }}>mock {p.mockups}</span>
            {p.logos < p.itemCount && <PoLogoUpload orderId={p.id} onDone={refresh} />}
            <PoMockupUpload orderId={p.id} onDone={refresh} />
          </div>
        </div>
      ))}
      {shown.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", paddingTop: 8 }}>All live POs are fully populated. 🎉</div>}
    </div>
  );
}

export default function AdminClubLogos() {
  const { data, isLoading } = useQuery<{ ok: boolean; clubs: ClubWithLogos[] }>({ queryKey: [OVERVIEW_KEY] });
  const [filter, setFilter] = useState<"all" | "missing">("all");

  const clubs = (data?.clubs || []).slice().sort((a, b) => a.clubName.localeCompare(b.clubName));
  const missingCount = clubs.filter((c) => !c.logos.some((l) => l.kind === "primary")).length;
  const visible = filter === "missing" ? clubs.filter((c) => !c.logos.some((l) => l.kind === "primary")) : clubs;

  return (
    <AdminLayout>
      <div style={{ padding: "32px 36px", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.4px" }}>Club Logos</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "6px 0 0", maxWidth: 680 }}>
              Every club's assets at a glance. <b style={{ color: "rgba(255,255,255,0.75)" }}>Drop a file</b> to add one (pick its type → placement is set automatically). The Primary logo auto-attaches to every PO.
              {data ? <> · <b style={{ color: missingCount ? "#fca5a5" : "#86efac" }}>{missingCount}</b> still need a primary.</> : null}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setFilter("all")} style={filter === "all" ? btnPrimary : btnGhost}>All</button>
            <button onClick={() => setFilter("missing")} style={filter === "missing" ? btnPrimary : btnGhost}>Missing only</button>
          </div>
        </div>

        <LivePoWorklist />

        {isLoading && <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
          {visible.map((c) => <ClubCard key={c.id} club={c} />)}
        </div>
      </div>
    </AdminLayout>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", fontSize: 12, background: "#000", color: "#fff",
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4,
};
const labelStyle: React.CSSProperties = { fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 };
const btnPrimary: React.CSSProperties = { padding: "6px 14px", fontSize: 11, fontWeight: 600, background: "#fff", color: "#000", border: 0, borderRadius: 4, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "5px 10px", fontSize: 11, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4, cursor: "pointer" };
