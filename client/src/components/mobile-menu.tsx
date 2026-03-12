import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { X, Instagram, Facebook, Twitter } from "lucide-react";
import { Button } from "@/components/ui/button";

const TikTokIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
  </svg>
);

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const navLinks = [
  { href: "/clubs", label: "Clubs" },
  { href: "/schools", label: "Schools" },
  { href: "/sponsor-placement", label: "Sponsors" },
  { href: "/team-stores", label: "Team Stores" },
  { href: "/our-work", label: "Our Work" },
  { href: "/contact", label: "Contact" },
];

export function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const [location] = useLocation();

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
            {navLinks.map((link) => (
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
            ))}
          </nav>

          <div className="px-6 py-4">
            <Link href="/quote">
              <Button 
                className="w-full bg-black text-white hover:bg-black/80 font-display uppercase tracking-wide rounded-full"
                onClick={onClose}
              >
                Start a Project
              </Button>
            </Link>
          </div>
        </div>

        <div className="p-5 border-t border-black/10">
          <div className="flex w-full border border-black/20 divide-x divide-black/20">
            <a href="#" className="flex-1 flex items-center justify-center py-3 hover:bg-black/5 transition-colors text-black/40 hover:text-black">
              <Instagram size={20} />
            </a>
            <a href="#" className="flex-1 flex items-center justify-center py-3 hover:bg-black/5 transition-colors text-black/40 hover:text-black">
              <Facebook size={20} />
            </a>
            <a href="#" className="flex-1 flex items-center justify-center py-3 hover:bg-black/5 transition-colors text-black/40 hover:text-black">
              <Twitter size={20} />
            </a>
            <a href="#" className="flex-1 flex items-center justify-center py-3 hover:bg-black/5 transition-colors text-black/40 hover:text-black">
              <TikTokIcon className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
