import { useEffect, useRef } from "react";
import { X, ShoppingCart, Calendar, Package, Store, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TeamStoreExplainerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInclude: () => void;
  context: "homepage" | "form";
}

export function TeamStoreExplainerModal({ isOpen, onClose, onInclude, context }: TeamStoreExplainerModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      closeButtonRef.current?.focus();
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    if (isOpen) document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleIncludeClick = () => {
    onInclude();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />
      
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-store-modal-title"
        aria-describedby="team-store-modal-desc"
        className={cn(
          "relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto",
          "animate-in zoom-in-95 fade-in duration-200"
        )}
      >
        <button
          ref={closeButtonRef}
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-black/30 hover:text-black transition-colors rounded-full hover:bg-black/5"
          aria-label="Close modal"
          data-testid="modal-close"
        >
          <X size={20} />
        </button>

        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-black/5 rounded-xl flex items-center justify-center">
              <Store className="text-black" size={24} />
            </div>
            <div>
              <h2 id="team-store-modal-title" className="text-xl font-display text-black">
                Team Store = online ordering without the admin
              </h2>
            </div>
          </div>

          <p id="team-store-modal-desc" className="text-black/50 mb-6">
            We set up a dedicated online store for your club or school. Parents and supporters order and pay directly — you don't handle any money or spreadsheets.
          </p>

          <div className="space-y-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-black/5 rounded-lg flex items-center justify-center shrink-0">
                <ShoppingCart className="text-black" size={20} />
              </div>
              <div>
                <div className="font-medium text-black">Individual ordering & payments</div>
                <div className="text-sm text-black/50">No collecting cash or chasing orders</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-black/5 rounded-lg flex items-center justify-center shrink-0">
                <Calendar className="text-black" size={20} />
              </div>
              <div>
                <div className="font-medium text-black">Cut-off dates managed by Sideline</div>
                <div className="text-sm text-black/50">We handle the deadlines and reminders</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-black/5 rounded-lg flex items-center justify-center shrink-0">
                <Package className="text-black" size={20} />
              </div>
              <div>
                <div className="font-medium text-black">Optional supporter merch drops</div>
                <div className="text-sm text-black/50">Hoodies, tees, caps for fans</div>
              </div>
            </div>
          </div>

          <div className="bg-black/5 rounded-xl p-4 mb-6">
            <div className="text-sm font-medium text-black mb-3">How it works:</div>
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                <span className="text-black/50">We build the store with your branding</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                <span className="text-black/50">You share the link with your community</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                <span className="text-black/50">We produce + deliver after cut-off</span>
              </div>
            </div>
          </div>

          <Button
            onClick={handleIncludeClick}
            className="w-full bg-black hover:bg-black/80 text-white font-display uppercase rounded-full py-6 h-auto tracking-wider"
            data-testid="modal-include-team-store"
          >
            Include Team Store in my project <ArrowRight className="ml-2" size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}
