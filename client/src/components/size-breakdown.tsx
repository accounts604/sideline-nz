import { Users, Hash } from "lucide-react";

interface OrderSizeBreakdown {
  id: string;
  orderItemId: string;
  size: string;
  quantity: number;
  playerName: string | null;
  playerNumber: string | null;
  notes: string | null;
}

interface OrderItem {
  id: string;
  productName: string;
  quantity: number;
}

export function SizeBreakdownView({ items, breakdowns }: {
  items: OrderItem[];
  breakdowns: OrderSizeBreakdown[];
}) {
  if (breakdowns.length === 0) {
    return (
      <div style={{
        background: "#111", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "12px", padding: "24px", textAlign: "center",
      }}>
        <Users size={24} color="rgba(255,255,255,0.15)" style={{ margin: "0 auto 8px" }} />
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)" }}>
          No size/player details added yet
        </p>
      </div>
    );
  }

  // Group breakdowns by orderItemId
  const byItem = new Map<string, OrderSizeBreakdown[]>();
  for (const b of breakdowns) {
    const list = byItem.get(b.orderItemId) || [];
    list.push(b);
    byItem.set(b.orderItemId, list);
  }

  return (
    <div style={{
      background: "#111", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "12px", overflow: "hidden",
    }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>
          Size & Player Details
        </h3>
      </div>

      {items.map((item) => {
        const itemBreakdowns = byItem.get(item.id) || [];
        if (itemBreakdowns.length === 0) return null;

        // Summary: total qty by size
        const sizeSummary = new Map<string, number>();
        for (const b of itemBreakdowns) {
          sizeSummary.set(b.size, (sizeSummary.get(b.size) || 0) + b.quantity);
        }

        const hasPlayerInfo = itemBreakdowns.some(b => b.playerName || b.playerNumber);

        return (
          <div key={item.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            {/* Product header */}
            <div style={{ padding: "12px 20px", background: "rgba(255,255,255,0.02)" }}>
              <p style={{ fontSize: "13px", fontWeight: 500, color: "#fff" }}>{item.productName}</p>
              <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
                {Array.from(sizeSummary.entries()).map(([size, qty]) => (
                  <span key={size} style={{
                    fontSize: "11px", padding: "2px 8px",
                    background: "rgba(59,130,246,0.1)", color: "#3b82f6",
                    borderRadius: "4px", fontWeight: 600,
                  }}>
                    {size}: {qty}
                  </span>
                ))}
              </div>
            </div>

            {/* Player details table */}
            {hasPlayerInfo && (
              <div style={{ padding: "0 20px 12px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "8px" }}>
                  <thead>
                    <tr style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      <th style={{ textAlign: "left", padding: "6px 0", fontWeight: 500 }}>Player</th>
                      <th style={{ textAlign: "left", padding: "6px 0", fontWeight: 500 }}>Number</th>
                      <th style={{ textAlign: "left", padding: "6px 0", fontWeight: 500 }}>Size</th>
                      <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 500 }}>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemBreakdowns.filter(b => b.playerName || b.playerNumber).map((b) => (
                      <tr key={b.id} style={{ borderTop: "1px solid rgba(255,255,255,0.03)" }}>
                        <td style={{ padding: "6px 0", fontSize: "12px", color: "#fff" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            <Users size={12} color="rgba(255,255,255,0.3)" />
                            {b.playerName || "—"}
                          </span>
                        </td>
                        <td style={{ padding: "6px 0", fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>
                          {b.playerNumber ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              <Hash size={12} color="rgba(255,255,255,0.3)" />
                              {b.playerNumber}
                            </span>
                          ) : "—"}
                        </td>
                        <td style={{ padding: "6px 0", fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>{b.size}</td>
                        <td style={{ padding: "6px 0", fontSize: "12px", color: "rgba(255,255,255,0.6)", textAlign: "right" }}>{b.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
