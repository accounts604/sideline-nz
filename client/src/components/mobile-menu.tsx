import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { X, LogIn, User, ChevronDown, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { NAV_LINKS } from "@/config/nav";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-start">
      <div
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-300"
        onClick={onClose}
      />

      <div className="relative w-[85%] max-w-sm h-full bg-white text-black shadow-2xl animate-in slide-in-from-left duration-300 flex flex-col">

        <div className="flex justify-end p-4 border-b border-black/10">
          <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <nav className="flex flex-col py-4">
            {NAV_LINKS.map((link) => {
              if (link.external) {
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-4 text-lg font-display uppercase tracking-wide block cursor-pointer transition-colors text-black/50 hover:text-black hover:bg-black/5"
                    onClick={onClose}
                  >
                    <span className="inline-flex items-center gap-1">
                      {link.label}
                      <ArrowUpRight size={16} />
                    </span>
                  </a>
                );
              }

              if (link.children) {
                const isExpanded = expanded === link.href;
                return (
                  <div key={link.href}>
                    <div className="flex items-stretch">
                      <Link href={link.href}>
                        <span
                          className={cn(
                            "px-6 py-4 text-lg font-display uppercase tracking-wide block cursor-pointer transition-colors flex-1",
                            location === link.href || location.startsWith(`${link.href}/`)
                              ? "text-black font-semibold"
                              : "text-black/50 hover:text-black hover:bg-black/5"
                          )}
                          onClick={onClose}
                        >
                          {link.label}
                        </span>
                      </Link>
                      <button
                        className="px-6 text-black/40 hover:text-black transition-colors"
                        onClick={() => setExpanded(isExpanded ? null : link.href)}
                        aria-label={`Toggle ${link.label} submenu`}
                      >
                        <ChevronDown size={18} className={cn("transition-transform", isExpanded && "rotate-180")} />
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="pb-2 bg-black/[0.03]">
                        {link.children.map((child) => (
                          <Link key={child.href} href={child.href}>
                            <span
                              className={cn(
                                "pl-10 pr-6 py-3 text-base font-display uppercase tracking-wide block cursor-pointer transition-colors",
                                location === child.href
                                  ? "text-black font-semibold"
                                  : "text-black/40 hover:text-black hover:bg-black/5"
                              )}
                              onClick={onClose}
                            >
                              {child.label}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link key={link.href} href={link.href}>
                  <span
                    className={cn(
                      "px-6 py-4 text-lg font-display uppercase tracking-wide block cursor-pointer transition-colors",
                      location === link.href
                        ? "text-black font-semibold"
                        : "text-black/50 hover:text-black hover:bg-black/5"
                    )}
                    onClick={onClose}
                  >
                    {link.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="px-6 py-4 space-y-3">
            <Link href="/free-mockup">
              <Button
                className="w-full bg-black text-white hover:bg-black/80 font-display uppercase tracking-wide rounded-full"
                onClick={onClose}
              >
                Get Free Mockup
              </Button>
            </Link>
            <Link href="/quote">
              <Button
                variant="outline"
                className="w-full border-black/20 text-black hover:bg-black/5 font-display uppercase tracking-wide rounded-full mt-2"
                onClick={onClose}
              >
                Get a Quote
              </Button>
            </Link>
            <Link href={user ? (user.role === "admin" ? "/admin" : "/portal") : "/login"}>
              <Button
                variant="outline"
                className="w-full border-black/20 text-black hover:bg-black/5 font-display uppercase tracking-wide rounded-full mt-2"
                onClick={onClose}
              >
                {user ? <User className="mr-2 h-4 w-4" /> : <LogIn className="mr-2 h-4 w-4" />}
                {user ? "My Portal" : "Login"}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
