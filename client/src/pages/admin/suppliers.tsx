import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Link } from "wouter";
import { Factory } from "lucide-react";

interface Supplier {
  id: string;
  email: string | null;
  supplierName: string | null;
  categories: string[];
  inviteAccepted: boolean;
  createdAt: string;
}

export default function AdminSuppliers() {
  const { data, isLoading } = useQuery<{ suppliers: Supplier[] }>({
    queryKey: ["/api/admin/suppliers"],
  });

  return (
    <AdminLayout>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff" }}>Suppliers</h1>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
            {data?.suppliers?.length ?? 0} active suppliers · click a row to manage live pricelist
          </p>
        </div>
      </div>

      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Loading...</div>
        ) : !data?.suppliers?.length ? (
          <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>
            <Factory size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
            <div>No suppliers yet. Use the admin invite endpoint to add one.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Supplier", "Email", "Categories", "Status", "Added"].map((h) => (
                    <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.suppliers.map((s) => (
                  <tr
                    key={s.id}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ padding: "14px 20px" }}>
                      <Link href={`/admin/suppliers/${s.id}`}>
                        <span style={{ fontSize: "14px", color: "#fff", cursor: "pointer", fontWeight: 500 }}>
                          {s.supplierName || "(unnamed)"}
                        </span>
                      </Link>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>
                      {s.email || "—"}
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      {s.categories.length === 0 ? (
                        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>—</span>
                      ) : (
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {s.categories.map((c) => (
                            <span key={c} style={{
                              fontSize: "11px",
                              fontWeight: 500,
                              padding: "3px 8px",
                              borderRadius: "4px",
                              background: "rgba(249,115,22,0.12)",
                              color: "#fb923c",
                            }}>{c}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "3px 8px",
                        borderRadius: "4px",
                        background: s.inviteAccepted ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.15)",
                        color: s.inviteAccepted ? "#22c55e" : "#eab308",
                      }}>
                        {s.inviteAccepted ? "Active" : "Invited"}
                      </span>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>
                      {new Date(s.createdAt).toLocaleDateString()}
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
