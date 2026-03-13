import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { useLocation, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Plus, Trash2, FileText } from "lucide-react";

interface POItem {
  productName: string;
  quantity: number;
  unitAmount: number;
  gradeGroup: string;
  brandingMethod: string;
}

export default function AdminCreatePO() {
  const [, navigate] = useLocation();

  // PO header fields
  const [storeSlug, setStoreSlug] = useState("custom");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [poReference, setPoReference] = useState("");
  const [accountName, setAccountName] = useState("");
  const [isRepeatOrder, setIsRepeatOrder] = useState(false);
  const [poComments, setPoComments] = useState("");
  const [deliveryAttention, setDeliveryAttention] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryEmail, setDeliveryEmail] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");

  // Items
  const [items, setItems] = useState<POItem[]>([
    { productName: "", quantity: 1, unitAmount: 0, gradeGroup: "", brandingMethod: "Full Sublimation" },
  ]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/orders/create-po", {
        storeSlug,
        customerName: customerName || undefined,
        customerEmail: customerEmail || undefined,
        poReference,
        accountName: accountName || undefined,
        isRepeatOrder,
        poComments: poComments || undefined,
        deliveryAttention: deliveryAttention || undefined,
        deliveryAddress: deliveryAddress || undefined,
        deliveryEmail: deliveryEmail || undefined,
        deliveryPhone: deliveryPhone || undefined,
        items: items.filter(i => i.productName),
      });
      return res.json();
    },
    onSuccess: (data) => {
      navigate(`/admin/orders/${data.id}`);
    },
  });

  const addItem = () => {
    setItems([...items, { productName: "", quantity: 1, unitAmount: 0, gradeGroup: "", brandingMethod: "Full Sublimation" }]);
  };

  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof POItem, value: any) => {
    const updated = [...items];
    (updated[idx] as any)[field] = value;
    setItems(updated);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", fontSize: "13px",
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "6px", color: "#fff", outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "12px", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "4px",
  };

  return (
    <AdminLayout>
      <div style={{ marginBottom: "24px" }}>
        <Link href="/admin/orders">
          <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "16px" }}>
            <ArrowLeft size={14} /> Back to Orders
          </span>
        </Link>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "12px" }}>
          <FileText size={24} /> Create Purchase Order
        </h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", maxWidth: "1000px" }}>
        {/* Left: Customer & PO Details */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* PO Details */}
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>PO Details</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={labelStyle}>PO Reference *</label>
                <input value={poReference} onChange={(e) => setPoReference(e.target.value)} placeholder="e.g. Onewhero Rugby Juniors 2026" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Account Name</label>
                <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Team / account name" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Store</label>
                <input value={storeSlug} onChange={(e) => setStoreSlug(e.target.value)} placeholder="custom" style={inputStyle} />
              </div>
              <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input type="checkbox" checked={isRepeatOrder} onChange={(e) => setIsRepeatOrder(e.target.checked)} />
                  Repeat Order
                </label>
              </div>
              <div>
                <label style={labelStyle}>Comments</label>
                <input value={poComments} onChange={(e) => setPoComments(e.target.value)} placeholder="e.g. Bulk Order" style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Customer */}
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>Customer</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Customer Name</label>
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Full name" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="customer@email.com" style={inputStyle} />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Delivery */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>Delivery Address</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Attention</label>
                <input value={deliveryAttention} onChange={(e) => setDeliveryAttention(e.target.value)} placeholder="Romero Tagi" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Address</label>
                <textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Full delivery address..."
                  rows={3} style={{ ...inputStyle, resize: "vertical" as any }} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input value={deliveryEmail} onChange={(e) => setDeliveryEmail(e.target.value)} placeholder="delivery@email.com" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input value={deliveryPhone} onChange={(e) => setDeliveryPhone(e.target.value)} placeholder="022 412 7205" style={inputStyle} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Product Lines */}
      <div style={{ marginTop: "24px", maxWidth: "1000px" }}>
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>Product Lines</h3>
            <button onClick={addItem}
              style={{
                padding: "6px 14px", fontSize: "12px", fontWeight: 600,
                background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px",
                cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
              }}>
              <Plus size={12} /> Add Product
            </button>
          </div>

          {items.map((item, idx) => (
            <div key={idx} style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", gap: "12px", alignItems: "flex-end" }}>
              <div style={{ flex: 2 }}>
                <label style={labelStyle}>Product Name</label>
                <input value={item.productName} onChange={(e) => updateItem(idx, "productName", e.target.value)}
                  placeholder="e.g. Sublimated Rugby Jersey" style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Grade/Group</label>
                <input value={item.gradeGroup} onChange={(e) => updateItem(idx, "gradeGroup", e.target.value)}
                  placeholder="e.g. Grade 6,7,8" style={inputStyle} />
              </div>
              <div style={{ width: "100px" }}>
                <label style={labelStyle}>Quantity</label>
                <input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)} style={inputStyle} />
              </div>
              <div style={{ width: "120px" }}>
                <label style={labelStyle}>Unit Price ($)</label>
                <input type="number" min={0} step={0.01} value={(item.unitAmount / 100).toFixed(2)}
                  onChange={(e) => updateItem(idx, "unitAmount", Math.round(parseFloat(e.target.value || "0") * 100))}
                  style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Branding Method</label>
                <select value={item.brandingMethod} onChange={(e) => updateItem(idx, "brandingMethod", e.target.value)} style={inputStyle}>
                  <option value="Full Sublimation" style={{ background: "#111" }}>Full Sublimation</option>
                  <option value="Screen Print" style={{ background: "#111" }}>Screen Print</option>
                  <option value="Embroidery" style={{ background: "#111" }}>Embroidery</option>
                  <option value="Heat Transfer" style={{ background: "#111" }}>Heat Transfer</option>
                  <option value="DTG Print" style={{ background: "#111" }}>DTG Print</option>
                </select>
              </div>
              <button onClick={() => removeItem(idx)} disabled={items.length <= 1}
                style={{
                  padding: "10px", background: "none", border: "none",
                  color: items.length > 1 ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.1)",
                  cursor: items.length > 1 ? "pointer" : "default",
                }}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Submit */}
      <div style={{ marginTop: "24px", maxWidth: "1000px", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
        <Link href="/admin/orders">
          <button style={{
            padding: "12px 24px", fontSize: "13px", fontWeight: 500,
            background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", cursor: "pointer",
          }}>Cancel</button>
        </Link>
        <button
          onClick={() => createMutation.mutate()}
          disabled={!poReference || items.every(i => !i.productName) || createMutation.isPending}
          style={{
            padding: "12px 32px", fontSize: "13px", fontWeight: 600,
            background: !poReference ? "rgba(255,255,255,0.06)" : "#fff",
            color: !poReference ? "rgba(255,255,255,0.3)" : "#000",
            border: "none", borderRadius: "6px",
            cursor: !poReference ? "not-allowed" : "pointer",
          }}
        >
          {createMutation.isPending ? "Creating..." : "Create Purchase Order"}
        </button>
      </div>

      {createMutation.isError && (
        <p style={{ color: "#ef4444", fontSize: "13px", marginTop: "12px" }}>
          Failed to create PO. Please check all required fields.
        </p>
      )}
    </AdminLayout>
  );
}
