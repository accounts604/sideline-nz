// Supplier order detail — the main supplier workspace for a single assigned order.
// Shows: PO header, garment lines (no pricing), tech-pack files (download only),
// and two action buttons: "Mark Files Received" and "Mark Dispatched".

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Loader2, Download, ArrowLeft, CheckCircle2, Truck, ExternalLink } from "lucide-react";
import { computeMilestones } from "@shared/po-milestones";

const NAVY = "#0A1628";
const NAVY_LIGHT = "#122239";
const GOLD = "#C9A84C";

type SupplierOrderDetail = {
  order: {
    id: string;
    orderNumber: string | null;
    poReference: string | null;
    accountName: string | null;
    customerName: string | null;
    customerFirstName: string | null;
    customerLastName: string | null;
    pipelineStage: string | null;
    dueDate: string | null;
    driveFolderUrl: string | null;
    deliveryAddress: string | null;
    deliveryAttention: string | null;
    deliveryPhone: string | null;
    poComments: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  items: Array<{
    id: string;
    productName: string;
    productType: string | null;
    material: string | null;
    quantity: number;
    size: string | null;
    productColors: any;
    brandingMethod: string | null;
    designNotes: string | null;
    designBrief: string | null;
    sizeChartType: string | null;
    frontDesignUrl: string | null;
    backDesignUrl: string | null;
    elementUrls: Array<{ name: string; url: string }> | null;
  }>;
  files: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    fileSize: number | null;
    mimeType: string | null;
    label: string;
    createdAt: string | null;
  }>;
};

export default function SupplierOrderDetail() {
  const [, params] = useRoute("/supplier/orders/:id");
  const orderId = params?.id;
  const queryClient = useQueryClient();
  const [trackingNumber, setTrackingNumber] = useState("");
  const [dispatchNotes, setDispatchNotes] = useState("");

  const { data, isLoading, error } = useQuery<SupplierOrderDetail>({
    queryKey: [`/api/supplier/orders/${orderId}`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!orderId,
  });

  const filesReceivedMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/supplier/orders/${orderId}/files-received`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/orders/${orderId}`] });
    },
  });

  const dispatchedMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/supplier/orders/${orderId}/dispatched`, {
        trackingNumber: trackingNumber || undefined,
        notes: dispatchNotes || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/orders/${orderId}`] });
      setTrackingNumber("");
      setDispatchNotes("");
    },
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: NAVY, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh", background: NAVY, color: "#fff", padding: "40px" }}>
        <p style={{ color: "#ef4444" }}>Order not found or not assigned to you.</p>
        <Link href="/supplier">
          <span style={{ color: GOLD, textDecoration: "underline", cursor: "pointer" }}>← Back to dashboard</span>
        </Link>
      </div>
    );
  }

  const { order, items, files } = data;

  return (
    <div style={{ minHeight: "100vh", background: NAVY, color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "20px 32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Link href="/supplier">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            <ArrowLeft className="w-4 h-4" /> Back to orders
          </div>
        </Link>
        <span
          style={{
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "1px",
            color: GOLD,
            border: `1px solid ${GOLD}`,
            borderRadius: "4px",
            padding: "4px 10px",
          }}
        >
          {order.pipelineStage || "Assigned"}
        </span>
      </header>

      <main style={{ padding: "40px 32px", maxWidth: "1100px", margin: "0 auto" }}>
        {/* PO summary */}
        <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "4px", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "1px" }}>
          {order.orderNumber || "(no PO number)"}
        </h1>
        <p style={{ color: "rgba(255,255,255,0.65)", marginBottom: "32px", fontSize: "14px" }}>
          {order.poReference || order.accountName || order.customerName || "—"}
        </p>

        {/* Due date + milestones */}
        {order.dueDate && (() => {
          const ms = computeMilestones(order.dueDate);
          if (!ms) return null;
          return (
            <Card title="35-Day Production Schedule">
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {ms.map((m) => {
                  const isShipDeadline = m.key === "ship_production";
                  return (
                    <div key={m.key} style={{
                      flex: "1 1 120px", textAlign: "center", padding: "10px 6px", borderRadius: "6px",
                      background: isShipDeadline ? "rgba(220,38,38,0.15)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${isShipDeadline ? "rgba(220,38,38,0.4)" : "rgba(255,255,255,0.06)"}`,
                    }}>
                      <div style={{ fontSize: "10px", color: isShipDeadline ? "#ef4444" : "rgba(255,255,255,0.4)", fontWeight: 600 }}>
                        Day {m.dayNumber}{isShipDeadline ? " — YOUR DEADLINE" : ""}
                      </div>
                      <div style={{ fontSize: "12px", fontWeight: isShipDeadline ? 700 : 600, color: isShipDeadline ? "#ef4444" : "#fff", marginTop: "2px" }}>{m.label}</div>
                      <div style={{ fontSize: "10px", color: isShipDeadline ? "#ef4444" : "rgba(255,255,255,0.5)", fontFamily: "ui-monospace, Menlo, monospace", marginTop: "2px" }}>{m.date}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })()}

        {/* Drive folder link */}
        {order.driveFolderUrl && (
          <div style={{ marginBottom: "16px" }}>
            <a href={order.driveFolderUrl} target="_blank" rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 16px", background: GOLD, color: NAVY, borderRadius: "6px", fontWeight: 600, fontSize: "13px", textDecoration: "none" }}>
              Open Drive Folder <ExternalLink size={14} />
            </a>
          </div>
        )}

        {/* Delivery info */}
        <Card title="Delivery">
          <Row label="Attention" value={order.deliveryAttention} />
          <Row label="Address" value={order.deliveryAddress} />
          <Row label="Phone" value={order.deliveryPhone} />
          {order.poComments && <Row label="Notes" value={order.poComments} />}
        </Card>

        {/* Garment lines — full read-only spec for each product */}
        <Card title="Garment lines">
          {items.length === 0 && <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>No line items on this PO yet.</p>}
          {items.map((i) => {
            const colors = (i.productColors || []) as Array<{ hex: string; name?: string }>;
            const elements = i.elementUrls || [];
            return (
              <div key={i.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "20px 0" }}>
                {/* Header: product + specs */}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "12px", fontSize: "13px", marginBottom: "12px" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "4px" }}>{i.productName}</div>
                    {i.material && <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "12px" }}>{i.material}</div>}
                  </div>
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Branding</div>
                    <div style={{ color: GOLD }}>{i.brandingMethod || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Quantity</div>
                    <div style={{ fontWeight: 600 }}>{i.quantity}</div>
                  </div>
                </div>

                {/* Colour swatches */}
                {colors.length > 0 && (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                    {colors.map((c, ci) => (
                      <span key={ci} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 10px 3px 4px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "999px", fontSize: "11px" }}>
                        <span style={{ width: "14px", height: "14px", background: c.hex, borderRadius: "999px", border: "1px solid rgba(255,255,255,0.2)" }} />
                        {c.name || c.hex} <small style={{ color: "rgba(255,255,255,0.4)" }}>{c.hex}</small>
                      </span>
                    ))}
                  </div>
                )}

                {/* Mockup images */}
                {(i.frontDesignUrl || i.backDesignUrl) && (
                  <div style={{ display: "flex", gap: "16px", marginBottom: "12px", flexWrap: "wrap" }}>
                    {i.frontDesignUrl && (
                      <div style={{ textAlign: "center" }}>
                        <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", marginBottom: "4px", textTransform: "uppercase" }}>Front</p>
                        <img src={i.frontDesignUrl} alt="Front" style={{ maxHeight: "200px", maxWidth: "250px", objectFit: "contain", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.1)" }} />
                      </div>
                    )}
                    {i.backDesignUrl && (
                      <div style={{ textAlign: "center" }}>
                        <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", marginBottom: "4px", textTransform: "uppercase" }}>Back</p>
                        <img src={i.backDesignUrl} alt="Back" style={{ maxHeight: "200px", maxWidth: "250px", objectFit: "contain", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.1)" }} />
                      </div>
                    )}
                  </div>
                )}

                {/* Elements / logos */}
                {elements.length > 0 && (
                  <div style={{ marginBottom: "12px" }}>
                    <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", marginBottom: "6px", textTransform: "uppercase" }}>Elements / Logos</p>
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                      {elements.map((el, ei) => (
                        <img key={ei} src={el.url} alt={el.name} title={el.name} style={{ maxHeight: "50px", maxWidth: "120px", objectFit: "contain" }} />
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Design Brief */}
                {i.designBrief && (
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "6px", padding: "12px 14px", marginBottom: "10px", fontSize: "12px", lineHeight: "1.6", whiteSpace: "pre-wrap", color: "rgba(255,255,255,0.75)" }}>
                    <span style={{ fontSize: "10px", color: GOLD, textTransform: "uppercase", letterSpacing: "0.5px" }}>Design Brief</span>
                    <div style={{ marginTop: "6px" }}>{i.designBrief}</div>
                  </div>
                )}

                {i.designNotes && (
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)" }}><strong>Notes:</strong> {i.designNotes}</div>
                )}
              </div>
            );
          })}
        </Card>

        {/* Tech-pack files */}
        <Card title="Tech-pack files">
          {files.length === 0 && (
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>
              No tech-pack files uploaded yet. Contact Sideline if you were expecting files.
            </p>
          )}
          {files.map((f) => (
            <div
              key={f.id}
              style={{
                borderTop: "1px solid rgba(255,255,255,0.08)",
                padding: "14px 0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: "14px", fontWeight: 500 }}>{f.fileName}</div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
                  {f.label}
                  {f.fileSize ? ` · ${Math.round(f.fileSize / 1024)} KB` : ""}
                </div>
              </div>
              <a
                href={f.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: "transparent",
                  color: GOLD,
                  border: `1px solid ${GOLD}`,
                  borderRadius: "6px",
                  padding: "8px 14px",
                  fontSize: "13px",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Download className="w-4 h-4" /> Download
              </a>
            </div>
          ))}
        </Card>

        {/* Actions */}
        <Card title="Actions">
          <button
            onClick={() => filesReceivedMut.mutate()}
            disabled={filesReceivedMut.isPending}
            style={{
              background: GOLD,
              color: NAVY,
              border: "none",
              borderRadius: "6px",
              padding: "14px 20px",
              fontWeight: 600,
              fontSize: "14px",
              cursor: filesReceivedMut.isPending ? "not-allowed" : "pointer",
              marginBottom: "12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "100%",
              justifyContent: "center",
            }}
          >
            <CheckCircle2 className="w-4 h-4" />
            {filesReceivedMut.isPending
              ? "Recording…"
              : filesReceivedMut.isSuccess
              ? "Files received ✓"
              : "Mark Files Received"}
          </button>

          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingTop: "16px",
              marginTop: "8px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <input
              type="text"
              placeholder="Tracking number (optional)"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 14px",
                fontSize: "14px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "6px",
                color: "#fff",
                outline: "none",
              }}
            />
            <textarea
              placeholder="Dispatch notes (optional)"
              value={dispatchNotes}
              onChange={(e) => setDispatchNotes(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                padding: "12px 14px",
                fontSize: "14px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "6px",
                color: "#fff",
                outline: "none",
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
            <button
              onClick={() => dispatchedMut.mutate()}
              disabled={dispatchedMut.isPending}
              style={{
                background: "transparent",
                color: GOLD,
                border: `1px solid ${GOLD}`,
                borderRadius: "6px",
                padding: "14px 20px",
                fontWeight: 600,
                fontSize: "14px",
                cursor: dispatchedMut.isPending ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                justifyContent: "center",
              }}
            >
              <Truck className="w-4 h-4" />
              {dispatchedMut.isPending
                ? "Recording…"
                : dispatchedMut.isSuccess
                ? "Dispatch logged ✓"
                : "Mark Dispatched"}
            </button>
          </div>
        </Card>
      </main>
    </div>
  );
}

// --- Small presentational helpers scoped to this file ---

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

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: "flex", padding: "6px 0", fontSize: "13px" }}>
      <div style={{ width: "100px", color: "rgba(255,255,255,0.5)" }}>{label}</div>
      <div style={{ color: "#fff", flex: 1 }}>{value || "—"}</div>
    </div>
  );
}
