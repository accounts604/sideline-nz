import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Menu } from "lucide-react";
import { useState } from "react";
import logo from "@assets/Sideline_Logo_1765694323892.png";
import logoHorizontal from "@assets/Sideline_NZ_logo_Horizontal_Wite_1767355724062.png";
import { MobileMenu } from "./mobile-menu";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "/clubs", label: "Clubs" },
    { href: "/schools", label: "Schools" },
    { href: "/sponsor-placement", label: "Sponsors" },
    { href: "/team-stores", label: "Team Stores" },
    { href: "/our-work", label: "Our Work" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <div className="min-h-screen flex flex-col font-sans bg-black text-white">
      <MobileMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

      {/* Nav — fixed, transparent, fades to black */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.9), transparent)" }}>
        <div className="container mx-auto px-4 h-full flex items-center justify-between">

          <div className="flex items-center gap-8">
            <button
              className="md:hidden p-2 text-white/60 hover:text-white transition-colors -ml-2"
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

          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <span
                  className={cn(
                    "text-xs tracking-wider uppercase font-medium transition-colors cursor-pointer",
                    location === link.href
                      ? "text-white"
                      : "text-white/40 hover:text-white"
                  )}
                >
                  {link.label}
                </span>
              </Link>
            ))}
          </nav>

          <Link href="/quote">
            <span className="text-xs tracking-wider uppercase font-medium text-white/40 hover:text-white transition-colors cursor-pointer hidden sm:inline">
              Get a Quote
            </span>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>

      <footer className="bg-black border-t border-white/[0.07] py-14">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center text-center">
            <Link href="/">
              <span className="mb-8 block hover:opacity-70 transition-opacity cursor-pointer">
                <img src={logoHorizontal} alt="Sideline NZ" className="h-7 w-auto object-contain" />
              </span>
            </Link>

            <div className="flex flex-wrap justify-center gap-8 mb-8">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href}>
                  <span className="text-xs tracking-wider uppercase text-white/25 hover:text-white transition-colors cursor-pointer">
                    {link.label}
                  </span>
                </Link>
              ))}
            </div>

            <p className="text-xs text-white/20 tracking-wider">
              &copy; {new Date().getFullYear()} Sideline Custom Goods Ltd
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
