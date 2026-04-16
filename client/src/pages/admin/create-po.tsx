import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { useLocation, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Plus, Trash2, FileText, Sparkles, Building2, User as UserIcon, CalendarClock, Ruler } from "lucide-react";
import { computeMilestones } from "@shared/po-milestones";
import { SIDELINE_PRODUCTS, productsGroupedByCategory, getProductById } from "@shared/product-catalog";
import { BRANDING_METHODS } from "@shared/branding-methods";

interface POItem {
  productType: string;           // canonical id from product-catalog
  productName: string;           // label stored on the PO (from catalog)
  material: string;              // overrideable from catalog default
  quantity: number;
  unitAmount: number;
  brandingMethod: string;
}

const EMPTY_ITEM: POItem = {
  productType: "",
  productName: "",
  material: "",
  quantity: 1,
  unitAmount: 0,
  brandingMethod: BRANDING_METHODS[0],
};

interface GhlSuggestion {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  companyName: string | null;
  tags?: string[];
  linkedUser?: { userId: string; teamName: string | null } | null;
}

export default function AdminCreatePO() {
  const [, navigate] = useLocation();

  // PO header fields
  const [storeSlug, setStoreSlug] = useState("custom");
  const [orderType, setOrderType] = useState<"team-store" | "bulk-order">("bulk-order");
  // Customer contact — mirrors GHL contact fields one-to-one
  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  // Company (team/club) fields — maps to GHL companyName + custom fields
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  // PO Reference is auto-assigned by the server (PO-YYYY-NNNN).
  // We fetch a preview the moment the form has enough detail to submit so the
  // admin can see the number they're about to commit. The server re-resolves
  // on create so nothing races against a concurrent PO.
  const [poReference, setPoReference] = useState<string>("");
  const [accountName, setAccountName] = useState("");
  // Customer due date (Door to Customer). Drives all upstream guard-rail
  // milestones via shared/po-milestones.ts.
  const [dueDate, setDueDate] = useState("");
  const [isRepeatOrder, setIsRepeatOrder] = useState(false);
  const [poComments, setPoComments] = useState("");
  const [deliveryAttention, setDeliveryAttention] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryEmail, setDeliveryEmail] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");

  // ────── Smart GHL lookup (typeahead) ──────
  // A single debounced search state shared across First Name / Last Name /
  // Email / Company inputs. Whichever field the admin is focused on defines
  // which dropdown shows. Selecting a suggestion fills every matching field.
  type ActiveField = "first" | "last" | "email" | "company" | null;
  const [activeField, setActiveField] = useState<ActiveField>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GhlSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const suppressNext = useRef(false); // skip search right after a suggestion is applied

  useEffect(() => {
    if (suppressNext.current) {
      suppressNext.current = false;
      return;
    }
    const q = searchQuery.trim();
    if (q.length < 2 || !activeField) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/ghl/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.contacts || []);
        } else {
          setSuggestions([]);
        }
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, activeField]);

  const applySuggestion = (s: GhlSuggestion) => {
    suppressNext.current = true;
    if (s.firstName) setCustomerFirstName(s.firstName);
    if (s.lastName) setCustomerLastName(s.lastName);
    if (s.email) setCustomerEmail(s.email);
    if (s.phone) setCustomerPhone(s.phone);
    if (s.companyName) setAccountName(s.companyName);
    setActiveField(null);
    setSuggestions([]);
    setSearchQuery("");
  };

  // Items
  const [items, setItems] = useState<POItem[]>([{ ...EMPTY_ITEM }]);

  // "Enough detail" to preview the reference = at least one product line is named
  // AND there is either an account/company name or a customer name to tie it to.
  const hasEnoughDetail =
    items.some((i) => i.productName.trim().length > 0) &&
    (accountName.trim().length > 0 ||
      customerFirstName.trim().length > 0 ||
      customerLastName.trim().length > 0);

  const { data: nextRefData } = useQuery<{ reference: string }>({
    queryKey: ["/api/admin/orders/next-po-reference"],
    enabled: hasEnoughDetail,
  });

  useEffect(() => {
    if (hasEnoughDetail && nextRefData?.reference && !poReference) {
      setPoReference(nextRefData.reference);
    }
    if (!hasEnoughDetail && poReference) {
      setPoReference("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEnoughDetail, nextRefData?.reference]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/orders/create-po", {
        storeSlug,
        orderType,
        customerFirstName: customerFirstName || undefined,
        customerLastName: customerLastName || undefined,
        customerEmail: customerEmail || undefined,
        customerPhone: customerPhone || undefined,
        // poReference is auto-assigned by the server
        accountName: accountName || undefined,
        companyEmail: companyEmail || undefined,
        companyPhone: companyPhone || undefined,
        dueDate: dueDate || undefined,
        isRepeatOrder,
        poComments: poComments || undefined,
        deliveryAttention: deliveryAttention || undefined,
        deliveryAddress: deliveryAddress || undefined,
        deliveryEmail: deliveryEmail || undefined,
        deliveryPhone: deliveryPhone || undefined,
        items: items
          .filter((i) => i.productName)
          .map((i) => ({
            productName: i.productName,
            productType: i.productType || undefined,
            material: i.material || undefined,
            quantity: i.quantity,
            unitAmount: i.unitAmount,
            brandingMethod: i.brandingMethod,
          })),
      });
      return res.json();
    },
    onSuccess: (data) => {
      navigate(`/admin/orders/${data.id}`);
    },
  });

  const addItem = () => {
    setItems([...items, { ...EMPTY_ITEM }]);
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

  // When the product dropdown changes, backfill productName + default material
  // automatically — admin can still tweak the material for custom specs.
  const selectProduct = (idx: number, productTypeId: string) => {
    const p = getProductById(productTypeId);
    if (!p) {
      updateItem(idx, "productType", productTypeId);
      return;
    }
    const updated = [...items];
    updated[idx] = {
      ...updated[idx],
      productType: p.id,
      productName: p.name,
      material: updated[idx].material || p.defaultMaterial,
    };
    setItems(updated);
  };

  const productGroups = productsGroupedByCategory();

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", fontSize: "13px",
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "6px", color: "#fff", outline: "none",
  };

  // Shared dropdown rendered just below the active field. onMouseDown
  // (not onClick) with preventDefault is the standard pattern for suggestion
  // lists — it fires before the input's blur and keeps focus from stealing it.
  const renderSuggestions = (forField: ActiveField) => {
    if (activeField !== forField) return null;
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return null;

    return (
      <div
        style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0,
          right: 0,
          zIndex: 30,
          background: "#0a0a0a",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "8px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          maxHeight: "260px",
          overflowY: "auto",
        }}
      >
        {searching ? (
          <div style={{ padding: "12px", fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Searching GHL…</div>
        ) : suggestions.length === 0 ? (
          <div style={{ padding: "12px", fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
            No GHL match — will be created on submit.
          </div>
        ) : (
          suggestions.map((s) => {
            const name = [s.firstName, s.lastName].filter(Boolean).join(" ") || s.email || "(no name)";
            return (
              <button
                key={s.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  color: "#fff",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(249,115,22,0.06)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                  <Sparkles size={11} style={{ color: "#f97316" }} />
                  <span style={{ fontSize: "13px", fontWeight: 600 }}>{name}</span>
                  {s.linkedUser && (
                    <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                      Linked
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {s.companyName && <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><Building2 size={10} />{s.companyName}</span>}
                  {s.email && <span>{s.email}</span>}
                  {s.phone && <span>{s.phone}</span>}
                </div>
              </button>
            );
          })
        )}
      </div>
    );
  };

  // onBlur helper — delayed clear so the suggestion click registers first.
  const handleBlur = () => {
    setTimeout(() => setActiveField((cur) => (cur ? null : cur)), 150);
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
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>PO Details</h3>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "6px" }}>
              <Sparkles size={11} style={{ color: "#f97316" }} />
              Start typing a company or contact name — matches from GHL appear as you type.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={labelStyle}>PO Reference</label>
                <div
                  style={{
                    ...inputStyle,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "rgba(255,255,255,0.03)",
                    color: poReference ? "#fff" : "rgba(255,255,255,0.35)",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    letterSpacing: "0.5px",
                  }}
                >
                  <span>{poReference || "Auto-assigned once product + account are filled"}</span>
                  {poReference && (
                    <span style={{ fontSize: "10px", color: "rgba(34,197,94,0.8)", textTransform: "uppercase", letterSpacing: "1px" }}>
                      Auto
                    </span>
                  )}
                </div>
              </div>
              <div style={{ position: "relative" }}>
                <label style={labelStyle}>Company / Team / Club Name</label>
                <input
                  value={accountName}
                  onChange={(e) => { setAccountName(e.target.value); setSearchQuery(e.target.value); }}
                  onFocus={() => { setActiveField("company"); setSearchQuery(accountName); }}
                  onBlur={handleBlur}
                  placeholder="e.g. Otahuhu RFC — smart lookup from GHL"
                  style={inputStyle}
                  autoComplete="off"
                />
                {renderSuggestions("company")}
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Company Email</label>
                  <input value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} placeholder="accounts@club.co.nz" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Company Phone</label>
                  <input value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} placeholder="09 123 4567" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Order Type</label>
                  <select value={orderType} onChange={(e) => setOrderType(e.target.value as any)} style={inputStyle}>
                    <option value="bulk-order" style={{ background: "#111" }}>Bulk Order</option>
                    <option value="team-store" style={{ background: "#111" }}>Team Store</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Store Slug</label>
                  <input value={storeSlug} onChange={(e) => setStoreSlug(e.target.value)} placeholder="custom" style={inputStyle} />
                </div>
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

              {/* ────── Customer Due Date + guard-rail milestone preview ────── */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "14px", marginTop: "4px" }}>
                <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                  <CalendarClock size={11} style={{ color: "#f97316" }} />
                  Customer Due Date (Door to Customer)
                </label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />

                {dueDate && (() => {
                  const ms = computeMilestones(dueDate);
                  if (!ms) return null;
                  return (
                    <div style={{ marginTop: "12px", background: "rgba(249,115,22,0.04)", border: "1px solid rgba(249,115,22,0.15)", borderRadius: "8px", padding: "12px 14px" }}>
                      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.8px", color: "rgba(249,115,22,0.9)", marginBottom: "8px", fontWeight: 600 }}>
                        Guard-rail schedule — 35-day build
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {ms.map((m) => (
                          <div key={m.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: "#fff" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: m.key === "door_to_customer" ? "#22c55e" : "#f97316" }} />
                              <span style={{ fontWeight: m.key === "door_to_customer" ? 600 : 400 }}>{m.label}</span>
                            </span>
                            <span style={{ display: "flex", alignItems: "center", gap: "10px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "11px", minWidth: "42px", textAlign: "right" }}>
                                Day {m.dayNumber}
                              </span>
                              <span>{m.date}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Customer — mirrors GHL contact fields */}
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Customer (Primary Contact)</h3>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "6px" }}>
              <UserIcon size={11} style={{ color: "#f97316" }} />
              Smart-linked to GHL — type a name or email to pull existing contacts.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <label style={labelStyle}>First Name</label>
                  <input
                    value={customerFirstName}
                    onChange={(e) => { setCustomerFirstName(e.target.value); setSearchQuery(e.target.value); }}
                    onFocus={() => { setActiveField("first"); setSearchQuery(customerFirstName); }}
                    onBlur={handleBlur}
                    placeholder="Romero"
                    style={inputStyle}
                    autoComplete="off"
                  />
                  {renderSuggestions("first")}
                </div>
                <div style={{ flex: 1, position: "relative" }}>
                  <label style={labelStyle}>Last Name</label>
                  <input
                    value={customerLastName}
                    onChange={(e) => { setCustomerLastName(e.target.value); setSearchQuery(e.target.value); }}
                    onFocus={() => { setActiveField("last"); setSearchQuery(customerLastName); }}
                    onBlur={handleBlur}
                    placeholder="Tagi"
                    style={inputStyle}
                    autoComplete="off"
                  />
                  {renderSuggestions("last")}
                </div>
              </div>
              <div style={{ position: "relative" }}>
                <label style={labelStyle}>Email</label>
                <input
                  value={customerEmail}
                  onChange={(e) => { setCustomerEmail(e.target.value); setSearchQuery(e.target.value); }}
                  onFocus={() => { setActiveField("email"); setSearchQuery(customerEmail); }}
                  onBlur={handleBlur}
                  placeholder="romero@kig.co.nz"
                  style={inputStyle}
                  autoComplete="off"
                />
                {renderSuggestions("email")}
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="022 412 7205" style={inputStyle} />
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

          {items.map((item, idx) => {
            const product = getProductById(item.productType);
            return (
              <div key={idx} style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", flexDirection: "column", gap: "12px" }}>
                {/* Row 1: product dropdown, material, branding, qty, unit price, remove */}
                <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
                  <div style={{ flex: 2 }}>
                    <label style={labelStyle}>Product</label>
                    <select
                      value={item.productType}
                      onChange={(e) => selectProduct(idx, e.target.value)}
                      style={inputStyle}
                    >
                      <option value="" style={{ background: "#111" }}>— Select a product —</option>
                      {Object.entries(productGroups).map(([category, products]) => (
                        <optgroup key={category} label={category}>
                          {products.map((p) => (
                            <option key={p.id} value={p.id} style={{ background: "#111" }}>{p.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={labelStyle}>Material Spec</label>
                    <input
                      value={item.material}
                      onChange={(e) => updateItem(idx, "material", e.target.value)}
                      placeholder={product?.defaultMaterial || "e.g. 180gsm Interlock Polyester"}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={labelStyle}>Branding Application</label>
                    <select value={item.brandingMethod} onChange={(e) => updateItem(idx, "brandingMethod", e.target.value)} style={inputStyle}>
                      {BRANDING_METHODS.map((m) => (
                        <option key={m} value={m} style={{ background: "#111" }}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ width: "90px" }}>
                    <label style={labelStyle}>Qty</label>
                    <input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)} style={inputStyle} />
                  </div>
                  <div style={{ width: "110px" }}>
                    <label style={labelStyle}>Unit ($)</label>
                    <input type="number" min={0} step={0.01} value={(item.unitAmount / 100).toFixed(2)}
                      onChange={(e) => updateItem(idx, "unitAmount", Math.round(parseFloat(e.target.value || "0") * 100))}
                      style={inputStyle} />
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

                {/* Row 2: Sideline NZ size guide for the selected product */}
                {product && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "8px 10px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "6px" }}>
                    <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.6px", color: "rgba(255,255,255,0.4)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Ruler size={10} /> Size Guide
                    </span>
                    {product.sizes.map((s) => (
                      <span key={s} style={{ padding: "2px 8px", fontSize: "11px", fontWeight: 600, color: "#fff", background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: "4px" }}>
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
          disabled={!hasEnoughDetail || createMutation.isPending}
          style={{
            padding: "12px 32px", fontSize: "13px", fontWeight: 600,
            background: !hasEnoughDetail ? "rgba(255,255,255,0.06)" : "#fff",
            color: !hasEnoughDetail ? "rgba(255,255,255,0.3)" : "#000",
            border: "none", borderRadius: "6px",
            cursor: !hasEnoughDetail ? "not-allowed" : "pointer",
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
