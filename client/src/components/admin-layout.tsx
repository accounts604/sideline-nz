import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Palette,
  Wand2,
  FileText,
  FolderOpen,
  Activity,
  LogOut,
  Menu,
  X,
  Factory,
  Image as ImageIcon,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import logoHorizontal from "@assets/Sideline_NZ_logo_Horizontal_Wite_1767355724062.png";
import { EzraLauncher } from "./ezra-launcher";

// Sidebar — eight items. Ezra lives in the bottom-right launcher (mounted
// below); the standalone "AI Tools" / name-asset form is still reachable
// at /admin/ai but doesn't take a sidebar slot.
const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { href: "/admin/triage", label: "Triage", icon: Activity },
  { href: "/admin/supporter-campaigns", label: "Supporter Campaigns", icon: Wand2 },
  { href: "/admin/club-logos", label: "Brand Identity", icon: ImageIcon },
  { href: "/admin/accounts", label: "Accounts", icon: Users },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/suppliers", label: "Suppliers", icon: Factory },
  { href: "/admin/vault", label: "File Vault", icon: FolderOpen },
  { href: "/admin/design-studio", label: "Design Studio", icon: Sparkles },
  { href: "/admin/quotes", label: "Smart Quotes", icon: FileText },
  { href: "/admin/integrations", label: "Integrations", icon: Activity },
  { href: "/admin/settings", label: "Settings", icon: SettingsIcon },
];

function NavLink({ href, label, icon: Icon, active, onClick }: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick?: () => void;
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
        {label}
      </div>
    </Link>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { logout, user } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/admin") return location === "/admin";
    return location.startsWith(href);
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div style={{ padding: "24px 20px 32px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <Link href="/admin">
          <div style={{ cursor: "pointer" }}>
            <img
              src={logoHorizontal}
              alt="Sideline NZ"
              style={{ height: "30px", width: "auto", objectFit: "contain", display: "block" }}
            />
            <p
              style={{
                fontSize: "11px",
                color: "rgba(255,255,255,0.35)",
                marginTop: "8px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                lineHeight: 1,
              }}
            >
              Admin Portal
            </p>
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
      </nav>

      {/* User + Logout */}
      <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: "8px", overflow: "hidden", textOverflow: "ellipsis" }}>
          {user?.email}
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
        className="admin-sidebar-desktop"
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 49,
          }}
          onClick={() => setMobileOpen(false)}
          className="admin-sidebar-overlay"
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
        className="admin-sidebar-mobile"
      >
        <button
          onClick={() => setMobileOpen(false)}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.5)",
            cursor: "pointer",
          }}
        >
          <X size={20} />
        </button>
        {sidebarContent}
      </aside>

      {/* Main content area */}
      <main style={{ flex: 1, marginLeft: "260px", minHeight: "100vh" }} className="admin-main">
        {/* Mobile header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "none",
          }}
          className="admin-mobile-header"
        >
          <button
            onClick={() => setMobileOpen(true)}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}
          >
            <Menu size={24} />
          </button>
        </div>

        <div className="admin-content" style={{ maxWidth: "1200px" }}>
          {children}
        </div>
      </main>

      {/* Ezra copilot — floating launcher + slide-out panel, mounted globally. */}
      <EzraLauncher />

      {/* Responsive CSS */}
      <style>{`
        .admin-content { padding: 32px; }
        @media (max-width: 768px) {
          .admin-sidebar-desktop { display: none !important; }
          .admin-main { margin-left: 0 !important; }
          .admin-mobile-header { display: flex !important; }
          .admin-content { padding: 14px 12px; }
        }
        @media (min-width: 769px) {
          .admin-sidebar-mobile { display: none !important; }
          .admin-sidebar-overlay { display: none !important; }
        }
      `}</style>
    </div>
  );
}
