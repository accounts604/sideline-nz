import { useState } from "react";
import Layout from "@/components/layout";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type IntakeForm = {
  club_type: "Club" | "School" | "Organisation" | "";
  organization: string;
  sport: string[];
  contact_name: string;
  role: string;
  email: string;
  phone: string;
  kit_items: string[];
  quantity_range: string;
  primary_colour: string;
  secondary_colour: string;
  timeline: string;
  current_supplier: string;
  design_direction: string;
  logo_status: string;
  logo_notes: string;
  design_notes: string;
  terms_agreed: boolean;
};

const SPORTS = ["Rugby union", "Rugby league", "Netball", "Football", "Basketball", "Cricket", "Athletics", "Other"];
const KIT_ITEMS = ["Match jerseys", "Training tees", "Shorts", "Hoodies", "Jackets", "Socks", "Supporter gear", "Bags", "Full kit package"];
const QUANTITY_RANGES = ["Under 25", "25–50", "50–100", "100–200", "200+"];
const TIMELINES = ["ASAP", "Within 4 weeks", "Within 8 weeks", "Next season", "Just exploring"];
const DESIGN_DIRECTIONS = ["Modern and clean", "Bold and aggressive", "Heritage and traditional", "Minimalist", "Open to suggestions"];
const LOGO_OPTIONS = ["Yes — high quality file", "Yes — but low quality", "No logo yet"];

const rolesByType: Record<string, string[]> = {
  Club: ["President", "Treasurer", "Committee member", "Coach", "Manager", "Sports coordinator", "Other"],
  School: ["Teacher", "Sports coordinator", "Principal", "Committee member", "Other"],
  Organisation: ["President", "Manager", "Sports coordinator", "Other"],
};

const orgLabels: Record<string, string> = {
  Club: "Club name",
  School: "School name",
  Organisation: "Organisation name",
};

const roleLabels: Record<string, string> = {
  Club: "Your role at the club",
  School: "Your role at the school",
  Organisation: "Your role",
};

export default function FreeMockup() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<IntakeForm>({
    club_type: "",
    organization: "",
    sport: [],
    contact_name: "",
    role: "",
    email: "",
    phone: "",
    kit_items: [],
    quantity_range: "",
    primary_colour: "",
    secondary_colour: "",
    timeline: "",
    current_supplier: "",
    design_direction: "",
    logo_status: "",
    logo_notes: "",
    design_notes: "",
    terms_agreed: false,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const canProceedStep1 =
    form.club_type &&
    form.organization &&
    form.sport.length > 0 &&
    form.contact_name &&
    form.role &&
    form.email;

  const canProceedStep2 =
    form.kit_items.length > 0 &&
    form.quantity_range &&
    form.primary_colour &&
    form.timeline;

  const canSubmit = form.terms_agreed;

  const toggleSport = (sport: string) => {
    setForm((f) => ({
      ...f,
      sport: f.sport.includes(sport) ? f.sport.filter((s) => s !== sport) : [...f.sport, sport],
    }));
  };

  const toggleKitItem = (item: string) => {
    setForm((f) => ({
      ...f,
      kit_items: f.kit_items.includes(item) ? f.kit_items.filter((i) => i !== item) : [...f.kit_items, item],
    }));
  };

  const handleNext = () => {
    if (step === 1 && canProceedStep1) setStep(2);
    else if (step === 2 && canProceedStep2) setStep(3);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/ghl/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Submission failed");
      }

      setSuccess(true);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <Layout>
        <section className="min-h-screen bg-black py-20 sm:py-[80px] px-5 sm:px-[52px]">
          <div className="container mx-auto max-w-2xl">
            <div className="bg-[#111] rounded-[6px] border border-white/[0.08] p-8 sm:p-12 text-center">
              <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-white" />
              </div>
              <h1 className="font-heading text-2xl text-white mb-4 tracking-wider uppercase">We've got your brief</h1>
              <p className="text-white/60 text-lg mb-2">
                Your free mockup is in the queue. We'll have a concept ready within 3–5 business days and send it straight to <strong>{form.email}</strong>. Keep an eye on your inbox.
              </p>
              <p className="text-white/40 text-sm mb-8">
                Questions in the meantime? Email <strong>info@sidelinenz.com</strong>
              </p>
              <Button 
                onClick={() => (window.location.href = "/")}
                className="bg-white hover:bg-white/90 text-black font-heading uppercase rounded-[4px] px-8"
              >
                Back to home
              </Button>
            </div>
          </div>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="relative bg-black py-20 sm:py-[80px] px-5 sm:px-[52px]">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-2 gap-8 md:gap-16">
            {/* Left column — Value proposition */}
            <div className="flex flex-col justify-start">
              <h1 className="font-heading text-4xl sm:text-5xl text-white mb-3 uppercase tracking-wider">
                Get your free custom mockup
              </h1>
              <p className="text-white/60 text-lg sm:text-xl mb-8">
                Tell us about your club. We'll build a custom design concept — free, no obligation.
              </p>

              <div className="space-y-4 mb-10">
                <div className="flex gap-3">
                  <div className="text-white font-medium text-sm pt-1">✓</div>
                  <p className="text-white/70 text-sm">1 free design concept based on your brief</p>
                </div>
                <div className="flex gap-3">
                  <div className="text-white font-medium text-sm pt-1">✓</div>
                  <p className="text-white/70 text-sm">1 free revision included</p>
                </div>
                <div className="flex gap-3">
                  <div className="text-white font-medium text-sm pt-1">✓</div>
                  <p className="text-white/70 text-sm">Quote delivered within 48 hours</p>
                </div>
              </div>

              {/* Terms box */}
              <div className="bg-[#111] rounded-[6px] border border-white/[0.08] p-6">
                <p className="text-white font-medium text-sm mb-4 tracking-wide">By submitting this form you agree to the following:</p>
                <ul className="space-y-2 text-white/60 text-sm">
                  <li>• 1 free mockup per club</li>
                  <li>• 1 free revision maximum</li>
                  <li>• Quotes valid for 14 days</li>
                  <li>• Mockup designs remain property of Sideline NZ until a production order is placed</li>
                  <li>• Additional revisions charged separately</li>
                </ul>
              </div>
            </div>

            {/* Right column — The form */}
            <div className="bg-[#111] rounded-[6px] border border-white/[0.08] p-6 sm:p-8">
              {/* Step indicator */}
              <p className="text-white/40 text-sm font-medium mb-6">Step {step} of 3</p>

              {/* Step 1: Your club */}
              {step === 1 && (
                <form className="space-y-5">
                  <h2 className="font-heading text-lg text-white mb-6 tracking-wider uppercase">Your club</h2>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-3">Club type *</label>
                    <div className="flex flex-wrap gap-2">
                      {["Club", "School", "Organisation"].map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, club_type: f.club_type === type ? "" : (type as any) }))}
                          className={`px-4 py-2 rounded-[4px] text-sm font-medium transition-all border ${
                            form.club_type === type
                              ? "bg-white text-black border-white"
                              : "bg-transparent text-white/70 border-white/[0.12] hover:border-white/30"
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      {form.club_type ? orgLabels[form.club_type] : "Organization name"} *
                    </label>
                    <Input
                      value={form.organization}
                      onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
                      placeholder="e.g. Otahuhu RFC"
                      className="bg-black border border-white/[0.12] rounded-[6px] py-3 text-white placeholder:text-white/30 focus:border-white/30 text-[16px]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-3">Sport *</label>
                    <div className="flex flex-wrap gap-2">
                      {SPORTS.map((sport) => (
                        <button
                          key={sport}
                          type="button"
                          onClick={() => toggleSport(sport)}
                          className={`px-4 py-2 rounded-[4px] text-sm font-medium transition-all border ${
                            form.sport.includes(sport)
                              ? "bg-white text-black border-white"
                              : "bg-transparent text-white/70 border-white/[0.12] hover:border-white/30"
                          }`}
                        >
                          {sport}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Your name *</label>
                    <Input
                      value={form.contact_name}
                      onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                      placeholder="John Smith"
                      className="bg-black border border-white/[0.12] rounded-[6px] py-3 text-white placeholder:text-white/30 focus:border-white/30 text-[16px]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      {form.club_type ? roleLabels[form.club_type] : "Your role"} *
                    </label>
                    <select
                      value={form.role}
                      onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                      className="w-full bg-black border border-white/[0.12] rounded-[6px] py-3 text-white placeholder:text-white/30 focus:border-white/30 text-[16px]"
                    >
                      <option value="">Select a role</option>
                      {form.club_type && rolesByType[form.club_type]?.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Email *</label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="john@example.com"
                      className="bg-black border border-white/[0.12] rounded-[6px] py-3 text-white placeholder:text-white/30 focus:border-white/30 text-[16px]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Phone</label>
                    <Input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="02X XXX XXXX"
                      className="bg-black border border-white/[0.12] rounded-[6px] py-3 text-white placeholder:text-white/30 focus:border-white/30 text-[16px]"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      type="button"
                      onClick={handleNext}
                      disabled={!canProceedStep1}
                      className={`flex-1 rounded-[4px] py-3 font-heading uppercase tracking-wide ${
                        canProceedStep1 ? "bg-white hover:bg-white/90 text-black" : "bg-white/10 text-white/30"
                      }`}
                    >
                      Next
                    </Button>
                  </div>
                </form>
              )}

              {/* Step 2: Your kit */}
              {step === 2 && (
                <form className="space-y-5">
                  <h2 className="font-heading text-lg text-white mb-6 tracking-wider uppercase">Your kit</h2>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-3">What do you need? *</label>
                    <div className="flex flex-wrap gap-2">
                      {KIT_ITEMS.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => toggleKitItem(item)}
                          className={`px-3 py-2 rounded-[4px] text-sm font-medium transition-all border ${
                            form.kit_items.includes(item)
                              ? "bg-white text-black border-white"
                              : "bg-transparent text-white/70 border-white/[0.12] hover:border-white/30"
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-3">Estimated quantity *</label>
                    <div className="flex flex-wrap gap-2">
                      {QUANTITY_RANGES.map((range) => (
                        <button
                          key={range}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, quantity_range: f.quantity_range === range ? "" : range }))}
                          className={`px-4 py-2 rounded-[4px] text-sm font-medium transition-all border ${
                            form.quantity_range === range
                              ? "bg-white text-black border-white"
                              : "bg-transparent text-white/70 border-white/[0.12] hover:border-white/30"
                          }`}
                        >
                          {range}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Primary colour *</label>
                    <Input
                      value={form.primary_colour}
                      onChange={(e) => setForm((f) => ({ ...f, primary_colour: e.target.value }))}
                      placeholder="e.g. Navy blue"
                      className="bg-black border border-white/[0.12] rounded-[6px] py-3 text-white placeholder:text-white/30 focus:border-white/30 text-[16px]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Secondary colour</label>
                    <Input
                      value={form.secondary_colour}
                      onChange={(e) => setForm((f) => ({ ...f, secondary_colour: e.target.value }))}
                      placeholder="e.g. White"
                      className="bg-black border border-white/[0.12] rounded-[6px] py-3 text-white placeholder:text-white/30 focus:border-white/30 text-[16px]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-3">When do you need this by? *</label>
                    <div className="flex flex-wrap gap-2">
                      {TIMELINES.map((timeline) => (
                        <button
                          key={timeline}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, timeline: f.timeline === timeline ? "" : timeline }))}
                          className={`px-4 py-2 rounded-[4px] text-sm font-medium transition-all border ${
                            form.timeline === timeline
                              ? "bg-white text-black border-white"
                              : "bg-transparent text-white/70 border-white/[0.12] hover:border-white/30"
                          }`}
                        >
                          {timeline}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Current supplier (optional)</label>
                    <Input
                      value={form.current_supplier}
                      onChange={(e) => setForm((f) => ({ ...f, current_supplier: e.target.value }))}
                      placeholder="Who do you use now?"
                      className="bg-black border border-white/[0.12] rounded-[6px] py-3 text-white placeholder:text-white/30 focus:border-white/30 text-[16px]"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      type="button"
                      onClick={handleBack}
                      className="flex-1 rounded-[4px] py-3 font-heading uppercase tracking-wide bg-transparent text-white border border-white/[0.12] hover:border-white/30"
                    >
                      Back
                    </Button>
                    <Button
                      type="button"
                      onClick={handleNext}
                      disabled={!canProceedStep2}
                      className={`flex-1 rounded-[4px] py-3 font-heading uppercase tracking-wide ${
                        canProceedStep2 ? "bg-white hover:bg-white/90 text-black" : "bg-white/10 text-white/30"
                      }`}
                    >
                      Next
                    </Button>
                  </div>
                </form>
              )}

              {/* Step 3: Design brief */}
              {step === 3 && (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <h2 className="font-heading text-lg text-white mb-6 tracking-wider uppercase">Design brief</h2>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-3">Design direction *</label>
                    <div className="flex flex-wrap gap-2">
                      {DESIGN_DIRECTIONS.map((direction) => (
                        <button
                          key={direction}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, design_direction: f.design_direction === direction ? "" : direction }))}
                          className={`px-4 py-2 rounded-[4px] text-sm font-medium transition-all border ${
                            form.design_direction === direction
                              ? "bg-white text-black border-white"
                              : "bg-transparent text-white/70 border-white/[0.12] hover:border-white/30"
                          }`}
                        >
                          {direction}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-3">Do you have a club logo? *</label>
                    <div className="flex flex-wrap gap-2">
                      {LOGO_OPTIONS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, logo_status: f.logo_status === option ? "" : option }))}
                          className={`px-4 py-2 rounded-[4px] text-sm font-medium transition-all border ${
                            form.logo_status === option
                              ? "bg-white text-black border-white"
                              : "bg-transparent text-white/70 border-white/[0.12] hover:border-white/30"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>

                  {form.logo_status && form.logo_status !== "No logo yet" && (
                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-2">Logo notes</label>
                      <Input
                        value={form.logo_notes}
                        onChange={(e) => setForm((f) => ({ ...f, logo_notes: e.target.value }))}
                        placeholder="Any notes about your logo file"
                        className="bg-black border border-white/[0.12] rounded-[6px] py-3 text-white placeholder:text-white/30 focus:border-white/30 text-[16px]"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Any other notes? (optional)</label>
                    <Textarea
                      value={form.design_notes}
                      onChange={(e) => setForm((f) => ({ ...f, design_notes: e.target.value }))}
                      placeholder="Colours to avoid, style references, specific requests..."
                      className="bg-black border border-white/[0.12] rounded-[6px] min-h-[100px] text-white placeholder:text-white/30 focus:border-white/30 text-[16px]"
                      rows={4}
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <input
                      type="checkbox"
                      id="terms_agreed"
                      checked={form.terms_agreed}
                      onChange={(e) => setForm((f) => ({ ...f, terms_agreed: e.target.checked }))}
                      className="w-4 h-4 rounded border-white/[0.12] bg-black text-white focus:ring-white"
                    />
                    <label htmlFor="terms_agreed" className="text-sm text-white/70">
                      I have read and agree to the terms listed on this page.
                    </label>
                  </div>

                  {error && (
                    <div className="rounded-[6px] border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
                      {error}
                    </div>
                  )}

                  <div className="flex gap-3 pt-4">
                    <Button
                      type="button"
                      onClick={handleBack}
                      className="flex-1 rounded-[4px] py-3 font-heading uppercase tracking-wide bg-transparent text-white border border-white/[0.12] hover:border-white/30"
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      disabled={!canSubmit || isSubmitting}
                      className={`flex-1 rounded-[4px] py-3 font-heading uppercase tracking-wide ${
                        canSubmit ? "bg-white hover:bg-white/90 text-black" : "bg-white/10 text-white/30"
                      }`}
                    >
                      {isSubmitting ? "Submitting..." : "Submit — get my free mockup"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
