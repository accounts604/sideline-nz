import { Link, useLocation } from "wouter";
import { useState } from "react";
import { LayoutDashboard, Palette, Package, ShoppingBag, LogOut, Menu, X, TrendingUp } from "lucide-react";
import { SidelineLogo } from "./sideline-logo";
import "../styles/horizon-theme-override.css";
import "../styles/horizon-components.css";

interface ClubPortalLayoutProps {
  clubName?: string;
  clubEmail?: string;
  shopifyStoreUrl?: string;
  onLogout: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { href: "/club-portal/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/club-portal/supporter-dashboard", label: "Supporter Drop", icon: TrendingUp },
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
      <div className={`nav-item ${active ? "active" : ""}`}>
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
      <div className="sidebar-header">
        <Link href="/club-portal/dashboard">
          <div style={{ cursor: "pointer" }}>
            <SidelineLogo subtitle="Club Hub" />
            <p className="club-name" title={clubName}>
              {clubName}
            </p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
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
        <div style={{ padding: "12px 16px", borderTop: "var(--border-width-1) solid var(--color-border)", borderBottom: "var(--border-width-1) solid var(--color-border)" }}>
          <a
            href={shopifyStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="nav-item"
          >
            <ShoppingBag size={18} />
            My Store
          </a>
        </div>
      )}

      {/* Email + Logout */}
      <div className="sidebar-footer">
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "12px", color: "var(--color-text-disabled)", margin: "0 0 12px", overflow: "hidden", textOverflow: "ellipsis" }} title={clubEmail}>
            {clubEmail}
          </p>
        </div>
        <button
          onClick={onLogout}
          className="btn btn-secondary btn-sm"
          style={{ gap: "8px" }}
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="layout-container">
      {/* Desktop Sidebar - Visible at 750px+ (Horizon breakpoint) */}
      <aside className="sidebar hidden-mobile" style={{ display: "none" }}>
        {sidebarContent}
      </aside>

      {/* Mobile Overlay Backdrop */}
      <div
        className={`sidebar-backdrop ${mobileOpen ? "open" : ""}`}
        onClick={() => setMobileOpen(false)}
      />

      {/* Mobile Sidebar - Overlay drawer */}
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`} style={{ display: mobileOpen ? "flex" : "none" }}>
        {sidebarContent}
      </aside>

      {/* Main Content Area */}
      <main className="layout-main">
        {/* Mobile Header - Hidden at 750px+ */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "var(--spacing-lg)",
            background: "var(--color-surface-elevated)",
            borderBottom: "var(--border-width-1) solid var(--color-border)",
          }}
          className="hidden-desktop"
        >
          <h1 style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-foreground)", margin: 0 }}>
            Sideline Club Hub
          </h1>
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
              color: "var(--color-foreground)",
              cursor: "pointer",
              transition: "all var(--transition-duration-base) var(--transition-timing-ease-out)",
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Page Content */}
        <div className="content-wrapper">
          {children}
        </div>
      </main>
    </div>
  );
}
