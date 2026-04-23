// Admin order detail — single scrollable editable sheet.
// Sections: PO header, Customer/Delivery, Garment Lines (with inline image upload),
// File Vault (drag-and-drop), Portal Actions, Admin Notes, Activity Log.
// No tabs. No chat. No production stages.

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { useParams, Link, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { upload } from "@vercel/blob/client";
import { getQueryFn } from "@/lib/queryClient";
import { computeMilestones } from "@shared/po-milestones";
import { productsGroupedByCategory, getProductById } from "@shared/product-catalog";
import { BRANDING_METHODS } from "@shared/branding-methods";
import { SIZE_CHART_LABELS, suggestSizeChart, getSizeChartTables, type SizeChartType } from "@shared/size-charts";
import { LOGO_POSITIONS, type LogoElement, type LogoPosition } from "@shared/schema";
import { getDesignPrints, getMockups, type DesignAsset } from "@shared/design-assets";
import {
  ArrowLeft, FileText, ExternalLink, Upload, Download,
  Check, X, MessageSquare, Printer, Plus, Trash2, Sparkles, Ruler, ChevronDown, ChevronRight, Copy,
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
  productType: string | null;
  material: string | null;
  frontDesignUrl: string | null;
  backDesignUrl: string | null;
  elementUrls: LogoElement[] | null;
  designPrints: DesignAsset[] | null;
  mockupImages: DesignAsset[] | null;
  gradeGroup: string | null; // deprecated — no longer shown
  designNotes: string | null;
  designBrief: string | null;
  sizeChartType: string | null;
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
  customerFirstName: string | null;
  customerLastName: string | null;
  customerPhone: string | null;
  companyEmail: string | null;
  companyPhone: string | null;
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
  orderType: string | null;
  artworkApproved: boolean | null;
  artworkApprovedBy: string | null;
  artworkApprovedAt: string | null;
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

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      const r = await apiRequest("DELETE", `/api/admin/orders/${params.id}/items/${itemId}`);
      return r.json();
    },
    onSuccess: invalidate,
  });

  // AI colour extraction — Gemini reads the design image and writes the
  // dominant hex+name set to item.productColors.
  const extractColors = useMutation({
    mutationFn: async ({ itemId, imageUrl, side }: { itemId: string; imageUrl?: string; side?: "front" | "back" }) => {
      const r = await apiRequest("POST", `/api/admin/orders/${params.id}/items/${itemId}/extract-colors`, {
        imageUrl, side, apply: true,
      });
      return r.json();
    },
    onSuccess: invalidate,
  });

  // AI design brief — Gemini describes the design layout, positions, patterns
  const generateBrief = useMutation({
    mutationFn: async ({ itemId }: { itemId: string }) => {
      const r = await apiRequest("POST", `/api/admin/orders/${params.id}/items/${itemId}/generate-brief`, {});
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

  const updateSizeMut = useMutation({
    mutationFn: async ({ bid, ...d }: { bid: string; size?: string; quantity?: number }) => {
      const r = await apiRequest("PATCH", `/api/admin/orders/${params.id}/size-breakdowns/${bid}`, d);
      return r.json();
    },
    onSuccess: invalidate,
  });

  const deleteSizeMut = useMutation({
    mutationFn: async (bid: string) => {
      const r = await apiRequest("DELETE", `/api/admin/orders/${params.id}/size-breakdowns/${bid}`);
      return r.json();
    },
    onSuccess: invalidate,
  });

  const genPdfMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/orders/${params.id}/generate-pdf`, {});
      return r.json();
    },
    onSuccess: (data) => {
      invalidate();
      if (data.pdfUrl) window.open(data.pdfUrl, "_blank");
    },
  });

  const raisePoMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/orders/${params.id}/raise-po`, { supplierId: selectedSupplierId || undefined });
      return r.json();
    },
    onSuccess: (r: any) => { invalidate(); setPortalMsg({ ok: true, text: r.ghlPushed ? "PO raised · supplier emailed · GHL → PO Raised" : `PO raised · supplier emailed · GHL skipped (${r.ghlPushReason})` }); },
    onError: (e: any) => setPortalMsg({ ok: false, text: e?.message || "Failed" }),
  });

  const [, navigate] = useLocation();
  const deleteOrderMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("DELETE", `/api/admin/orders/${params.id}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      navigate("/admin/orders");
    },
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

  // ─── Cockpit header — "where is this PO right now?" at a glance ───
  // 7 read-at-a-glance fields: PO#, Company, Due, current milestone, stage,
  // supplier, drive. Every field elsewhere on the page stays inline-editable
  // exactly as before — this strip is reference, not entry.
  const cockpitMilestone = (() => {
    if (!order.dueDate) return null;
    const ms = computeMilestones(order.dueDate);
    if (!ms) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    // Next milestone not yet passed
    const next = ms.find((m) => new Date(m.date + "T00:00:00") >= today) || ms[ms.length - 1];
    return next;
  })();

  const supplierName = (() => {
    const sid = selectedSupplierId || order.assignedSupplierId;
    if (!sid) return null;
    const s = (suppliers || []).find((x: any) => x.id === sid);
    return s?.supplierName || s?.email || null;
  })();

  const primaryContact =
    [order.customerFirstName, order.customerLastName].filter(Boolean).join(" ").trim() ||
    order.customerName ||
    order.customerEmail ||
    "—";

  return (
    <AdminLayout>
      {/* Back link */}
      <div style={{ marginBottom: "14px" }}>
        <Link href="/admin/orders">
          <span style={{ color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
            <ArrowLeft size={13} /> Orders
          </span>
        </Link>
      </div>

      {/* ──── Cockpit header (sticky) ──── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "linear-gradient(180deg, rgba(10,22,40,0.98) 0%, rgba(10,22,40,0.95) 100%)",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "12px",
        padding: "14px 18px",
        marginBottom: "16px",
        display: "flex", flexDirection: "column", gap: "10px",
      }}>
        {/* Top row — PO#, badges, actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: "18px", fontWeight: 700, margin: 0, color: "#fff", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              {order.poReference || order.orderNumber}
            </h1>
            {order.accountName && <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)" }}>— {order.accountName}</span>}
            {order.orderType && (
              <span style={{
                fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "4px",
                textTransform: "uppercase", letterSpacing: "0.5px",
                background: order.orderType === "team-store" ? "rgba(59,130,246,0.15)" : order.orderType === "sample-run" ? "rgba(234,179,8,0.15)" : "rgba(168,85,247,0.15)",
                color: order.orderType === "team-store" ? "#3b82f6" : order.orderType === "sample-run" ? "#eab308" : "#a855f7",
              }}>
                {order.orderType === "team-store" ? "Team Store" : order.orderType === "sample-run" ? "Sample Run" : "Bulk Order"}
              </span>
            )}
            <StatusBadge status={order.status} />
            {order.pipelineStage && <StageBadge stage={order.pipelineStage} />}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {order.driveFolderUrl && (
              <a href={order.driveFolderUrl} target="_blank" rel="noreferrer"
                style={{ padding: "7px 12px", fontSize: "11px", fontWeight: 600, background: "rgba(249,115,22,0.1)", color: "#f97316", border: "1px solid rgba(249,115,22,0.3)", borderRadius: "6px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                Drive <ExternalLink size={10} />
              </a>
            )}
            <button
              onClick={() => { setPortalMsg(null); raisePoMut.mutate(); }}
              disabled={raisePoMut.isPending || (!selectedSupplierId && !order.assignedSupplierId)}
              title={!order.assignedSupplierId && !selectedSupplierId ? "Assign a supplier in Portal Actions first" : "Dispatch PO to supplier"}
              style={{
                padding: "7px 14px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px",
                background: (selectedSupplierId || order.assignedSupplierId) ? "#C9A84C" : "rgba(255,255,255,0.04)",
                color: (selectedSupplierId || order.assignedSupplierId) ? "#0A1628" : "rgba(255,255,255,0.3)",
                border: "none", borderRadius: "6px",
                cursor: raisePoMut.isPending || (!selectedSupplierId && !order.assignedSupplierId) ? "not-allowed" : "pointer",
              }}
            >
              {raisePoMut.isPending ? "Dispatching…" : "Dispatch to Supplier"}
            </button>
            {order.driveFolderId && (
              <button
                onClick={() => genPdfMut.mutate()}
                disabled={genPdfMut.isPending}
                style={{ padding: "7px 12px", fontSize: "11px", fontWeight: 600, background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}
              >
                <FileText size={12} /> {genPdfMut.isPending ? "Generating…" : "PDF → Drive"}
              </button>
            )}
            <Link href={`/admin/orders/${order.id}/po`}>
              <button style={{ padding: "7px 12px", fontSize: "11px", fontWeight: 600, background: "#fff", color: "#000", border: "none", borderRadius: "6px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Printer size={12} /> Preview
              </button>
            </Link>
            <button
              onClick={() => {
                const confirmLabel = order.poReference || order.orderNumber;
                if (!window.confirm(`Delete ${confirmLabel}?\n\nThis permanently removes the order, line items, size breakdowns, uploaded designs, production stages, QC checks, messages, and activity. The Drive folder will remain as an audit trail. This cannot be undone.`)) return;
                deleteOrderMut.mutate();
              }}
              disabled={deleteOrderMut.isPending}
              title="Delete this order and all associated data"
              style={{ padding: "7px 12px", fontSize: "11px", fontWeight: 600, background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "6px", cursor: deleteOrderMut.isPending ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}
            >
              <Trash2 size={12} /> {deleteOrderMut.isPending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>

        {/* Bottom row — 5 at-a-glance cells */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px", fontSize: "12px" }}>
          <CockpitCell label="Contact">
            <span style={{ color: "#fff" }}>{primaryContact}</span>
          </CockpitCell>
          <CockpitCell label="Due">
            {order.dueDate
              ? <span style={{ color: "#fff", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{order.dueDate}</span>
              : <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>}
          </CockpitCell>
          <CockpitCell label="Next milestone">
            {cockpitMilestone
              ? <span style={{ color: "#f97316" }}>{cockpitMilestone.label} · <span style={{ color: "rgba(255,255,255,0.5)" }}>Day {cockpitMilestone.dayNumber}</span></span>
              : <span style={{ color: "rgba(255,255,255,0.3)" }}>set a due date</span>}
          </CockpitCell>
          <CockpitCell label="Supplier">
            {supplierName
              ? <span style={{ color: "#fff" }}>{supplierName}</span>
              : <span style={{ color: "rgba(234,179,8,0.9)" }}>not assigned</span>}
          </CockpitCell>
          <CockpitCell label="Lines">
            <span style={{ color: "#fff" }}>{items.length}</span>
          </CockpitCell>
        </div>
      </div>

      {/* ──── PO Details ──── */}
      <Section title="PO Details" defaultOpen={false}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
          <Field label="PO Reference"><EditableField value={order.poReference} onSave={(v) => updateOrder.mutate({ poReference: v })} placeholder="PO-YYYY-NNNN" /></Field>
          <Field label="Account"><EditableField value={order.accountName} onSave={(v) => updateOrder.mutate({ accountName: v })} placeholder="Account name" /></Field>
          <Field label="Order Type">
            <select value={order.orderType || "bulk-order"} onChange={(e) => updateOrder.mutate({ orderType: e.target.value })} style={{ ...inputStyle, width: "auto" }}>
              <option value="bulk-order" style={{ background: "#111" }}>Bulk Order</option>
              <option value="team-store" style={{ background: "#111" }}>Team Store</option>
              <option value="sample-run" style={{ background: "#111" }}>Sample Run</option>
            </select>
          </Field>
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
          <Field label="Artwork Approval">
            {order.artworkApproved ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ padding: "4px 10px", background: "#16a34a", color: "#fff", borderRadius: "4px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.3px" }}>APPROVED</span>
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
                  {order.artworkApprovedBy || "—"}
                  {order.artworkApprovedAt ? ` · ${new Date(order.artworkApprovedAt).toISOString().slice(0, 10)}` : ""}
                </span>
                <button
                  onClick={() => updateOrder.mutate({ artworkApproved: false, artworkApprovedBy: null, artworkApprovedAt: null })}
                  style={{ padding: "3px 8px", fontSize: "11px", background: "transparent", color: "rgba(239,68,68,0.8)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "4px", cursor: "pointer" }}
                  title="Revert to pending"
                >Revert</button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ padding: "4px 10px", background: "#f59e0b", color: "#fff", borderRadius: "4px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.3px" }}>PENDING</span>
                <button
                  onClick={() => {
                    const who = prompt("Approved by (name):", order.customerName || "") || "";
                    if (!who) return;
                    updateOrder.mutate({ artworkApproved: true, artworkApprovedBy: who, artworkApprovedAt: new Date().toISOString() });
                  }}
                  style={{ padding: "4px 10px", fontSize: "11px", fontWeight: 600, background: "#16a34a", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
                >Mark Approved</button>
              </div>
            )}
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
      <Section title="Customer" defaultOpen={false}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
          <Field label="First Name"><EditableField value={order.customerFirstName} onSave={(v) => updateOrder.mutate({ customerFirstName: v })} placeholder="First name" /></Field>
          <Field label="Last Name"><EditableField value={order.customerLastName} onSave={(v) => updateOrder.mutate({ customerLastName: v })} placeholder="Last name" /></Field>
          <Field label="Phone"><EditableField value={order.customerPhone} onSave={(v) => updateOrder.mutate({ customerPhone: v })} placeholder="022..." /></Field>
          <Field label="Email"><EditableField value={order.customerEmail} onSave={(v) => updateOrder.mutate({ customerEmail: v })} placeholder="customer@email.com" /></Field>
          <Field label="Company Email"><EditableField value={order.companyEmail} onSave={(v) => updateOrder.mutate({ companyEmail: v })} placeholder="accounts@club.co.nz" /></Field>
          <Field label="Company Phone"><EditableField value={order.companyPhone} onSave={(v) => updateOrder.mutate({ companyPhone: v })} placeholder="09 ..." /></Field>
        </div>
      </Section>

      <Section title="Delivery Address" defaultOpen={false}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <Field label="Attention"><EditableField value={order.deliveryAttention} onSave={(v) => updateOrder.mutate({ deliveryAttention: v })} placeholder="Attention" /></Field>
          <Field label="Phone"><EditableField value={order.deliveryPhone} onSave={(v) => updateOrder.mutate({ deliveryPhone: v })} placeholder="022..." /></Field>
          <Field label="Email" style={{ gridColumn: "span 2" }}><EditableField value={order.deliveryEmail} onSave={(v) => updateOrder.mutate({ deliveryEmail: v })} placeholder="delivery@email.com" /></Field>
          <Field label="Address" style={{ gridColumn: "span 2" }}><EditableField value={order.deliveryAddress} onSave={(v) => updateOrder.mutate({ deliveryAddress: v })} placeholder="Full address" multiline /></Field>
        </div>
      </Section>

      {/* ──── Garment Lines ──── */}
      <Section title="Garment Lines" count={items.length} defaultOpen={true}>
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
            <div key={item.id} style={{ position: "relative", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "20px", marginBottom: "16px" }}>
              <button
                onClick={() => {
                  const label = item.productName || "this garment";
                  if (!window.confirm(`Remove ${label} from this order?\n\nThe line item + its size breakdowns will be deleted. Other garments on this order are not affected.`)) return;
                  deleteItem.mutate(item.id);
                }}
                disabled={deleteItem.isPending}
                title="Remove this garment line"
                style={{ position: "absolute", top: "12px", right: "12px", padding: "5px 8px", fontSize: "10px", fontWeight: 600, background: "rgba(239,68,68,0.08)", color: "rgba(239,68,68,0.85)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "5px", cursor: deleteItem.isPending ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: "4px", textTransform: "uppercase", letterSpacing: "0.3px", zIndex: 2 }}
              >
                <Trash2 size={11} /> Remove line
              </button>
              {/* Item header */}
              <div style={{ display: "flex", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
                <Field label="Product" style={{ flex: 2 }}>
                  <select
                    value={item.productType || ""}
                    onChange={(e) => {
                      const p = getProductById(e.target.value);
                      updateItem.mutate({
                        itemId: item.id,
                        productType: e.target.value,
                        ...(p ? { productName: p.name, material: item.material || p.defaultMaterial } : {}),
                      });
                    }}
                    style={{ ...inputStyle, width: "100%" }}
                  >
                    <option value="" style={{ background: "#111" }}>
                      {item.productName || "— Select product —"}
                    </option>
                    {Object.entries(productsGroupedByCategory()).map(([category, products]) => (
                      <optgroup key={category} label={category}>
                        {products.map((p) => (
                          <option key={p.id} value={p.id} style={{ background: "#111" }}>{p.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </Field>
                <Field label="Material" style={{ flex: 2 }}>
                  <EditableField
                    value={item.material}
                    onSave={(v) => updateItem.mutate({ itemId: item.id, material: v })}
                    placeholder={getProductById(item.productType)?.defaultMaterial || "Fabric / weight / finish"}
                  />
                </Field>
                <Field label="Branding Application" style={{ flex: 1.4 }}>
                  <select
                    value={item.brandingMethod || ""}
                    onChange={(e) => updateItem.mutate({ itemId: item.id, brandingMethod: e.target.value })}
                    style={{ ...inputStyle, width: "100%" }}
                  >
                    <option value="" style={{ background: "#111" }}>— Select —</option>
                    {BRANDING_METHODS.map((m) => (
                      <option key={m} value={m} style={{ background: "#111" }}>{m}</option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* Sideline NZ size chart — selectable per garment line */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "8px 10px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "6px", marginBottom: "12px" }}>
                <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.6px", color: "rgba(255,255,255,0.4)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <Ruler size={10} /> Size Chart
                </span>
                <select
                  value={item.sizeChartType || suggestSizeChart(item.productType)}
                  onChange={(e) => updateItem.mutate({ itemId: item.id, sizeChartType: e.target.value })}
                  style={{ fontSize: "11px", padding: "3px 8px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", color: "#fff" }}
                >
                  {Object.entries(SIZE_CHART_LABELS).map(([k, label]) => (
                    <option key={k} value={k} style={{ background: "#111" }}>{label}</option>
                  ))}
                </select>
                {(() => {
                  const chartType = (item.sizeChartType || suggestSizeChart(item.productType)) as SizeChartType;
                  const tables = getSizeChartTables(chartType);
                  const allHeaders = tables.flatMap(t => t.headers.filter(Boolean));
                  return allHeaders.map((s) => (
                    <span key={s} style={{ padding: "2px 8px", fontSize: "11px", fontWeight: 600, color: "#fff", background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: "4px" }}>
                      {s}
                    </span>
                  ));
                })()}
              </div>

              {/* Colours chip row (moved from header so it gets its own breathing space) */}
              <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
                <Field label="Colours" style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                    {(item.productColors ?? []).map((c, i) => (
                      <span
                        key={i}
                        title={`${c.hex}${c.name ? " · " + c.name : ""}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "2px 8px 2px 3px",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: "999px",
                          background: "rgba(255,255,255,0.04)",
                          fontSize: "11px",
                          color: "rgba(255,255,255,0.75)",
                        }}
                      >
                        <span style={{ width: "14px", height: "14px", background: c.hex, borderRadius: "999px", border: "1px solid rgba(255,255,255,0.25)" }} />
                        {c.name || c.hex}
                      </span>
                    ))}
                    {!(item.productColors?.length) && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "12px" }}>—</span>}
                    <button
                      type="button"
                      onClick={() => extractColors.mutate({ itemId: item.id })}
                      disabled={extractColors.isPending || (!item.frontDesignUrl && !item.backDesignUrl)}
                      title={item.frontDesignUrl || item.backDesignUrl ? "Extract dominant colours from the design with AI" : "Upload a design first"}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "3px 8px",
                        fontSize: "10px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        background: "rgba(249,115,22,0.08)",
                        color: "#f97316",
                        border: "1px solid rgba(249,115,22,0.25)",
                        borderRadius: "999px",
                        cursor: (item.frontDesignUrl || item.backDesignUrl) ? "pointer" : "not-allowed",
                        opacity: (item.frontDesignUrl || item.backDesignUrl) ? 1 : 0.4,
                      }}
                    >
                      <Sparkles size={10} />
                      {extractColors.isPending && extractColors.variables?.itemId === item.id ? "Reading…" : "AI extract"}
                    </button>
                  </div>
                </Field>
              </div>

              {/* Row 1: 2D Design Prints + 3D Mockups (both multi-image managers) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <DesignAssetManager
                  title="2D Design Prints — factory artwork (true colours)"
                  assets={getDesignPrints(item as any)}
                  vaultImages={designs.filter((d) => d.folder === "mockups" && d.mimeType?.startsWith("image/")).map((d) => ({ id: d.id, fileUrl: d.fileUrl, fileName: d.fileName }))}
                  onSave={(next) => updateItem.mutate({ itemId: item.id, designPrints: next })}
                  defaultLabels={["Front", "Back", "Sleeve", "Detail"]}
                  onFirstUpload={(url) => {
                    // Auto-extract colours + brief on first 2D print upload (true
                    // colours beat mockup colours). Skipped if already set.
                    if (!item.productColors?.length) {
                      extractColors.mutate({ itemId: item.id, imageUrl: url, side: "front" });
                    }
                    if (!item.designBrief) {
                      setTimeout(() => generateBrief.mutate({ itemId: item.id }), 1500);
                    }
                  }}
                />
                <DesignAssetManager
                  title="3D Mockups — vendor renders"
                  assets={getMockups(item as any)}
                  vaultImages={designs.filter((d) => d.folder === "mockups" && d.mimeType?.startsWith("image/")).map((d) => ({ id: d.id, fileUrl: d.fileUrl, fileName: d.fileName }))}
                  onSave={(next) => updateItem.mutate({ itemId: item.id, mockupImages: next, frontDesignUrl: null, backDesignUrl: null })}
                  defaultLabels={["Front", "Back", "Side", "3/4 View"]}
                />
              </div>

              {/* Row 2: Logo Elements (full-width, with copy-from dropdown) */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", flexWrap: "wrap", gap: "8px" }}>
                  <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(255,255,255,0.4)", margin: 0 }}>Logo Elements ({(item.elementUrls ?? []).length})</p>
                  <CopyLogosFrom
                    currentItemId={item.id}
                    items={items}
                    onCopy={(sourceElements) => {
                      const cloned = sourceElements.map((el) => ({ ...el })) as LogoElement[];
                      updateItem.mutate({ itemId: item.id, elementUrls: cloned });
                    }}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "8px" }}>
                  {(item.elementUrls ?? []).map((el, i) => (
                    <LogoElementEditor
                      key={i}
                      element={el}
                      onChange={(next) => {
                        const list = [...(item.elementUrls ?? [])];
                        list[i] = next;
                        updateItem.mutate({ itemId: item.id, elementUrls: list });
                      }}
                      onRemove={() => {
                        const list = [...(item.elementUrls ?? [])];
                        list.splice(i, 1);
                        updateItem.mutate({ itemId: item.id, elementUrls: list });
                      }}
                    />
                  ))}
                  <ImageUploadSlot
                    label="+ Add element"
                    url={null}
                    small
                    onUpload={(url) => {
                      const name = prompt("Element name (e.g. sponsor logo):") || "Logo";
                      const existing = (item.elementUrls ?? []) as LogoElement[];
                      updateItem.mutate({ itemId: item.id, elementUrls: [...existing, { name, url }] });
                    }}
                    vaultImages={designs.filter((d) => d.folder === "logos" && d.mimeType?.startsWith("image/")).map((d) => ({ id: d.id, fileUrl: d.fileUrl, fileName: d.fileName }))}
                  />
                </div>
              </div>

              {/* Size breakdown + design notes */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(255,255,255,0.4)", marginBottom: "6px" }}>Size Run</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px", alignItems: "center" }}>
                    {bds.map((b) => (
                      <span key={b.id} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", padding: "3px 4px 3px 10px", background: "rgba(255,255,255,0.06)", borderRadius: "6px", color: "#fff", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <span style={{ fontWeight: 600, marginRight: "2px" }}>{b.size}</span>
                        <input
                          type="number"
                          min={1}
                          value={b.quantity}
                          onChange={(e) => {
                            const v = parseInt(e.target.value);
                            if (v > 0) updateSizeMut.mutate({ bid: b.id, quantity: v });
                          }}
                          style={{
                            width: "38px", padding: "2px 4px", fontSize: "12px", textAlign: "center",
                            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: "3px", color: "#fff", outline: "none",
                          }}
                        />
                        <button
                          onClick={() => deleteSizeMut.mutate(b.id)}
                          title="Remove size"
                          style={{ background: "none", border: "none", color: "rgba(239,68,68,0.5)", cursor: "pointer", fontSize: "12px", padding: "0 2px", lineHeight: 1 }}
                        >✕</button>
                      </span>
                    ))}
                    {bds.length > 0 && (
                      <span style={{ fontSize: "12px", padding: "4px 10px", background: "rgba(201,168,76,0.15)", borderRadius: "4px", color: "#C9A84C", fontWeight: 600 }}>
                        Total: {totalQty}
                      </span>
                    )}
                    {bds.length === 0 && <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>No sizes added yet</span>}
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

              {/* AI Design Brief */}
              <div style={{ marginTop: "12px", padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: item.designBrief ? "8px" : "0" }}>
                  <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Sparkles size={10} style={{ color: "#f97316" }} /> Design Brief
                    <span style={{ fontSize: "9px", opacity: 0.6, fontStyle: "italic", textTransform: "none", letterSpacing: "0" }}>powered by AI</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => generateBrief.mutate({ itemId: item.id })}
                    disabled={generateBrief.isPending || (!item.frontDesignUrl && !item.backDesignUrl)}
                    title={item.frontDesignUrl || item.backDesignUrl ? "Generate AI design brief from mockup images" : "Upload a design first"}
                    style={{
                      padding: "4px 10px", fontSize: "10px", fontWeight: 600,
                      background: "rgba(249,115,22,0.08)", color: "#f97316",
                      border: "1px solid rgba(249,115,22,0.25)", borderRadius: "999px",
                      cursor: (item.frontDesignUrl || item.backDesignUrl) ? "pointer" : "not-allowed",
                      opacity: (item.frontDesignUrl || item.backDesignUrl) ? 1 : 0.4,
                    }}
                  >
                    {generateBrief.isPending && generateBrief.variables?.itemId === item.id ? "Analysing…" : item.designBrief ? "Regenerate" : "Generate"}
                  </button>
                </div>
                {item.designBrief && (
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)", lineHeight: "1.7", whiteSpace: "pre-wrap" }}>
                    {item.designBrief}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </Section>

      {/* ──── File Vault (drag & drop) ──── */}
      <Section title="File Vault" defaultOpen={false}>
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
      <Section title="Portal Actions" gold defaultOpen={false}>
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
      <Section title="Admin Notes" defaultOpen={false}>
        <EditableField value={order.adminNotes} onSave={(v) => updateOrder.mutate({ adminNotes: v })} placeholder="Internal notes…" multiline style={{ width: "100%" }} />
      </Section>

      {/* ──── Activity Log ──── */}
      <Section title="Activity Log" defaultOpen={false}>
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

// ─── Multi-image manager (Design Prints / Mockups) ────────────────
//
// Renders a list of DesignAsset thumbnails with inline label editing + a
// remove button, plus a "+ Add" slot at the end. Writes the full updated
// array back through `onSave` on every change so the parent mutation
// debounces naturally.

function DesignAssetManager({ title, assets, vaultImages, onSave, defaultLabels = [], onFirstUpload }: {
  title: string;
  assets: DesignAsset[];
  vaultImages: { id: string; fileUrl: string; fileName: string }[];
  onSave: (next: DesignAsset[]) => void;
  defaultLabels?: string[];
  onFirstUpload?: (url: string) => void;
}) {
  const labelInputStyle: React.CSSProperties = {
    width: "100%", padding: "3px 6px", fontSize: "10px",
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "3px", color: "rgba(255,255,255,0.9)", outline: "none",
    textTransform: "uppercase", letterSpacing: "0.3px",
  };

  return (
    <div>
      <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(255,255,255,0.4)", marginBottom: "6px" }}>{title}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "8px" }}>
        {assets.map((a, i) => (
          <div key={i} style={{ padding: "6px", background: "rgba(255,255,255,0.02)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ aspectRatio: "1", background: "rgba(255,255,255,0.03)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "5px", overflow: "hidden" }}>
              <img src={a.url} alt={a.label} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            </div>
            <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
              <input
                style={labelInputStyle}
                value={a.label}
                placeholder="Label"
                onChange={(e) => {
                  const next = [...assets];
                  next[i] = { ...next[i], label: e.target.value };
                  onSave(next);
                }}
              />
              <button
                onClick={() => onSave(assets.filter((_, j) => j !== i))}
                title="Remove"
                style={{ background: "transparent", border: "none", color: "rgba(239,68,68,0.7)", cursor: "pointer", padding: "2px" }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}
        <ImageUploadSlot
          label="+ Add"
          url={null}
          small
          onUpload={(url) => {
            const nextLabel = defaultLabels[assets.length] || `View ${assets.length + 1}`;
            const next = [...assets, { label: nextLabel, url }];
            onSave(next);
            if (assets.length === 0 && onFirstUpload) onFirstUpload(url);
          }}
          vaultImages={vaultImages}
        />
      </div>
    </div>
  );
}

// ─── Copy logos from another garment on this order ─────────────────
//
// Saves a lot of keystrokes on a club order where the jersey, shorts, jacket,
// and hoodie all share the same club + sponsor logos. Pick the source
// garment → clones its elementUrls (with positions, sizes, thread codes,
// file refs) onto the current item. User can then tweak per-item.

function CopyLogosFrom({ currentItemId, items, onCopy }: {
  currentItemId: string;
  items: OrderItem[];
  onCopy: (elements: LogoElement[]) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const sources = items.filter((it) => it.id !== currentItemId && (it.elementUrls ?? []).length > 0);
  if (sources.length === 0) return null;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setPickerOpen((v) => !v)}
        style={{ padding: "4px 10px", fontSize: "10px", fontWeight: 600, background: "rgba(59,130,246,0.1)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "4px", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.3px", display: "inline-flex", alignItems: "center", gap: "4px" }}
        title="Copy all logo elements (with placement data) from another garment on this order"
      >
        <Copy size={10} /> Copy logos from…
      </button>
      {pickerOpen && (
        <div style={{ position: "absolute", top: "100%", right: 0, marginTop: "4px", background: "#111", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", padding: "4px", zIndex: 10, minWidth: "220px", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
          {sources.map((src) => (
            <button
              key={src.id}
              onClick={() => {
                const msg = `Copy ${(src.elementUrls ?? []).length} logo(s) from "${src.productName}"?\n\nExisting logos on this garment will be replaced.`;
                if (!window.confirm(msg)) return;
                onCopy(src.elementUrls ?? []);
                setPickerOpen(false);
              }}
              style={{ display: "block", width: "100%", padding: "7px 10px", background: "transparent", border: "none", color: "rgba(255,255,255,0.85)", textAlign: "left", fontSize: "12px", cursor: "pointer", borderRadius: "4px" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {src.productName}
              <span style={{ marginLeft: "6px", color: "rgba(255,255,255,0.4)", fontSize: "10px" }}>({(src.elementUrls ?? []).length})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Logo placement editor (per element) ───────────────────────────
//
// Collapsed row: thumbnail + name + position pill + expand chevron + delete.
// Expanded: inputs for position, application, size (mm), thread/PMS codes,
// artwork file. Writes through `onChange` on blur/commit so the parent
// mutation batches.

const APPLICATION_METHODS = ["Embroidery", "Screen Print", "Sublimation", "Heat Transfer", "DTF", "Vinyl"];

function LogoElementEditor({ element, onChange, onRemove }: {
  element: LogoElement;
  onChange: (next: LogoElement) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<LogoElement>(element);

  const commit = (patch: Partial<LogoElement>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    onChange(next);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "5px 8px", fontSize: "11px",
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "4px", color: "#fff", outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.6px",
    color: "rgba(255,255,255,0.4)", marginBottom: "3px",
  };

  return (
    <div style={{ padding: "6px", background: "rgba(255,255,255,0.02)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <img src={local.url} alt={local.name} style={{ maxHeight: "44px", maxWidth: "70px", objectFit: "contain" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "11px", color: "#fff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{local.name}</div>
          <div style={{ fontSize: "10px", color: local.position ? "#4ade80" : "rgba(255,255,255,0.35)" }}>
            {local.position || "No position set"}
            {local.application ? ` · ${local.application}` : ""}
            {local.sizeMm ? ` · ${local.sizeMm}` : ""}
          </div>
        </div>
        <button onClick={() => setOpen((v) => !v)} title={open ? "Collapse" : "Edit placement"} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", padding: "4px" }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button onClick={onRemove} title="Remove element" style={{ background: "transparent", border: "none", color: "rgba(239,68,68,0.7)", cursor: "pointer", padding: "4px" }}>
          <Trash2 size={14} />
        </button>
      </div>

      {open && (
        <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <div>
            <div style={labelStyle}>Name</div>
            <input
              style={inputStyle}
              value={local.name}
              onChange={(e) => setLocal({ ...local, name: e.target.value })}
              onBlur={() => commit({ name: local.name })}
            />
          </div>
          <div>
            <div style={labelStyle}>Position</div>
            <select style={inputStyle} value={local.position || ""} onChange={(e) => commit({ position: (e.target.value || undefined) as LogoPosition | undefined })}>
              <option value="">— unassigned —</option>
              {LOGO_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Application</div>
            <select style={inputStyle} value={local.application || ""} onChange={(e) => commit({ application: e.target.value || undefined })}>
              <option value="">—</option>
              {APPLICATION_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Size (mm)</div>
            <input
              style={inputStyle}
              placeholder="e.g. 85 × 60 mm"
              value={local.sizeMm || ""}
              onChange={(e) => setLocal({ ...local, sizeMm: e.target.value })}
              onBlur={() => commit({ sizeMm: local.sizeMm || undefined })}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={labelStyle}>Thread / PMS codes (comma-separated)</div>
            <input
              style={inputStyle}
              placeholder="e.g. PMS Black, PMS 130 C, White"
              value={(local.threadColours || []).join(", ")}
              onChange={(e) => setLocal({ ...local, threadColours: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
              onBlur={() => commit({ threadColours: local.threadColours?.length ? local.threadColours : undefined })}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={labelStyle}>Artwork file reference</div>
            <input
              style={inputStyle}
              placeholder="e.g. NWF-LOGO-v2.ai"
              value={local.artworkFile || ""}
              onChange={(e) => setLocal({ ...local, artworkFile: e.target.value })}
              onBlur={() => commit({ artworkFile: local.artworkFile || undefined })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Small presentational helpers ────────────────────────────────────

// Section with localStorage-persisted open state. Key = "po-section:<title>"
// (global, not per-order) — admins typically want the same sections open
// across every PO they touch, not per-PO memory.
function Section({ title, children, gold, defaultOpen = false, count }: { title: string; children: React.ReactNode; gold?: boolean; defaultOpen?: boolean; count?: number }) {
  const storageKey = `po-section:${title}`;
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return defaultOpen;
    const v = window.localStorage.getItem(storageKey);
    return v === null ? defaultOpen : v === "1";
  });
  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(storageKey, next ? "1" : "0"); } catch {}
      return next;
    });
  };
  return (
    <div style={{ background: "#111", border: `1px solid ${gold ? "rgba(201,168,76,0.25)" : "rgba(255,255,255,0.06)"}`, borderRadius: "12px", marginBottom: "12px", overflow: "hidden" }}>
      <button
        onClick={toggle}
        style={{
          width: "100%", padding: "14px 24px", background: "none", border: "none", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 700, color: gold ? "#C9A84C" : "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "1.5px", margin: 0 }}>{title}</h2>
          {typeof count === "number" && (
            <span style={{ fontSize: "10px", fontWeight: 600, color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.06)", padding: "2px 7px", borderRadius: "10px" }}>{count}</span>
          )}
        </span>
        <span style={{ fontSize: "18px", color: "rgba(255,255,255,0.3)", transform: open ? "rotate(0)" : "rotate(-90deg)", transition: "transform 0.15s" }}>▾</span>
      </button>
      {open && <div style={{ padding: "0 24px 20px" }}>{children}</div>}
    </div>
  );
}

// Compact cell for the cockpit header — label above, value below, no input.
function CockpitCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: "3px", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: "12px", fontWeight: 500 }}>{children}</div>
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
