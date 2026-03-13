import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard,
  ShoppingCart,
  User,
  Bell,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SidelineLogo } from "./sideline-logo";

const NAV_ITEMS = [
  { href: "/portal", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portal/orders", label: "My Orders", icon: ShoppingCart },
  { href: "/portal/profile", label: "Profile", icon: User },
];

function NavLink({ href, label, icon: Icon, active, onClick, badge }: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick?: () => void;
  badge?: number;
}) {
  return (
    <Link href={href} onClick={onClick}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "10px 16px",
          borderRadius: "8px",
          fontSize: "14px",
          fontWeight: active ? 600 : 400,
          color: active ? "#fff" : "rgba(255,255,255,0.6)",
          background: active ? "rgba(249,115,22,0.12)" : "transparent",
          borderLeft: active ? "3px solid #f97316" : "3px solid transparent",
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
      >
        <Icon size={18} />
        <span style={{ flex: 1 }}>{label}</span>
        {badge ? (
          <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 7px", borderRadius: "10px", background: "#ef4444", color: "#fff" }}>
            {badge}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export function PortalLayout({ children }: { children: React.ReactNode }) {
  const { logout, user } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: notifications } = useQuery<any[]>({
    queryKey: ["/api/portal/notifications"],
    refetchInterval: 30000,
  });

  const unreadCount = notifications?.filter((n: any) => !n.read).length || 0;

  const isActive = (href: string) => {
    if (href === "/portal") return location === "/portal";
    return location.startsWith(href);
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div style={{ padding: "24px 20px 32px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <Link href="/portal">
          <div style={{ cursor: "pointer" }}>
            <SidelineLogo subtitle="Customer Portal" />
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav style={{ padding: "16px 12px", flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            {...item}
            active={isActive(item.href)}
            onClick={() => setMobileOpen(false)}
          />
        ))}
        <NavLink
          href="/portal/notifications"
          label="Notifications"
          icon={Bell}
          active={isActive("/portal/notifications")}
          onClick={() => setMobileOpen(false)}
          badge={unreadCount}
        />
      </nav>

      {/* User + Logout */}
      <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis" }}>
          {user?.teamName || user?.email}
        </p>
        <button
          onClick={() => { logout(); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.5)",
            cursor: "pointer",
            fontSize: "13px",
            padding: "6px 0",
          }}
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a0a0a" }}>
      {/* Desktop sidebar */}
      <aside
        style={{
          width: "260px",
          background: "#111",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 40,
        }}
        className="portal-sidebar-desktop"
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 49 }}
          onClick={() => setMobileOpen(false)}
          className="portal-sidebar-overlay"
        />
      )}

      {/* Mobile sidebar */}
      <aside
        style={{
          width: "260px",
          background: "#111",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 50,
          transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.2s ease",
        }}
        className="portal-sidebar-mobile"
      >
        <button
          onClick={() => setMobileOpen(false)}
          style={{ position: "absolute", top: "16px", right: "16px", background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}
        >
          <X size={20} />
        </button>
        {sidebarContent}
      </aside>

      {/* Main content area */}
      <main style={{ flex: 1, marginLeft: "260px", minHeight: "100vh" }} className="portal-main">
        {/* Mobile header */}
        <div
          style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "none" }}
          className="portal-mobile-header"
        >
          <button
            onClick={() => setMobileOpen(true)}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}
          >
            <Menu size={24} />
          </button>
        </div>

        <div style={{ padding: "32px", maxWidth: "1200px" }}>
          {children}
        </div>
      </main>

      <style>{`
        @media (max-width: 768px) {
          .portal-sidebar-desktop { display: none !important; }
          .portal-main { margin-left: 0 !important; }
          .portal-mobile-header { display: flex !important; }
        }
        @media (min-width: 769px) {
          .portal-sidebar-mobile { display: none !important; }
          .portal-sidebar-overlay { display: none !important; }
        }
      `}</style>
    </div>
  );
}
