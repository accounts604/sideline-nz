import Layout from "@/components/layout";
import { Link } from "wouter";
import { SPORTS } from "@/data/sports";

export default function Sports() {
  return (
    <Layout>
      <section className="pt-28 pb-10 sm:pb-14 bg-primary text-white text-center">
        <div className="container mx-auto px-4">
          <h1 className="font-heading text-3xl sm:text-4xl text-white mb-4 uppercase tracking-wider">Find Your Sport</h1>
          <p className="text-lg text-white/60 max-w-2xl mx-auto">
            We create custom uniforms for teams across all major sports. Select your sport to learn more.
          </p>
        </div>
      </section>

      <section className="py-12 sm:py-16 bg-muted/20 min-h-screen">
        <div className="container mx-auto px-4">

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {SPORTS.map(sport => (
              <Link key={sport.id} href={sport.id === "other" ? "/quote" : `/sports/${sport.id}`}>
                <div
                  className="group bg-white rounded-xl border border-border p-6 hover:shadow-lg hover:border-accent/50 transition-all cursor-pointer h-full"
                  data-testid={`card-sport-${sport.id}`}
                >
                  <div className="w-14 h-14 bg-accent/10 rounded-full flex items-center justify-center mb-4 text-accent group-hover:bg-accent group-hover:text-white transition-colors">
                    <span className="font-semibold text-lg">{sport.name.charAt(0)}</span>
                  </div>
                  <h3 className="text-xl font-bold text-primary mb-2">{sport.name}</h3>
                  <p className="text-muted-foreground text-sm">{sport.description}</p>
                </div>
              </Link>
            ))}
          </div>

          <div className="text-center mt-12">
            <p className="text-muted-foreground mb-4">Not sure where to start?</p>
            <Link href="/quote">
              <span className="text-accent font-medium hover:underline cursor-pointer">Start a project and tell us what you need →</span>
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
