import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal-layout";
import { apiRequest } from "@/lib/queryClient";
import { Check } from "lucide-react";

interface Profile {
  id: string;
  email: string | null;
  username: string;
  role: string;
  teamName: string | null;
  contactPhone: string | null;
  createdAt: string;
}

export default function PortalProfile() {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data: profile, isLoading } = useQuery<Profile>({
    queryKey: ["/api/portal/profile"],
  });

  const [teamName, setTeamName] = useState("");
  const [phone, setPhone] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (profile && !initialized) {
    setTeamName(profile.teamName || "");
    setPhone(profile.contactPhone || "");
    setInitialized(true);
  }

  const updateMutation = useMutation({
    mutationFn: async (data: { teamName?: string; contactPhone?: string }) => {
      const res = await apiRequest("PATCH", "/api/portal/profile", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <PortalLayout>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff" }}>Profile</h1>
        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>
          Manage your account details
        </p>
      </div>

      {isLoading ? (
        <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "40px" }}>Loading...</div>
      ) : profile ? (
        <div style={{ maxWidth: "500px" }}>
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "24px" }}>
            {/* Email (read-only) */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Email
              </label>
              <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.7)", padding: "10px 0" }}>{profile.email}</p>
            </div>

            {/* Team Name */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Team / Organisation Name
              </label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Auckland Rugby Club"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "6px",
                  color: "#fff",
                  outline: "none",
                }}
              />
            </div>

            {/* Phone */}
            <div style={{ marginBottom: "24px" }}>
              <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Contact Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+64 21 123 4567"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "6px",
                  color: "#fff",
                  outline: "none",
                }}
              />
            </div>

            <button
              onClick={() => updateMutation.mutate({ teamName, contactPhone: phone })}
              disabled={updateMutation.isPending}
              style={{
                padding: "12px 24px",
                fontSize: "14px",
                fontWeight: 600,
                background: saved ? "rgba(34,197,94,0.15)" : "#fff",
                color: saved ? "#22c55e" : "#000",
                border: saved ? "1px solid rgba(34,197,94,0.3)" : "none",
                borderRadius: "6px",
                cursor: updateMutation.isPending ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {saved ? <><Check size={16} /> Saved</> : "Save Changes"}
            </button>
          </div>

          {/* Account info */}
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "24px", marginTop: "16px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#fff", marginBottom: "12px" }}>Account Info</h3>
            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", display: "flex", flexDirection: "column", gap: "6px" }}>
              <p>Member since: {new Date(profile.createdAt).toLocaleDateString()}</p>
              <p>Role: {profile.role}</p>
            </div>
          </div>
        </div>
      ) : null}
    </PortalLayout>
  );
}
