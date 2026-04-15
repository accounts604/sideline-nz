// Admin order detail — single scrollable editable sheet.
// Sections: PO header, Customer/Delivery, Garment Lines (with inline image upload),
// File Vault (drag-and-drop), Portal Actions, Admin Notes, Activity Log.
// No tabs. No chat. No production stages.

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { useParams, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { upload } from "@vercel/blob/client";
import { getQueryFn } from "@/lib/queryClient";
import { computeMilestones } from "@shared/po-milestones";
import {
  ArrowLeft, FileText, ExternalLink, Upload, Download,
  Check, X, MessageSquare, Printer, Plus, Trash2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────

interface OrderItem {
  id: string;
  productName: string;
  productImage: string | null;
  size: string | null;
  quantity: number;
  unitAmount: number;
  currency: string;
  productColors: { hex: string; name?: string }[] | null;
  brandingMethod: string | null;
  frontDesignUrl: string | null;
  backDesignUrl: string | null;
  elementUrls: { name: string; url: string }[] | null;
  gradeGroup: string | null;
  designNotes: string | null;
}

interface DesignFile {
  id: string;
  label: string;
  folder: string | null;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  status: string;
  version: number;
  createdAt: string;
}

interface DesignComment {
  id: string;
  designFileId: string;
  comment: string;
  action: string | null;
  createdAt: string;
}

interface SizeBreakdown {
  id: string;
  orderItemId: string;
  size: string;
  quantity: number;
  playerName: string | null;
  playerNumber: string | null;
}

interface Order {
  id: string;
  orderNumber: string;
  customerEmail: string | null;
  customerName: string | null;
  storeSlug: string;
  status: string;
  designStatus: string | null;
  adminNotes: string | null;
  productionStage: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  total: number;
  subtotal: number;
  shipping: number;
  tax: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  pipelineStage: string | null;
  ghlOpportunityId: string | null;
  assignedSupplierId: string | null;
  poReference: string | null;
  accountName: string | null;
  isRepeatOrder: boolean | null;
  poComments: string | null;
  deliveryAttention: string | null;
  deliveryAddress: string | null;
  deliveryEmail: string | null;
  deliveryPhone: string | null;
  dueDate: string | null;
  driveFolderId: string | null;
  driveFolderUrl: string | null;
  driveFolderName: string | null;
}

interface SupplierOption {
  id: string;
  email: string;
  supplierName: string | null;
  inviteAccepted: boolean;
}

interface OrderDetail {
  order: Order;
  items: OrderItem[];
  designs: DesignFile[];
  comments: DesignComment[];
  sizeBreakdowns: SizeBreakdown[];
  activity: any[];
  [key: string]: any;
}

const FOLDERS = ["logos", "mockups", "size-run", "tech-pack", "other"] as const;

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", fontSize: "13px",
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "6px", color: "#fff", outline: "none",
};

// ─── Inline-editable text field ──────────────────────────────────────

function EditableField({
  value, onSave, placeholder, multiline, style,
}: {
  value: string | null | undefined;
  onSave: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  style?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  function start() { setDraft(value ?? ""); setEditing(true); }
  function save() { setEditing(false); if (draft !== (value ?? "")) onSave(draft); }
  function cancel() { setEditing(false); setDraft(value ?? ""); }

  if (editing) {
    const Tag = multiline ? "textarea" : "input";
    return (
      <Tag
        autoFocus
        value={draft}
        onChange={(e: any) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e: any) => {
          if (e.key === "Enter" && !multiline) save();
          if (e.key === "Escape") cancel();
        }}
        style={{ ...inputStyle, resize: multiline ? "vertical" : undefined, minHeight: multiline ? "60px" : undefined, ...style }}
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      onClick={start}
      title="Click to edit"
      style={{
        cursor: "pointer", borderBottom: "1px dashed rgba(255,255,255,0.15)",
        padding: "2px 0", minWidth: "40px", display: "inline-block",
        color: value ? "#fff" : "rgba(255,255,255,0.3)", ...style,
      }}
    >
      {value || placeholder || "—"}
    </span>
  );
}

// ─── Inline image upload (for order item front/back/elements) ────────

function ImageUploadSlot({
  label, url, onUpload, small, vaultImages,
}: {
  label: string;
  url: string | null;
  onUpload: (blobUrl: string) => void;
  small?: boolean;
  vaultImages?: { id: string; fileUrl: string; fileName: string }[];
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    setUploading(true);
    setError("");
    try {
      const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/uploads/token" });
      onUpload(blob.url);
    } catch (e: any) {
      console.error("Image upload failed:", e);
      setError(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div
        style={{
          textAlign: "center", cursor: "pointer",
          border: `1px dashed ${error ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.15)"}`, borderRadius: "8px",
          padding: small ? "8px" : "16px", minHeight: small ? "60px" : "200px",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: uploading ? "rgba(201,168,76,0.08)" : error ? "rgba(239,68,68,0.04)" : "rgba(255,255,255,0.02)",
        }}
        onClick={() => ref.current?.click()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onDragOver={(e) => e.preventDefault()}
      >
        <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        {uploading ? (
          <span style={{ fontSize: "12px", color: "#C9A84C" }}>Uploading…</span>
        ) : url ? (
          <img src={url} alt={label} style={{ maxHeight: small ? "50px" : "220px", maxWidth: "100%", objectFit: "contain" }} />
        ) : (
          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>
            <Upload size={18} style={{ marginBottom: "6px" }} /><br />{label}<br /><span style={{ fontSize: "10px" }}>Click or drag image</span>
          </span>
        )}
      </div>
      {error && <p style={{ fontSize: "10px", color: "#ef4444", marginTop: "4px" }}>{error}</p>}
      {/* Pick from file vault */}
      {!url && vaultImages && vaultImages.length > 0 && (
        <div style={{ marginTop: "6px" }}>
          <p style={{ fontSize: "9px", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: "4px" }}>Or use from vault:</p>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {vaultImages.map((v) => (
              <img
                key={v.id}
                src={v.fileUrl}
                alt={v.fileName}
                title={`Use ${v.fileName}`}
                onClick={(e) => { e.stopPropagation(); onUpload(v.fileUrl); }}
                style={{ width: "48px", height: "48px", objectFit: "contain", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", background: "rgba(255,255,255,0.04)", padding: "2px" }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export default function AdminOrderDetail() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [`/api/admin/orders/${params.id}`] });

  // File vault upload state
  const uploadFileRef = useRef<HTMLInputElement>(null);
  const [uploadFolder, setUploadFolder] = useState<typeof FOLDERS[number]>("mockups");
  const [uploadLabel, setUploadLabel] = useState("jersey");
  const [uploadError, setUploadError] = useState("");

  // Design review state
  const [reviewingFileId, setReviewingFileId] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState("");

  // Portal actions state
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [portalMsg, setPortalMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Status edit
  const [statusEdit, setStatusEdit] = useState("");

  // Add item form
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState("Sublimated Rugby Jersey");
  const [newItemGrade, setNewItemGrade] = useState("");
  const [newItemBranding, setNewItemBranding] = useState("Full Sublimation");
  const [newItemQty, setNewItemQty] = useState(1);

  // Add size breakdown
  const [addingSizeForItem, setAddingSizeForItem] = useState<string | null>(null);
  const [newSize, setNewSize] = useState("");
  const [newSizeQty, setNewSizeQty] = useState(1);

  // ─── Queries ─────────────────────────────────────────────────

  const { data, isLoading } = useQuery<OrderDetail>({
    queryKey: [`/api/admin/orders/${params.id}`],
    enabled: !!params.id,
  });

  const { data: suppliersData } = useQuery<{ suppliers: SupplierOption[] }>({
    queryKey: ["/api/admin/suppliers"],
  });
  const suppliers = suppliersData?.suppliers ?? [];

  // ─── Mutations ───────────────────────────────────────────────

  const updateOrder = useMutation({
    mutationFn: async (d: Record<string, any>) => { const r = await apiRequest("PATCH", `/api/admin/orders/${params.id}`, d); return r.json(); },
    onSuccess: invalidate,
  });

  const updateItem = useMutation({
    mutationFn: async ({ itemId, ...d }: Record<string, any> & { itemId: string }) => {
      const r = await apiRequest("PATCH", `/api/admin/orders/${params.id}/items/${itemId}`, d);
      return r.json();
    },
    onSuccess: invalidate,
  });

  const uploadFileMut = useMutation({
    mutationFn: async () => {
      const file = uploadFileRef.current?.files?.[0];
      if (!file) throw new Error("Pick a file");
      const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/uploads/token" });
      const r = await apiRequest("POST", `/api/admin/orders/${params.id}/designs`, {
        label: uploadLabel, folder: uploadFolder, fileName: file.name, fileUrl: blob.url, fileSize: file.size, mimeType: file.type,
      });
      return r.json();
    },
    onSuccess: () => { invalidate(); if (uploadFileRef.current) uploadFileRef.current.value = ""; setUploadError(""); },
    onError: (e: any) => setUploadError(e?.message || "Upload failed"),
  });

  const updateFolderMut = useMutation({
    mutationFn: async ({ fileId, folder }: { fileId: string; folder: string | null }) => {
      const r = await apiRequest("PATCH", `/api/admin/designs/${fileId}/folder`, { folder });
      return r.json();
    },
    onSuccess: invalidate,
  });

  const reviewMut = useMutation({
    mutationFn: async (d: { designFileId: string; action: string; comment?: string }) => {
      const r = await apiRequest("POST", `/api/admin/orders/${params.id}/design-review`, d);
      return r.json();
    },
    onSuccess: () => { invalidate(); setReviewComment(""); setReviewingFileId(null); },
  });

  const sendApprovalMut = useMutation({
    mutationFn: async () => { const r = await apiRequest("POST", `/api/admin/orders/${params.id}/send-for-approval`, {}); return r.json(); },
    onSuccess: (r: any) => { invalidate(); setPortalMsg({ ok: true, text: `Approval link sent · ${r.link}` }); },
    onError: (e: any) => setPortalMsg({ ok: false, text: e?.message || "Failed" }),
  });

  const addItemMut = useMutation({
    mutationFn: async (d: Record<string, any>) => { const r = await apiRequest("POST", `/api/admin/orders/${params.id}/items`, d); return r.json(); },
    onSuccess: () => { invalidate(); setShowAddItem(false); setNewItemName("Sublimated Rugby Jersey"); setNewItemGrade(""); setNewItemBranding("Full Sublimation"); setNewItemQty(1); },
  });

  const addSizeMut = useMutation({
    mutationFn: async (d: { orderItemId: string; size: string; quantity: number }) => {
      const r = await apiRequest("POST", `/api/admin/orders/${params.id}/size-breakdowns`, d);
      return r.json();
    },
    onSuccess: () => { invalidate(); setAddingSizeForItem(null); setNewSize(""); setNewSizeQty(1); },
  });

  const raisePoMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/orders/${params.id}/raise-po`, { supplierId: selectedSupplierId || undefined });
      return r.json();
    },
    onSuccess: (r: any) => { invalidate(); setPortalMsg({ ok: true, text: r.ghlPushed ? "PO raised · supplier emailed · GHL → PO Raised" : `PO raised · supplier emailed · GHL skipped (${r.ghlPushReason})` }); },
    onError: (e: any) => setPortalMsg({ ok: false, text: e?.message || "Failed" }),
  });

  // Drag-and-drop handler for file vault folders
  const handleFolderDrop = useCallback(async (folder: typeof FOLDERS[number], files: FileList) => {
    for (const file of Array.from(files)) {
      try {
        const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/uploads/token" });
        await apiRequest("POST", `/api/admin/orders/${params.id}/designs`, {
          label: file.name.split(".")[0], folder, fileName: file.name, fileUrl: blob.url, fileSize: file.size, mimeType: file.type,
        });
      } catch (e) {
        console.error("Drop upload failed:", e);
      }
    }
    invalidate();
  }, [params.id]);

  // ─── Loading / Not Found ─────────────────────────────────────

  if (isLoading) return <AdminLayout><div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Loading…</div></AdminLayout>;
  if (!data) return <AdminLayout><div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Order not found</div></AdminLayout>;

  const { order, items, designs, comments, sizeBreakdowns, activity } = data;
  const hasMockups = designs.some((d) => d.folder === "mockups");

  // Group size breakdowns by item
  const bdByItem = new Map<string, SizeBreakdown[]>();
  for (const b of sizeBreakdowns ?? []) {
    const list = bdByItem.get(b.orderItemId) || [];
    list.push(b);
    bdByItem.set(b.orderItemId, list);
  }

  // ─── Render ──────────────────────────────────────────────────

  return (
    <AdminLayout>
      {/* Header bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link href="/admin/orders"><span style={{ color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}><ArrowLeft size={14} /> Orders</span></Link>
          <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0, color: "#fff" }}>{order.orderNumber}</h1>
          <StatusBadge status={order.status} />
          {order.pipelineStage && <StageBadge stage={order.pipelineStage} />}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {order.driveFolderUrl && (
            <a
              href={order.driveFolderUrl}
              target="_blank"
              rel="noreferrer"
              title={order.driveFolderName || "Drive folder"}
              style={{ padding: "8px 14px", fontSize: "12px", fontWeight: 600, background: "rgba(249,115,22,0.1)", color: "#f97316", border: "1px solid rgba(249,115,22,0.3)", borderRadius: "6px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              File Vault ↗
            </a>
          )}
          <Link href={`/admin/orders/${order.id}/po`}>
            <button style={{ padding: "8px 16px", fontSize: "12px", fontWeight: 600, background: "#fff", color: "#000", border: "none", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
              <Printer size={14} /> View / Print PO
            </button>
          </Link>
        </div>
      </div>

      {/* ──── PO Details ──── */}
      <Section title="PO Details">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
          <Field label="PO Reference"><EditableField value={order.poReference} onSave={(v) => updateOrder.mutate({ poReference: v })} placeholder="PO-YYYY-NNNN" /></Field>
          <Field label="Account"><EditableField value={order.accountName} onSave={(v) => updateOrder.mutate({ accountName: v })} placeholder="Account name" /></Field>
          <Field label="Comments"><EditableField value={order.poComments} onSave={(v) => updateOrder.mutate({ poComments: v })} placeholder="Notes" /></Field>
          <Field label="Status">
            <select value={statusEdit || order.status} onChange={(e) => { setStatusEdit(e.target.value); updateOrder.mutate({ status: e.target.value }); }} style={{ ...inputStyle, width: "auto" }}>
              {["pending", "paid", "processing", "shipped", "delivered", "cancelled"].map((s) => <option key={s} value={s} style={{ background: "#111" }}>{s}</option>)}
            </select>
          </Field>
          <Field label="New / Repeat">
            <select value={order.isRepeatOrder ? "repeat" : "new"} onChange={(e) => updateOrder.mutate({ isRepeatOrder: e.target.value === "repeat" })} style={{ ...inputStyle, width: "auto" }}>
              <option value="new" style={{ background: "#111" }}>New</option>
              <option value="repeat" style={{ background: "#111" }}>Repeat</option>
            </select>
          </Field>
          <Field label="Design Status"><span style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px" }}>{order.designStatus || "—"}</span></Field>
          <Field label="Customer Due Date">
            <input
              type="date"
              value={order.dueDate || ""}
              onChange={(e) => updateOrder.mutate({ dueDate: e.target.value || null })}
              style={{ ...inputStyle, width: "auto" }}
            />
          </Field>
        </div>

        {/* ──── Guard-rail milestone timeline ──── */}
        {order.dueDate && (() => {
          const ms = computeMilestones(order.dueDate);
          if (!ms) return null;
          return (
            <div style={{ marginTop: "18px", background: "rgba(249,115,22,0.04)", border: "1px solid rgba(249,115,22,0.15)", borderRadius: "8px", padding: "14px 18px" }}>
              <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.8px", color: "rgba(249,115,22,0.9)", marginBottom: "10px", fontWeight: 600 }}>
                35-day build schedule — anchored to customer due date
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {ms.map((m) => {
                  const today = new Date(); today.setHours(0,0,0,0);
                  const mDate = new Date(m.date + "T00:00:00");
                  const isPast = mDate < today && m.key !== "door_to_customer";
                  const isDue = m.key === "door_to_customer";
                  return (
                    <div key={m.key} style={{
                      flex: "1 1 160px",
                      padding: "10px 12px",
                      background: isDue ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${isDue ? "rgba(34,197,94,0.3)" : isPast ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.06)"}`,
                      borderRadius: "6px",
                    }}>
                      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                        Day {m.dayNumber}
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "2px" }}>{m.label}</div>
                      <div style={{ fontSize: "11px", color: isDue ? "#22c55e" : isPast ? "#ef4444" : "rgba(255,255,255,0.5)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                        {m.date}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </Section>

      {/* ──── Customer / Delivery ──── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
        <Section title="Customer">
          <Field label="Name"><EditableField value={order.customerName} onSave={(v) => updateOrder.mutate({ customerName: v })} placeholder="Customer name" /></Field>
          <Field label="Email"><EditableField value={order.customerEmail} onSave={(v) => updateOrder.mutate({ customerEmail: v })} placeholder="customer@email.com" /></Field>
        </Section>
        <Section title="Delivery Address">
          <Field label="Attention"><EditableField value={order.deliveryAttention} onSave={(v) => updateOrder.mutate({ deliveryAttention: v })} placeholder="Attention" /></Field>
          <Field label="Address"><EditableField value={order.deliveryAddress} onSave={(v) => updateOrder.mutate({ deliveryAddress: v })} placeholder="Full address" multiline /></Field>
          <Field label="Email"><EditableField value={order.deliveryEmail} onSave={(v) => updateOrder.mutate({ deliveryEmail: v })} placeholder="delivery@email.com" /></Field>
          <Field label="Phone"><EditableField value={order.deliveryPhone} onSave={(v) => updateOrder.mutate({ deliveryPhone: v })} placeholder="022..." /></Field>
        </Section>
      </div>

      {/* ──── Garment Lines ──── */}
      <Section title={`Garment Lines (${items.length})`}>
        {items.length === 0 && <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "13px", marginBottom: "12px" }}>No items on this PO yet. Add one below.</p>}

        {/* Add item form */}
        {showAddItem ? (
          <div style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.2)", borderRadius: "10px", padding: "16px 20px", marginBottom: "16px" }}>
            <p style={{ fontSize: "12px", fontWeight: 700, color: "#C9A84C", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>New Garment Line</p>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 100px", gap: "10px", marginBottom: "12px" }}>
              <div>
                <label style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: "3px" }}>Product Name</label>
                <input value={newItemName} onChange={(e) => setNewItemName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: "3px" }}>Grade / Group</label>
                <input value={newItemGrade} onChange={(e) => setNewItemGrade(e.target.value)} placeholder="Grade 6,7,8" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: "3px" }}>Branding Method</label>
                <input value={newItemBranding} onChange={(e) => setNewItemBranding(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: "3px" }}>Qty</label>
                <input type="number" value={newItemQty} onChange={(e) => setNewItemQty(Number(e.target.value))} min={1} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => addItemMut.mutate({ productName: newItemName, gradeGroup: newItemGrade || undefined, brandingMethod: newItemBranding || undefined, quantity: newItemQty })}
                disabled={addItemMut.isPending || !newItemName.trim()}
                style={{ padding: "8px 18px", fontSize: "12px", fontWeight: 600, background: "#C9A84C", color: "#0A1628", border: "none", borderRadius: "6px", cursor: "pointer" }}>
                {addItemMut.isPending ? "Adding…" : "Add Item"}
              </button>
              <button onClick={() => setShowAddItem(false)} style={{ padding: "8px 14px", fontSize: "12px", color: "rgba(255,255,255,0.5)", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddItem(true)} style={{ marginBottom: "16px", padding: "10px 18px", fontSize: "12px", fontWeight: 600, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)", border: "1px dashed rgba(255,255,255,0.15)", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", width: "100%" }}>
            <Plus size={14} /> Add Garment Line
          </button>
        )}
        {items.map((item) => {
          const bds = bdByItem.get(item.id) || [];
          const sizeSummary = new Map<string, number>();
          for (const b of bds) sizeSummary.set(b.size, (sizeSummary.get(b.size) || 0) + b.quantity);
          const totalQty = sizeSummary.size > 0 ? Array.from(sizeSummary.values()).reduce((a, b) => a + b, 0) : item.quantity;

          return (
            <div key={item.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "20px", marginBottom: "16px" }}>
              {/* Item header */}
              <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
                <Field label="Product" style={{ flex: 2 }}><EditableField value={item.productName} onSave={(v) => updateItem.mutate({ itemId: item.id, productName: v })} /></Field>
                <Field label="Grade" style={{ flex: 1 }}><EditableField value={item.gradeGroup} onSave={(v) => updateItem.mutate({ itemId: item.id, gradeGroup: v })} placeholder="Grade" /></Field>
                <Field label="Branding" style={{ flex: 1 }}><EditableField value={item.brandingMethod} onSave={(v) => updateItem.mutate({ itemId: item.id, brandingMethod: v })} placeholder="Method" /></Field>
                <Field label="Colours" style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    {(item.productColors ?? []).map((c, i) => (
                      <span key={i} style={{ width: "20px", height: "14px", background: c.hex, border: "1px solid rgba(255,255,255,0.2)", borderRadius: "2px", display: "inline-block" }} title={c.hex} />
                    ))}
                    {!(item.productColors?.length) && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "12px" }}>—</span>}
                  </div>
                </Field>
              </div>

              {/* Design images — front, back, elements side by side */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div>
                  <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(255,255,255,0.4)", marginBottom: "6px" }}>Front Design</p>
                  <ImageUploadSlot
                    label="Upload front"
                    url={item.frontDesignUrl}
                    onUpload={(url) => updateItem.mutate({ itemId: item.id, frontDesignUrl: url })}
                    vaultImages={designs.filter((d) => d.folder === "mockups" && d.mimeType?.startsWith("image/")).map((d) => ({ id: d.id, fileUrl: d.fileUrl, fileName: d.fileName }))}
                  />
                </div>
                <div>
                  <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(255,255,255,0.4)", marginBottom: "6px" }}>Back Design</p>
                  <ImageUploadSlot
                    label="Upload back"
                    url={item.backDesignUrl}
                    onUpload={(url) => updateItem.mutate({ itemId: item.id, backDesignUrl: url })}
                    vaultImages={designs.filter((d) => d.folder === "mockups" && d.mimeType?.startsWith("image/")).map((d) => ({ id: d.id, fileUrl: d.fileUrl, fileName: d.fileName }))}
                  />
                </div>
                <div>
                  <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(255,255,255,0.4)", marginBottom: "6px" }}>Elements ({(item.elementUrls ?? []).length})</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {(item.elementUrls ?? []).map((el, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
                        <img src={el.url} alt={el.name} style={{ maxHeight: "55px", maxWidth: "120px", objectFit: "contain" }} />
                        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>{el.name}</span>
                      </div>
                    ))}
                    <ImageUploadSlot
                      label="+ Add element"
                      url={null}
                      small
                      onUpload={(url) => {
                        const name = prompt("Element name (e.g. sponsor logo):") || "Logo";
                        const existing = (item.elementUrls ?? []) as { name: string; url: string }[];
                        updateItem.mutate({ itemId: item.id, elementUrls: [...existing, { name, url }] });
                      }}
                      vaultImages={designs.filter((d) => d.folder === "logos" && d.mimeType?.startsWith("image/")).map((d) => ({ id: d.id, fileUrl: d.fileUrl, fileName: d.fileName }))}
                    />
                  </div>
                </div>
              </div>

              {/* Size breakdown + design notes */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(255,255,255,0.4)", marginBottom: "6px" }}>Size Run</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                    {Array.from(sizeSummary.entries()).map(([size, qty]) => (
                      <span key={size} style={{ fontSize: "12px", padding: "4px 10px", background: "rgba(255,255,255,0.06)", borderRadius: "4px", color: "#fff" }}>
                        {size}: {qty}
                      </span>
                    ))}
                    {sizeSummary.size > 0 && (
                      <span style={{ fontSize: "12px", padding: "4px 10px", background: "rgba(201,168,76,0.15)", borderRadius: "4px", color: "#C9A84C", fontWeight: 600 }}>
                        Total: {totalQty}
                      </span>
                    )}
                    {sizeSummary.size === 0 && <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>No sizes added yet</span>}
                  </div>
                  {/* Add size */}
                  {addingSizeForItem === item.id ? (
                    <div style={{ display: "flex", gap: "6px", alignItems: "end" }}>
                      <div>
                        <label style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)" }}>Size</label>
                        <input value={newSize} onChange={(e) => setNewSize(e.target.value)} placeholder="Y8, M, XL…" style={{ ...inputStyle, width: "80px", padding: "6px 8px", fontSize: "12px" }} />
                      </div>
                      <div>
                        <label style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)" }}>Qty</label>
                        <input type="number" value={newSizeQty} onChange={(e) => setNewSizeQty(Number(e.target.value))} min={1} style={{ ...inputStyle, width: "60px", padding: "6px 8px", fontSize: "12px" }} />
                      </div>
                      <button onClick={() => addSizeMut.mutate({ orderItemId: item.id, size: newSize, quantity: newSizeQty })}
                        disabled={addSizeMut.isPending || !newSize.trim()}
                        style={{ padding: "6px 12px", fontSize: "11px", fontWeight: 600, background: "#C9A84C", color: "#0A1628", border: "none", borderRadius: "4px", cursor: "pointer" }}>
                        {addSizeMut.isPending ? "…" : "Add"}
                      </button>
                      <button onClick={() => setAddingSizeForItem(null)} style={{ padding: "6px 8px", fontSize: "11px", color: "rgba(255,255,255,0.4)", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", cursor: "pointer" }}>✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingSizeForItem(item.id)} style={{ padding: "4px 10px", fontSize: "10px", color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.12)", borderRadius: "4px", cursor: "pointer" }}>
                      + Add Size
                    </button>
                  )}
                </div>
                <div>
                  <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(255,255,255,0.4)", marginBottom: "6px" }}>Design Notes</p>
                  <EditableField value={item.designNotes} onSave={(v) => updateItem.mutate({ itemId: item.id, designNotes: v })} placeholder="Notes…" multiline />
                </div>
              </div>
            </div>
          );
        })}
      </Section>

      {/* ──── File Vault (drag & drop) ──── */}
      <Section title="File Vault">
        {/* Folder drop zones */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px", marginBottom: "16px" }}>
          {FOLDERS.map((folder) => {
            const folderFiles = designs.filter((d) => d.folder === folder);
            return (
              <FolderDropZone
                key={folder}
                folder={folder}
                fileCount={folderFiles.length}
                onDrop={(files) => handleFolderDrop(folder, files)}
              />
            );
          })}
        </div>

        {/* Upload form */}
        <div style={{ display: "flex", gap: "10px", alignItems: "end", marginBottom: "16px", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Folder</label>
            <select value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value as any)} style={{ ...inputStyle, width: "130px" }}>
              {FOLDERS.map((f) => <option key={f} value={f} style={{ background: "#111" }}>{f}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Label</label>
            <input value={uploadLabel} onChange={(e) => setUploadLabel(e.target.value)} placeholder="jersey…" style={{ ...inputStyle, width: "120px" }} />
          </div>
          <div style={{ flex: 1, minWidth: "180px" }}>
            <label style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>File</label>
            <input ref={uploadFileRef} type="file" style={{ ...inputStyle }} />
          </div>
          <button onClick={() => uploadFileMut.mutate()} disabled={uploadFileMut.isPending}
            style={{ padding: "8px 16px", fontSize: "12px", fontWeight: 600, background: "#fff", color: "#000", border: "none", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", height: "36px" }}>
            <Upload size={14} /> {uploadFileMut.isPending ? "…" : "Upload"}
          </button>
          {uploadError && <span style={{ fontSize: "11px", color: "#ef4444" }}>{uploadError}</span>}
        </div>

        {/* File list */}
        {/* Mockup gallery — show image files visually */}
        {designs.filter((d) => d.mimeType?.startsWith("image/")).length > 0 && (
          <div style={{ marginBottom: "16px" }}>
            <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(255,255,255,0.4)", marginBottom: "8px" }}>Image Preview</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
              {designs.filter((d) => d.mimeType?.startsWith("image/")).map((file) => (
                <div key={file.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", overflow: "hidden" }}>
                  <img src={file.fileUrl} alt={file.fileName} style={{ width: "100%", height: "180px", objectFit: "contain", background: "#000", padding: "8px" }} />
                  <div style={{ padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>{file.fileName}</span>
                    <span style={{ fontSize: "9px", textTransform: "uppercase", color: file.folder ? "#C9A84C" : "rgba(255,255,255,0.3)", fontWeight: 600 }}>{file.folder || "unfiled"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* File list */}
        {designs.length === 0 ? (
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "12px" }}>No files yet. Upload or drag-and-drop onto a folder above.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {designs.map((file) => (
              <div key={file.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "6px", fontSize: "13px" }}>
                <FileText size={14} color="rgba(255,255,255,0.3)" />
                <span style={{ flex: 1, color: "#fff" }}>{file.fileName}</span>
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>{file.label} · v{file.version}</span>
                <select
                  value={file.folder ?? ""}
                  onChange={(e) => updateFolderMut.mutate({ fileId: file.id, folder: e.target.value || null })}
                  style={{ padding: "4px 6px", fontSize: "10px", background: file.folder ? "rgba(201,168,76,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${file.folder ? "rgba(201,168,76,0.4)" : "rgba(255,255,255,0.1)"}`, borderRadius: "4px", color: file.folder ? "#C9A84C" : "rgba(255,255,255,0.5)", outline: "none", textTransform: "uppercase", fontWeight: 600 }}
                >
                  <option value="" style={{ background: "#111" }}>unfiled</option>
                  {FOLDERS.map((f) => <option key={f} value={f} style={{ background: "#111" }}>{f}</option>)}
                </select>
                <StatusBadge status={file.status} />
                {file.status === "pending" && (
                  reviewingFileId === file.id ? (
                    <div style={{ display: "flex", gap: "4px" }}>
                      <input value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Comment…" style={{ ...inputStyle, width: "120px", padding: "4px 6px", fontSize: "11px" }} />
                      <button onClick={() => reviewMut.mutate({ designFileId: file.id, action: "approved", comment: reviewComment })} style={{ padding: "4px 8px", fontSize: "10px", background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "4px", cursor: "pointer" }}><Check size={10} /></button>
                      <button onClick={() => reviewMut.mutate({ designFileId: file.id, action: "rejected", comment: reviewComment })} style={{ padding: "4px 8px", fontSize: "10px", background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "4px", cursor: "pointer" }}><X size={10} /></button>
                      <button onClick={() => { setReviewingFileId(null); setReviewComment(""); }} style={{ padding: "4px 8px", fontSize: "10px", color: "rgba(255,255,255,0.4)", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", cursor: "pointer" }}>✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setReviewingFileId(file.id)} style={{ padding: "4px 8px", fontSize: "10px", color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", cursor: "pointer" }}>Review</button>
                  )
                )}
                <a href={file.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.4)" }}><ExternalLink size={14} /></a>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ──── Portal Actions ──── */}
      <Section title="Portal Actions" gold>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <button
              onClick={() => { setPortalMsg(null); sendApprovalMut.mutate(); }}
              disabled={sendApprovalMut.isPending || !hasMockups}
              title={!hasMockups ? "Upload a file with folder=mockups first" : ""}
              style={{
                width: "100%", padding: "12px", fontSize: "12px", fontWeight: 600,
                background: hasMockups ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.04)",
                color: hasMockups ? "#C9A84C" : "rgba(255,255,255,0.3)",
                border: "1px solid rgba(201,168,76,0.4)", borderRadius: "6px",
                cursor: sendApprovalMut.isPending || !hasMockups ? "not-allowed" : "pointer",
                textTransform: "uppercase", letterSpacing: "0.5px",
              }}
            >
              {sendApprovalMut.isPending ? "Sending…" : "Send for Client Approval"}
            </button>
            <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>Emails /approve/:token link · GHL → Mockup Sent</p>
          </div>
          <div>
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <select
                value={selectedSupplierId || order.assignedSupplierId || ""}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              >
                <option value="" style={{ background: "#111" }}>{suppliers.length ? "— pick supplier —" : "No suppliers yet"}</option>
                {suppliers.map((s) => <option key={s.id} value={s.id} style={{ background: "#111" }}>{s.supplierName || s.email}{!s.inviteAccepted ? " (pending)" : ""}</option>)}
              </select>
            </div>
            <button
              onClick={() => { setPortalMsg(null); raisePoMut.mutate(); }}
              disabled={raisePoMut.isPending || (!selectedSupplierId && !order.assignedSupplierId)}
              style={{
                width: "100%", padding: "12px", fontSize: "12px", fontWeight: 600,
                background: (selectedSupplierId || order.assignedSupplierId) ? "#C9A84C" : "rgba(255,255,255,0.04)",
                color: (selectedSupplierId || order.assignedSupplierId) ? "#0A1628" : "rgba(255,255,255,0.3)",
                border: "none", borderRadius: "6px",
                cursor: raisePoMut.isPending || (!selectedSupplierId && !order.assignedSupplierId) ? "not-allowed" : "pointer",
                textTransform: "uppercase", letterSpacing: "0.5px",
              }}
            >
              {raisePoMut.isPending ? "Raising PO…" : "Raise PO to Supplier"}
            </button>
            <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>Assigns supplier · emails PO · GHL → PO Raised</p>
          </div>
        </div>
        {portalMsg && (
          <div style={{ marginTop: "12px", padding: "10px", fontSize: "11px", borderRadius: "6px", background: portalMsg.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: portalMsg.ok ? "#22c55e" : "#ef4444", border: `1px solid ${portalMsg.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, wordBreak: "break-all" }}>
            {portalMsg.text}
          </div>
        )}
      </Section>

      {/* ──── Admin Notes ──── */}
      <Section title="Admin Notes">
        <EditableField value={order.adminNotes} onSave={(v) => updateOrder.mutate({ adminNotes: v })} placeholder="Internal notes…" multiline style={{ width: "100%" }} />
      </Section>

      {/* ──── Activity Log ──── */}
      <Section title="Activity Log">
        {(activity ?? []).length === 0 ? (
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "12px" }}>No activity yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "400px", overflowY: "auto" }}>
            {(activity ?? []).map((a: any) => (
              <div key={a.id} style={{ padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "6px", borderLeft: "3px solid rgba(201,168,76,0.3)", fontSize: "12px" }}>
                <div style={{ color: "#fff", fontWeight: 500 }}>{a.action.replace(/_/g, " ")}</div>
                {a.details && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", marginTop: "2px" }}>{typeof a.details === "string" ? a.details : JSON.stringify(a.details)}</div>}
                <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "10px", marginTop: "2px" }}>{new Date(a.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </AdminLayout>
  );
}

// ─── Small presentational helpers ────────────────────────────────────

function Section({ title, children, gold, defaultOpen = true }: { title: string; children: React.ReactNode; gold?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: "#111", border: `1px solid ${gold ? "rgba(201,168,76,0.25)" : "rgba(255,255,255,0.06)"}`, borderRadius: "12px", marginBottom: "16px", overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", padding: "16px 24px", background: "none", border: "none", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}
      >
        <h2 style={{ fontSize: "13px", fontWeight: 700, color: gold ? "#C9A84C" : "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "1.5px", margin: 0 }}>{title}</h2>
        <span style={{ fontSize: "18px", color: "rgba(255,255,255,0.3)", transform: open ? "rotate(0)" : "rotate(-90deg)", transition: "transform 0.15s" }}>▾</span>
      </button>
      {open && <div style={{ padding: "0 24px 20px" }}>{children}</div>}
    </div>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</label>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    pending: { bg: "rgba(234,179,8,0.15)", text: "#eab308" },
    paid: { bg: "rgba(34,197,94,0.15)", text: "#22c55e" },
    processing: { bg: "rgba(59,130,246,0.15)", text: "#3b82f6" },
    shipped: { bg: "rgba(168,85,247,0.15)", text: "#a855f7" },
    delivered: { bg: "rgba(34,197,94,0.15)", text: "#22c55e" },
    cancelled: { bg: "rgba(239,68,68,0.15)", text: "#ef4444" },
    approved: { bg: "rgba(34,197,94,0.15)", text: "#22c55e" },
    rejected: { bg: "rgba(239,68,68,0.15)", text: "#ef4444" },
    needs_revision: { bg: "rgba(239,68,68,0.15)", text: "#ef4444" },
  };
  const c = colors[status] || { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.5)" };
  return <span style={{ fontSize: "10px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px", background: c.bg, color: c.text, textTransform: "uppercase", letterSpacing: "0.5px" }}>{status.replace(/_/g, " ")}</span>;
}

function StageBadge({ stage }: { stage: string }) {
  return <span style={{ fontSize: "10px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px", background: "rgba(201,168,76,0.12)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{stage}</span>;
}

function FolderDropZone({ folder, fileCount, onDrop }: { folder: string; fileCount: number; onDrop: (files: FileList) => void }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length > 0) onDrop(e.dataTransfer.files); }}
      style={{
        padding: "16px 8px", textAlign: "center", borderRadius: "8px",
        border: `2px dashed ${over ? "#C9A84C" : "rgba(255,255,255,0.1)"}`,
        background: over ? "rgba(201,168,76,0.08)" : "rgba(255,255,255,0.02)",
        cursor: "default", transition: "all 0.15s",
      }}
    >
      <div style={{ fontSize: "12px", fontWeight: 600, color: over ? "#C9A84C" : "#fff", textTransform: "uppercase", letterSpacing: "0.5px" }}>{folder}</div>
      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", marginTop: "4px" }}>{fileCount} file{fileCount !== 1 ? "s" : ""}</div>
    </div>
  );
}
