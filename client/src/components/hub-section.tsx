import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Check, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

const PILLARS = [
  {
    icon: "\u{1F3C9}",
    title: "Custom Kit",
    desc: "Fully sublimated, fully yours. Match jerseys, training gear, and off-field apparel designed around your club identity.",
    tag: "Design included",
  },
  {
    icon: "\u{1F4B0}",
    title: "Supporter Funded",
    desc: "Your supporters buy merch they actually want. That revenue funds your kit. No upfront cost. No sausage sizzles.",
    tag: "No upfront cost",
  },
  {
    icon: "\u{1F3EA}",
    title: "Your Own Store",
    desc: "A branded online store where members order direct. No stock, no shipping, no admin.",
    tag: "Live in 24hrs",
    anchor: "#team-stores",
  },
];

const SPORTS = ["Rugby", "League", "Netball", "Football", "Basketball", "Touch", "Other"];

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function HubSection() {
  const [clubName, setClubName] = useState("");
  const [sport, setSport] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = clubName.trim().length > 0 && sport.length > 0 && isValidEmail(email);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/ghl/mockup-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ club_name: clubName, sport, email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Something went wrong");
      }
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="hub-mockup-form" className="py-20 lg:py-28 bg-black text-white">
      <div className="container mx-auto px-4 max-w-3xl">
        <p className="text-xs tracking-[0.2em] uppercase text-white/40 mb-4 text-center" data-testid="badge-hub">
          No cost &middot; No commitment
        </p>

        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-display text-white text-center mb-4 leading-tight">
          Get a Free<br />Kit Mockup.
        </h2>

        <p className="text-center text-white/50 mb-12 max-w-md mx-auto">
          Tell us your club, your sport, and your colours. We'll design a custom mockup and send it to your inbox within 48 hours. No cost. No obligation. Just a look at what your kit could be.
        </p>

        {success ? (
          <div className="flex flex-col items-center justify-center text-center py-8" data-testid="card-hub-mockup-form">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-white/10">
              <Check className="w-8 h-8 text-white" />
            </div>
            <h3 className="font-display text-2xl text-white mb-2">Mockup on its way!</h3>
            <p className="text-white/50">Check your inbox at <span className="text-white font-medium">{email}</span> within 48 hours.</p>
          </div>
        ) : (
          <div className="max-w-md mx-auto space-y-4" data-testid="card-hub-mockup-form">
            <Input
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              placeholder="Club name"
              data-testid="input-hub-club-name"
              className="bg-transparent border-white/20 text-white placeholder:text-white/30 rounded-lg py-6 text-base focus:border-white"
            />

            <select
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              data-testid="select-hub-sport"
              className="w-full bg-transparent text-white rounded-lg px-4 py-4 focus:outline-none appearance-none border border-white/20 text-base"
            >
              <option value="" className="text-black">Sport</option>
              {SPORTS.map((s) => (
                <option key={s} value={s} className="text-black">{s}</option>
              ))}
            </select>

            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email address"
              data-testid="input-hub-email"
              className={cn("bg-transparent border-white/20 text-white placeholder:text-white/30 rounded-lg py-6 text-base focus:border-white",
                email && !isValidEmail(email) && "border-red-400"
              )}
            />

            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}

            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
              className={cn("w-full rounded-full py-6 h-auto font-display uppercase tracking-wider text-base",
                canSubmit ? "bg-white hover:bg-white/90 text-black" : "bg-white/10 text-white/30"
              )}
              data-testid="button-hub-send-mockup"
            >
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
              ) : (
                "Send My Free Mockup"
              )}
            </Button>

            <p className="text-center text-xs text-white/30 pt-2">Free &middot; No commitment &middot; Delivered within 48 hours</p>
          </div>
        )}
      </div>
    </section>
  );
}
