import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PortalLayout } from "@/components/portal-layout";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Bell, Check, FileText, ShoppingCart } from "lucide-react";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  orderId: string | null;
  designFileId: string | null;
  read: boolean;
  createdAt: string;
}

const ICON_MAP: Record<string, React.ElementType> = {
  design_approved: Check,
  design_rejected: FileText,
  order_shipped: ShoppingCart,
};

const COLOR_MAP: Record<string, string> = {
  design_approved: "#22c55e",
  design_rejected: "#ef4444",
  order_shipped: "#a855f7",
};

export default function PortalNotifications() {
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/portal/notifications"],
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/portal/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/notifications"] });
    },
  });

  return (
    <PortalLayout>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff" }}>Notifications</h1>
        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>
          Design reviews, order updates, and more
        </p>
      </div>

      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: "32px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>Loading...</div>
        ) : !notifications || notifications.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center" }}>
            <Bell size={24} color="rgba(255,255,255,0.2)" style={{ margin: "0 auto 12px" }} />
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px" }}>No notifications yet</p>
          </div>
        ) : (
          notifications.map((notif) => {
            const Icon = ICON_MAP[notif.type] || Bell;
            const color = COLOR_MAP[notif.type] || "rgba(255,255,255,0.4)";

            return (
              <div
                key={notif.id}
                style={{
                  display: "flex",
                  gap: "16px",
                  padding: "16px 24px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: notif.read ? "transparent" : "rgba(59,130,246,0.03)",
                  cursor: notif.read ? "default" : "pointer",
                }}
                onClick={() => {
                  if (!notif.read) markReadMutation.mutate(notif.id);
                }}
              >
                <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={16} color={color} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <p style={{ fontSize: "14px", color: "#fff", fontWeight: notif.read ? 400 : 600 }}>{notif.title}</p>
                    {!notif.read && (
                      <span style={{ width: "6px", height: "6px", borderRadius: "3px", background: "#3b82f6", flexShrink: 0 }} />
                    )}
                  </div>
                  {notif.message && (
                    <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", marginTop: "2px" }}>{notif.message}</p>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "6px" }}>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>
                      {new Date(notif.createdAt).toLocaleString()}
                    </span>
                    {notif.orderId && (
                      <Link href={`/portal/orders/${notif.orderId}`}>
                        <span style={{ fontSize: "11px", color: "#3b82f6", cursor: "pointer" }}>View Order</span>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </PortalLayout>
  );
}
