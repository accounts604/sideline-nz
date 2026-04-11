// Supplier order detail — the main supplier workspace for a single assigned order.
// Shows: PO header, garment lines (no pricing), tech-pack files (download only),
// and two action buttons: "Mark Files Received" and "Mark Dispatched".

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Loader2, Download, ArrowLeft, CheckCircle2, Truck } from "lucide-react";

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
    pipelineStage: string | null;
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
    quantity: number;
    size: string | null;
    productColors: any;
    brandingMethod: string | null;
    gradeGroup: string | null;
    designNotes: string | null;
    frontDesignUrl: string | null;
    backDesignUrl: string | null;
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

        {/* Delivery info */}
        <Card title="Delivery">
          <Row label="Attention" value={order.deliveryAttention} />
          <Row label="Address" value={order.deliveryAddress} />
          <Row label="Phone" value={order.deliveryPhone} />
          {order.poComments && <Row label="Notes" value={order.poComments} />}
        </Card>

        {/* Garment lines */}
        <Card title="Garment lines">
          {items.length === 0 && <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>No line items on this PO yet.</p>}
          {items.map((i) => (
            <div
              key={i.id}
              style={{
                borderTop: "1px solid rgba(255,255,255,0.08)",
                padding: "16px 0",
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1fr",
                gap: "12px",
                fontSize: "13px",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, marginBottom: "2px" }}>{i.productName}</div>
                {i.gradeGroup && <div style={{ color: "rgba(255,255,255,0.55)" }}>{i.gradeGroup}</div>}
              </div>
              <div style={{ color: "rgba(255,255,255,0.75)" }}>Qty: {i.quantity}</div>
              <div style={{ color: "rgba(255,255,255,0.75)" }}>{i.brandingMethod || "—"}</div>
              <div style={{ color: "rgba(255,255,255,0.55)" }}>{i.designNotes || ""}</div>
            </div>
          ))}
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
