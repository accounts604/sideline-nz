import { useState } from "react";
import Layout from "@/components/layout";
import { Mail, Phone, MapPin, Send, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const ENQUIRY_TYPES = [
  "General enquiry",
  "Quote follow-up",
  "Order status",
  "Sizing help",
  "Design question",
  "Other",
];

export default function Contact() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    enquiry_type: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const canSubmit = form.name && form.email && form.email.includes("@") && form.message;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/ghl/contact", {
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

  const resetForm = () => {
    setSuccess(false);
    setForm({ name: "", email: "", phone: "", enquiry_type: "", message: "" });
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
              <h1 className="font-heading text-2xl text-white mb-4 tracking-wider uppercase">Message Sent</h1>
              <p className="text-white/60 text-lg mb-8">
                Thanks for reaching out! We'll get back to you within 24 hours.
              </p>
              <Button 
                onClick={resetForm} 
                className="bg-white hover:bg-white/90 text-black font-heading uppercase rounded-[4px] px-8"
                data-testid="button-send-another"
              >
                Send Another Message
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
          <h1 className="font-heading text-4xl sm:text-6xl text-white mb-4 uppercase tracking-wider">
            Get in Touch
          </h1>
          <p className="text-white/60 text-lg sm:text-xl mb-12 max-w-2xl">
            Whether it's a new kit order, a restock, or a fresh design concept — we're ready to talk. Drop us a line and we'll get back to you fast.
          </p>

          <div className="grid md:grid-cols-2 gap-12">
            <div className="bg-[#111] rounded-[6px] border border-white/[0.08] p-6 sm:p-8">
              <h2 className="font-heading text-xl text-white mb-6 tracking-wider uppercase">Send us a message</h2>
              
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">Your name *</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="John Smith"
                    className="bg-black border border-white/[0.12] rounded-[6px] py-3 text-white placeholder:text-white/30 focus:border-white/30 text-[16px]"
                    data-testid="input-contact-name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">Email *</label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="john@example.com"
                    className="bg-black border border-white/[0.12] rounded-[6px] py-3 text-white placeholder:text-white/30 focus:border-white/30 text-[16px]"
                    data-testid="input-contact-email"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">Phone (optional)</label>
                  <Input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="021 123 4567"
                    className="bg-black border border-white/[0.12] rounded-[6px] py-3 text-white placeholder:text-white/30 focus:border-white/30 text-[16px]"
                    data-testid="input-contact-phone"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">What's this about?</label>
                  <div className="flex flex-wrap gap-2">
                    {ENQUIRY_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, enquiry_type: f.enquiry_type === type ? "" : type }))}
                        className={`px-4 py-2 rounded-[4px] text-sm font-medium transition-all border ${
                          form.enquiry_type === type
                            ? "bg-white text-black border-white"
                            : "bg-transparent text-white/70 border-white/[0.12] hover:border-white/30"
                        }`}
                        data-testid={`enquiry-type-${type.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">Message *</label>
                  <Textarea
                    value={form.message}
                    onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                    placeholder="Tell us how we can help..."
                    className="bg-black border border-white/[0.12] rounded-[6px] min-h-[120px] text-white placeholder:text-white/30 focus:border-white/30 text-[16px]"
                    rows={4}
                    data-testid="input-contact-message"
                  />
                </div>

                {error && (
                  <div className="rounded-[6px] border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={!canSubmit || isSubmitting}
                  className={`w-full rounded-[4px] py-3 font-heading uppercase tracking-wide ${
                    canSubmit ? "bg-white hover:bg-white/90 text-black" : "bg-white/10 text-white/30"
                  }`}
                  data-testid="button-contact-submit"
                >
                  {isSubmitting ? (
                    "Sending..."
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" /> Send Message
                    </>
                  )}
                </Button>
              </form>
            </div>

            <div className="space-y-10">
              <div className="flex items-start gap-4">
                <div className="bg-white/10 p-3 rounded-full text-white">
                  <Mail size={24} />
                </div>
                <div>
                  <h3 className="font-heading text-lg text-white mb-1 uppercase tracking-wider">Email Us</h3>
                  <p className="text-white/70">info@sidelinenz.com</p>
                  <p className="text-sm text-white/40">We reply within 24 hours.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="bg-white/10 p-3 rounded-full text-white">
                  <Phone size={24} />
                </div>
                <div>
                  <h3 className="font-heading text-lg text-white mb-1 uppercase tracking-wider">Call Us</h3>
                  <p className="text-white/70">0800 SIDELINE</p>
                  <p className="text-sm text-white/40">Mon–Fri, 9am – 5pm NZT.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="bg-white/10 p-3 rounded-full text-white">
                  <MapPin size={24} />
                </div>
                <div>
                  <h3 className="font-heading text-lg text-white mb-1 uppercase tracking-wider">Location</h3>
                  <p className="text-white/70">Auckland, New Zealand</p>
                  <p className="text-sm text-white/40">Serving clubs and schools worldwide.</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>
    </Layout>
  );
}
