import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Check, FileCheck, Users } from "lucide-react";
import heroImage from "@assets/20250719_120007_1767526990051.jpg";

export default function Schools() {
  return (
    <Layout>
      {/* Hero */}
      <section className="relative h-[60vh] min-h-[400px] flex items-end overflow-hidden bg-black">
        <div className="absolute inset-0 z-0">
          <img
            src={heroImage}
            alt="School sports team"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #000 0%, rgba(0,0,0,0.5) 40%, transparent 70%)' }} />
        </div>
        <div className="relative z-10 w-full px-[52px] pb-[48px] md:px-[52px] max-md:px-[20px] max-md:pb-[32px]">
          <h1
            className="font-heading text-white uppercase tracking-wider leading-none"
            style={{ fontSize: 'clamp(52px, 7vw, 96px)' }}
            data-testid="text-schools-hero-title"
          >
            For Schools
          </h1>
          <p className="text-lg md:text-xl text-gray-300 mt-4 max-w-2xl font-light" data-testid="text-schools-hero-sub">
            Gear that works within your systems, not against them.
          </p>
        </div>
      </section>

      {/* Stat Banner */}
      <section className="py-12 md:py-16 bg-black border-b border-white/[0.08]">
        <div className="container mx-auto px-5 md:px-[52px] text-center">
          <p
            className="font-heading text-white leading-none"
            style={{ fontSize: 'clamp(64px, 10vw, 100px)' }}
            data-testid="text-schools-stat-number"
          >
            100%
          </p>
          <p className="text-gray-400 text-lg uppercase tracking-widest mt-2 font-heading" data-testid="text-schools-stat-label">
            School Safe Process
          </p>
        </div>
      </section>

      {/* Section 1 — Designed around how schools work */}
      <section className="py-[80px] md:py-[80px] max-md:py-[44px] bg-black">
        <div className="container mx-auto px-5 md:px-[52px]">
          <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
            <div className="bg-[#111] aspect-[4/3] max-md:h-[220px] max-md:aspect-auto rounded-[6px] overflow-hidden border border-white/[0.08] flex items-center justify-center">
              <div className="text-center text-gray-500">
                <p className="text-xl font-heading uppercase tracking-wide mb-1">School Uniform Example</p>
                <p className="text-sm text-gray-600">(Product images would go here)</p>
              </div>
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl text-white mb-6" data-testid="text-schools-section1-heading">
                Designed around how schools work.
              </h2>
              <p className="text-gray-400 text-base md:text-lg leading-relaxed" data-testid="text-schools-section1-body">
                We understand the approval process, the budget cycles, and the reporting requirements. Our quoting process is clear and documented so you can present it to your SLT with confidence.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2 — Organised delivery */}
      <section className="py-[80px] md:py-[80px] max-md:py-[44px] bg-black">
        <div className="container mx-auto px-5 md:px-[52px]">
          <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
            <div className="order-2 md:order-1">
              <h2 className="text-2xl sm:text-3xl text-white mb-6" data-testid="text-schools-section2-heading">
                Organised delivery. Zero admin.
              </h2>
              <p className="text-gray-400 text-base md:text-lg leading-relaxed" data-testid="text-schools-section2-body">
                Individually bagged and labelled by student name. Delivered on time, every time. No chasing suppliers, no mystery boxes, no sizing disasters.
              </p>
            </div>
            <div className="order-1 md:order-2 bg-[#111] aspect-[4/3] max-md:h-[220px] max-md:aspect-auto rounded-[6px] overflow-hidden border border-white/[0.08] flex items-center justify-center">
              <div className="text-center text-gray-500">
                <p className="text-xl font-heading uppercase tracking-wide mb-1">Organised Delivery</p>
                <p className="text-sm text-gray-600">(Image would go here)</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3 — Sponsor-ready */}
      <section className="py-[80px] md:py-[80px] max-md:py-[44px] bg-black">
        <div className="container mx-auto px-5 md:px-[52px]">
          <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
            <div className="bg-[#111] aspect-[4/3] max-md:h-[220px] max-md:aspect-auto rounded-[6px] overflow-hidden border border-white/[0.08] flex items-center justify-center">
              <div className="text-center text-gray-500">
                <p className="text-xl font-heading uppercase tracking-wide mb-1">Sponsor Integration</p>
                <p className="text-sm text-gray-600">(Image would go here)</p>
              </div>
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl text-white mb-6" data-testid="text-schools-section3-heading">
                Sponsor-ready from day one.
              </h2>
              <p className="text-gray-400 text-base md:text-lg leading-relaxed" data-testid="text-schools-section3-body">
                We design sponsor placement into your school kit from the start — helping sports departments offset costs and build commercial relationships with local businesses.
              </p>
              <Link href="/sponsor-placement">
                <span className="inline-block mt-4 text-sm text-white/50 hover:text-white transition-colors cursor-pointer">
                  See our sponsor zone guide →
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-[80px] max-md:py-[44px] bg-black overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={heroImage}
            alt="School sports"
            className="w-full h-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-black/70" />
        </div>
        <div className="relative z-10 container mx-auto px-5 md:px-[52px] text-center">
          <h2
            className="font-heading text-white uppercase tracking-wider mb-4"
            style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}
            data-testid="text-schools-cta-heading"
          >
            Let's talk about your school.
          </h2>
          <p className="text-gray-400 text-base md:text-lg mb-8 max-w-xl mx-auto" data-testid="text-schools-cta-body">
            Get in touch and we'll put together a proposal that works for your budget and your process.
          </p>
          <Link href="/quote">
            <Button
              size="lg"
              className="bg-white text-black hover:bg-white/90 font-heading uppercase tracking-wide rounded-[4px] px-8"
              data-testid="button-schools-cta"
            >
              Start School Quote
            </Button>
          </Link>
        </div>
      </section>
    </Layout>
  );
}
