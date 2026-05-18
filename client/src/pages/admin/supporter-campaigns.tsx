import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AdminLayout } from "@/components/admin-layout";
import { apiRequest } from "@/lib/queryClient";

interface ClubStat {
  id: string;
  clubName: string;
  email: string;
  shopifyOrderTag: string | null;
  collectionHandle: string | null;
  supporterDropClosedAt: string | null;
  profitShareTierBps: number;
  orderCount: number;
  unitsSold: number;
  revenueCents: number;
  error?: string;
}

interface StatsResponse { ok: boolean; generatedAt: string; clubs: ClubStat[]; }

function money(cents: number, currency = "NZD") {
  const symbol = currency === "NZD" ? "$" : currency + " ";
  return symbol + (cents / 100).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function tierForUnits(units: number): { bps: number; label: string; nextUnits: number | null } {
  if (units >= 200) return { bps: 1200, label: "12% (200+)", nextUnits: null };
  if (units >= 150) return { bps: 1000, label: "10% (150–199)", nextUnits: 200 - units };
  if (units >= 100) return { bps: 800, label: "8% (100–149)", nextUnits: 150 - units };
  if (units >= 50) return { bps: 600, label: "6% (50–99)", nextUnits: 100 - units };
  return { bps: 0, label: `Below threshold`, nextUnits: 50 - units };
}

export default function AdminSupporterCampaigns() {
  const qc = useQueryClient();
  const [actionLog, setActionLog] = useState<Record<string, { ok: boolean; text: string }>>({});

  const { data, isLoading, error, refetch, isFetching } = useQuery<StatsResponse>({
    queryKey: ["/api/admin/clubs/supporter-stats"],
    refetchInterval: 5 * 60_000,
  });

  const buildPo = useMutation({
    mutationFn: async (clubId: string) => {
      const r = await apiRequest("POST", `/api/admin/clubs/${clubId}/build-po-from-closed-drop`, {});
      return await r.json();
    },
    onSuccess: (resp: any, clubId: string) => {
      setActionLog((s) => ({ ...s, [clubId]: { ok: true, text: `PO ${resp.poReference || "built"} — sample order ${resp.sampleOrderId}` } }));
      qc.invalidateQueries({ queryKey: ["/api/admin/clubs/supporter-stats"] });
    },
    onError: (err: any, clubId: string) => {
      setActionLog((s) => ({ ...s, [clubId]: { ok: false, text: err?.message || "Failed" } }));
    },
  });

  return (
    <AdminLayout>
      <div style={{ padding: "32px 36px", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "26px", fontWeight: 700, margin: 0, letterSpacing: "-0.4px" }}>Supporter Campaigns</h1>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", margin: "6px 0 0" }}>
              Each club's drop, pulled live from Shopify by collection handle. Click <b>Build PO</b> to lock the bulk supplier order for whatever's been paid for so far.
            </p>
          </div>
          <button onClick={() => refetch()} style={{
            padding: "8px 16px", fontSize: "12px", fontWeight: 600,
            background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)",
            border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", cursor: "pointer",
          }}>{isFetching ? "Refreshing…" : "Refresh"}</button>
        </div>

        {isLoading && <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading from Shopify…</p>}
        {error && <p style={{ color: "#fca5a5" }}>Failed to load: {String((error as any)?.message || error)}</p>}

        {data && data.clubs.length === 0 && (
          <p style={{ color: "rgba(255,255,255,0.5)", padding: "24px 0" }}>No clubs with a supporter collection configured yet.</p>
        )}

        {data && data.clubs.length > 0 && (
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                  <Th>Club</Th>
                  <Th right>Orders</Th>
                  <Th right>Units</Th>
                  <Th right>Revenue</Th>
                  <Th>Tier</Th>
                  <Th>Drop state</Th>
                  <Th>Action</Th>
                </tr>
              </thead>
              <tbody>
                {data.clubs
                  .slice()
                  .sort((a, b) => b.unitsSold - a.unitsSold)
                  .map((c) => {
                    const tier = tierForUnits(c.unitsSold);
                    const closed = !!c.supporterDropClosedAt;
                    const log = actionLog[c.id];
                    const pending = buildPo.isPending && buildPo.variables === c.id;
                    return (
                      <tr key={c.id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <Td>
                          <div style={{ fontWeight: 600 }}>{c.clubName}</div>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>{c.collectionHandle}</div>
                        </Td>
                        <Td right>{c.orderCount}</Td>
                        <Td right>{c.unitsSold}</Td>
                        <Td right>{money(c.revenueCents)}</Td>
                        <Td>
                          <span style={{ fontSize: "11px", color: c.unitsSold >= 50 ? "#86efac" : "#fdba74" }}>{tier.label}</span>
                          {tier.nextUnits !== null && (
                            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>{tier.nextUnits} to next</div>
                          )}
                        </Td>
                        <Td>
                          {closed
                            ? <span style={{ fontSize: "11px", color: "#86efac" }}>Closed {new Date(c.supporterDropClosedAt!).toISOString().slice(0,10)}</span>
                            : <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>Open</span>}
                        </Td>
                        <Td>
                          <button
                            onClick={() => buildPo.mutate(c.id)}
                            disabled={pending || c.orderCount === 0}
                            title={c.orderCount === 0 ? "No orders to build PO from" : closed ? "Idempotent — returns existing PO" : "Locks drop and builds bulk supplier PO"}
                            style={{
                              padding: "7px 14px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase",
                              background: c.orderCount === 0 ? "rgba(255,255,255,0.04)" : "rgba(201,168,76,0.15)",
                              color: c.orderCount === 0 ? "rgba(255,255,255,0.3)" : "#C9A84C",
                              border: "1px solid rgba(201,168,76,0.4)", borderRadius: "5px",
                              cursor: pending || c.orderCount === 0 ? "not-allowed" : "pointer",
                            }}
                          >
                            {pending ? "Building…" : closed ? "View PO" : "Build PO"}
                          </button>
                          {log && (
                            <div style={{ marginTop: 6, fontSize: 10, color: log.ok ? "#86efac" : "#fca5a5" }}>{log.text}</div>
                          )}
                          {c.error && (
                            <div style={{ marginTop: 6, fontSize: 10, color: "#fca5a5" }}>{c.error}</div>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th style={{
      padding: "12px 16px",
      textAlign: right ? "right" : "left",
      fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.8px",
      color: "rgba(255,255,255,0.45)", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.08)",
    }}>{children}</th>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td style={{ padding: "12px 16px", textAlign: right ? "right" : "left", fontSize: "13px", color: "#fff", verticalAlign: "top" }}>{children}</td>
  );
}
