import { useState } from "react";
import Layout from "@/components/layout";
import Seo from "@/components/seo";
import { Check, ChevronLeft } from "lucide-react";
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

const SPORTS_OPTIONS = [
  "Rugby union",
  "Rugby league",
  "Netball",
  "Football",
  "Basketball",
  "Cricket",
  "Athletics",
  "Other",
];

const KIT_ITEMS_OPTIONS = [
  "Match jerseys",
  "Training tees",
  "Shorts",
  "Hoodies",
  "Jackets",
  "Socks",
  "Supporter gear",
  "Bags",
  "Full kit package",
];

const QUANTITY_OPTIONS = ["Under 25", "25–50", "50–100", "100–200", "200+"];

const TIMELINE_OPTIONS = ["ASAP", "Within 4 weeks", "Within 8 weeks", "Next season", "Just exploring"];

const DESIGN_DIRECTION_OPTIONS = [
  "Modern and clean",
  "Bold and aggressive",
  "Heritage and traditional",
  "Minimalist",
  "Open to suggestions",
];

const LOGO_STATUS_OPTIONS = ["Yes — high quality file", "Yes — but low quality", "No logo yet"];

const ROLE_OPTIONS = [
  "President",
  "Treasurer",
  "Committee member",
  "Coach",
  "Manager",
  "Sports coordinator",
  "Teacher",
  "Other",
];

export default function FreeMockup() {
  const [currentStep, setCurrentStep] = useState(1);
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

  // Validation helpers
  const step1Complete = form.club_type && form.organization && form.sport.length > 0 && form.contact_name && form.role && form.email;
  const step2Complete = form.kit_items.length > 0 && form.quantity_range && form.primary_colour && form.timeline;
  const canSubmit = form.terms_agreed && form.design_direction && form.logo_status;

  // Label helpers based on club_type
  const getOrganizationLabel = () => {
    switch (form.club_type) {
      case "School":
        return "School name";
      case "Organisation":
        return "Organisation name";
      default:
        return "Club name";
    }
  };

  const getRoleLabel = () => {
    switch (form.club_type) {
      case "School":
        return "Your role at the school";
      case "Organisation":
        return "Your role";
      default:
        return "Your role at the club";
    }
  };

  // Form handlers
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

  const handleNextStep = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
      setError(null);
    }
  };

  const handleBackStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
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
      setError(e.message || "Something went wrong. Please try again or email info@sidelinenz.com");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSuccess(false);
    setCurrentStep(1);
    setForm({
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
  };

  if (success) {
    return (
      <Layout>
      <Seo title="Get a Free Kit Mockup" description="See your team's kit in your colours before you commit. Sideline NZ creates a free custom mockup from your logo and design ideas." path="/free-mockup" />
        <section className="min-h-screen bg-black py-20 sm:py-[80px] px-5 sm:px-[52px]">
          <div className="container mx-auto max-w-2xl">
            <div className="bg-[#111] rounded-[6px] border border-white/[0.08] p-8 sm:p-12 text-center">
              <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-white" />
              </div>
              <h1 className="font-heading text-2xl text-white mb-4 tracking-wider uppercase">We've got your brief</h1>
              <p className="text-white/60 text-lg mb-2">
                Your free mockup is in the queue. We'll have a concept ready within 3–5 business days and send it straight to{" "}
                <span className="text-white">{form.email}</span>. Keep an eye on your inbox.
              </p>
              <p className="text-white/40 text-sm mb-8">Questions in the meantime? Email info@sidelinenz.com</p>
              <Button
                onClick={resetForm}
                className="bg-white hover:bg-white/90 text-black font-heading uppercase rounded-[4px] px-8"
              >
                Back to Home
              </Button>
            </div>
          </div>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      <Seo title="Get a Free Kit Mockup" description="See your team's kit in your colours before you commit. Sideline NZ creates a free custom mockup from your logo and design ideas." path="/free-mockup" />
      <section className="bg-black py-20 sm:py-[80px] px-5 sm:px-[52px]">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-2 gap-12">
            {/* Left column — Value proposition */}
            <div className="pt-4">
              <h1 className="font-heading text-3xl sm:text-4xl text-white mb-3 uppercase tracking-wider">
                Get your free custom mockup
              </h1>
              <p className="text-white/60 text-lg mb-8">
                Tell us about your club. We'll build a custom design concept — free, no obligation.
              </p>

              <div className="space-y-3 mb-10">
                <div className="flex items-start gap-3">
                  <span className="text-white/40 mt-1">•</span>
                  <p className="text-white/80">1 free design concept based on your brief</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-white/40 mt-1">•</span>
                  <p className="text-white/80">1 free revision included</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-white/40 mt-1">•</span>
                  <p className="text-white/80">Quote delivered within 48 hours</p>
                </div>
              </div>

              {/* Terms summary box */}
              <div className="bg-[#111] rounded-[6px] border border-white/[0.08] p-6">
                <p className="font-heading text-sm text-white mb-4 uppercase tracking-wider">
                  By submitting this form you agree to the following:
                </p>
                <div className="space-y-2 text-sm text-white/60">
                  <p>• 1 free mockup per club</p>
                  <p>• 1 free revision maximum</p>
                  <p>• Quotes valid for 14 days</p>
                  <p>• Mockup designs remain property of Sideline NZ until a production order is placed</p>
                  <p>• Additional revisions charged separately</p>
                </div>
              </div>
            </div>

            {/* Right column — The form */}
            <div>
              <div className="bg-[#111] rounded-[6px] border border-white/[0.08] p-8">
                {/* Step indicator */}
                <div className="mb-8">
                  <p className="text-xs text-white/40 uppercase tracking-wider">
                    Step {currentStep} of 3
                  </p>
                  <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white transition-all duration-300"
                      style={{ width: `${(currentStep / 3) * 100}%` }}
                    />
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* ===== STEP 1 ===== */}
                  {currentStep === 1 && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-white/70 mb-2">Club type *</label>
                        <div className="flex flex-wrap gap-2">
                          {["Club", "School", "Organisation"].map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  club_type: f.club_type === type ? "" : (type as any),
                                }))
                              }
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
                          {getOrganizationLabel()} *
                        </label>
                        <Input
                          value={form.organization}
                          onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
                          placeholder="e.g. Otahuhu RFC"
                          className="bg-black border border-white/[0.12] rounded-[6px] py-3 text-white placeholder:text-white/30 focus:border-white/30 text-[16px]"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-white/70 mb-2">Sport(s) *</label>
                        <div className="flex flex-wrap gap-2">
                          {SPORTS_OPTIONS.map((sport) => (
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
                          {getRoleLabel()} *
                        </label>
                        <select
                          value={form.role}
                          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                          className="w-full bg-black border border-white/[0.12] rounded-[6px] py-3 text-white text-[16px] focus:border-white/30 appearance-none px-3"
                        >
                          <option value="">Select a role</option>
                          {ROLE_OPTIONS.map((r) => (
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
                        <label className="block text-sm font-medium text-white/70 mb-2">Phone (optional)</label>
                        <Input
                          type="tel"
                          value={form.phone}
                          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                          placeholder="02X XXX XXXX"
                          className="bg-black border border-white/[0.12] rounded-[6px] py-3 text-white placeholder:text-white/30 focus:border-white/30 text-[16px]"
                        />
                      </div>
                    </>
                  )}

                  {/* ===== STEP 2 ===== */}
                  {currentStep === 2 && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-white/70 mb-2">What do you need? *</label>
                        <div className="flex flex-wrap gap-2">
                          {KIT_ITEMS_OPTIONS.map((item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => toggleKitItem(item)}
                              className={`px-4 py-2 rounded-[4px] text-sm font-medium transition-all border ${
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
                        <label className="block text-sm font-medium text-white/70 mb-2">Estimated quantity *</label>
                        <div className="flex flex-wrap gap-2">
                          {QUANTITY_OPTIONS.map((qty) => (
                            <button
                              key={qty}
                              type="button"
                              onClick={() => setForm((f) => ({ ...f, quantity_range: f.quantity_range === qty ? "" : qty }))}
                              className={`px-4 py-2 rounded-[4px] text-sm font-medium transition-all border ${
                                form.quantity_range === qty
                                  ? "bg-white text-black border-white"
                                  : "bg-transparent text-white/70 border-white/[0.12] hover:border-white/30"
                              }`}
                            >
                              {qty}
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
                        <label className="block text-sm font-medium text-white/70 mb-2">Secondary colour (optional)</label>
                        <Input
                          value={form.secondary_colour}
                          onChange={(e) => setForm((f) => ({ ...f, secondary_colour: e.target.value }))}
                          placeholder="e.g. White"
                          className="bg-black border border-white/[0.12] rounded-[6px] py-3 text-white placeholder:text-white/30 focus:border-white/30 text-[16px]"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-white/70 mb-2">When do you need this by? *</label>
                        <div className="flex flex-wrap gap-2">
                          {TIMELINE_OPTIONS.map((tl) => (
                            <button
                              key={tl}
                              type="button"
                              onClick={() => setForm((f) => ({ ...f, timeline: f.timeline === tl ? "" : tl }))}
                              className={`px-4 py-2 rounded-[4px] text-sm font-medium transition-all border ${
                                form.timeline === tl
                                  ? "bg-white text-black border-white"
                                  : "bg-transparent text-white/70 border-white/[0.12] hover:border-white/30"
                              }`}
                            >
                              {tl}
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
                    </>
                  )}

                  {/* ===== STEP 3 ===== */}
                  {currentStep === 3 && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-white/70 mb-2">Design direction *</label>
                        <div className="flex flex-wrap gap-2">
                          {DESIGN_DIRECTION_OPTIONS.map((dir) => (
                            <button
                              key={dir}
                              type="button"
                              onClick={() =>
                                setForm((f) => ({ ...f, design_direction: f.design_direction === dir ? "" : dir }))
                              }
                              className={`px-4 py-2 rounded-[4px] text-sm font-medium transition-all border ${
                                form.design_direction === dir
                                  ? "bg-white text-black border-white"
                                  : "bg-transparent text-white/70 border-white/[0.12] hover:border-white/30"
                              }`}
                            >
                              {dir}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-white/70 mb-2">Do you have a club logo? *</label>
                        <div className="flex flex-wrap gap-2">
                          {LOGO_STATUS_OPTIONS.map((status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() =>
                                setForm((f) => ({ ...f, logo_status: f.logo_status === status ? "" : status }))
                              }
                              className={`px-4 py-2 rounded-[4px] text-sm font-medium transition-all border ${
                                form.logo_status === status
                                  ? "bg-white text-black border-white"
                                  : "bg-transparent text-white/70 border-white/[0.12] hover:border-white/30"
                              }`}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      </div>

                      {form.logo_status !== "No logo yet" && form.logo_status && (
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

                      <div className="pt-2">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.terms_agreed}
                            onChange={(e) => setForm((f) => ({ ...f, terms_agreed: e.target.checked }))}
                            className="mt-1 w-5 h-5 rounded border border-white/[0.12] bg-black accent-white"
                          />
                          <span className="text-sm text-white/70">
                            I have read and agree to the terms listed on this page. *
                          </span>
                        </label>
                      </div>
                    </>
                  )}

                  {error && (
                    <div className="rounded-[6px] border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
                      {error}
                    </div>
                  )}

                  {/* Navigation buttons */}
                  <div className="flex gap-4 pt-6">
                    {currentStep > 1 && (
                      <button
                        type="button"
                        onClick={handleBackStep}
                        className="flex items-center gap-2 px-4 py-3 text-white/60 hover:text-white transition-colors"
                      >
                        <ChevronLeft size={16} />
                        Back
                      </button>
                    )}
                    <div className="flex-1" />
                    {currentStep < 3 ? (
                      <Button
                        type="button"
                        onClick={handleNextStep}
                        disabled={!step1Complete && currentStep === 1 ? true : !step2Complete && currentStep === 2 ? true : false}
                        className={`rounded-[4px] py-3 font-heading uppercase tracking-wide ${
                          currentStep === 1 && !step1Complete
                            ? "bg-white/10 text-white/30"
                            : currentStep === 2 && !step2Complete
                              ? "bg-white/10 text-white/30"
                              : "bg-white hover:bg-white/90 text-black"
                        }`}
                      >
                        Next
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        disabled={!canSubmit || isSubmitting}
                        className={`rounded-[4px] py-3 font-heading uppercase tracking-wide ${
                          canSubmit && !isSubmitting ? "bg-white hover:bg-white/90 text-black" : "bg-white/10 text-white/30"
                        }`}
                      >
                        {isSubmitting ? "Submitting..." : "Submit — get my free mockup"}
                      </Button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
