import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Menu, LogIn, User, ChevronDown, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import logoHorizontal from "@assets/Sideline_NZ_logo_Horizontal_Wite_1767355724062.png";
import { MobileMenu } from "./mobile-menu";
import { useAuth } from "@/lib/auth-context";
import { NAV_LINKS, FOOTER_COLUMNS, type NavLink } from "@/config/nav";

function DesktopNavItem({ link, location }: { link: NavLink; location: string }) {
  const isActive = link.children
    ? location === link.href || location.startsWith(`${link.href}/`)
    : location === link.href;

  const itemClass = cn(
    "text-xs tracking-wider uppercase font-medium transition-colors cursor-pointer",
    isActive ? "text-white" : "text-white/40 hover:text-white"
  );

  if (link.external) {
    const offsite = link.href.startsWith("http");
    return (
      <a
        href={link.href}
        target={offsite ? "_blank" : undefined}
        rel={offsite ? "noopener noreferrer" : undefined}
        className={itemClass}
      >
        <span className="inline-flex items-center gap-0.5">
          {link.label}
          {offsite && <ArrowUpRight size={11} />}
        </span>
      </a>
    );
  }

  if (link.children) {
    return (
      <div className="relative group">
        <Link href={link.href}>
          <span className={cn(itemClass, "inline-flex items-center gap-1")}>
            {link.label}
            <ChevronDown size={12} className="transition-transform group-hover:rotate-180" />
          </span>
        </Link>
        <div className="absolute left-1/2 -translate-x-1/2 top-full pt-4 hidden group-hover:block">
          <div className="bg-black/95 backdrop-blur border border-white/10 rounded-md py-2 min-w-[190px] shadow-xl">
            {link.children.map((child) => (
              <Link key={child.href} href={child.href}>
                <span
                  className={cn(
                    "block px-4 py-2 text-xs tracking-wider uppercase font-medium transition-colors cursor-pointer",
                    location === child.href ? "text-white" : "text-white/50 hover:text-white hover:bg-white/5"
                  )}
                >
                  {child.label}
                </span>
              </Link>
            ))}
            <Link href={link.href}>
              <span className="block px-4 pt-2 pb-1 mt-1 border-t border-white/10 text-xs tracking-wider uppercase font-medium text-white/40 hover:text-white transition-colors cursor-pointer">
                All sports →
              </span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link href={link.href}>
      <span className={itemClass}>{link.label}</span>
    </Link>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col font-sans bg-black text-white">
      <MobileMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

      {/* Nav — fixed, transparent, fades to black */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.9), transparent)" }}>
        <div className="container mx-auto px-4 h-full flex items-center justify-between">

          <div className="flex items-center gap-8">
            <button
              className="lg:hidden p-2 text-white/60 hover:text-white transition-colors -ml-2"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={24} />
            </button>

            <Link href="/">
              <span className="hover:opacity-80 transition-opacity cursor-pointer block">
                <img src={logoHorizontal} alt="Sideline NZ" className="h-7 w-auto object-contain" />
              </span>
            </Link>
          </div>

          <nav className="hidden lg:flex items-center gap-6 xl:gap-8">
            {NAV_LINKS.map((link) => (
              <DesktopNavItem key={link.href} link={link} location={location} />
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <Link href="/free-mockup">
              <span className="text-xs tracking-wider uppercase font-medium bg-white text-black px-4 py-2 rounded-[4px] hover:bg-white/90 transition-colors cursor-pointer hidden lg:inline">
                Get free mockup
              </span>
            </Link>
            <Link href="/quote">
              <span className="text-xs tracking-wider uppercase font-medium text-white/40 hover:text-white transition-colors cursor-pointer hidden lg:inline">
                Get a Quote
              </span>
            </Link>
            <Link href={user ? (user.role === "admin" ? "/admin" : "/portal") : "/login"}>
              <span className="flex items-center gap-1.5 text-xs tracking-wider uppercase font-medium text-white/40 hover:text-white transition-colors cursor-pointer">
                {user ? <User size={14} /> : <LogIn size={14} />}
                <span className="hidden lg:inline">{user ? "Portal" : "Login"}</span>
              </span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>

      <footer className="bg-black border-t border-white/[0.07] py-14">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 max-w-4xl mx-auto mb-12">
            <div className="col-span-2 md:col-span-1">
              <Link href="/">
                <span className="block hover:opacity-70 transition-opacity cursor-pointer mb-4">
                  <img src={logoHorizontal} alt="Sideline NZ" className="h-7 w-auto object-contain" />
                </span>
              </Link>
              <p className="text-xs text-white/25 leading-relaxed">
                Custom teamwear and supporter merch for clubs, schools and competitions across New Zealand.
              </p>
            </div>

            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title}>
                <p className="text-xs tracking-wider uppercase font-semibold text-white/50 mb-4">{col.title}</p>
                <div className="flex flex-col gap-3">
                  {col.links.map((link) =>
                    link.external ? (
                      <a
                        key={link.href}
                        href={link.href}
                        target={link.href.startsWith("http") ? "_blank" : undefined}
                        rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                        className="text-xs tracking-wider uppercase text-white/25 hover:text-white transition-colors"
                      >
                        <span className="inline-flex items-center gap-0.5">
                          {link.label}
                          {link.href.startsWith("http") && <ArrowUpRight size={10} />}
                        </span>
                      </a>
                    ) : (
                      <Link key={link.href} href={link.href}>
                        <span className="text-xs tracking-wider uppercase text-white/25 hover:text-white transition-colors cursor-pointer">
                          {link.label}
                        </span>
                      </Link>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 border-t border-white/[0.07] pt-8">
            <Link href={user ? (user.role === "admin" ? "/admin" : "/portal") : "/login"}>
              <span className="text-xs tracking-wider uppercase text-white/25 hover:text-white transition-colors cursor-pointer">
                {user ? "My Portal" : "Login"}
              </span>
            </Link>
            <Link href="/terms">
              <span className="text-xs tracking-wider uppercase text-white/25 hover:text-white transition-colors cursor-pointer">
                Terms &amp; Conditions
              </span>
            </Link>
            <p className="text-xs text-white/20 tracking-wider">
              &copy; {new Date().getFullYear()} Sideline Custom Goods Ltd
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
