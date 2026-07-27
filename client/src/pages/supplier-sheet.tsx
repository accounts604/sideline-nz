// Public, no-login supplier tracking sheet at /s/:token.
//
// Deliberately plain. Our manufacturer reads English as a second language and works on a
// phone, so this is one table, short words, and three inputs per row. No branding chrome,
// no navigation, nothing to get lost in. Every row saves on its own.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Loader2 } from "lucide-react";

interface SheetOrder {
  id: string;
  poReference: string | null;
  client: string | null;
  units: number;
  lines: string[];
  stage: string;
  sentToYou: string | null;
  weNeedBy: string | null;
  shipDate: string | null;
  trackingNumber: string | null;
}

const d = (v: string | null) => (v ? String(v).slice(0, 10) : "");

function Row({ token, o }: { token: string; o: SheetOrder }) {
  const [shipDate, setShipDate] = useState(d(o.shipDate));
  const [trackingNumber, setTracking] = useState(o.trackingNumber || "");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [msg, setMsg] = useState("");

  const late = o.weNeedBy && new Date(o.weNeedBy) < new Date();

  async function save() {
    setState("saving");
    try {
      const r = await fetch(`/api/sheet/${token}/${o.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipDate, trackingNumber, note }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save");
      setState("saved");
      setMsg("Saved. Thank you.");
      setNote("");
    } catch (e: any) {
      setState("error");
      setMsg(e.message || "Could not save");
    }
  }

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 14, background: "#fff", color: "#111" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#111" }}>{o.poReference}</div>
          <div style={{ color: "#555" }}>{o.client} · {o.units} units</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 13, color: "#333" }}>
          <div>Stage: <b>{o.stage}</b></div>
          <div>Sent to you: {d(o.sentToYou) || "not yet"}</div>
          <div style={{ color: late ? "#c62828" : "#555", fontWeight: late ? 700 : 400 }}>
            We need it by: {d(o.weNeedBy) || "no date"}{late ? " (LATE)" : ""}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 13, color: "#444", margin: "10px 0" }}>{o.lines.join(" · ")}</div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 13, color: "#111" }}>
          <div style={{ marginBottom: 4 }}>When will it ship?</div>
          <input type="date" value={shipDate} onChange={(e) => setShipDate(e.target.value)}
                 style={{ padding: 8, border: "1px solid #bbb", borderRadius: 6, fontSize: 15, color: "#111", background: "#fff" }} />
        </label>
        <label style={{ fontSize: 13, color: "#111", flex: "1 1 200px" }}>
          <div style={{ marginBottom: 4 }}>Tracking number</div>
          <input value={trackingNumber} onChange={(e) => setTracking(e.target.value)} placeholder="Add when you have it"
                 style={{ padding: 8, border: "1px solid #bbb", borderRadius: 6, fontSize: 15, width: "100%", color: "#111", background: "#fff" }} />
        </label>
        <label style={{ fontSize: 13, color: "#111", flex: "1 1 260px" }}>
          <div style={{ marginBottom: 4 }}>Anything we should know?</div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. waiting on sizes from you"
                 style={{ padding: 8, border: "1px solid #bbb", borderRadius: 6, fontSize: 15, width: "100%", color: "#111", background: "#fff" }} />
        </label>
        <button onClick={save} disabled={state === "saving"}
                style={{ padding: "10px 20px", background: "#004A48", color: "#fff", border: 0, borderRadius: 6,
                         fontSize: 15, cursor: state === "saving" ? "not-allowed" : "pointer" }}>
          {state === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
      {msg && <div style={{ marginTop: 8, fontSize: 13, color: state === "error" ? "#c62828" : "#2e7d32" }}>{msg}</div>}
    </div>
  );
}

export default function SupplierSheetPage() {
  const [, params] = useRoute("/s/:token");
  const token = params?.token || "";

  const { data, isLoading, error } = useQuery<{ supplier: string; orders: SheetOrder[] }>({
    queryKey: [`/api/sheet/${token}`],
    queryFn: async () => {
      const r = await fetch(`/api/sheet/${token}`);
      if (!r.ok) throw new Error("This link is not valid.");
      return r.json();
    },
    enabled: !!token,
  });

  if (isLoading) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 className="animate-spin" /></div>;
  if (error || !data) return <div style={{ padding: 40, fontFamily: "Arial", textAlign: "center" }}>This link is not valid. Please ask Sideline NZ for a new one.</div>;

  return (
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 860, margin: "0 auto", padding: "24px 16px 60px", background: "#f7f7f7", minHeight: "100vh", color: "#111" }}>
      <h1 style={{ fontSize: 22, margin: "0 0 6px", color: "#111", fontWeight: 700 }}>Order tracking sheet</h1>
      <p style={{ color: "#555", margin: "0 0 4px" }}>{data.supplier} and Sideline NZ</p>
      <p style={{ color: "#555", fontSize: 14, margin: "0 0 22px", lineHeight: 1.6 }}>
        These are the orders open with you. For each one, tell us when it will ship and add the
        tracking number when you have it. You do not need to log in. Please keep this page updated
        instead of replying to every email.
      </p>

      {data.orders.length === 0
        ? <p>No open orders right now.</p>
        : data.orders.map((o) => <Row key={o.id} token={token} o={o} />)}

      <p style={{ color: "#777", fontSize: 13, marginTop: 24 }}>
        This link is private. Please do not share it outside your team.
      </p>
    </div>
  );
}
