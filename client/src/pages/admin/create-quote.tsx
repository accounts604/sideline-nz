import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { useLocation, Link } from "wouter";
import { ArrowLeft, Plus, Trash2, FileText, Wand2 } from "lucide-react";

interface TemplateItem {
  name: string;
  description?: string;
  unitPrice: number;
  minQty?: number;
  sizes?: string;
  brandingMethod?: string;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  sport: string | null;
  category: string;
  items: TemplateItem[];
}

interface QuoteLineItem {
  productName: string;
  description: string;
  quantity: number;
  unitPrice: number; // cents
  sizes: string;
  brandingMethod: string;
}

export default function AdminCreateQuote() {
  const [, navigate] = useLocation();

  // Customer
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [teamName, setTeamName] = useState("");
  const [sport, setSport] = useState("");

  // Items
  const [items, setItems] = useState<QuoteLineItem[]>([
    { productName: "", description: "", quantity: 1, unitPrice: 0, sizes: "", brandingMethod: "Full Sublimation" },
  ]);

  // Pricing
  const [discount, setDiscount] = useState(0);
  const [discountLabel, setDiscountLabel] = useState("");
  const [shipping, setShipping] = useState(0);

  // Notes
  const [adminNotes, setAdminNotes] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");

  // Templates
  const { data: templates } = useQuery<Template[]>({
    queryKey: ["/api/admin/quote-templates"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerEmail,
          customerPhone: customerPhone || undefined,
          teamName: teamName || undefined,
          sport: sport || undefined,
          items: items.filter(i => i.productName).map(i => ({
            ...i,
            unitPrice: i.unitPrice,
          })),
          discount: discount * 100,
          discountLabel: discountLabel || undefined,
          shipping: shipping * 100,
          adminNotes: adminNotes || undefined,
          customerNotes: customerNotes || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to create quote");
      return res.json();
    },
    onSuccess: (data) => {
      navigate(`/admin/quotes/${data.id}`);
    },
  });

  const applyTemplate = (template: Template) => {
    setSport(template.sport || "");
    setItems(template.items.map(item => ({
      productName: item.name,
      description: item.description || "",
      quantity: item.minQty || 1,
      unitPrice: item.unitPrice,
      sizes: item.sizes || "",
      brandingMethod: item.brandingMethod || "Full Sublimation",
    })));
  };

  const addItem = () => {
    setItems([...items, { productName: "", description: "", quantity: 1, unitPrice: 0, sizes: "", brandingMethod: "Full Sublimation" }]);
  };

  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof QuoteLineItem, value: any) => {
    const updated = [...items];
    (updated[idx] as any)[field] = value;
    setItems(updated);
  };

  // Live totals
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const discountCents = discount * 100;
  const shippingCents = shipping * 100;
  const taxCents = Math.round((subtotal - discountCents + shippingCents) * 0.15);
  const totalCents = subtotal - discountCents + shippingCents + taxCents;

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
        <Link href="/admin/quotes">
          <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "16px" }}>
            <ArrowLeft size={14} /> Back to Quotes
          </span>
        </Link>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "12px" }}>
          <FileText size={24} /> Create Smart Quote
        </h1>
      </div>

      {/* Template quick-apply */}
      {templates && templates.length > 0 && (
        <div style={{ marginBottom: "24px", background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <Wand2 size={16} color="#f97316" />
            <h3 style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>Quick Start from Template</h3>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t)}
                style={{
                  padding: "8px 16px", fontSize: "12px", fontWeight: 500,
                  background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)",
                  borderRadius: "6px", color: "#f97316", cursor: "pointer",
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "24px", maxWidth: "1100px" }}>
        {/* Main form */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Customer */}
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>Customer</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Contact name" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Email *</label>
                <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="email@example.com" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Team / Club Name</label>
                <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Onewhero RFC" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="022 XXX XXXX" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Sport</label>
                <select value={sport} onChange={(e) => setSport(e.target.value)} style={inputStyle}>
                  <option value="" style={{ background: "#111" }}>Select sport...</option>
                  {["Rugby", "Rugby League", "Netball", "Cricket", "Basketball", "Hockey", "Football", "Touch"].map(s => (
                    <option key={s} value={s.toLowerCase()} style={{ background: "#111" }}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>Line Items</h3>
              <button onClick={addItem} style={{
                padding: "6px 14px", fontSize: "12px", fontWeight: 600,
                background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px",
                cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
              }}>
                <Plus size={12} /> Add Item
              </button>
            </div>

            {items.map((item, idx) => (
              <div key={idx} style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
                  <div style={{ flex: 2 }}>
                    <label style={labelStyle}>Product *</label>
                    <input value={item.productName} onChange={(e) => updateItem(idx, "productName", e.target.value)}
                      placeholder="e.g. Sublimated Rugby Jersey" style={inputStyle} />
                  </div>
                  <div style={{ width: "90px" }}>
                    <label style={labelStyle}>Qty</label>
                    <input type="number" min={1} value={item.quantity}
                      onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)} style={inputStyle} />
                  </div>
                  <div style={{ width: "110px" }}>
                    <label style={labelStyle}>Unit $ (cents)</label>
                    <input type="number" min={0} value={(item.unitPrice / 100).toFixed(2)}
                      onChange={(e) => updateItem(idx, "unitPrice", Math.round(parseFloat(e.target.value || "0") * 100))} style={inputStyle} />
                  </div>
                  <div style={{ width: "110px" }}>
                    <label style={labelStyle}>Line Total</label>
                    <div style={{ padding: "10px 12px", fontSize: "13px", color: "#22c55e", fontWeight: 600 }}>
                      ${((item.quantity * item.unitPrice) / 100).toFixed(2)}
                    </div>
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
                <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                  <div style={{ flex: 2 }}>
                    <input value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)}
                      placeholder="Description (optional)" style={{ ...inputStyle, fontSize: "12px" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <input value={item.sizes} onChange={(e) => updateItem(idx, "sizes", e.target.value)}
                      placeholder="Sizes: S, M, L, XL" style={{ ...inputStyle, fontSize: "12px" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <select value={item.brandingMethod} onChange={(e) => updateItem(idx, "brandingMethod", e.target.value)} style={{ ...inputStyle, fontSize: "12px" }}>
                      <option value="Full Sublimation" style={{ background: "#111" }}>Full Sublimation</option>
                      <option value="Screen Print" style={{ background: "#111" }}>Screen Print</option>
                      <option value="Embroidery" style={{ background: "#111" }}>Embroidery</option>
                      <option value="Heat Transfer" style={{ background: "#111" }}>Heat Transfer</option>
                      <option value="DTG Print" style={{ background: "#111" }}>DTG Print</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>Notes</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Customer Notes (visible on quote)</label>
                <textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)}
                  placeholder="Notes shown to the customer..." rows={3} style={{ ...inputStyle, resize: "vertical" as any }} />
              </div>
              <div>
                <label style={labelStyle}>Internal Notes (admin only)</label>
                <textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Internal notes..." rows={2} style={{ ...inputStyle, resize: "vertical" as any }} />
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar — totals + actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Pricing */}
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px", position: "sticky", top: "20px" }}>
            <h3 style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "16px" }}>
              Pricing
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              <div>
                <label style={labelStyle}>Discount ($)</label>
                <input type="number" min={0} step={0.01} value={discount || ""}
                  onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} style={inputStyle} />
              </div>
              {discount > 0 && (
                <div>
                  <label style={labelStyle}>Discount Label</label>
                  <input value={discountLabel} onChange={(e) => setDiscountLabel(e.target.value)}
                    placeholder="e.g. 10% Volume Discount" style={inputStyle} />
                </div>
              )}
              <div>
                <label style={labelStyle}>Shipping ($)</label>
                <input type="number" min={0} step={0.01} value={shipping || ""}
                  onChange={(e) => setShipping(parseFloat(e.target.value) || 0)} style={inputStyle} />
              </div>
            </div>

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                <span style={{ color: "rgba(255,255,255,0.4)" }}>Subtotal</span>
                <span style={{ color: "rgba(255,255,255,0.7)" }}>${(subtotal / 100).toFixed(2)}</span>
              </div>
              {discountCents > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                  <span style={{ color: "#22c55e" }}>Discount</span>
                  <span style={{ color: "#22c55e" }}>-${(discountCents / 100).toFixed(2)}</span>
                </div>
              )}
              {shippingCents > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>Shipping</span>
                  <span style={{ color: "rgba(255,255,255,0.7)" }}>${(shippingCents / 100).toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                <span style={{ color: "rgba(255,255,255,0.4)" }}>GST (15%)</span>
                <span style={{ color: "rgba(255,255,255,0.7)" }}>${(taxCents / 100).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "18px", fontWeight: 700, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "8px", marginTop: "4px" }}>
                <span style={{ color: "#fff" }}>Total</span>
                <span style={{ color: "#f97316" }}>${(totalCents / 100).toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={() => createMutation.mutate()}
              disabled={!customerName || !customerEmail || items.every(i => !i.productName) || createMutation.isPending}
              style={{
                width: "100%", padding: "14px", fontSize: "14px", fontWeight: 600,
                background: (!customerName || !customerEmail) ? "rgba(255,255,255,0.06)" : "#f97316",
                color: (!customerName || !customerEmail) ? "rgba(255,255,255,0.3)" : "#fff",
                border: "none", borderRadius: "8px", cursor: (!customerName || !customerEmail) ? "not-allowed" : "pointer",
                marginTop: "20px",
              }}
            >
              {createMutation.isPending ? "Creating..." : "Create Quote"}
            </button>

            {createMutation.isError && (
              <p style={{ color: "#ef4444", fontSize: "12px", marginTop: "8px" }}>Failed to create quote</p>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
