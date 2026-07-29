import { useQuery } from "@tanstack/react-query";

/**
 * Shown on every page while an admin is viewing as someone else.
 *
 * Deliberately loud and fixed to the top: the whole failure mode this guards
 * against is forgetting you are inside somebody else's account. It also states
 * that the session is read-only, so a refused write reads as expected rather
 * than as a bug.
 */
export function ImpersonationBanner() {
  const { data } = useQuery<{ impersonating?: { label?: string; readOnly?: boolean } | null }>({
    queryKey: ["/api/auth/me"],
    refetchInterval: 60_000,
    retry: false,
  });
  const imp = data?.impersonating;
  const who = imp?.label;
  if (!who) return null;

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 200, display: "flex", alignItems: "center", gap: "12px",
      flexWrap: "wrap", padding: "10px 22px", fontSize: "13px",
      background: "rgba(249,115,22,0.16)", borderBottom: "1px solid rgba(249,115,22,0.4)", color: "#f0f0f0",
    }}>
      <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#f97316", flex: "none" }} />
      <span>
        Viewing as <strong>{who}</strong>{" "}
        <span style={{ color: "rgba(255,255,255,0.55)" }}>— read-only, nothing you do is saved to their account</span>
      </span>
      <span style={{ flex: 1 }} />
      <button
        onClick={async () => {
          await fetch("/api/auth/end-impersonation", { method: "POST", credentials: "include" });
          window.location.href = "/admin/accounts";
        }}
        style={{
          background: "#fff", color: "#111", border: 0, borderRadius: "7px",
          padding: "6px 13px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer",
        }}
      >
        Back to admin
      </button>
    </div>
  );
}
