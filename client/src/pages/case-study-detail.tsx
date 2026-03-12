import { useParams, Link, Redirect } from "wouter";
import Layout from "@/components/layout";
import { getCaseStudyBySlug } from "@/data/case-studies";
import { MapPin, ArrowLeft, CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CaseStudyDetailPage() {
  const params = useParams<{ slug: string }>();
  const study = getCaseStudyBySlug(params.slug || "");

  if (!study) {
    return <Redirect to="/our-work" />;
  }

  return (
    <Layout>
      <section className="relative bg-black">
        <div className="aspect-[21/9] sm:aspect-[3/1] w-full overflow-hidden">
          <img 
            src={study.coverImage} 
            alt={study.name} 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
        </div>
        
        <div className="absolute inset-0 flex items-end">
          <div className="container mx-auto px-4 pb-8 sm:pb-12 text-white">
            <Link href="/our-work">
              <span className="inline-flex items-center text-white/70 hover:text-white mb-4 cursor-pointer text-sm">
                <ArrowLeft size={16} className="mr-1" /> Back to Our Work
              </span>
            </Link>
            
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={`px-3 py-1 ${study.accentBg} text-white rounded-md text-sm font-medium`}>
                {study.sport}
              </span>
              <span className="flex items-center gap-1 text-white/70 text-sm">
                <MapPin size={14} />
                {study.location}
              </span>
            </div>
            
            <h1 className="font-heading text-2xl sm:text-4xl mb-2 tracking-wider">{study.name}</h1>
            <p className="text-white/80 text-lg max-w-2xl">{study.tagline}</p>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 bg-black">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="prose prose-lg max-w-none">
            <p className="text-xl text-white/70 leading-relaxed">
              {study.description}
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {study.services.map((service) => (
              <span 
                key={service}
                className="px-4 py-2 bg-[#111] border border-white/[0.08] rounded-md text-sm font-medium text-white/90"
              >
                {service}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 bg-black">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-[#111] rounded-md p-6 border border-white/[0.08]">
              <h3 className="font-heading text-lg font-bold text-white mb-3 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center text-sm">1</span>
                The Challenge
              </h3>
              <p className="text-white/60 text-sm leading-relaxed">
                {study.challenge}
              </p>
            </div>
            
            <div className="bg-[#111] rounded-md p-6 border border-white/[0.08]">
              <h3 className="font-heading text-lg font-bold text-white mb-3 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center text-sm">2</span>
                Our Solution
              </h3>
              <p className="text-white/60 text-sm leading-relaxed">
                {study.solution}
              </p>
            </div>
            
            <div className="bg-[#111] rounded-md p-6 border border-white/[0.08]">
              <h3 className="font-heading text-lg font-bold text-white mb-3 flex items-center gap-2">
                <CheckCircle className="w-8 h-8 text-white" />
                The Outcome
              </h3>
              <p className="text-white/60 text-sm leading-relaxed">
                {study.outcome}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 bg-[#111] border-t border-white/[0.08]">
        <div className="container mx-auto px-4 text-center">
          <h2 className="font-heading text-xl sm:text-2xl text-white mb-4 tracking-wider">
            Ready to create something for your team?
          </h2>
          <p className="text-white/70 mb-6 max-w-xl mx-auto">
            Whether you need custom jerseys, team apparel, or a complete kit refresh, we're here to help.
          </p>
          <Link href="/quote">
            <Button className="bg-white hover:bg-white/90 text-black rounded-[4px] px-8 font-heading uppercase">
              Start Your Project <ArrowRight size={16} className="ml-2" />
            </Button>
          </Link>
        </div>
      </section>
    </Layout>
  );
}
