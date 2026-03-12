import { Link } from "wouter";
import Layout from "@/components/layout";
import { CASE_STUDIES } from "@/data/case-studies";
import { ArrowRight } from "lucide-react";

function CaseStudyCard({ study, index }: { study: typeof CASE_STUDIES[0]; index: number }) {
  return (
    <Link href={`/our-work/${study.slug}`}>
      <div
        className="group relative overflow-hidden cursor-pointer"
        style={{ borderRadius: 6 }}
        data-testid={`card-case-study-${study.slug}`}
      >
        <div className="relative w-full overflow-hidden h-[240px] sm:h-[360px]">
          <img
            src={study.coverImage}
            alt={study.name}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />

          <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
            <span
              className="inline-block px-2 py-0.5 text-xs font-medium text-white rounded mb-2"
              style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
            >
              {study.sport}
            </span>
            <h3 className="font-heading text-lg sm:text-xl font-bold text-white uppercase tracking-wide mb-1">
              {study.name}
            </h3>
            <p className="text-sm text-white/70 line-clamp-2 mb-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {study.tagline}
            </p>
            <div className="flex items-center text-white text-sm font-medium opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
              View Project <ArrowRight size={14} className="ml-1" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function PlaceholderCard() {
  return (
    <Link href="/quote">
      <div
        className="group relative overflow-hidden cursor-pointer"
        style={{ borderRadius: 6 }}
        data-testid="card-case-study-placeholder"
      >
        <div
          className="relative w-full h-[240px] sm:h-[360px] flex flex-col items-center justify-center"
          style={{ background: "#111", border: "1px dashed rgba(255,255,255,0.12)" }}
        >
          <p style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", marginBottom: "16px" }}>Your Club Here</p>
          <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(28px, 4vw, 40px)", color: "rgba(255,255,255,0.6)", lineHeight: 1, marginBottom: "16px", textAlign: "center", padding: "0 20px" }}>
            Could Be You Next
          </p>
          <div
            className="flex items-center text-sm font-medium transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
            style={{ color: "#fff", opacity: 0.5 }}
          >
            Start a Project <ArrowRight size={14} className="ml-1" />
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function OurWorkPage() {
  const needsPlaceholders = CASE_STUDIES.length < 6;
  const placeholderCount = needsPlaceholders ? Math.max(0, 6 - CASE_STUDIES.length) : 0;

  return (
    <Layout>
      <section className="relative py-20 sm:py-28" style={{ background: "#000" }}>
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: "url('/attached_assets/generated_images/rugby_team_huddle_on_field.png')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-black" />
        <div className="relative container mx-auto px-5 sm:px-[52px]">
          <h1
            className="font-heading text-4xl sm:text-6xl font-bold text-white uppercase tracking-wider"
            data-testid="text-our-work-title"
          >
            Our Work
          </h1>
          <p className="text-lg text-white/60 mt-4 max-w-xl">
            Real results for real teams. From grassroots clubs to national reps — see what happens when passion meets premium gear.
          </p>
        </div>
      </section>

      <section className="py-11 sm:py-20" style={{ background: "#000" }}>
        <div className="container mx-auto px-5 sm:px-[52px]">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
            {CASE_STUDIES.map((study, index) => (
              <CaseStudyCard key={study.slug} study={study} index={index} />
            ))}
            {Array.from({ length: placeholderCount }).map((_, i) => (
              <PlaceholderCard key={`placeholder-${i}`} />
            ))}
          </div>

          <div className="mt-16 sm:mt-20 text-center">
            <p className="text-white/50 mb-4 text-sm sm:text-base">
              Your team deserves gear that performs as hard as they do.
            </p>
            <Link href="/quote">
              <span
                className="inline-flex items-center justify-center px-8 py-3 text-sm font-semibold uppercase tracking-wider cursor-pointer transition-colors"
                style={{
                  background: "#fff",
                  color: "#000",
                  borderRadius: 4,
                }}
                data-testid="link-start-project"
              >
                Start Your Project <ArrowRight size={16} className="ml-2" />
              </span>
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
