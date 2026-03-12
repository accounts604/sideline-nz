import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal-layout";
import { useParams, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Upload, FileText, ExternalLink, RefreshCw, AlertCircle, Receipt, Truck, MapPin } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { ProductionTracker } from "@/components/production-tracker";
import { OrderChat } from "@/components/order-chat";
import { QualityChecksView } from "@/components/quality-checks";
import { SizeBreakdownView } from "@/components/size-breakdown";

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
  parentFileId: string | null;
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

interface ProductionStage {
  id: string;
  stage: string;
  status: string;
  enteredAt: string | null;
  completedAt: string | null;
  notes: string | null;
  estimatedDate: string | null;
}

interface QualityCheck {
  id: string;
  orderId: string;
  productionStageId: string | null;
  checkType: string;
  status: string;
  checkedBy: string | null;
  notes: string | null;
  photoUrls: string[] | null;
  issues: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface OrderSizeBreakdown {
  id: string;
  orderItemId: string;
  size: string;
  quantity: number;
  playerName: string | null;
  playerNumber: string | null;
  notes: string | null;
}

interface Order {
  id: string;
  orderNumber: string;
  customerEmail: string | null;
  customerName: string | null;
  storeSlug: string;
  status: string;
  designStatus: string | null;
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
  stages: ProductionStage[];
  qcChecks: QualityCheck[];
  sizeBreakdowns: OrderSizeBreakdown[];
  messages: any[];
  activity: any[];
}

const DESIGN_LABELS = ["jersey", "shorts", "socks", "logo", "other"] as const;

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

function DesignUploadForm({ orderId, onSuccess, reuploadFile }: {
  orderId: string;
  onSuccess: () => void;
  reuploadFile?: DesignFile | null;
}) {
  const [label, setLabel] = useState<string>(reuploadFile?.label || "jersey");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Please select a file");

    setUploading(true);
    setError("");

    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/uploads/token",
      });

      const url = reuploadFile
        ? `/api/portal/orders/${orderId}/designs/${reuploadFile.id}/reupload`
        : `/api/portal/orders/${orderId}/designs`;

      await apiRequest("POST", url, {
        label: reuploadFile ? reuploadFile.label : label,
        fileName: file.name,
        fileUrl: blob.url,
        fileSize: file.size,
        mimeType: file.type,
      });

      if (fileRef.current) fileRef.current.value = "";
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ padding: "20px 24px", background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>
        {reuploadFile ? `Re-upload ${reuploadFile.label} (v${reuploadFile.version + 1})` : "Upload Design File"}
      </h3>

      {!reuploadFile && (
        <div style={{ marginBottom: "12px" }}>
          <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "6px" }}>Label</label>
          <select
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            style={{
              padding: "10px 12px", fontSize: "13px",
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "6px", color: "#fff", outline: "none", width: "200px",
            }}
          >
            {DESIGN_LABELS.map((l) => (
              <option key={l} value={l} style={{ background: "#111" }}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <input ref={fileRef} type="file" accept="image/*,application/pdf,.zip" style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", flex: 1 }} />
        <button
          onClick={handleUpload}
          disabled={uploading}
          style={{
            padding: "10px 20px", fontSize: "13px", fontWeight: 600,
            background: uploading ? "rgba(255,255,255,0.06)" : "#fff",
            color: uploading ? "rgba(255,255,255,0.4)" : "#000",
            border: "none", borderRadius: "6px",
            cursor: uploading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: "6px",
          }}
        >
          <Upload size={14} />
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </div>

      {error && (
        <p style={{ fontSize: "12px", color: "#ef4444", marginTop: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
          <AlertCircle size={12} /> {error}
        </p>
      )}
    </div>
  );
}

export default function PortalOrderDetail() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [reuploadFile, setReuploadFile] = useState<DesignFile | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "production" | "designs" | "chat">("overview");

  const { data, isLoading } = useQuery<OrderDetail>({
    queryKey: [`/api/portal/orders/${params.id}`],
    enabled: !!params.id,
  });

  const handleUploadSuccess = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/portal/orders/${params.id}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/portal/orders"] });
    setShowUpload(false);
    setReuploadFile(null);
  };

  if (isLoading) {
    return <PortalLayout><div style={{ color: "rgba(255,255,255,0.3)", padding: "40px", textAlign: "center" }}>Loading...</div></PortalLayout>;
  }

  if (!data) {
    return <PortalLayout><div style={{ color: "rgba(255,255,255,0.5)", padding: "40px", textAlign: "center" }}>Order not found</div></PortalLayout>;
  }

  const { order, items, designs, comments, stages, qcChecks, sizeBreakdowns } = data;

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "production", label: "Production" },
    { key: "designs", label: `Designs (${designs.length})` },
    { key: "chat", label: "Chat" },
  ] as const;

  return (
    <PortalLayout>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <Link href="/portal/orders">
          <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "16px" }}>
            <ArrowLeft size={14} /> Back to Orders
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff" }}>Order {order.orderNumber}</h1>
          <StatusBadge status={order.status} />
          <StatusBadge status={order.designStatus || "not_started"} />
        </div>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
          {order.storeSlug} &middot; {new Date(order.createdAt).toLocaleString()}
        </p>
      </div>

      {/* Tracking info banner */}
      {order.trackingNumber && (
        <div style={{
          background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.15)",
          borderRadius: "10px", padding: "14px 20px", marginBottom: "24px",
          display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
        }}>
          <Truck size={18} color="#a855f7" />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: "13px", color: "#fff", fontWeight: 500 }}>Tracking: {order.trackingNumber}</p>
            {order.estimatedDeliveryDate && (
              <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
                Est. delivery: {new Date(order.estimatedDeliveryDate).toLocaleDateString()}
              </p>
            )}
          </div>
          {order.trackingUrl && (
            <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer"
              style={{
                padding: "6px 14px", fontSize: "12px", fontWeight: 600,
                background: "rgba(168,85,247,0.15)", color: "#a855f7",
                borderRadius: "6px", textDecoration: "none",
                display: "flex", alignItems: "center", gap: "6px",
              }}>
              <MapPin size={12} /> Track Package
            </a>
          )}
        </div>
      )}

      {/* Tab navigation */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "0" }}>
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
              transition: "color 0.2s, border-color 0.2s",
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

            {/* Size & Player Details */}
            {sizeBreakdowns.length > 0 && (
              <SizeBreakdownView items={items} breakdowns={sizeBreakdowns} />
            )}

            {/* QC Checks (if any) */}
            {qcChecks.length > 0 && (
              <QualityChecksView checks={qcChecks} />
            )}
          </div>

          {/* Right sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>Order Summary</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Subtotal</span>
                  <span style={{ color: "#fff" }}>${(order.subtotal / 100).toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Shipping</span>
                  <span style={{ color: "#fff" }}>${(order.shipping / 100).toFixed(2)}</span>
                </div>
                {order.tax > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Tax</span>
                    <span style={{ color: "#fff" }}>${(order.tax / 100).toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <span style={{ color: "#fff", fontWeight: 600 }}>Total</span>
                  <span style={{ color: "#fff", fontWeight: 600 }}>${(order.total / 100).toFixed(2)} {order.currency?.toUpperCase()}</span>
                </div>
              </div>

              <Link href={`/portal/orders/${order.id}/invoice`}>
                <button style={{
                  width: "100%", marginTop: "16px", padding: "10px",
                  fontSize: "13px", fontWeight: 500,
                  background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                }}>
                  <Receipt size={14} /> View Invoice
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Production */}
      {activeTab === "production" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "700px" }}>
          <ProductionTracker stages={stages} />
          {qcChecks.length > 0 && <QualityChecksView checks={qcChecks} />}
        </div>
      )}

      {/* TAB: Designs */}
      {activeTab === "designs" && (
        <div style={{ maxWidth: "800px" }}>
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>Design Files ({designs.length})</h2>
              <button
                onClick={() => { setShowUpload(!showUpload); setReuploadFile(null); }}
                style={{
                  padding: "8px 16px", fontSize: "12px", fontWeight: 600,
                  background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
                }}
              >
                <Upload size={14} /> Upload Design
              </button>
            </div>

            {(showUpload || reuploadFile) && (
              <DesignUploadForm orderId={order.id} onSuccess={handleUploadSuccess} reuploadFile={reuploadFile} />
            )}

            {designs.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>
                No design files uploaded yet. Click "Upload Design" to get started.
              </div>
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

                  {file.status === "rejected" && (
                    <div style={{ marginLeft: "28px", marginTop: "8px" }}>
                      <button
                        onClick={() => { setReuploadFile(file); setShowUpload(false); }}
                        style={{
                          padding: "6px 14px", fontSize: "12px", fontWeight: 500,
                          background: "rgba(239,68,68,0.1)", color: "#ef4444",
                          border: "1px solid rgba(239,68,68,0.2)", borderRadius: "6px",
                          cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
                        }}
                      >
                        <RefreshCw size={12} /> Re-upload
                      </button>
                    </div>
                  )}

                  {comments.filter(c => c.designFileId === file.id).map((c) => (
                    <div key={c.id} style={{
                      marginTop: "8px", marginLeft: "28px", padding: "8px 12px",
                      background: "rgba(255,255,255,0.02)", borderRadius: "6px",
                      borderLeft: `3px solid ${c.action === "approved" ? "#22c55e" : c.action === "rejected" ? "#ef4444" : "rgba(255,255,255,0.1)"}`,
                    }}>
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
          <OrderChat orderId={order.id} userRole="customer" apiPrefix="/api/portal" />
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          div[style*="grid-template-columns: 1fr 360px"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </PortalLayout>
  );
}
