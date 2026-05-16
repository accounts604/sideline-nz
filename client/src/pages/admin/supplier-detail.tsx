import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { AdminLayout } from "@/components/admin-layout";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Plus, Trash2, Save, X } from "lucide-react";
import { SIDELINE_PRODUCTS, productsGroupedByCategory } from "@shared/product-catalog";

interface Supplier {
  id: string;
  email: string | null;
  supplierName: string | null;
  contactPhone: string | null;
  ccEmail: string | null;
  categories: string[];
  inviteAccepted: boolean;
  createdAt: string;
}

interface SupplierPrice {
  id: string;
  supplierId: string;
  productType: string;
  sizeOrVariant: string | null;
  unitCostCents: number;
  currency: string;
  sourceInvoiceRef: string | null;
  effectiveFrom: string;
  notes: string | null;
}

const ALL_CATEGORIES = Array.from(new Set(SIDELINE_PRODUCTS.map((p) => p.category)));

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function productLabel(productType: string) {
  const p = SIDELINE_PRODUCTS.find((x) => x.id === productType);
  return p ? `${p.name} (${p.category})` : productType;
}

export default function AdminSupplierDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [editingCategories, setEditingCategories] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<string[]>([]);
  const [showAddPrice, setShowAddPrice] = useState(false);
  const [newPrice, setNewPrice] = useState({
    productType: "",
    sizeOrVariant: "",
    unitCostDollars: "",
    currency: "USD",
    sourceInvoiceRef: "",
    notes: "",
  });

  const { data: supplier } = useQuery<Supplier>({
    queryKey: [`/api/admin/suppliers/${id}`],
  });

  const { data: pricesData } = useQuery<{ prices: SupplierPrice[] }>({
    queryKey: [`/api/admin/suppliers/${id}/prices`],
  });

  const updateSupplier = useMutation({
    mutationFn: async (patch: Partial<Supplier> & { categories?: string[] }) => {
      const res = await apiRequest("PATCH", `/api/admin/suppliers/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/suppliers/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suppliers"] });
      setEditingCategories(false);
    },
  });

  const createPrice = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", `/api/admin/suppliers/${id}/prices`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/suppliers/${id}/prices`] });
      setShowAddPrice(false);
      setNewPrice({ productType: "", sizeOrVariant: "", unitCostDollars: "", currency: "USD", sourceInvoiceRef: "", notes: "" });
    },
  });

  const deletePrice = useMutation({
    mutationFn: async (priceId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/suppliers/${id}/prices/${priceId}`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/admin/suppliers/${id}/prices`] }),
  });

  if (!supplier) {
    return <AdminLayout><div style={{ color: "rgba(255,255,255,0.4)" }}>Loading...</div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <Link href="/admin/suppliers">
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "rgba(255,255,255,0.5)", cursor: "pointer", marginBottom: "16px" }}>
          <ArrowLeft size={14} /> Back to suppliers
        </span>
      </Link>

      <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>
        {supplier.supplierName || "(unnamed supplier)"}
      </h1>
      <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", marginBottom: "24px" }}>
        {supplier.email} {supplier.ccEmail && <>· CC: {supplier.ccEmail}</>} {supplier.contactPhone && <>· {supplier.contactPhone}</>}
      </p>

      {/* Categories */}
      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px", marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#fff" }}>Product categories handled</h3>
          {!editingCategories ? (
            <button
              onClick={() => { setCategoryDraft(supplier.categories); setEditingCategories(true); }}
              style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}
            >Edit</button>
          ) : (
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => updateSupplier.mutate({ categories: categoryDraft })}
                disabled={updateSupplier.isPending}
                style={{ background: "#22c55e", border: "none", color: "#000", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}
              ><Save size={12} /> Save</button>
              <button
                onClick={() => setEditingCategories(false)}
                style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}
              >Cancel</button>
            </div>
          )}
        </div>
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: "12px" }}>
          When a PO is raised without a supplier explicitly set, the dispatch flow looks at the order's product categories. If only one supplier handles all those categories, they get auto-assigned. Currently this is the only routing signal — there is no per-product override.
        </p>
        {editingCategories ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {ALL_CATEGORIES.map((cat) => {
              const on = categoryDraft.includes(cat);
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryDraft(on ? categoryDraft.filter((c) => c !== cat) : [...categoryDraft, cat])}
                  style={{
                    padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500, cursor: "pointer",
                    background: on ? "rgba(249,115,22,0.18)" : "rgba(255,255,255,0.04)",
                    color: on ? "#fb923c" : "rgba(255,255,255,0.6)",
                    border: on ? "1px solid rgba(249,115,22,0.4)" : "1px solid rgba(255,255,255,0.1)",
                  }}
                >{cat}</button>
              );
            })}
          </div>
        ) : supplier.categories.length === 0 ? (
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>None set — this supplier won't be auto-assigned.</p>
        ) : (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {supplier.categories.map((c) => (
              <span key={c} style={{ fontSize: "12px", fontWeight: 500, padding: "5px 10px", borderRadius: "6px", background: "rgba(249,115,22,0.12)", color: "#fb923c" }}>{c}</span>
            ))}
          </div>
        )}
      </div>

      {/* Pricelist */}
      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px", marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div>
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#fff" }}>Live pricelist</h3>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
              Unit costs from this supplier's invoices. Add a new row each time they update pricing — the most recent effective date wins per product/variant.
            </p>
          </div>
          {!showAddPrice && (
            <button
              onClick={() => setShowAddPrice(true)}
              style={{ background: "#fff", border: "none", color: "#000", padding: "8px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
            ><Plus size={14} /> Add price</button>
          )}
        </div>

        {showAddPrice && (
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "16px", marginBottom: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 2fr", gap: "10px", marginBottom: "10px" }}>
              <select
                value={newPrice.productType}
                onChange={(e) => setNewPrice({ ...newPrice, productType: e.target.value })}
                style={{ padding: "8px 10px", fontSize: "13px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff" }}
              >
                <option value="">— Select product —</option>
                {Object.entries(productsGroupedByCategory()).map(([cat, products]) => (
                  <optgroup key={cat} label={cat}>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </optgroup>
                ))}
              </select>
              <input
                placeholder="Size / variant (optional)"
                value={newPrice.sizeOrVariant}
                onChange={(e) => setNewPrice({ ...newPrice, sizeOrVariant: e.target.value })}
                style={{ padding: "8px 10px", fontSize: "13px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff" }}
              />
              <input
                placeholder="Unit cost"
                type="number"
                step="0.01"
                value={newPrice.unitCostDollars}
                onChange={(e) => setNewPrice({ ...newPrice, unitCostDollars: e.target.value })}
                style={{ padding: "8px 10px", fontSize: "13px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff" }}
              />
              <select
                value={newPrice.currency}
                onChange={(e) => setNewPrice({ ...newPrice, currency: e.target.value })}
                style={{ padding: "8px 10px", fontSize: "13px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff" }}
              >
                <option value="USD">USD</option>
                <option value="NZD">NZD</option>
                <option value="CNY">CNY</option>
                <option value="AUD">AUD</option>
              </select>
              <input
                placeholder="Source invoice ref"
                value={newPrice.sourceInvoiceRef}
                onChange={(e) => setNewPrice({ ...newPrice, sourceInvoiceRef: e.target.value })}
                style={{ padding: "8px 10px", fontSize: "13px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff" }}
              />
            </div>
            <input
              placeholder="Notes (optional)"
              value={newPrice.notes}
              onChange={(e) => setNewPrice({ ...newPrice, notes: e.target.value })}
              style={{ padding: "8px 10px", fontSize: "13px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff", width: "100%", marginBottom: "10px", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                onClick={() => setShowAddPrice(false)}
                style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", padding: "8px 14px", borderRadius: "6px", fontSize: "12px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}
              ><X size={12} /> Cancel</button>
              <button
                onClick={() => {
                  const dollars = parseFloat(newPrice.unitCostDollars);
                  if (!newPrice.productType || isNaN(dollars) || dollars < 0) return;
                  createPrice.mutate({
                    productType: newPrice.productType,
                    sizeOrVariant: newPrice.sizeOrVariant || null,
                    unitCostCents: Math.round(dollars * 100),
                    currency: newPrice.currency,
                    sourceInvoiceRef: newPrice.sourceInvoiceRef || null,
                    notes: newPrice.notes || null,
                  });
                }}
                disabled={createPrice.isPending || !newPrice.productType || !newPrice.unitCostDollars}
                style={{ background: "#fff", border: "none", color: "#000", padding: "8px 16px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
              >Save price</button>
            </div>
          </div>
        )}

        {!pricesData?.prices?.length ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>
            No prices yet. Add the first row from a supplier invoice.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Product", "Variant", "Unit cost", "Source", "Effective from", ""].map((h) => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pricesData.prices.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "12px", fontSize: "13px", color: "#fff" }}>{productLabel(p.productType)}</td>
                    <td style={{ padding: "12px", fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>{p.sizeOrVariant || "—"}</td>
                    <td style={{ padding: "12px", fontSize: "13px", color: "#fff", fontWeight: 500 }}>{formatMoney(p.unitCostCents, p.currency)}</td>
                    <td style={{ padding: "12px", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>{p.sourceInvoiceRef || "—"}</td>
                    <td style={{ padding: "12px", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>{new Date(p.effectiveFrom).toLocaleDateString()}</td>
                    <td style={{ padding: "12px", textAlign: "right" }}>
                      <button
                        onClick={() => { if (confirm("Delete this price?")) deletePrice.mutate(p.id); }}
                        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer" }}
                      ><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
