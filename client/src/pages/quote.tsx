import { useState, useMemo, useEffect, useRef } from "react";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ArrowRight, Check, Loader2, HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { TeamStoreExplainerModal } from "@/components/team-store-explainer-modal";

type UserType = "club" | "school" | "other";

type FormData = {
  user_type: UserType | "";
  role: string;
  organization: string;
  member_count: string;
  current_supplier: string;
  sports: string[];
  needs: string[];
  kit_quantity: string;
  supporter_quantity: string;
  estimated_quantity: string;
  teams_involved: string[];
  fundraising_interest: string;
  sponsorship_interest: string;
  style_preference: string;
  timing: string;
  season_start: string;
  design_stage: string;
  budget_range: string;
  mockup_interest: string;
  notes: string;
  approval_process: string;
  main_concern: string[];
  name: string;
  email: string;
  phone: string;
  kit_items: string[];
  personalisation: string[];
  supporter_audience: string[];
  school_event_date: string;
  slt_friendly: string;
  team_store_interest: string;
  team_store_audience: string[];
  team_store_goal: string;
};

const INITIAL_DATA: FormData = {
  user_type: "", role: "", organization: "", member_count: "", current_supplier: "",
  sports: [], needs: [], kit_quantity: "", supporter_quantity: "", estimated_quantity: "",
  teams_involved: [], fundraising_interest: "", sponsorship_interest: "", style_preference: "",
  timing: "", season_start: "", design_stage: "", budget_range: "",
  mockup_interest: "", notes: "", approval_process: "", main_concern: [],
  name: "", email: "", phone: "", kit_items: [], personalisation: [],
  supporter_audience: [], school_event_date: "", slt_friendly: "",
  team_store_interest: "", team_store_audience: [], team_store_goal: "",
};

const SPORTS = ["Rugby", "League", "Football", "Netball", "Basketball", "Hockey", "Cricket", "Touch", "Other"];

const NEED_CARDS = [
  { label: "Full Playing Kit", desc: "Match-day jerseys, shorts, socks", icon: "\u{1F3C9}" },
  { label: "Training Gear", desc: "Tees, singlets, hoodies, trackies", icon: "\u{1F3CB}\uFE0F" },
  { label: "Supporter Gear", desc: "Hoodies, tees, caps, flags", icon: "\u{1F9E2}" },
  { label: "Off-Field Apparel", desc: "Polos, jackets, staff/community wear", icon: "\u{1F455}" },
  { label: "Not Sure Yet", desc: "We'll guide you to the right setup", icon: "\u{1F937}" },
];

const KIT_ITEMS = ["Jersey", "Shorts", "Socks"];
const PERSONALISATION = ["Numbers", "Names", "Sponsor logos", "Player initials"];
const SUPPORTER_AUDIENCE = ["Players", "Parents", "Alumni", "Wider community"];
const STYLE_PREF = ["Clean / Classic", "Bold / Modern", "Cultural / Heritage"];
const TEAMS = ["Premier", "Reserve", "Juniors", "Women", "Academy", "Multiple teams"];
const QUANTITIES = ["Under 20", "20\u201350", "50\u2013100", "100+"];
const MEMBER_COUNT = ["Under 20", "20\u201350", "51\u2013100", "100\u2013200", "200+"];
const TIMING = ["ASAP (Rush)", "1\u20132 Months", "3\u20134 Months", "Next Season", "Just Exploring"];
const SEASON_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December", "Not sure"];
const DESIGN_STAGE = ["No design yet", "Have ideas", "Updating existing kit", "Design ready"];

const BUDGET_OPTIONS = [
  { value: "Still exploring", label: "Still exploring", hint: "Not sure yet" },
  { value: "Budget-conscious", label: "Budget-conscious", hint: "~$50\u201380 per person" },
  { value: "Mid-range", label: "Mid-range", hint: "~$80\u2013130 per person" },
  { value: "Premium", label: "Premium", hint: "$130+ per person" },
];

const CONCERNS = ["Late delivery", "Wrong sizing", "Complicated ordering", "Committee approval", "Communication", "Budget pressure"];
const APPROVAL = ["Just me", "Committee approval", "SLT/Finance approval", "Not sure yet"];
const TEAM_STORE_INTEREST = ["Yes", "Maybe", "No"];
const TEAM_STORE_AUDIENCE = ["Players", "Parents", "Supporters", "Alumni", "Community"];
const TEAM_STORE_GOAL = ["Fundraising", "Convenience", "Supporter merch", "Pre-orders for season", "Fund our kit through supporter sales"];
const FUNDRAISING_INTEREST = ["Yes please", "Maybe", "No thanks"];
const SPONSORSHIP_INTEREST = ["Yes, we have sponsors", "Looking for sponsors", "No sponsors"];
const MOCKUP_INTEREST = ["Yes please", "No thanks"];

const STEP_HEADINGS = [
  { title: "ABOUT YOU", subtitle: "Tell us who you are so we can tailor everything to your setup." },
  { title: "YOUR KIT NEEDS", subtitle: "What does your team need on and off the field?" },
  { title: "TIMING & EXTRAS", subtitle: "Fundraising, sponsorship, and when you need it." },
  { title: "DESIGN & BUDGET", subtitle: "Where are you at with your kit design?" },
  { title: "FINAL DETAILS", subtitle: "Approval, concerns, and online store options." },
  { title: "CONTACT INFO", subtitle: "How do we get in touch with you?" },
];

function TogglePill({ label, active, onClick, testId }: { label: string; active: boolean; onClick: () => void; testId?: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId}
      className={cn("px-4 py-2.5 rounded border-2 text-sm font-medium transition-all",
        active ? "bg-white text-black border-white" : "bg-transparent text-white/80 border-white/20 hover:border-white/50"
      )}>
      {label}
    </button>
  );
}

function MultiSelectPills({ options, value, onChange, idPrefix }: { options: string[]; value: string[]; onChange: (v: string[]) => void; idPrefix: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value.includes(opt);
        return (
          <TogglePill key={opt} label={opt} active={active}
            testId={`${idPrefix}-${opt.toLowerCase().replace(/\s+/g, "-")}`}
            onClick={() => { if (active) onChange(value.filter((v) => v !== opt)); else onChange([...value, opt]); }}
          />
        );
      })}
    </div>
  );
}

function CardSelect({ items, selected, toggle }: { items: { label: string; desc: string; icon: string }[]; selected: string[]; toggle: (label: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {items.map((it) => {
        const active = selected.includes(it.label);
        return (
          <button key={it.label} type="button" onClick={() => toggle(it.label)}
            data-testid={`need-${it.label.toLowerCase().replace(/\s+/g, "-")}`}
            className={cn("text-left rounded-md border-2 p-4 transition-all",
              active ? "border-white bg-white text-black" : "border-white/15 hover:border-white/40 bg-[#111]"
            )}>
            <div className="flex items-start gap-3">
              <div className="text-2xl">{it.icon}</div>
              <div>
                <div className="font-medium">{it.label}</div>
                <div className={cn("text-sm", active ? "text-black/60" : "text-white/50")}>{it.desc}</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SelectField({ label, sublabel, value, onChange, options, placeholder = "Select..." }: {
  label: string; sublabel?: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-white mb-1">{label}</label>
      {sublabel && <p className="text-xs text-white/50 mb-2">{sublabel}</p>}
      <select className="w-full border border-white/15 rounded-md px-4 py-3 focus:outline-none focus:border-white/50 bg-[#111] text-white"
        value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function BudgetSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-white mb-2">Budget range *</label>
      <div className="grid grid-cols-2 gap-2">
        {BUDGET_OPTIONS.map((opt) => (
          <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
            data-testid={`budget-${opt.value.toLowerCase().replace(/\s+/g, "-")}`}
            className={cn("text-left rounded-md border-2 p-3 transition-all",
              value === opt.value ? "border-white bg-white text-black" : "border-white/15 hover:border-white/40 bg-[#111]"
            )}>
            <div className={cn("text-sm font-medium", value === opt.value ? "text-black" : "text-white")}>{opt.label}</div>
            <div className={cn("text-xs mt-0.5", value === opt.value ? "text-black/60" : "text-white/50")}>{opt.hint}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function capitalise(s: string) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Quote() {
  const totalSteps = 6;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL_DATA);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isTeamStoreModalOpen, setIsTeamStoreModalOpen] = useState(false);
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("teamStore") === "yes") setForm((f) => ({ ...f, team_store_interest: "Yes" }));
    if (params.get("fundraise") === "yes") setForm((f) => ({ ...f, fundraising_interest: "Yes please" }));
    if (params.get("mockup") === "yes") setForm((f) => ({ ...f, mockup_interest: "Yes please" }));
  }, []);

  useEffect(() => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  const roleOptions = useMemo(() => {
    if (form.user_type === "club") return ["Club Manager", "Coach", "Uniform Coordinator", "Treasurer", "Other"];
    if (form.user_type === "school") return ["Director of Sport", "Sports Coordinator", "TIC", "Deputy Principal", "Other"];
    return ["Owner", "Manager", "Coordinator", "Community Leader", "Other"];
  }, [form.user_type]);

  const orgLabel = form.user_type === "school" ? "School name" : form.user_type === "club" ? "Club name" : "Organisation name";
  const orgPlaceholder = form.user_type === "school" ? "e.g. Rangitoto College" : form.user_type === "club" ? "e.g. Ponsonby RFC" : "e.g. Westside Community Group";
  const memberLabel = form.user_type === "school" ? "How many students/players are in your school programme?" : "How many players or members are in your club/team?";
  const sponsorLabel = form.user_type === "school" ? "Does your school have sponsors or are you looking to attract them?" : "Does your club have sponsors or are you looking to attract them?";

  const needsKit = form.needs.includes("Full Playing Kit") || form.needs.includes("Training Gear");
  const needsSupporter = form.needs.includes("Supporter Gear");
  const needsBoth = needsKit && needsSupporter;

  const canNext = useMemo(() => {
    if (step === 0) return !!form.user_type && !!form.organization && form.sports.length > 0;
    if (step === 1) {
      if (form.needs.length === 0) return false;
      if (form.needs.includes("Not Sure Yet")) return true;
      if (needsBoth) return !!form.kit_quantity && !!form.supporter_quantity;
      return !!form.estimated_quantity;
    }
    if (step === 2) return !!form.timing;
    if (step === 3) return !!form.design_stage && !!form.budget_range;
    if (step === 4) return !!form.approval_process;
    if (step === 5) return !!form.name && isValidEmail(form.email) && !!form.phone;
    return false;
  }, [step, form, needsBoth]);

  const next = () => { setError(null); setCompletedSteps((prev) => new Set([...prev, step])); setStep((s) => Math.min(s + 1, totalSteps - 1)); };
  const back = () => { setError(null); setStep((s) => Math.max(s - 1, 0)); };
  const goToStep = (target: number) => { if (completedSteps.has(target) || target < step) setStep(target); };

  const handleNeedToggle = (label: string) => {
    const active = form.needs.includes(label);
    let nextNeeds = active ? form.needs.filter((n) => n !== label) : [...form.needs, label];
    if (label === "Not Sure Yet" && !active) nextNeeds = ["Not Sure Yet"];
    else nextNeeds = nextNeeds.filter((n) => n !== "Not Sure Yet");
    setForm((f) => ({ ...f, needs: nextNeeds }));
  };

  const getQuantitySummary = () => {
    if (needsBoth) return `Kit: ${form.kit_quantity}, Supporter: ${form.supporter_quantity}`;
    return form.estimated_quantity;
  };

  const submit = async () => {
    if (!isValidEmail(form.email)) { setError("Please enter a valid email address."); return; }
    setIsSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/ghl/submit-project", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_type: form.user_type, role: form.role, organization: form.organization,
          member_count: form.member_count, current_supplier: form.current_supplier,
          sports: form.sports.join(", "), needs: form.needs.join(", "),
          estimated_quantity: getQuantitySummary(),
          teams_involved: form.teams_involved.join(", "),
          fundraising_interest: form.fundraising_interest, sponsorship_interest: form.sponsorship_interest,
          style_preference: form.style_preference, timing: form.timing, season_start: form.season_start,
          design_stage: form.design_stage, budget_range: form.budget_range,
          mockup_interest: form.mockup_interest, notes: form.notes,
          approval_process: form.approval_process, main_concern: form.main_concern.join(", "),
          kit_items: form.kit_items.join(", "), personalisation: form.personalisation.join(", "),
          supporter_audience: form.supporter_audience.join(", "),
          school_event_date: form.school_event_date, slt_friendly: form.slt_friendly,
          team_store_interest: form.team_store_interest,
          team_store_audience: form.team_store_audience.join(", "), team_store_goal: form.team_store_goal,
          name: form.name, email: form.email, phone: form.phone,
        }),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data?.error || "Submission failed"); }
      setSuccess(true);
    } catch (e: any) { setError(e.message || "Something went wrong"); } finally { setIsSubmitting(false); }
  };

  const resetForm = () => { setSuccess(false); setStep(0); setCompletedSteps(new Set()); setForm(INITIAL_DATA); };

  if (success) {
    return (
      <Layout>
        <section className="py-20 bg-black min-h-screen">
          <div className="container mx-auto px-4 max-w-2xl">
            <div className="bg-[#111] rounded-md border border-white/10 p-8 sm:p-12 text-center">
              <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-white" />
              </div>
              <h1 className="font-heading text-2xl text-white mb-3 tracking-wider" data-testid="text-success-heading">REQUEST RECEIVED</h1>
              <p className="text-white/60 text-lg mb-2">
                We'll be in touch within 24 hours — check your inbox at <span className="font-medium text-white">{form.email}</span>.
              </p>
              <p className="text-sm text-white/50 mb-6">In the meantime, feel free to reach us at <a href="mailto:hello@sidelinenz.com" className="text-white hover:underline">hello@sidelinenz.com</a>.</p>
              {form.mockup_interest === "Yes please" && (
                <div className="bg-white/5 border border-white/10 rounded-md p-4 mb-4 text-sm text-white/80 font-medium" data-testid="text-mockup-confirmation">
                  {"\u{1F3A8}"} Your free kit mockup will arrive in the same email — keep an eye out.
                </div>
              )}
              {form.fundraising_interest === "Yes please" && (
                <div className="bg-white/5 border border-white/10 rounded-md p-4 mb-4 text-sm text-white/80 font-medium" data-testid="text-fundraising-confirmation">
                  {"\u{1F4B0}"} We'll include fundraising campaign details in our response.
                </div>
              )}
              <Button onClick={resetForm} className="bg-white hover:bg-white/90 text-black font-heading uppercase rounded px-8" data-testid="button-start-another">
                Start Another Project
              </Button>
            </div>
          </div>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      <TeamStoreExplainerModal isOpen={isTeamStoreModalOpen} onClose={() => setIsTeamStoreModalOpen(false)}
        onInclude={() => setForm((f) => ({ ...f, team_store_interest: "Yes" }))} context="form"
      />

      <section className="py-10 sm:py-14 bg-black text-white text-center">
        <div className="container mx-auto px-4 max-w-2xl">
          <h1 className="font-heading text-3xl sm:text-4xl text-white mb-2 tracking-wider">START A PROJECT</h1>
          <p className="text-white/50">A few quick questions so we can build the right kit solution for your team.</p>
        </div>
      </section>

      <section className="py-10 sm:py-16 bg-black min-h-screen">
        <div className="container mx-auto px-4 max-w-2xl">

          <div className="mb-8">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-white/50">Step {step + 1} of {totalSteps}</span>
              <span className="text-sm text-white/50">{Math.round(((step + 1) / totalSteps) * 100)}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-3">
              <div className="h-full bg-white transition-all duration-500" style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
            </div>
            <div className="flex justify-between">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <button key={i} type="button" onClick={() => goToStep(i)}
                  data-testid={`step-indicator-${i}`}
                  className={cn("w-7 h-7 rounded-full text-xs font-medium transition-all flex items-center justify-center",
                    i === step ? "bg-white text-black" :
                    completedSteps.has(i) ? "bg-white/30 text-white cursor-pointer hover:bg-white/50" :
                    "bg-white/10 text-white/40 cursor-default")}>
                  {completedSteps.has(i) && i !== step ? <Check className="w-3 h-3" /> : i + 1}
                </button>
              ))}
            </div>
          </div>

          <div ref={formRef} className="bg-[#111] rounded-md border border-white/10 p-6 sm:p-10">

            <div className="mb-6 pb-4 border-b border-white/10">
              <h2 className="font-display text-xl text-white tracking-wider">{STEP_HEADINGS[step].title}</h2>
              <p className="text-sm text-white/50 mt-1">{STEP_HEADINGS[step].subtitle}</p>
            </div>

            {step === 0 && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-white mb-3">I am a... *</label>
                  <div className="flex flex-wrap gap-3">
                    {(["club", "school", "other"] as UserType[]).map((t) => (
                      <TogglePill key={t}
                        label={t === "club" ? "Club" : t === "school" ? "School" : "Other"}
                        active={form.user_type === t} testId={`type-${t}`}
                        onClick={() => setForm((f) => ({ ...f, user_type: t, role: "" }))}
                      />
                    ))}
                  </div>
                </div>

                {form.user_type && (
                  <SelectField
                    label={form.user_type === "school" ? "Your role at the school" : form.user_type === "club" ? "Your role at the club" : "Your role"}
                    value={form.role} onChange={(v) => setForm((f) => ({ ...f, role: v }))} options={roleOptions}
                  />
                )}

                <div>
                  <label className="block text-sm font-medium text-white mb-2">{orgLabel} *</label>
                  <Input value={form.organization} onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
                    placeholder={orgPlaceholder} data-testid="input-organization" className="border border-white/15 rounded-md py-3 bg-[#111] text-white placeholder:text-white/30"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-3">Sports involved *</label>
                  <MultiSelectPills options={SPORTS} value={form.sports}
                    onChange={(v) => setForm((f) => ({ ...f, sports: v }))} idPrefix="sport"
                  />
                </div>

                <SelectField label={memberLabel} value={form.member_count}
                  sublabel="Helps us suggest the right pricing tier."
                  onChange={(v) => setForm((f) => ({ ...f, member_count: v }))} options={MEMBER_COUNT} placeholder="Select size..."
                />

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Who do you currently order from? (optional)</label>
                  <Input value={form.current_supplier} onChange={(e) => setForm((f) => ({ ...f, current_supplier: e.target.value }))}
                    placeholder="e.g. Selector, Rebel Sport, or leave blank if new"
                    data-testid="input-current-supplier" className="border border-white/15 rounded-md py-3 bg-[#111] text-white placeholder:text-white/30"
                  />
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-white mb-3">What do you need? *</label>
                  <CardSelect items={NEED_CARDS} selected={form.needs} toggle={handleNeedToggle} />
                </div>

                {form.needs.includes("Full Playing Kit") && (
                  <div className="rounded-md border border-white/15 p-5 space-y-4 bg-white/5">
                    <div className="font-medium text-white">Playing kit details</div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">What items are included?</label>
                      <MultiSelectPills options={KIT_ITEMS} value={form.kit_items}
                        onChange={(v) => setForm((f) => ({ ...f, kit_items: v }))} idPrefix="kit"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">Personalisation needed?</label>
                      <MultiSelectPills options={PERSONALISATION} value={form.personalisation}
                        onChange={(v) => setForm((f) => ({ ...f, personalisation: v }))} idPrefix="pers"
                      />
                    </div>
                  </div>
                )}

                {form.needs.includes("Supporter Gear") && (
                  <div className="rounded-md border border-white/15 p-5 space-y-4 bg-white/5">
                    <div className="font-medium text-white">Supporter gear details</div>
                    <label className="block text-sm font-medium text-white mb-2">Who is this for?</label>
                    <MultiSelectPills options={SUPPORTER_AUDIENCE} value={form.supporter_audience}
                      onChange={(v) => setForm((f) => ({ ...f, supporter_audience: v }))} idPrefix="audience"
                    />
                  </div>
                )}

                {!form.needs.includes("Not Sure Yet") && form.needs.length > 0 && (
                  needsBoth ? (
                    <div className="space-y-4 rounded-md border border-white/15 p-5 bg-white/5">
                      <div className="font-medium text-white text-sm">Estimated quantities</div>
                      <SelectField label="Playing kit quantity" value={form.kit_quantity}
                        onChange={(v) => setForm((f) => ({ ...f, kit_quantity: v }))} options={QUANTITIES}
                      />
                      <SelectField label="Supporter gear quantity" value={form.supporter_quantity}
                        onChange={(v) => setForm((f) => ({ ...f, supporter_quantity: v }))} options={QUANTITIES}
                      />
                    </div>
                  ) : (
                    <SelectField label="Estimated quantity *" value={form.estimated_quantity}
                      onChange={(v) => setForm((f) => ({ ...f, estimated_quantity: v }))} options={QUANTITIES}
                    />
                  )
                )}

                <div>
                  <label className="block text-sm font-medium text-white mb-3">Teams involved (optional)</label>
                  <MultiSelectPills options={TEAMS} value={form.teams_involved}
                    onChange={(v) => setForm((f) => ({ ...f, teams_involved: v }))} idPrefix="team"
                  />
                </div>

                {form.user_type === "school" && (
                  <div className="rounded-md border border-white/15 p-5 space-y-4 bg-white/5">
                    <div className="font-medium text-white">School details</div>
                    <SelectField label="Do you need presentation-ready mockups for your Senior Leadership Team (SLT)?"
                      value={form.slt_friendly} onChange={(v) => setForm((f) => ({ ...f, slt_friendly: v }))} options={["Yes", "No"]}
                    />
                    <div>
                      <label className="block text-sm font-medium text-white mb-1">Key event date (optional)</label>
                      <p className="text-xs text-white/50 mb-2">e.g. "Term 2 Week 3" or "Athletics Day March 15"</p>
                      <Input value={form.school_event_date} onChange={(e) => setForm((f) => ({ ...f, school_event_date: e.target.value }))}
                        placeholder="e.g. Term 2, March 15, Athletics Day"
                        data-testid="input-event-date" className="border border-white/15 rounded-md py-3 bg-[#111] text-white placeholder:text-white/30"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <SelectField label="When do you need it? *" value={form.timing}
                  onChange={(v) => setForm((f) => ({ ...f, timing: v }))} options={TIMING}
                />

                <SelectField label="When does your season start? (optional)" value={form.season_start}
                  onChange={(v) => setForm((f) => ({ ...f, season_start: v }))} options={SEASON_MONTHS} placeholder="Select month..."
                />

                <SelectField label="Style preference (optional)" value={form.style_preference}
                  onChange={(v) => setForm((f) => ({ ...f, style_preference: v }))} options={STYLE_PREF}
                />

                <div className="rounded-md border border-white/15 bg-white/5 p-5">
                  <label className="block text-sm font-bold text-white mb-1">Interested in a supporter fundraiser to help fund your kit? {"\u{1F4B0}"}</label>
                  <p className="text-xs text-white/50 mb-3">Supporters buy merch. Your kit gets funded. No upfront cost to your organisation.</p>
                  <div className="flex flex-wrap gap-2">
                    {FUNDRAISING_INTEREST.map((opt) => (
                      <TogglePill key={opt} label={opt} active={form.fundraising_interest === opt}
                        testId={`fundraise-${opt.toLowerCase().replace(/\s+/g, "-")}`}
                        onClick={() => setForm((f) => ({ ...f, fundraising_interest: opt }))}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-1">{sponsorLabel} (optional)</label>
                  <p className="text-xs text-white/50 mb-3">We can help structure sponsor placement on your kit.</p>
                  <div className="flex flex-wrap gap-2">
                    {SPONSORSHIP_INTEREST.map((opt) => (
                      <TogglePill key={opt} label={opt} active={form.sponsorship_interest === opt}
                        testId={`sponsor-${opt.toLowerCase().replace(/\s+/g, "-")}`}
                        onClick={() => setForm((f) => ({ ...f, sponsorship_interest: opt }))}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="rounded-md border border-white/15 bg-white/5 p-5">
                  <label className="block text-sm font-bold text-white mb-1">Want a free custom kit mockup? {"\u{1F3A8}"}</label>
                  <p className="text-xs text-white/50 mb-3">No commitment. We'll send it within 24 hours.</p>
                  <div className="flex flex-wrap gap-2">
                    {MOCKUP_INTEREST.map((opt) => (
                      <TogglePill key={opt} label={opt} active={form.mockup_interest === opt}
                        testId={`mockup-${opt.toLowerCase().replace(/\s+/g, "-")}`}
                        onClick={() => setForm((f) => ({ ...f, mockup_interest: opt }))} />
                    ))}
                  </div>
                </div>

                <SelectField label="Design stage *" value={form.design_stage}
                  onChange={(v) => setForm((f) => ({ ...f, design_stage: v }))} options={DESIGN_STAGE}
                />

                <BudgetSelect value={form.budget_range} onChange={(v) => setForm((f) => ({ ...f, budget_range: v }))} />

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Anything else? (optional)</label>
                  <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Special requirements, deadlines, sponsor details, etc."
                    className="border border-white/15 rounded-md bg-[#111] text-white placeholder:text-white/30" rows={3} data-testid="input-notes"
                  />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <SelectField label="Who approves decisions like this? *" value={form.approval_process}
                  onChange={(v) => setForm((f) => ({ ...f, approval_process: v }))} options={APPROVAL}
                />

                <div>
                  <label className="block text-sm font-medium text-white mb-3">Any concerns we should know about? (optional)</label>
                  <MultiSelectPills options={CONCERNS} value={form.main_concern}
                    onChange={(v) => setForm((f) => ({ ...f, main_concern: v }))} idPrefix="concern"
                  />
                </div>

                <div className="border-t border-white/10 pt-6">
                  <div className="flex items-center gap-2 mb-1">
                    <label className="block text-sm font-medium text-white">Do you need an online team store?</label>
                    <button type="button" onClick={() => setIsTeamStoreModalOpen(true)}
                      className="text-white/60 hover:text-white/80 transition-colors" data-testid="button-team-store-help">
                      <HelpCircle size={16} />
                    </button>
                  </div>
                  <p className="text-xs text-white/50 mb-3">A place where your members can order gear online.</p>
                  <div className="flex flex-wrap gap-2">
                    {TEAM_STORE_INTEREST.map((opt) => (
                      <TogglePill key={opt} label={opt} active={form.team_store_interest === opt}
                        testId={`team-store-${opt.toLowerCase().replace(/\s+/g, "-")}`}
                        onClick={() => setForm((f) => ({ ...f, team_store_interest: opt }))}
                      />
                    ))}
                  </div>
                </div>

                {form.team_store_interest === "Yes" && (
                  <div className="space-y-4 bg-white/5 rounded-md p-4 border border-white/15">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">Who will use the store? (optional)</label>
                      <MultiSelectPills options={TEAM_STORE_AUDIENCE} value={form.team_store_audience}
                        onChange={(v) => setForm((f) => ({ ...f, team_store_audience: v }))} idPrefix="ts-audience"
                      />
                    </div>
                    <SelectField label="Main goal for the store (optional)" value={form.team_store_goal}
                      onChange={(v) => setForm((f) => ({ ...f, team_store_goal: v }))} options={TEAM_STORE_GOAL}
                    />
                  </div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Your name *</label>
                  <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="John Smith" data-testid="input-name" className="border border-white/15 rounded-md py-3 bg-[#111] text-white placeholder:text-white/30"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Email *</label>
                  <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="john@example.com" data-testid="input-email"
                    className={cn("border border-white/15 rounded-md py-3 bg-[#111] text-white placeholder:text-white/30", form.email && !isValidEmail(form.email) && "border-red-400")}
                  />
                  {form.email && !isValidEmail(form.email) && (
                    <p className="text-xs text-red-500 mt-1">Please enter a valid email address.</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-1">Phone *</label>
                  <p className="text-xs text-white/50 mb-2">NZ mobile (e.g. 021 123 4567) or landline</p>
                  <Input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="021 123 4567" data-testid="input-phone" className="border border-white/15 rounded-md py-3 bg-[#111] text-white placeholder:text-white/30"
                  />
                </div>

                <div className="bg-white/5 rounded-md border border-white/10 overflow-hidden">
                  <button type="button" onClick={() => setReviewExpanded((v) => !v)}
                    data-testid="button-toggle-review"
                    className="w-full flex items-center justify-between p-4 text-left">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-sm">Review Your Details</h3>
                      <button type="button" onClick={(e) => { e.stopPropagation(); goToStep(0); }}
                        className="text-xs text-white/60 hover:underline" data-testid="button-edit-from-start">Edit</button>
                    </div>
                    {reviewExpanded ? <ChevronUp className="w-4 h-4 text-white/50" /> : <ChevronDown className="w-4 h-4 text-white/50" />}
                  </button>

                  {reviewExpanded && (
                    <div className="px-4 pb-4 text-sm text-white/50 space-y-1 border-t border-white/10 pt-3">
                      <p data-testid="review-type"><span className="font-medium text-white">Type:</span> {capitalise(form.user_type)}</p>
                      {form.role && <p data-testid="review-role"><span className="font-medium text-white">Role:</span> {form.role}</p>}
                      <p data-testid="review-org"><span className="font-medium text-white">Organisation:</span> {form.organization}</p>
                      {form.member_count && <p data-testid="review-members"><span className="font-medium text-white">Members:</span> {form.member_count}</p>}
                      {form.current_supplier && <p data-testid="review-supplier"><span className="font-medium text-white">Current supplier:</span> {form.current_supplier}</p>}
                      <p data-testid="review-sports"><span className="font-medium text-white">Sports:</span> {form.sports.join(", ")}</p>
                      <p data-testid="review-needs"><span className="font-medium text-white">Needs:</span> {form.needs.join(", ")}</p>
                      {form.kit_items.length > 0 && <p data-testid="review-kit-items"><span className="font-medium text-white">Kit items:</span> {form.kit_items.join(", ")}</p>}
                      {form.personalisation.length > 0 && <p data-testid="review-personalisation"><span className="font-medium text-white">Personalisation:</span> {form.personalisation.join(", ")}</p>}
                      {form.teams_involved.length > 0 && <p data-testid="review-teams"><span className="font-medium text-white">Teams:</span> {form.teams_involved.join(", ")}</p>}
                      {form.supporter_audience.length > 0 && <p data-testid="review-audience"><span className="font-medium text-white">Audience:</span> {form.supporter_audience.join(", ")}</p>}
                      <p data-testid="review-quantity"><span className="font-medium text-white">Quantity:</span> {getQuantitySummary()}</p>
                      {form.style_preference && <p data-testid="review-style"><span className="font-medium text-white">Style:</span> {form.style_preference}</p>}
                      {form.fundraising_interest && <p data-testid="review-fundraising"><span className="font-medium text-white">Fundraising:</span> {form.fundraising_interest}</p>}
                      {form.sponsorship_interest && <p data-testid="review-sponsorship"><span className="font-medium text-white">Sponsorship:</span> {form.sponsorship_interest}</p>}
                      <p data-testid="review-timing"><span className="font-medium text-white">Timing:</span> {form.timing}</p>
                      {form.season_start && <p data-testid="review-season"><span className="font-medium text-white">Season starts:</span> {form.season_start}</p>}
                      <p data-testid="review-design"><span className="font-medium text-white">Design:</span> {form.design_stage}</p>
                      <p data-testid="review-budget"><span className="font-medium text-white">Budget:</span> {form.budget_range}</p>
                      {form.mockup_interest && <p data-testid="review-mockup"><span className="font-medium text-white">Free mockup:</span> {form.mockup_interest}</p>}
                      {form.notes && <p data-testid="review-notes"><span className="font-medium text-white">Notes:</span> {form.notes}</p>}
                      <p data-testid="review-approval"><span className="font-medium text-white">Approval:</span> {form.approval_process}</p>
                      {form.main_concern.length > 0 && <p data-testid="review-concerns"><span className="font-medium text-white">Concerns:</span> {form.main_concern.join(", ")}</p>}
                      {form.school_event_date && <p data-testid="review-event-date"><span className="font-medium text-white">Event date:</span> {form.school_event_date}</p>}
                      {form.slt_friendly && <p data-testid="review-slt"><span className="font-medium text-white">SLT-friendly quote:</span> {form.slt_friendly}</p>}
                      {form.team_store_interest && <p data-testid="review-team-store"><span className="font-medium text-white">Team Store:</span> {form.team_store_interest}</p>}
                      {form.team_store_goal && <p data-testid="review-store-goal"><span className="font-medium text-white">Store goal:</span> {form.team_store_goal}</p>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400" data-testid="text-error">
                {error}
              </div>
            )}

            <div className="mt-8 flex items-center justify-between">
              <Button type="button" variant="outline" onClick={back} disabled={isSubmitting || step === 0}
                className={cn("rounded border-white/20 text-white/70 hover:bg-white/10 hover:text-white", step === 0 && "opacity-40")} data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Button>

              {step < totalSteps - 1 ? (
                <Button type="button" onClick={next} disabled={!canNext}
                  className={cn("rounded", canNext ? "bg-white hover:bg-white/90 text-black" : "bg-white/10 text-white/30")}
                  data-testid="button-next">
                  Next <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button type="button" onClick={submit} disabled={isSubmitting || !canNext}
                  className={cn("rounded", canNext ? "bg-white hover:bg-white/90 text-black" : "bg-white/10 text-white/30")}
                  data-testid="button-submit">
                  {isSubmitting ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>) : "Submit"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
