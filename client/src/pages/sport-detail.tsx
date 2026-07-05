import Layout from "@/components/layout";
import Seo from "@/components/seo";
import { Link, useParams } from "wouter";
import { getSport, SPORTS } from "@/data/sports";
import { Check, ArrowRight } from "lucide-react";

export default function SportDetail() {
  const params = useParams<{ id: string }>();
  const sport = getSport(params.id ?? "");

  if (!sport) {
    return (
      <Layout>
        <section className="py-24 text-center">
          <div className="container mx-auto px-4">
            <h1 className="font-heading text-3xl text-white mb-4 uppercase tracking-wider">Sport not found</h1>
            <Link href="/sports">
              <span className="text-accent font-medium hover:underline cursor-pointer">Browse all sports →</span>
            </Link>
          </div>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      <Seo
        title={`Custom ${sport.name} Uniforms & Teamwear`}
        description={`Custom sublimated ${sport.name.toLowerCase()} jerseys, kit and supporter apparel for New Zealand teams. Free design mockups from Sideline NZ.`}
        path={`/sports/${sport.id}`}
      />
      <section className="pt-28 pb-12 sm:pb-16 bg-primary text-white text-center">
        <div className="container mx-auto px-4">
          <p className="text-xs tracking-widest uppercase text-white/40 mb-3">Custom Teamwear</p>
          <h1 className="font-heading text-4xl sm:text-5xl text-white mb-4 uppercase tracking-wider">{sport.name}</h1>
          <p className="text-lg text-white/60 max-w-2xl mx-auto">{sport.heroLine}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <Link href="/free-mockup">
              <span className="text-xs tracking-wider uppercase font-medium bg-white text-black px-6 py-3 rounded-[4px] hover:bg-white/90 transition-colors cursor-pointer inline-block">
                Get a free mockup
              </span>
            </Link>
            <Link href={`/quote?sport=${sport.id}`}>
              <span className="text-xs tracking-wider uppercase font-medium border border-white/30 text-white px-6 py-3 rounded-[4px] hover:bg-white/10 transition-colors cursor-pointer inline-block">
                Get a quote
              </span>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 bg-muted/20">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="bg-white rounded-xl border border-border p-8 sm:p-10">
            <h2 className="text-2xl font-bold text-primary mb-6">What we make for {sport.name.toLowerCase()}</h2>
            <ul className="grid sm:grid-cols-2 gap-3 mb-8">
              {sport.gear.map((item) => (
                <li key={item} className="flex items-center gap-3 text-muted-foreground">
                  <span className="w-6 h-6 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0">
                    <Check size={14} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-sm mb-8">
              Every order comes with a free design mockup, and every club gets its own online team
              store on us: supporters order and pay online, we handle production and delivery, your
              club keeps the fundraising margin.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href={`/quote?sport=${sport.id}`}>
                <span className="inline-flex items-center gap-2 text-accent font-medium hover:underline cursor-pointer">
                  Start a {sport.name.toLowerCase()} project <ArrowRight size={16} />
                </span>
              </Link>
              <Link href="/our-work">
                <span className="inline-flex items-center gap-2 text-muted-foreground font-medium hover:text-primary hover:underline cursor-pointer">
                  See our work
                </span>
              </Link>
            </div>
          </div>

          <div className="text-center mt-10">
            <p className="text-muted-foreground text-sm mb-3">Play something else?</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SPORTS.filter((s) => s.id !== sport.id).map((s) => (
                <Link key={s.id} href={s.id === "other" ? "/quote" : `/sports/${s.id}`}>
                  <span className="text-xs tracking-wider uppercase px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:border-accent hover:text-accent transition-colors cursor-pointer inline-block">
                    {s.name}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
