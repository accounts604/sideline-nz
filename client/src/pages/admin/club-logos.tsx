// Admin "Brand Identity" — every club & team's brand identity in one place,
// across three pillars: Logos, Designs and Colours. Typed drag-and-drop upload
// (Primary/Secondary/Front/Back/Sponsor + the sponsor prominence ladder); it all
// flows into every PO. See docs/sideline-studio.md + reference_sideline_logo_asset_taxonomy.
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

interface ClubColors { primary?: string | null; secondary?: string | null; accent?: string | null }
interface ClubWithLogos {
  id: string;
  clubName: string;
  shopifyOrderTag: string | null;
  logos: LogoRow[];
  colors: ClubColors | null;
  currentPo: { id: string; poReference: string | null; status: string | null } | null;
}

// Brand-identity endpoint — one club/school per entry, its three pillars (logos,
// designs, colours) + its teams nested inside. The single coherent hierarchy.
interface BrandAsset {
  id: string;
  kind: AssetKind;
  displayLabel: string | null;
  previewUrl: string | null;
  defaultPosition: string | null;
  clubAccountId: string | null;
}
interface BrandOrder {
  poRef: string;
  poId: string;
  status: string | null;
  name: string;
}
interface BrandTeam {
  id: string;
  name: string;
  notes: string | null;
  secondaryLogoUrl: string | null;
  orders: BrandOrder[];
}
interface BrandDetails {
  website: string | null;
  deliveryAddress: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  ghlBusinessId: string | null;
}
interface BrandClub {
  id: string;
  name: string;
  kind: "club" | "school";
  accountId: string | null;
  primaryLogoUrl: string | null;
  colors: ClubColors | null;
  verified: boolean;
  details: BrandDetails | null;
  logos: BrandAsset[];
  designs: BrandAsset[];
  teams: BrandTeam[];
}

const BRAND_KEY = "/api/admin/clubs/brand-identity";

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

// COLOURS pillar — primary/secondary/accent, the single source of truth that
// flows into every PO for this club. Saves to club_brand_identity.colors.
function ColoursPillar({ clubId, initial, onSaved }: { clubId: string; initial: ClubColors | null; onSaved: () => void }) {
  const [c, setC] = useState({ primary: initial?.primary || "#1e3a8a", secondary: initial?.secondary || "#ffffff", accent: initial?.accent || "#dc2626" });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(false);
  async function save() {
    setBusy(true); setSaved(false); setErr(false);
    try {
      const r = await apiRequest("PUT", `/api/admin/clubs/${clubId}/colours`, { colors: c });
      const j = await r.json().catch(() => ({}));
      if (!j?.ok) throw new Error();
      setSaved(true); onSaved();
    } catch { setErr(true); } finally { setBusy(false); }
  }
  const slots: [keyof typeof c, string][] = [["primary", "Primary"], ["secondary", "Secondary"], ["accent", "Accent"]];
  return (
    <div>
      <div style={pillarLabelStyle}>Colours</div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>Set once. Flows into every PO for this club.</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-start" }}>
        {slots.map(([k, label]) => (
          <label key={k} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontSize: 9, color: "rgba(255,255,255,0.5)" }}>
            <input type="color" value={c[k]} onChange={(e) => { setC((s) => ({ ...s, [k]: e.target.value })); setSaved(false); }} style={{ width: 30, height: 30, padding: 0, border: "1px solid rgba(255,255,255,0.15)", background: "none", cursor: "pointer", borderRadius: 6 }} />
            {label}
          </label>
        ))}
      </div>
      <button onClick={save} disabled={busy} style={{ ...btnGhost, fontSize: 10, padding: "3px 10px", marginTop: 10, ...(err ? { borderColor: "#fca5a5", color: "#fca5a5" } : {}) }}>{busy ? "Saving…" : err ? "⚠ retry" : saved ? "✓ Saved" : "Save colours"}</button>
    </div>
  );
}

// PARENT DETAILS pillar — the club/school as the GHL business: website, delivery
// address (defaults a PO's ship-to), and primary contact. Saved to club details.
function ParentDetailsPillar({ clubId, initial, onSaved }: { clubId: string; initial: BrandDetails | null; onSaved: () => void }) {
  const [d, setD] = useState({
    website: initial?.website || "",
    deliveryAddress: initial?.deliveryAddress || "",
    contactName: initial?.contactName || "",
    contactEmail: initial?.contactEmail || "",
    contactPhone: initial?.contactPhone || "",
    ghlBusinessId: initial?.ghlBusinessId || "",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(false);
  type GhlResult = { id: string; label: string; website: string | null; deliveryAddress: string | null; contactName: string | null; contactEmail: string | null; contactPhone: string | null; ghlBusinessId: string | null };
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GhlResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { const v = e.target.value; setD((s) => ({ ...s, [k]: v })); setSaved(false); };
  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true); setDropdownOpen(true);
    try {
      const r = await apiRequest("GET", `/api/admin/clubs/ghl-search?q=${encodeURIComponent(q)}`);
      const { results: rows } = await r.json();
      setResults(Array.isArray(rows) ? rows : []);
    } catch { /* quiet */ } finally { setSearching(false); }
  }
  function pick(res: GhlResult) {
    setD((s) => ({
      website: res.website ?? s.website,
      deliveryAddress: res.deliveryAddress ?? s.deliveryAddress,
      contactName: res.contactName ?? s.contactName,
      contactEmail: res.contactEmail ?? s.contactEmail,
      contactPhone: res.contactPhone ?? s.contactPhone,
      ghlBusinessId: res.ghlBusinessId ?? s.ghlBusinessId,
    }));
    setSaved(false); setDropdownOpen(false); setResults([]);
  }
  async function save() {
    setBusy(true); setSaved(false); setErr(false);
    try {
      const r = await apiRequest("PUT", `/api/admin/clubs/${clubId}/details`, {
        website: d.website, deliveryAddress: d.deliveryAddress, contactName: d.contactName,
        contactEmail: d.contactEmail, contactPhone: d.contactPhone, ghlBusinessId: d.ghlBusinessId,
      });
      const j = await r.json().catch(() => ({}));
      if (!j?.ok) throw new Error();
      setSaved(true); onSaved();
    } catch { setErr(true); } finally { setBusy(false); }
  }
  const fieldLabel: React.CSSProperties = { fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 3, display: "block" };
  return (
    <div>
      <div style={pillarLabelStyle}>Parent details</div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>The club/school is the GHL business. Address defaults a PO's ship-to.</div>
      <div style={{ position: "relative", marginBottom: 12, maxWidth: 340 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
            placeholder="Look up in GHL (name, club, email)…"
            style={{ ...inputStyle, width: 240, flex: "0 1 240px" }}
          />
          <button onClick={runSearch} disabled={searching || query.trim().length < 2} style={{ ...btnGhost, opacity: (searching || query.trim().length < 2) ? 0.5 : 1 }}>{searching ? "…" : "Search"}</button>
        </div>
        {dropdownOpen && !searching && results.length === 0 && (
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>No GHL matches</div>
        )}
        {results.length > 0 && (
          <div style={{ position: "absolute", zIndex: 20, left: 0, right: 0, marginTop: 4, background: "#16181d", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 4, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
            {results.map((res) => (
              <div
                key={res.id}
                onClick={() => pick(res)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.08)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                style={{ padding: "6px 9px", cursor: "pointer", borderTop: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.9)" }}>{res.label}</div>
                {(res.contactEmail || res.contactPhone) && (
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{[res.contactEmail, res.contactPhone].filter(Boolean).join(" · ")}</div>
                )}
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>Fills the fields from your GHL CRM — review, then Save.</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 220px", minWidth: 180 }}>
          <label style={fieldLabel}>Website</label>
          <input value={d.website} onChange={set("website")} placeholder="https://…" style={inputStyle} />
        </div>
        <div style={{ flex: "1 1 100%" }}>
          <label style={fieldLabel}>Delivery address</label>
          <textarea value={d.deliveryAddress} onChange={set("deliveryAddress")} rows={2} placeholder="Ship-to address" style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
        </div>
        <div style={{ flex: "1 1 160px", minWidth: 140 }}>
          <label style={fieldLabel}>Contact name</label>
          <input value={d.contactName} onChange={set("contactName")} placeholder="Name" style={inputStyle} />
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 160 }}>
          <label style={fieldLabel}>Contact email</label>
          <input value={d.contactEmail} onChange={set("contactEmail")} placeholder="email@…" style={inputStyle} />
        </div>
        <div style={{ flex: "1 1 150px", minWidth: 130 }}>
          <label style={fieldLabel}>Contact phone</label>
          <input value={d.contactPhone} onChange={set("contactPhone")} placeholder="Phone" style={inputStyle} />
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 160 }}>
          <label style={{ ...fieldLabel, color: "rgba(255,255,255,0.3)" }}>GHL business ID (optional)</label>
          <input value={d.ghlBusinessId} onChange={set("ghlBusinessId")} placeholder="GHL business ID" style={{ ...inputStyle, color: "rgba(255,255,255,0.6)" }} />
        </div>
      </div>
      <button onClick={save} disabled={busy} style={{ ...btnGhost, fontSize: 10, padding: "3px 10px", marginTop: 10, ...(err ? { borderColor: "#fca5a5", color: "#fca5a5" } : {}) }}>{busy ? "Saving…" : err ? "⚠ retry" : saved ? "✓ Saved" : "Save details"}</button>
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
  const logoAssets = logos.filter((l) => l.kind === "primary" || l.kind === "secondary" || l.kind === "sponsor");
  const designAssets = logos.filter((l) => l.kind === "front-design" || l.kind === "back-design");

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

      {/* Always-visible: this club's brand identity across three pillars */}
      {logos.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 14 }}>
          {/* LOGOS pillar */}
          <div>
            <div style={pillarLabelStyle}>Logos</div>
            {logoAssets.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                {logoAssets.map((l) => <AssetTile key={l.id} logo={l} />)}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>No logos yet</div>
            )}
          </div>
          {/* DESIGNS pillar */}
          <div>
            <div style={pillarLabelStyle}>Designs</div>
            {designAssets.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                {designAssets.map((l) => <AssetTile key={l.id} logo={l} />)}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>No designs yet</div>
            )}
          </div>
          {/* COLOURS pillar — editable, saved to the brand identity. */}
          <ColoursPillar clubId={club.id} initial={club.colors} onSaved={refresh} />
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

// One coherent card per club/school: its brand identity across the three pillars
// (Logos, Designs, Colours) with its teams nested inside. Replaces the old split
// between the Structure panel and the per-club asset cards.
function ClubBrandCard({ club }: { club: BrandClub }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: [BRAND_KEY] });
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dropKind, setDropKind] = useState<AssetKind>("primary");
  const [dropPos, setDropPos] = useState("");

  // Account-less parents (created from standalone orders) have no asset container.
  // We lazily ensure one the first time uploads are needed, then cache its id.
  const [ensuredAccountId, setEnsuredAccountId] = useState<string | null>(null);
  const [ensuring, setEnsuring] = useState(false);
  const effectiveAccountId = club.accountId || ensuredAccountId;

  // Fetch-brand (logo candidates scraped from the parent's website — suggestions only).
  type BrandCandidate = { url: string; source: string; likelyLogo?: boolean };
  type BrandColor = { hex: string; name?: string; pms?: string; source?: string };
  const [candidates, setCandidates] = useState<BrandCandidate[]>([]);
  const [fetchedColors, setFetchedColors] = useState<BrandColor[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchNote, setFetchNote] = useState<string | null>(null);
  const [pickKind, setPickKind] = useState<AssetKind>("primary");
  const [coloursApplied, setColoursApplied] = useState(false);

  // Resolve (or lazily create) the parent's asset-container account id.
  async function getAccountId(): Promise<string | null> {
    if (club.accountId) return club.accountId;
    if (ensuredAccountId) return ensuredAccountId;
    setEnsuring(true);
    try {
      const r = await apiRequest("POST", `/api/admin/clubs/${club.id}/ensure-account`, {});
      const j = await r.json().catch(() => ({}));
      const acct: string | null = j?.accountId || null;
      if (acct) setEnsuredAccountId(acct);
      return acct;
    } catch {
      return null;
    } finally {
      setEnsuring(false);
    }
  }

  async function fetchBrand() {
    setFetching(true); setFetchNote(null); setCandidates([]); setFetchedColors([]); setColoursApplied(false);
    try {
      const r = await apiRequest("POST", `/api/admin/clubs/${club.id}/fetch-brand`, {});
      const j = await r.json().catch(() => ({}));
      const cands: BrandCandidate[] = Array.isArray(j?.candidates) ? j.candidates : [];
      const cols: BrandColor[] = Array.isArray(j?.colors) ? j.colors : [];
      setCandidates(cands); setFetchedColors(cols);
      if (j?.note) setFetchNote(String(j.note));
      else if (cands.length === 0 && cols.length === 0) setFetchNote("Nothing found on the site.");
    } catch (e: any) {
      setFetchNote(e?.message || "Fetch failed");
    } finally {
      setFetching(false);
    }
  }

  // Apply the top fetched colours to the brand identity (primary/secondary/accent).
  async function applyColours() {
    try {
      await apiRequest("PUT", `/api/admin/clubs/${club.id}/colours`, { colors: { primary: fetchedColors[0]?.hex || null, secondary: fetchedColors[1]?.hex || null, accent: fetchedColors[2]?.hex || null } });
      setColoursApplied(true); refresh();
    } catch { /* */ }
  }

  // Delete this parent (Club/School). Non-destructive: orders + accounts survive
  // (unparented); only the grouping + its teams are removed.
  async function deleteParent() {
    if (!window.confirm(`Delete parent "${club.name}" from Brand Identity?\n\nIts orders and accounts are kept (they just become unparented) — only the parent grouping + its teams are removed. You can re-parent the orders later.`)) return;
    try { await apiRequest("DELETE", `/api/admin/clubs/${club.id}`, undefined); refresh(); } catch { /* */ }
  }

  // The HUMAN GATE: confirm the brand identity is correct before free mockups go out.
  async function verifyBrand(e?: any) {
    if (e) e.stopPropagation();
    try { await apiRequest("POST", `/api/admin/clubs/${club.id}/verify-brand`, { verified: !club.verified }); refresh(); } catch { /* */ }
  }

  // Save a picked candidate as a real logo asset (never auto-applied).
  async function pickCandidate(c: BrandCandidate) {
    const acct = await getAccountId();
    if (!acct) { setFetchNote("Couldn't resolve an account for uploads."); return; }
    try {
      await apiRequest("POST", `/api/admin/clubs/${acct}/logos`, { imageUrl: c.url, kind: pickKind, defaultPosition: ASSET_TYPES.find((t) => t.value === pickKind)?.pos });
      refresh();
      setCandidates([]); setFetchNote(null);
    } catch (e: any) {
      setFetchNote(e?.message || "Save failed");
    }
  }

  // "Enable uploads" — ensures the account then reveals the dropzone.
  const enableUploadsBtn = (
    <button onClick={() => getAccountId()} disabled={ensuring} style={{ ...btnGhost, opacity: ensuring ? 0.6 : 1 }}>
      {ensuring ? "Enabling…" : "Enable uploads"}
    </button>
  );

  // Teams are real three-level entities now — render them all.
  const teams = club.teams;
  const teamCount = club.teams.length;
  const typeDefaultPos = ASSET_TYPES.find((t) => t.value === dropKind)?.pos || "Left Chest";
  const effectivePos = dropPos || (dropKind === "sponsor" ? "Front Center" : typeDefaultPos);

  // AssetTile expects a LogoRow; brand-identity assets lack the Canva/sync fields.
  const asLogoRow = (a: BrandAsset): LogoRow => ({ ...a, canvaDesignId: "", canvaPageIndex: null, lastSyncedAt: null } as any);

  // Up to 3 colour swatches for the compact header preview (skip nulls).
  const swatches = [club.colors?.primary, club.colors?.secondary, club.colors?.accent].filter(Boolean).slice(0, 3) as string[];
  const countChipStyle: React.CSSProperties = { fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)", whiteSpace: "nowrap" };

  return (
    <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 16 }}>
      {/* COMPACT HEADER — clickable to toggle open; reads as a single scannable summary row */}
      <div
        onClick={() => { const n = !open; setOpen(n); if (n && !effectiveAccountId) getAccountId(); }}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer", flexWrap: "wrap" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", flexShrink: 0, width: 12 }}>{open ? "▾" : "▸"}</span>
          {club.primaryLogoUrl
            ? <img src={club.primaryLogoUrl} alt="" style={{ width: 26, height: 26, borderRadius: 4, objectFit: "contain", background: "#000", flexShrink: 0 }} />
            : <div style={{ width: 26, height: 26, borderRadius: 4, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{club.kind === "school" ? "🏫" : "🛡️"}</div>}
          <span style={{ fontWeight: 700, fontSize: 15, color: "#fcd34d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{club.name}</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{club.kind} · {teamCount} team{teamCount === 1 ? "" : "s"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
          {club.primaryLogoUrl
            ? <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(134,239,172,0.12)", color: "#86efac", border: "1px solid rgba(134,239,172,0.3)", whiteSpace: "nowrap" }}>primary ✓</span>
            : <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(252,165,165,0.12)", color: "#fca5a5", border: "1px solid rgba(252,165,165,0.3)", whiteSpace: "nowrap" }}>no primary</span>}
          <span style={countChipStyle}>L{club.logos.length}</span>
          <span style={countChipStyle}>D{club.designs.length}</span>
          {/* HUMAN GATE — verify before free mockups can go out */}
          {club.verified
            ? <button onClick={verifyBrand} title="Verified — click to un-verify" style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(134,239,172,0.15)", color: "#86efac", border: "1px solid rgba(134,239,172,0.4)", whiteSpace: "nowrap", cursor: "pointer" }}>✓ brand verified</button>
            : <button onClick={verifyBrand} title="Confirm the brand identity is correct to unlock free mockups" style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(250,204,21,0.15)", color: "#fde047", border: "1px solid rgba(250,204,21,0.4)", whiteSpace: "nowrap", cursor: "pointer", fontWeight: 600 }}>⚠ verify brand</button>}
          {swatches.length > 0 && (
            <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
              {swatches.map((col, i) => (
                <span key={i} style={{ width: 12, height: 12, borderRadius: 3, background: col, border: "1px solid rgba(255,255,255,0.2)", flexShrink: 0 }} />
              ))}
            </div>
          )}
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap" }}>{open ? "▾ open" : "▸ open to edit"}</span>
        </div>
      </div>

      {open && (<>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
        {/* LOGOS pillar — includes the club-level primary (clubs.primary_logo_url)
            so it's visible even when there's no account-held asset. */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ ...pillarLabelStyle, marginBottom: 0 }}>Logos</div>
            <button onClick={fetchBrand} disabled={fetching} style={{ ...btnGhost, fontSize: 10, padding: "3px 8px", opacity: fetching ? 0.6 : 1 }}>{fetching ? "…" : "Fetch brand"}</button>
          </div>
          {(() => {
            const tiles: BrandAsset[] = [...club.logos];
            if (club.primaryLogoUrl && !tiles.some((l) => l.kind === "primary" || l.previewUrl === club.primaryLogoUrl)) {
              tiles.unshift({ id: "club-primary", kind: "primary", displayLabel: "Primary Logo", previewUrl: club.primaryLogoUrl, defaultPosition: null, clubAccountId: null });
            }
            return tiles.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                {tiles.map((a) => <AssetTile key={a.id} logo={asLogoRow(a)} />)}
              </div>
            ) : effectiveAccountId ? (
              <div style={{ maxWidth: 320 }}>
                <LogoDropZone clubId={effectiveAccountId} compact onDone={refresh} />
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>Drop the primary logo to start.</div>
              </div>
            ) : (
              <div style={{ maxWidth: 320 }}>
                {enableUploadsBtn}
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>No logos yet — enable uploads to add one.</div>
              </div>
            );
          })()}

          {/* Fetch-brand candidates — suggestions scraped from the parent's website.
              Click one to save it (admin picks; never auto-applied). */}
          {(candidates.length > 0 || fetchedColors.length > 0 || fetchNote) && (
            <div style={{ marginTop: 12 }}>
              {candidates.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>Save as</span>
                  <select value={pickKind} onChange={(e) => setPickKind(e.target.value as AssetKind)} style={{ ...inputStyle, width: "auto", padding: "3px 6px", cursor: "pointer" }}>
                    {ASSET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>— click a candidate to save it</span>
                </div>
              )}
              {candidates.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {candidates.map((c, i) => (
                    <div key={i} onClick={() => pickCandidate(c)} title={c.url} style={{ width: 64, textAlign: "center", cursor: "pointer" }}>
                      <img src={c.url} alt="" style={{ width: 56, height: 56, objectFit: "contain", background: "#fff", padding: 3, borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)" }} />
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.source}</div>
                      {c.likelyLogo && <div style={{ fontSize: 8, color: "#86efac", fontWeight: 600 }}>logo?</div>}
                    </div>
                  ))}
                </div>
              )}
              {fetchedColors.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>Brand colours (from website)</span>
                    <button onClick={applyColours} style={{ ...btnGhost, fontSize: 10, padding: "3px 8px" }}>{coloursApplied ? "✓ Applied" : "Apply colours"}</button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {fetchedColors.map((c, i) => (
                      <div key={i} title={`${c.name || ""} ${c.hex}${c.pms ? " · " + c.pms : ""}`.trim()} style={{ textAlign: "center" }}>
                        <span style={{ display: "block", width: 22, height: 22, borderRadius: 4, background: c.hex, border: "1px solid rgba(255,255,255,0.2)" }} />
                        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{c.hex}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {fetchNote && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 8 }}>{fetchNote}</div>}
            </div>
          )}
        </div>

        {/* DESIGNS pillar */}
        <div>
          <div style={pillarLabelStyle}>Designs</div>
          {club.designs.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              {club.designs.map((a) => <AssetTile key={a.id} logo={asLogoRow(a)} />)}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>No designs yet</div>
          )}
        </div>

        {/* COLOURS pillar — every card shows the editor (account ensured on open) */}
        {effectiveAccountId
          ? <ColoursPillar clubId={effectiveAccountId} initial={club.colors} onSaved={refresh} />
          : <div><div style={pillarLabelStyle}>Colours</div>{enableUploadsBtn}<div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>Enable to set colours.</div></div>}

        {/* PARENT DETAILS pillar — editable club/school business + contact + ship-to */}
        <ParentDetailsPillar clubId={club.id} initial={club.details} onSaved={refresh} />

        {/* TEAMS pillar — Team ▸ Orders nesting */}
        <div>
          <div style={pillarLabelStyle}>Teams</div>
          {teams.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {teams.map((t) => (
                <div key={t.id}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.92)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                  {t.notes && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{t.notes}</div>}
                  <div style={{ marginTop: 4, marginLeft: 8, paddingLeft: 10, borderLeft: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", gap: 3 }}>
                    {t.orders.length > 0 ? (
                      t.orders.map((o) => (
                        <div key={o.poId} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11 }}>
                          <a href={`/admin/orders/${o.poId}`} style={{ color: "#93c5fd", flexShrink: 0 }}>{o.poRef}</a>
                          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "rgba(255,255,255,0.45)" }}>{o.name}</span>
                          {o.status && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, flexShrink: 0 }}>{o.status}</span>}
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>no orders yet</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>No teams yet</div>
          )}
        </div>
      </div>

      {/* Add + EDIT assets — always shown when the card is open, for every club
          (account-less parents get an asset account ensured on open). */}
      {(
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={labelStyle}>Add logos &amp; designs — one labelled drop zone per type</div>
          {effectiveAccountId ? (<>
            <div style={{ ...pillarLabelStyle, marginTop: 6 }}>Logos</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
              {ASSET_TYPES.filter((t) => ["primary", "secondary", "sponsor"].includes(t.value)).map((t) => (
                <div key={t.value} style={{ width: 168 }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginBottom: 4, fontWeight: 600 }}>{t.label}</div>
                  <LogoDropZone clubId={effectiveAccountId} kind={t.value} position={t.pos} compact onDone={refresh} />
                </div>
              ))}
            </div>
            <div style={pillarLabelStyle}>Designs</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {ASSET_TYPES.filter((t) => ["front-design", "back-design"].includes(t.value)).map((t) => (
                <div key={t.value} style={{ width: 168 }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginBottom: 4, fontWeight: 600 }}>{t.label}</div>
                  <LogoDropZone clubId={effectiveAccountId} kind={t.value} position={t.pos} compact onDone={refresh} />
                </div>
              ))}
            </div>
          </>) : (
            <div style={{ maxWidth: 360 }}>{enableUploadsBtn}<div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>This parent has no asset account yet — enable uploads to add logos &amp; designs.</div></div>
          )}
          {(club.logos.length + club.designs.length) > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={labelStyle}>Edit existing — rename / change type / placement / remove</div>
              {[...club.logos, ...club.designs].map((a) => <AssetManageRow key={a.id} clubId={a.clubAccountId || effectiveAccountId || ""} logo={asLogoRow(a)} onChanged={refresh} />)}
            </div>
          )}
          {/* Danger zone — remove this parent from Brand Identity (orders kept) */}
          <div style={{ marginTop: 18, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <button onClick={deleteParent} style={{ ...btnGhost, fontSize: 11, borderColor: "rgba(252,165,165,0.4)", color: "#fca5a5" }}>Delete parent</button>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginLeft: 8 }}>removes the club/school grouping; its orders stay (become unparented)</span>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}

interface PoStatus { id: string; poReference: string; accountName: string; clubName: string | null; status: string | null; clubAccountId: string | null; itemCount: number; logos: number; sized: number; fabric: number; branding: number; mockups: number; needs: string[]; complete: boolean; }

// Per-PO mockup upload — drops a front/back mockup image onto the PO.
function PoMockupUpload({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function handle(file: File) {
    setBusy(true); setErr(null);
    try {
      const dataBase64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(new Error("read failed")); r.readAsDataURL(file); });
      const up = await apiRequest("POST", "/api/uploads/blob", { filename: file.name, contentType: file.type, dataBase64 });
      const { url } = await up.json();
      const r = await apiRequest("POST", `/api/admin/orders/${orderId}/mockup`, { imageUrl: url, fileName: file.name, mimeType: file.type, label: file.name.replace(/\.[^.]+$/, "") });
      const j = await r.json().catch(() => ({}));
      if (!j?.ok) throw new Error(j?.error || "upload rejected");
      onDone();
    } catch (e: any) { setErr(String(e?.message || "failed")); } finally { setBusy(false); }
  }
  return (
    <>
      <button onClick={() => ref.current?.click()} disabled={busy} title={err || undefined} style={{ ...btnGhost, fontSize: 10, padding: "3px 8px", flexShrink: 0, ...(err ? { borderColor: "#fca5a5", color: "#fca5a5" } : {}) }}>{busy ? "…" : err ? "⚠ retry" : "+ mockup"}</button>
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
  const [err, setErr] = useState<string | null>(null);
  async function handle(file: File) {
    setBusy(true); setErr(null);
    try {
      const dataBase64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(new Error("read failed")); r.readAsDataURL(file); });
      const up = await apiRequest("POST", "/api/uploads/blob", { filename: file.name, contentType: file.type, dataBase64 });
      const { url } = await up.json();
      const r = await apiRequest("POST", `/api/admin/orders/${orderId}/attach-logo`, { imageUrl: url });
      const j = await r.json().catch(() => ({}));
      if (!j?.ok) throw new Error(j?.error || "upload rejected");
      if (j.itemsUpdated === 0) throw new Error("no garment items to attach to");
      onDone();
    } catch (e: any) { setErr(String(e?.message || "failed")); } finally { setBusy(false); }
  }
  return (
    <>
      <button onClick={() => ref.current?.click()} disabled={busy} title={err || undefined} style={{ ...btnGhost, fontSize: 10, padding: "3px 8px", flexShrink: 0, ...(err ? { borderColor: "#fca5a5", color: "#fca5a5" } : {}) }}>{busy ? "…" : err ? "⚠ retry" : "+ logo"}</button>
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
      {(() => {
        const groups: Record<string, PoStatus[]> = {};
        for (const p of shown) { const k = p.clubName || "— No club yet (standalone) —"; (groups[k] = groups[k] || []).push(p); }
        // Real clubs first (alpha), the "no club yet" bucket last.
        const keys = Object.keys(groups).sort((a, b) => ((a.startsWith("—") ? 1 : 0) - (b.startsWith("—") ? 1 : 0)) || a.localeCompare(b));
        return keys.map((club) => (
          <div key={club}>
            <div style={{ fontSize: 11, fontWeight: 700, color: club.startsWith("—") ? "rgba(255,255,255,0.35)" : "#fcd34d", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 12, marginBottom: 2 }}>
              {club} <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>· {groups[club].length}</span>
            </div>
            {groups[club].map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 12 }}>
                <a href={`/admin/orders/${p.id}`} style={{ color: "#93c5fd", fontWeight: 600, width: 112, flexShrink: 0 }}>{p.poReference}</a>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.accountName}</span>
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
          </div>
        ));
      })()}
      {shown.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", paddingTop: 8 }}>All live POs are fully populated. 🎉</div>}
    </div>
  );
}

interface ClubStructure { id: string; name: string; kind: string; primaryLogoUrl: string | null; teams: { name: string; po?: string; kind: string }[]; }

// Clubs & schools, each with its teams (club_accounts + standalone orders linked
// via orders.club_id). Makes the club -> team structure visible: e.g. Richmond
// Rovers with its Under 12s/16s/Seniors, Aorere College with Premier Netball.
function ClubsPanel() {
  const { data } = useQuery<{ ok: boolean; clubs: ClubStructure[] }>({ queryKey: ["/api/admin/clubs/structure"] });
  const clubs = data?.clubs || [];
  if (!clubs.length) return null;
  return (
    <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 16, marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Structure <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>· {clubs.length} · each owns the shared primary logo; teams sit under it</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {clubs.map((c) => (
          <div key={c.id} style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              {c.primaryLogoUrl
                ? <img src={c.primaryLogoUrl} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: "contain", background: "#000" }} />
                : <div style={{ width: 28, height: 28, borderRadius: 4, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{c.kind === "school" ? "🏫" : "🛡️"}</div>}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fcd34d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{c.kind} · {c.teams.length} team{c.teams.length === 1 ? "" : "s"} · primary {c.primaryLogoUrl ? "set" : "missing"}</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {c.teams.length ? c.teams.map((t, i) => (
                <div key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", display: "flex", gap: 6, alignItems: "baseline" }}>
                  <span style={{ color: "rgba(255,255,255,0.3)" }}>{t.kind === "order" ? "▸" : "•"}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                  {t.po && <span style={{ color: "#93c5fd", fontSize: 10 }}>{t.po}</span>}
                </div>
              )) : <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>No teams linked yet</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminClubLogos() {
  const { data, isLoading } = useQuery<{ ok: boolean; clubs: BrandClub[] }>({ queryKey: [BRAND_KEY] });
  const [filter, setFilter] = useState<"all" | "missing">("all");
  const [search, setSearch] = useState("");

  // Sort: clubs missing a primary logo first (surface the ones needing attention), then alpha.
  const clubs = (data?.clubs || []).slice().sort((a, b) => {
    const byPrimary = (a.primaryLogoUrl ? 1 : 0) - (b.primaryLogoUrl ? 1 : 0);
    return byPrimary || a.name.localeCompare(b.name);
  });
  const missingCount = clubs.filter((c) => !c.primaryLogoUrl).length;
  const q = search.trim().toLowerCase();
  const visible = clubs.filter((c) => {
    if (filter === "missing" && c.primaryLogoUrl) return false;
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.teams.some((t) => t.name.toLowerCase().includes(q));
  });

  return (
    <AdminLayout>
      <div style={{ padding: "32px 36px", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.4px" }}>Brand Identity</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "6px 0 0", maxWidth: 680 }}>
              Every club and team's brand identity: <b style={{ color: "rgba(255,255,255,0.75)" }}>Logos, Designs and Colours</b>. Set it once here and it flows into every PO.
              {data ? <> · <b style={{ color: missingCount ? "#fca5a5" : "#86efac" }}>{missingCount}</b> still need a primary.</> : null}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search club or team..."
              style={{ width: 200, padding: "5px 10px", fontSize: 12, background: "#000", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4 }}
            />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>{visible.length} club{visible.length === 1 ? "" : "s"}</span>
            <button onClick={() => setFilter("all")} style={filter === "all" ? btnPrimary : btnGhost}>All</button>
            <button onClick={() => setFilter("missing")} style={filter === "missing" ? btnPrimary : btnGhost}>Missing only</button>
          </div>
        </div>

        <LivePoWorklist />

        {isLoading && <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
          {visible.map((c) => <ClubBrandCard key={c.id} club={c} />)}
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
const pillarLabelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 };
const btnPrimary: React.CSSProperties = { padding: "6px 14px", fontSize: 11, fontWeight: 600, background: "#fff", color: "#000", border: 0, borderRadius: 4, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "5px 10px", fontSize: 11, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4, cursor: "pointer" };
