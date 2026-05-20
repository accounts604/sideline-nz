// Admin settings — currently just the Xero connection. Add more
// integrations here as they land.

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle2, AlertCircle, LinkIcon, Unplug } from "lucide-react";

interface XeroStatus {
  ok: boolean;
  envConfigured: boolean;
  connected: boolean;
  tenantName: string | null;
  tenantId: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
}

export default function AdminSettings() {
  const qc = useQueryClient();
  const [location] = useLocation();
  const [toast, setToast] = useState<string | null>(null);

  const { data: xero, isLoading } = useQuery<XeroStatus>({
    queryKey: ["/api/admin/xero/status"],
  });

  // After OAuth callback, the server redirects here with ?xero=connected.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("xero") === "connected") {
      const tenant = url.searchParams.get("tenant");
      setToast(`Xero connected${tenant ? ` to ${tenant}` : ""} ✓`);
      url.searchParams.delete("xero");
      url.searchParams.delete("tenant");
      window.history.replaceState({}, "", url.pathname + (url.search ? `?${url.searchParams}` : ""));
      setTimeout(() => setToast(null), 4000);
      qc.invalidateQueries({ queryKey: ["/api/admin/xero/status"] });
    }
  }, [location, qc]);

  const disconnect = useMutation({
    mutationFn: async () => {
      if (!confirm("Disconnect Xero? You'll need to re-grant access from the dashboard before any pull-from-Xero actions work.")) {
        throw new Error("cancelled");
      }
      const r = await apiRequest("DELETE", "/api/admin/xero", undefined);
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/xero/status"] });
    },
    onError: (e: any) => { if (e?.message !== "cancelled") alert(e?.message || "Failed"); },
  });

  return (
    <AdminLayout>
      <div style={{ padding: "32px 36px", color: "#fff", maxWidth: 800 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.4px" }}>Settings</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "6px 0 24px" }}>
          Integrations + connections used by the back office.
        </p>

        {toast && (
          <div style={{ padding: "10px 14px", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", color: "#86efac", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{toast}</div>
        )}

        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "20px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: "#13b5ea", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 4 }}>Accounting</div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Xero</div>
            </div>
            {isLoading ? null : xero?.connected ? (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                <CheckCircle2 size={13} /> Connected
              </div>
            ) : (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)", borderRadius: 6, fontSize: 12 }}>
                <AlertCircle size={13} /> Not connected
              </div>
            )}
          </div>

          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: "0 0 16px" }}>
            Lets the system pull customer invoice PDFs from Xero by invoice reference (the "Pull from Xero" button on each PO's Invoices & Payments section).
          </p>

          {!xero?.envConfigured && (
            <div style={{ padding: "10px 14px", background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.3)", color: "#fb923c", borderRadius: 6, marginBottom: 14, fontSize: 12 }}>
              <strong>Server not configured.</strong> Set <code>XERO_CLIENT_ID</code> and <code>XERO_CLIENT_SECRET</code> env vars (Railway + Vercel). Then register the redirect URI in your Xero app at developer.xero.com.
            </div>
          )}

          {xero?.connected && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 14 }}>
              <div>Organisation: <span style={{ color: "#fff" }}>{xero.tenantName || xero.tenantId}</span></div>
              <div>Connected: <span style={{ color: "#fff" }}>{xero.connectedAt ? new Date(xero.connectedAt).toLocaleString() : "—"}</span></div>
              <div>Access token expires: <span style={{ color: "#fff" }}>{xero.expiresAt ? new Date(xero.expiresAt).toLocaleTimeString() : "—"}</span> (auto-refreshed)</div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            {!xero?.connected && (
              <a
                href="/api/admin/xero/connect"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", fontSize: 13, fontWeight: 600, background: "#13b5ea", color: "#fff", border: 0, borderRadius: 6, textDecoration: "none", opacity: xero?.envConfigured ? 1 : 0.5, pointerEvents: xero?.envConfigured ? "auto" : "none" }}
              >
                <LinkIcon size={13} /> Connect Xero
              </a>
            )}
            {xero?.connected && (
              <>
                <a
                  href="/api/admin/xero/connect"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", fontSize: 13, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, textDecoration: "none" }}
                >
                  Re-connect
                </a>
                <button
                  onClick={() => disconnect.mutate()}
                  disabled={disconnect.isPending}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", fontSize: 13, background: "rgba(239,68,68,0.1)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, cursor: "pointer" }}
                >
                  <Unplug size={13} /> {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
