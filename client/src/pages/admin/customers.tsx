import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Search, UserPlus, X } from "lucide-react";

interface Customer {
  id: string;
  email: string | null;
  teamName: string | null;
  contactPhone: string | null;
  emailVerified: boolean | null;
  createdAt: string;
}

export default function AdminCustomers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTeam, setInviteTeam] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  const queryString = search ? `?search=${encodeURIComponent(search)}` : "";
  const { data, isLoading } = useQuery<{ customers: Customer[]; total: number }>({
    queryKey: [`/api/admin/customers${queryString}`],
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; teamName?: string }) => {
      const res = await apiRequest("POST", "/api/admin/customers/invite", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
      setInviteSuccess(`Invite created for ${data.email}. Token: ${data.inviteToken}`);
      setInviteEmail("");
      setInviteTeam("");
      setInviteError("");
    },
    onError: (err: any) => {
      try {
        const parsed = JSON.parse(err.message.split(": ").slice(1).join(": "));
        setInviteError(parsed.error || "Failed to create invite");
      } catch {
        setInviteError("Failed to create invite");
      }
    },
  });

  return (
    <AdminLayout>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff" }}>Customers</h1>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
            {data?.total ?? 0} registered customers
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative" }}>
            <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)" }} />
            <input
              type="text"
              placeholder="Search customers..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setSearch(searchInput); }}
              onBlur={() => setSearch(searchInput)}
              style={{
                padding: "10px 12px 10px 36px",
                fontSize: "13px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                color: "#fff",
                outline: "none",
                width: "220px",
              }}
            />
          </div>

          {/* Invite button */}
          <button
            onClick={() => setShowInvite(!showInvite)}
            style={{
              padding: "10px 16px",
              fontSize: "13px",
              fontWeight: 600,
              background: "#fff",
              color: "#000",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <UserPlus size={16} />
            Invite
          </button>
        </div>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px", marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>Invite Customer</h3>
            <button onClick={() => { setShowInvite(false); setInviteError(""); setInviteSuccess(""); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
              <X size={18} />
            </button>
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <input
              type="email"
              placeholder="Email address *"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              style={{
                padding: "10px 12px",
                fontSize: "13px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "6px",
                color: "#fff",
                outline: "none",
                flex: "1 1 200px",
              }}
            />
            <input
              type="text"
              placeholder="Team name (optional)"
              value={inviteTeam}
              onChange={(e) => setInviteTeam(e.target.value)}
              style={{
                padding: "10px 12px",
                fontSize: "13px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "6px",
                color: "#fff",
                outline: "none",
                flex: "1 1 200px",
              }}
            />
            <button
              onClick={() => {
                if (!inviteEmail) return;
                inviteMutation.mutate({ email: inviteEmail, teamName: inviteTeam || undefined });
              }}
              disabled={inviteMutation.isPending || !inviteEmail}
              style={{
                padding: "10px 20px",
                fontSize: "13px",
                fontWeight: 600,
                background: "#fff",
                color: "#000",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                opacity: !inviteEmail ? 0.5 : 1,
              }}
            >
              Send Invite
            </button>
          </div>
          {inviteError && <p style={{ fontSize: "13px", color: "#ef4444", marginTop: "12px" }}>{inviteError}</p>}
          {inviteSuccess && <p style={{ fontSize: "13px", color: "#22c55e", marginTop: "12px" }}>{inviteSuccess}</p>}
        </div>
      )}

      {/* Customer table */}
      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Loading...</div>
        ) : !data?.customers?.length ? (
          <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>No customers found</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Email", "Team", "Phone", "Verified", "Joined"].map((h) => (
                    <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.customers.map((c) => (
                  <tr
                    key={c.id}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ padding: "14px 20px" }}>
                      <Link href={`/admin/customers/${c.id}`}>
                        <span style={{ fontSize: "14px", color: "#fff", cursor: "pointer", fontWeight: 500 }}>{c.email || "—"}</span>
                      </Link>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>
                      {c.teamName || "—"}
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>
                      {c.contactPhone || "—"}
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "3px 8px",
                        borderRadius: "4px",
                        background: c.emailVerified ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.15)",
                        color: c.emailVerified ? "#22c55e" : "#eab308",
                      }}>
                        {c.emailVerified ? "Yes" : "Pending"}
                      </span>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>
                      {new Date(c.createdAt).toLocaleDateString()}
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
