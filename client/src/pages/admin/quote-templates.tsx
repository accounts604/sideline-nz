import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Link } from "wouter";
import { ArrowLeft, Plus, Trash2, Save, Layers, Edit2, X } from "lucide-react";

interface TemplateItem {
  name: string;
  description: string;
  unitPrice: number;
  minQty: number;
  sizes: string;
  brandingMethod: string;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  sport: string | null;
  category: string;
  items: TemplateItem[];
  validUntilDays: number | null;
  isActive: boolean | null;
  createdAt: string;
}

const EMPTY_ITEM: TemplateItem = { name: "", description: "", unitPrice: 0, minQty: 1, sizes: "", brandingMethod: "Full Sublimation" };

export default function AdminQuoteTemplates() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null); // template id or "new"
  const [form, setForm] = useState({ name: "", description: "", sport: "", category: "custom", items: [{ ...EMPTY_ITEM }], validUntilDays: 30 });

  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ["/api/admin/quote-templates"],
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const url = editing === "new" ? "/api/admin/quote-templates" : `/api/admin/quote-templates/${editing}`;
      const method = editing === "new" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          sport: form.sport || undefined,
          category: form.category,
          items: form.items.filter(i => i.name),
          validUntilDays: form.validUntilDays,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quote-templates"] });
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/admin/quote-templates/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/quote-templates"] }),
  });

  const startEdit = (t: Template) => {
    setForm({
      name: t.name,
      description: t.description || "",
      sport: t.sport || "",
      category: t.category,
      items: (t.items as TemplateItem[]).length > 0 ? (t.items as TemplateItem[]) : [{ ...EMPTY_ITEM }],
      validUntilDays: t.validUntilDays || 30,
    });
    setEditing(t.id);
  };

  const startNew = () => {
    setForm({ name: "", description: "", sport: "", category: "custom", items: [{ ...EMPTY_ITEM }], validUntilDays: 30 });
    setEditing("new");
  };

  const updateItem = (idx: number, field: keyof TemplateItem, value: any) => {
    const items = [...form.items];
    (items[idx] as any)[field] = value;
    setForm({ ...form, items });
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", fontSize: "13px",
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "6px", color: "#fff", outline: "none",
  };
  const labelStyle: React.CSSProperties = { fontSize: "12px", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "4px" };

  return (
    <AdminLayout>
      <div style={{ marginBottom: "24px" }}>
        <Link href="/admin/quotes">
          <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "16px" }}>
            <ArrowLeft size={14} /> Back to Quotes
          </span>
        </Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "12px" }}>
            <Layers size={24} /> Quote Templates
          </h1>
          {!editing && (
            <button onClick={startNew} style={{
              padding: "10px 20px", fontSize: "13px", fontWeight: 600,
              background: "#f97316", color: "#fff", border: "none",
              borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
            }}>
              <Plus size={16} /> New Template
            </button>
          )}
        </div>
      </div>

      {/* Editor */}
      {editing && (
        <div style={{ background: "#111", border: "1px solid rgba(249,115,22,0.2)", borderRadius: "12px", padding: "24px", marginBottom: "24px", maxWidth: "900px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>
              {editing === "new" ? "New Template" : "Edit Template"}
            </h3>
            <button onClick={() => setEditing(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "20px" }}>
            <div>
              <label style={labelStyle}>Template Name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rugby Club Full Kit" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Sport</label>
              <select value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value })} style={inputStyle}>
                <option value="" style={{ background: "#111" }}>Any</option>
                {["Rugby", "Rugby League", "Netball", "Cricket", "Basketball", "Hockey", "Football", "Touch"].map(s => (
                  <option key={s} value={s.toLowerCase()} style={{ background: "#111" }}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inputStyle}>
                {["custom", "club", "school", "events"].map(c => (
                  <option key={c} value={c} style={{ background: "#111" }}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description" style={inputStyle} />
          </div>

          {/* Template Items */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <label style={labelStyle}>Default Line Items</label>
              <button onClick={() => setForm({ ...form, items: [...form.items, { ...EMPTY_ITEM }] })} style={{
                padding: "4px 10px", fontSize: "11px", background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", color: "rgba(255,255,255,0.6)", cursor: "pointer",
              }}>
                <Plus size={10} /> Add
              </button>
            </div>

            {form.items.map((item, idx) => (
              <div key={idx} style={{ display: "flex", gap: "8px", marginBottom: "8px", alignItems: "flex-end" }}>
                <div style={{ flex: 2 }}>
                  <input value={item.name} onChange={(e) => updateItem(idx, "name", e.target.value)} placeholder="Product name" style={{ ...inputStyle, fontSize: "12px" }} />
                </div>
                <div style={{ width: "80px" }}>
                  <input type="number" min={1} value={item.minQty} onChange={(e) => updateItem(idx, "minQty", parseInt(e.target.value) || 1)} placeholder="Min qty" style={{ ...inputStyle, fontSize: "12px" }} />
                </div>
                <div style={{ width: "100px" }}>
                  <input type="number" min={0} step={0.01} value={(item.unitPrice / 100).toFixed(2)}
                    onChange={(e) => updateItem(idx, "unitPrice", Math.round(parseFloat(e.target.value || "0") * 100))}
                    placeholder="Unit $" style={{ ...inputStyle, fontSize: "12px" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <input value={item.sizes} onChange={(e) => updateItem(idx, "sizes", e.target.value)} placeholder="Sizes" style={{ ...inputStyle, fontSize: "12px" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <select value={item.brandingMethod} onChange={(e) => updateItem(idx, "brandingMethod", e.target.value)} style={{ ...inputStyle, fontSize: "12px" }}>
                    <option value="Full Sublimation" style={{ background: "#111" }}>Sublimation</option>
                    <option value="Screen Print" style={{ background: "#111" }}>Screen Print</option>
                    <option value="Embroidery" style={{ background: "#111" }}>Embroidery</option>
                    <option value="Heat Transfer" style={{ background: "#111" }}>Heat Transfer</option>
                  </select>
                </div>
                <button onClick={() => {
                  if (form.items.length > 1) setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
                }} disabled={form.items.length <= 1} style={{
                  padding: "8px", background: "none", border: "none",
                  color: form.items.length > 1 ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.1)", cursor: form.items.length > 1 ? "pointer" : "default",
                }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending} style={{
              padding: "10px 20px", fontSize: "13px", fontWeight: 600,
              background: form.name ? "#f97316" : "rgba(255,255,255,0.06)",
              color: form.name ? "#fff" : "rgba(255,255,255,0.3)",
              border: "none", borderRadius: "6px", cursor: form.name ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", gap: "6px",
            }}>
              <Save size={14} /> {saveMutation.isPending ? "Saving..." : "Save Template"}
            </button>
            <button onClick={() => setEditing(null)} style={{
              padding: "10px 20px", fontSize: "13px", background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "6px", cursor: "pointer",
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Template List */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: "16px", maxWidth: "900px" }}>
        {isLoading ? (
          <div style={{ color: "rgba(255,255,255,0.3)", padding: "40px" }}>Loading...</div>
        ) : templates?.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.3)", padding: "40px" }}>No templates yet. Create one to speed up quoting.</div>
        ) : (
          templates?.map((t) => (
            <div key={t.id} style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div>
                  <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>{t.name}</h3>
                  {t.description && <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>{t.description}</p>}
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  <span style={{ padding: "2px 8px", fontSize: "10px", borderRadius: "4px", background: "rgba(249,115,22,0.1)", color: "#f97316", fontWeight: 600, textTransform: "uppercase" }}>
                    {t.category}
                  </span>
                  {t.sport && (
                    <span style={{ padding: "2px 8px", fontSize: "10px", borderRadius: "4px", background: "rgba(59,130,246,0.1)", color: "#3b82f6", fontWeight: 600, textTransform: "uppercase" }}>
                      {t.sport}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: "12px" }}>
                {(t.items as TemplateItem[]).length} items — Total from ${((t.items as TemplateItem[]).reduce((s, i) => s + i.unitPrice * (i.minQty || 1), 0) / 100).toFixed(2)}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "12px" }}>
                {(t.items as TemplateItem[]).map((item, i) => (
                  <span key={i} style={{ padding: "2px 8px", fontSize: "10px", borderRadius: "4px", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                    {item.name}
                  </span>
                ))}
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => startEdit(t)} style={{
                  padding: "6px 12px", fontSize: "11px", background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px",
                  color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px",
                }}>
                  <Edit2 size={10} /> Edit
                </button>
                <button onClick={() => {
                  if (confirm("Delete this template?")) deleteMutation.mutate(t.id);
                }} style={{
                  padding: "6px 12px", fontSize: "11px", background: "rgba(239,68,68,0.06)",
                  border: "1px solid rgba(239,68,68,0.15)", borderRadius: "4px",
                  color: "rgba(239,68,68,0.6)", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px",
                }}>
                  <Trash2 size={10} /> Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </AdminLayout>
  );
}
