import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Loader2, Paintbrush, Users, Store, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Pillar {
  Icon: LucideIcon;
  title: string;
  desc: string;
  tag: string;
}

const PILLARS: Pillar[] = [
  {
    Icon: Paintbrush,
    title: "Custom Kit",
    desc: "Fully sublimated, fully yours. Match jerseys, training gear, and off-field apparel designed around your club identity.",
    tag: "Design included",
  },
  {
    Icon: Users,
    title: "Supporter Funded",
    desc: "Your supporters buy merch they actually want. That revenue funds your kit. No upfront cost. No sausage sizzles.",
    tag: "No upfront cost",
  },
  {
    Icon: Store,
    title: "Your Own Store",
    desc: "A branded online store where members order direct. No stock, no shipping, no admin.",
    tag: "Live in 24hrs",
  },
];

const SPORTS = ["Rugby", "League", "Netball", "Football", "Basketball", "Touch", "Other"];

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function PillarCard({ pillar, index }: { pillar: Pillar; index: number }) {
  const { Icon, title, desc, tag } = pillar;
  return (
    <div
      data-testid={`pillar-card-${index}`}
      className="group relative flex flex-col items-start p-6 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
    >
      {/* Step number */}
      <span className="absolute top-5 right-5 text-[11px] font-mono text-white/15 tracking-wider">
        0{index + 1}
      </span>

      {/* Icon */}
      <div className="w-11 h-11 rounded-lg bg-white/[0.06] flex items-center justify-center mb-5 group-hover:bg-white/10 transition-colors">
        <Icon className="w-5 h-5 text-white/70" strokeWidth={1.5} />
      </div>

      {/* Title + tag */}
      <h3 className="text-[15px] font-semibold text-white mb-1.5 tracking-wide uppercase">
        {title}
      </h3>
      <span className="inline-block text-[10px] tracking-[0.15em] uppercase text-white/30 border border-white/10 rounded-full px-2.5 py-0.5 mb-4">
        {tag}
      </span>

      {/* Description */}
      <p className="text-[13px] text-white/40 leading-relaxed">
        {desc}
      </p>
    </div>
  );
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
    <section id="hub-mockup-form" className="bg-black text-white">
      {/* ── Three Pillars ── */}
      <div className="pt-20 lg:pt-28 pb-12 lg:pb-16">
        <div className="container mx-auto px-5 md:px-[52px]">
          <p
            className="text-[10px] tracking-[0.25em] uppercase text-white/25 mb-3 text-center"
            data-testid="badge-hub"
          >
            The Sideline Model
          </p>
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl text-white text-center mb-3 leading-tight uppercase tracking-wider"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            Three pillars. Zero hassle.
          </h2>
          <p className="text-center text-white/40 mb-12 max-w-lg mx-auto text-sm leading-relaxed">
            Custom kit, supporter funding, and your own online store — all managed by us. You just pick your colours.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {PILLARS.map((pillar, i) => (
              <PillarCard key={pillar.title} pillar={pillar} index={i} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="max-w-4xl mx-auto px-5 md:px-[52px]">
        <div className="h-px bg-white/[0.06]" />
      </div>

      {/* ── Mockup Form ── */}
      <div className="py-16 lg:py-20">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-display text-white text-center mb-4 leading-tight">
            Get a Free<br />Kit Mockup.
          </h2>

          <p className="text-center text-white/50 mb-12 max-w-md mx-auto text-sm">
            Tell us your club, your sport, and your colours. We'll design a custom mockup and send it to your inbox within 48 hours. No cost. No obligation.
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
      </div>
    </section>
  );
}
