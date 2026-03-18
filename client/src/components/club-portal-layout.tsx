import { Link, useLocation } from "wouter";
import { useState } from "react";
import { LayoutDashboard, Palette, Package, ShoppingBag, LogOut, Menu, X } from "lucide-react";
import { SidelineLogo } from "./sideline-logo";

interface ClubPortalLayoutProps {
  clubName?: string;
  clubEmail?: string;
  shopifyStoreUrl?: string;
  onLogout: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { href: "/club-portal/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/club-portal/mockup-review", label: "My Mockup", icon: Palette },
  { href: "/club-portal/order-tracking", label: "Order Tracking", icon: Package },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onClick,
}: {
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
          borderRadius: "6px",
          fontSize: "14px",
          fontWeight: active ? 600 : 400,
          color: active ? "#fff" : "rgba(255,255,255,0.6)",
          background: active ? "rgba(255,255,255,0.08)" : "transparent",
          borderLeft: active ? "3px solid #ffffff" : "3px solid transparent",
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

export function ClubPortalLayout({
  clubName = "Club",
  clubEmail,
  shopifyStoreUrl,
  onLogout,
  children,
}: ClubPortalLayoutProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/club-portal/dashboard") return location === "/club-portal/dashboard";
    return location.startsWith(href);
  };

  const sidebarContent = (
    <>
      {/* Logo + Club Name */}
      <div style={{ padding: "24px 20px 32px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Link href="/club-portal/dashboard">
          <div style={{ cursor: "pointer" }}>
            <SidelineLogo subtitle="Club Hub" />
            <p
              style={{
                marginTop: "12px",
                fontSize: "14px",
                fontWeight: 600,
                color: "#fff",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {clubName}
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

      {/* Store Link */}
      {shopifyStoreUrl && (
        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <a
            href={shopifyStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "10px 16px",
              borderRadius: "6px",
              fontSize: "14px",
              color: "rgba(255,255,255,0.6)",
              textDecoration: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.08)";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "rgba(255,255,255,0.6)";
            }}
          >
            <ShoppingBag size={18} />
            My Store
          </a>
        </div>
      )}

      {/* Email + Logout */}
      <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: "12px", overflow: "hidden", textOverflow: "ellipsis" }}>
          {clubEmail}
        </p>
        <button
          onClick={onLogout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            width: "100%",
            padding: "8px 12px",
            fontSize: "13px",
            fontWeight: 500,
            color: "rgba(255,255,255,0.6)",
            background: "transparent",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
            e.currentTarget.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "rgba(255,255,255,0.6)";
          }}
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#000" }}>
      {/* Desktop Sidebar */}
      <div
        style={{
          display: "none",
          "@media (min-width: 1024px)": { display: "flex" },
          flexDirection: "column",
          width: "260px",
          background: "#111",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
        className="lg:flex"
      >
        {sidebarContent}
      </div>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 40,
          }}
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          height: "100vh",
          width: "260px",
          background: "#111",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.3s ease",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          "@media (min-width: 1024px)": { display: "none" },
        }}
        className="lg:hidden"
      >
        {sidebarContent}
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Mobile Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px",
            background: "#111",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            "@media (min-width: 1024px)": { display: "none" },
          }}
          className="lg:hidden"
        >
          <h1 style={{ fontSize: "16px", fontWeight: 600, color: "#fff" }}>Sideline Club Hub</h1>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "40px",
              height: "40px",
              background: "transparent",
              border: "none",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Page Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "32px 24px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
