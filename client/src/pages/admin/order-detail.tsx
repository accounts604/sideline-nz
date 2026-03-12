import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { useParams, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, Check, X, MessageSquare, FileText, ExternalLink,
  Play, Plus, Shield, Truck, Users, Hash,
} from "lucide-react";
import { ProductionTracker } from "@/components/production-tracker";
import { OrderChat } from "@/components/order-chat";
import { QualityChecksView } from "@/components/quality-checks";
import { SizeBreakdownView } from "@/components/size-breakdown";
import { ActivityLog } from "@/components/activity-log";

interface OrderItem {
  id: string;
  productName: string;
  productImage: string | null;
  size: string | null;
  quantity: number;
  unitAmount: number;
  currency: string;
}

interface DesignFile {
  id: string;
  label: string;
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
  userId: string;
  comment: string;
  action: string | null;
  createdAt: string;
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
  estimatedDeliveryDate: string | null;
  total: number;
  subtotal: number;
  shipping: number;
  tax: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
}

interface OrderDetail {
  order: Order;
  items: OrderItem[];
  designs: DesignFile[];
  comments: DesignComment[];
  stages: any[];
  qcChecks: any[];
  sizeBreakdowns: any[];
  messages: any[];
  activity: any[];
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
    not_started: { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.4)" },
    pending_review: { bg: "rgba(234,179,8,0.15)", text: "#eab308" },
    needs_revision: { bg: "rgba(239,68,68,0.15)", text: "#ef4444" },
  };
  const c = colors[status] || { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.5)" };
  return (
    <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px", background: c.bg, color: c.text, textTransform: "uppercase", letterSpacing: "0.5px" }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function AdminOrderDetail() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [reviewComment, setReviewComment] = useState("");
  const [reviewingFileId, setReviewingFileId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [statusEdit, setStatusEdit] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "production" | "designs" | "chat" | "activity">("overview");

  // Size breakdown form state
  const [showSizeForm, setShowSizeForm] = useState(false);
  const [sizeFormItem, setSizeFormItem] = useState("");
  const [sizeFormSize, setSizeFormSize] = useState("");
  const [sizeFormQty, setSizeFormQty] = useState(1);
  const [sizeFormName, setSizeFormName] = useState("");
  const [sizeFormNumber, setSizeFormNumber] = useState("");

  // QC form state
  const [showQcForm, setShowQcForm] = useState(false);
  const [qcType, setQcType] = useState("pre_production");
  const [qcStatus, setQcStatus] = useState("pending");
  const [qcNotes, setQcNotes] = useState("");
  const [qcIssues, setQcIssues] = useState("");

  // Tracking form state
  const [showTrackingForm, setShowTrackingForm] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/admin/orders/${params.id}`] });
  };

  const { data, isLoading } = useQuery<OrderDetail>({
    queryKey: [`/api/admin/orders/${params.id}`],
    enabled: !!params.id,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ designFileId, action, comment }: { designFileId: string; action: string; comment?: string }) => {
      const res = await apiRequest("POST", `/api/admin/orders/${params.id}/design-review`, { designFileId, action, comment });
      return res.json();
    },
    onSuccess: () => { invalidate(); setReviewComment(""); setReviewingFileId(null); },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/admin/orders/${params.id}`, data);
      return res.json();
    },
    onSuccess: () => { invalidate(); setEditingNotes(false); setStatusEdit(""); setShowTrackingForm(false); },
  });

  const initPipelineMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/orders/${params.id}/production/initialize`);
      return res.json();
    },
    onSuccess: invalidate,
  });

  const advanceStageMutation = useMutation({
    mutationFn: async (notes?: string | void) => {
      const res = await apiRequest("POST", `/api/admin/orders/${params.id}/production/advance`, { notes });
      return res.json();
    },
    onSuccess: invalidate,
  });

  const addSizeBreakdownMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/admin/orders/${params.id}/size-breakdowns`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setShowSizeForm(false);
      setSizeFormSize("");
      setSizeFormQty(1);
      setSizeFormName("");
      setSizeFormNumber("");
    },
  });

  const addQcMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/admin/orders/${params.id}/qc`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setShowQcForm(false);
      setQcNotes("");
      setQcIssues("");
    },
  });

  if (isLoading) return <AdminLayout><div style={{ color: "rgba(255,255,255,0.3)", padding: "40px", textAlign: "center" }}>Loading...</div></AdminLayout>;
  if (!data) return <AdminLayout><div style={{ color: "rgba(255,255,255,0.5)", padding: "40px", textAlign: "center" }}>Order not found</div></AdminLayout>;

  const { order, items, designs, comments, stages, qcChecks, sizeBreakdowns, activity } = data;

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "production", label: "Production" },
    { key: "designs", label: `Designs (${designs.length})` },
    { key: "chat", label: "Chat" },
    { key: "activity", label: "Activity" },
  ] as const;

  const inputStyle = {
    width: "100%", padding: "10px 12px", fontSize: "13px",
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "6px", color: "#fff", outline: "none",
  };

  return (
    <AdminLayout>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <Link href="/admin/orders">
          <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "16px" }}>
            <ArrowLeft size={14} /> Back to Orders
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff" }}>Order {order.orderNumber}</h1>
          <StatusBadge status={order.status} />
          <StatusBadge status={order.designStatus || "not_started"} />
          {order.productionStage && order.productionStage !== "order_received" && (
            <StatusBadge status={order.productionStage} />
          )}
        </div>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
          {order.customerName || order.customerEmail || "Guest"} &middot; {new Date(order.createdAt).toLocaleString()}
        </p>
      </div>

      {/* Tab navigation */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "10px 20px", fontSize: "13px", fontWeight: 500,
              background: "transparent", border: "none",
              color: activeTab === tab.key ? "#fff" : "rgba(255,255,255,0.4)",
              borderBottom: activeTab === tab.key ? "2px solid #fff" : "2px solid transparent",
              cursor: "pointer", marginBottom: "-1px",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: Overview */}
      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "24px", minWidth: 0 }}>
            {/* Production Progress (compact) */}
            {stages.length > 0 && <ProductionTracker stages={stages} />}

            {/* Order Items */}
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "hidden" }}>
              <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                Order Items ({items.length})
              </h2>
              {items.map((item) => (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "16px", padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  {item.productImage && (
                    <img src={item.productImage} alt="" style={{ width: "48px", height: "48px", borderRadius: "6px", objectFit: "cover" }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: "14px", color: "#fff", fontWeight: 500 }}>{item.productName}</p>
                    {item.size && <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Size: {item.size}</p>}
                  </div>
                  <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>x{item.quantity}</p>
                  <p style={{ fontSize: "14px", color: "#fff", fontWeight: 500, minWidth: "80px", textAlign: "right" }}>
                    ${((item.unitAmount * item.quantity) / 100).toFixed(2)}
                  </p>
                </div>
              ))}
              <div style={{ padding: "16px 24px", display: "flex", justifyContent: "flex-end" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "#fff" }}>
                  Total: ${(order.total / 100).toFixed(2)} {order.currency?.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Size Breakdowns */}
            <SizeBreakdownView items={items} breakdowns={sizeBreakdowns} />
          </div>

          {/* Right sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Order Status */}
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>Order Status</h3>
              <select
                value={statusEdit || order.status}
                onChange={(e) => setStatusEdit(e.target.value)}
                style={{ ...inputStyle, marginBottom: "12px" }}
              >
                {["pending", "paid", "processing", "shipped", "delivered", "cancelled"].map((s) => (
                  <option key={s} value={s} style={{ background: "#111" }}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
              {statusEdit && statusEdit !== order.status && (
                <button
                  onClick={() => updateMutation.mutate({ status: statusEdit })}
                  disabled={updateMutation.isPending}
                  style={{ width: "100%", padding: "10px", fontSize: "13px", fontWeight: 600, background: "#fff", color: "#000", border: "none", borderRadius: "6px", cursor: "pointer" }}
                >
                  Update Status
                </button>
              )}
            </div>

            {/* Tracking Info */}
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#fff" }}>Tracking</h3>
                {!showTrackingForm && (
                  <button onClick={() => { setShowTrackingForm(true); setTrackingNumber(order.trackingNumber || ""); setTrackingUrl(order.trackingUrl || ""); }}
                    style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                    {order.trackingNumber ? "Edit" : "Add"}
                  </button>
                )}
              </div>
              {showTrackingForm ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <input placeholder="Tracking number" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} style={inputStyle} />
                  <input placeholder="Tracking URL (optional)" value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} style={inputStyle} />
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => updateMutation.mutate({ trackingNumber, trackingUrl })}
                      style={{ flex: 1, padding: "8px", fontSize: "12px", fontWeight: 600, background: "#fff", color: "#000", border: "none", borderRadius: "6px", cursor: "pointer" }}>
                      Save
                    </button>
                    <button onClick={() => setShowTrackingForm(false)}
                      style={{ padding: "8px 14px", fontSize: "12px", color: "rgba(255,255,255,0.4)", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                order.trackingNumber ? (
                  <div>
                    <p style={{ fontSize: "13px", color: "#fff" }}><Truck size={14} style={{ marginRight: "6px", verticalAlign: "-2px" }} />{order.trackingNumber}</p>
                    {order.trackingUrl && (
                      <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "#3b82f6" }}>Track package</a>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)" }}>No tracking info</p>
                )
              )}
            </div>

            {/* Customer Info */}
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>Customer</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {order.customerName && <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)" }}>{order.customerName}</p>}
                {order.customerEmail && <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>{order.customerEmail}</p>}
                <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>Store: {order.storeSlug}</p>
              </div>
            </div>

            {/* Admin Notes */}
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>Admin Notes</h3>
              {editingNotes ? (
                <div>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                    style={{ ...inputStyle, resize: "vertical" as const, minHeight: "80px", marginBottom: "8px" }} />
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => updateMutation.mutate({ adminNotes: notes })} disabled={updateMutation.isPending}
                      style={{ padding: "8px 14px", fontSize: "12px", fontWeight: 600, background: "#fff", color: "#000", border: "none", borderRadius: "6px", cursor: "pointer" }}>Save</button>
                    <button onClick={() => setEditingNotes(false)}
                      style={{ padding: "8px 14px", fontSize: "12px", color: "rgba(255,255,255,0.5)", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", cursor: "pointer" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", marginBottom: "12px", whiteSpace: "pre-wrap" }}>{order.adminNotes || "No notes yet"}</p>
                  <button onClick={() => { setNotes(order.adminNotes || ""); setEditingNotes(true); }}
                    style={{ padding: "6px 14px", fontSize: "12px", color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", cursor: "pointer" }}>Edit Notes</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: Production */}
      {activeTab === "production" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "800px" }}>
          {/* Pipeline controls */}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {stages.length === 0 ? (
              <button onClick={() => initPipelineMutation.mutate()} disabled={initPipelineMutation.isPending}
                style={{
                  padding: "10px 20px", fontSize: "13px", fontWeight: 600,
                  background: "#fff", color: "#000", border: "none", borderRadius: "6px",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
                }}>
                <Play size={14} /> Initialize Production Pipeline
              </button>
            ) : (
              <button onClick={() => advanceStageMutation.mutate()} disabled={advanceStageMutation.isPending}
                style={{
                  padding: "10px 20px", fontSize: "13px", fontWeight: 600,
                  background: "#3b82f6", color: "#fff", border: "none", borderRadius: "6px",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
                }}>
                <Play size={14} /> Advance to Next Stage
              </button>
            )}

            <button onClick={() => setShowQcForm(!showQcForm)}
              style={{
                padding: "10px 20px", fontSize: "13px", fontWeight: 600,
                background: "rgba(20,184,166,0.15)", color: "#14b8a6",
                border: "1px solid rgba(20,184,166,0.3)", borderRadius: "6px",
                cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
              }}>
              <Shield size={14} /> Add QC Check
            </button>
          </div>

          {/* QC Form */}
          {showQcForm && (
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>New Quality Check</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "4px" }}>Check Type</label>
                  <select value={qcType} onChange={(e) => setQcType(e.target.value)} style={inputStyle}>
                    <option value="pre_production" style={{ background: "#111" }}>Pre-Production</option>
                    <option value="mid_production" style={{ background: "#111" }}>Mid-Production</option>
                    <option value="final" style={{ background: "#111" }}>Final Inspection</option>
                    <option value="packaging" style={{ background: "#111" }}>Packaging</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "4px" }}>Result</label>
                  <select value={qcStatus} onChange={(e) => setQcStatus(e.target.value)} style={inputStyle}>
                    <option value="pending" style={{ background: "#111" }}>Pending</option>
                    <option value="passed" style={{ background: "#111" }}>Passed</option>
                    <option value="failed" style={{ background: "#111" }}>Failed</option>
                    <option value="conditional" style={{ background: "#111" }}>Conditional</option>
                  </select>
                </div>
              </div>
              <input placeholder="Notes" value={qcNotes} onChange={(e) => setQcNotes(e.target.value)} style={{ ...inputStyle, marginBottom: "8px" }} />
              {(qcStatus === "failed" || qcStatus === "conditional") && (
                <input placeholder="Issue description" value={qcIssues} onChange={(e) => setQcIssues(e.target.value)} style={{ ...inputStyle, marginBottom: "8px" }} />
              )}
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => addQcMutation.mutate({ checkType: qcType, status: qcStatus, notes: qcNotes || undefined, issues: qcIssues || undefined })}
                  disabled={addQcMutation.isPending}
                  style={{ padding: "8px 16px", fontSize: "12px", fontWeight: 600, background: "#fff", color: "#000", border: "none", borderRadius: "6px", cursor: "pointer" }}>Save</button>
                <button onClick={() => setShowQcForm(false)}
                  style={{ padding: "8px 16px", fontSize: "12px", color: "rgba(255,255,255,0.4)", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}

          <ProductionTracker stages={stages} />
          {qcChecks.length > 0 && <QualityChecksView checks={qcChecks} isAdmin />}

          {/* Size Breakdown Management */}
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>Size & Player Details</h3>
              <button onClick={() => setShowSizeForm(!showSizeForm)}
                style={{
                  padding: "6px 14px", fontSize: "12px", fontWeight: 600,
                  background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
                }}>
                <Plus size={12} /> Add
              </button>
            </div>

            {showSizeForm && (
              <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                  <div>
                    <label style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: "4px" }}>Product</label>
                    <select value={sizeFormItem} onChange={(e) => setSizeFormItem(e.target.value)} style={inputStyle}>
                      <option value="" style={{ background: "#111" }}>Select item...</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id} style={{ background: "#111" }}>{i.productName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: "4px" }}>Size</label>
                    <input value={sizeFormSize} onChange={(e) => setSizeFormSize(e.target.value)} placeholder="e.g. Medium" style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                  <div>
                    <label style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: "4px" }}>Quantity</label>
                    <input type="number" min={1} value={sizeFormQty} onChange={(e) => setSizeFormQty(parseInt(e.target.value) || 1)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: "4px" }}>Player Name</label>
                    <input value={sizeFormName} onChange={(e) => setSizeFormName(e.target.value)} placeholder="Optional" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: "4px" }}>Number</label>
                    <input value={sizeFormNumber} onChange={(e) => setSizeFormNumber(e.target.value)} placeholder="Optional" style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => {
                      if (!sizeFormItem || !sizeFormSize) return;
                      addSizeBreakdownMutation.mutate({
                        orderItemId: sizeFormItem,
                        size: sizeFormSize,
                        quantity: sizeFormQty,
                        playerName: sizeFormName || undefined,
                        playerNumber: sizeFormNumber || undefined,
                      });
                    }}
                    disabled={!sizeFormItem || !sizeFormSize || addSizeBreakdownMutation.isPending}
                    style={{ padding: "8px 16px", fontSize: "12px", fontWeight: 600, background: "#fff", color: "#000", border: "none", borderRadius: "6px", cursor: "pointer" }}>
                    Add Entry
                  </button>
                  <button onClick={() => setShowSizeForm(false)}
                    style={{ padding: "8px 16px", fontSize: "12px", color: "rgba(255,255,255,0.4)", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {sizeBreakdowns.length === 0 && !showSizeForm ? (
              <div style={{ padding: "24px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>
                No size/player details yet. Click "Add" to enter details.
              </div>
            ) : (
              <SizeBreakdownView items={items} breakdowns={sizeBreakdowns} />
            )}
          </div>
        </div>
      )}

      {/* TAB: Designs */}
      {activeTab === "designs" && (
        <div style={{ maxWidth: "800px" }}>
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "hidden" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              Design Files ({designs.length})
            </h2>
            {designs.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>No design files uploaded yet</div>
            ) : (
              designs.map((file) => (
                <div key={file.id} style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                    <FileText size={16} color="rgba(255,255,255,0.4)" />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: "14px", color: "#fff", fontWeight: 500 }}>{file.fileName}</p>
                      <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
                        {file.label} &middot; v{file.version} &middot; {new Date(file.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <StatusBadge status={file.status} />
                    <a href={file.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.4)" }}>
                      <ExternalLink size={16} />
                    </a>
                  </div>

                  {file.status === "pending" && (
                    <div style={{ marginTop: "12px", marginLeft: "28px" }}>
                      {reviewingFileId === file.id ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          <textarea placeholder="Add a comment (optional)..." value={reviewComment} onChange={(e) => setReviewComment(e.target.value)}
                            style={{ ...inputStyle, resize: "vertical" as const, minHeight: "60px" }} />
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button onClick={() => reviewMutation.mutate({ designFileId: file.id, action: "approved", comment: reviewComment })}
                              disabled={reviewMutation.isPending}
                              style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 600, background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                              <Check size={14} /> Approve
                            </button>
                            <button onClick={() => reviewMutation.mutate({ designFileId: file.id, action: "rejected", comment: reviewComment })}
                              disabled={reviewMutation.isPending}
                              style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 600, background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                              <X size={14} /> Reject
                            </button>
                            <button onClick={() => { setReviewingFileId(null); setReviewComment(""); }}
                              style={{ padding: "8px 16px", fontSize: "13px", color: "rgba(255,255,255,0.4)", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", cursor: "pointer" }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setReviewingFileId(file.id)}
                          style={{ padding: "6px 14px", fontSize: "12px", fontWeight: 500, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                          <MessageSquare size={12} /> Review
                        </button>
                      )}
                    </div>
                  )}

                  {comments.filter(c => c.designFileId === file.id).map((c) => (
                    <div key={c.id} style={{ marginTop: "8px", marginLeft: "28px", padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "6px", borderLeft: `3px solid ${c.action === "approved" ? "#22c55e" : c.action === "rejected" ? "#ef4444" : "rgba(255,255,255,0.1)"}` }}>
                      <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>{c.comment}</p>
                      <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>{new Date(c.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB: Chat */}
      {activeTab === "chat" && (
        <div style={{ maxWidth: "700px" }}>
          <OrderChat orderId={order.id} userRole="admin" apiPrefix="/api/admin" />
        </div>
      )}

      {/* TAB: Activity */}
      {activeTab === "activity" && (
        <div style={{ maxWidth: "700px" }}>
          <ActivityLog activity={activity} />
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          div[style*="grid-template-columns: 1fr 360px"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </AdminLayout>
  );
}
