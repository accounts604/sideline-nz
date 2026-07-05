import { useRoute, Link } from "wouter";
import Layout from "@/components/layout";
import { ArrowRight, Loader2, ArrowLeft } from "lucide-react";
import { useCollections } from "@/hooks/use-shopify";
import type { ShopifyCollection } from "@/lib/shopify";
import { getCompetition } from "@/data/competitions";

function TeamTile({ store }: { store: ShopifyCollection }) {
  // Strip the "2026 <Team> Supporters ..." boilerplate down to the club name for the tile.
  const shortName = store.title
    .replace(/^\d{4}\s+/, "")
    .replace(/\s+(Supporters?\s+(Range|Merch(andise)?\s+Range)|Team Kit).*$/i, "")
    .trim();
  return (
    <a
      href={"https://teamstore.sidelinenz.com/collections/" + store.handle}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={"tile-competition-team-" + store.handle}
    >
      <div
        className="group relative cursor-pointer overflow-hidden border border-[#e5e5e5] hover:border-[#111] transition-colors"
        style={{ borderRadius: "8px" }}
      >
        <div className="relative h-[240px] md:h-[360px] bg-[#f5f5f5] overflow-hidden">
          {store.image ? (
            <img
              src={store.image.url}
              alt={store.image.altText || store.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#ccc] text-sm">No image</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <h3 className="text-white text-lg md:text-xl uppercase tracking-wider mb-1" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            {shortName || store.title}
          </h3>
          <div className="flex items-center text-white/70 text-sm font-medium group-hover:text-white transition-colors">
            Shop the Store <ArrowRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
    </a>
  );
}

export default function CompetitionPage() {
  const [, params] = useRoute("/competitions/:slug");
  const competition = params?.slug ? getCompetition(params.slug) : undefined;
  const { data: collections, isLoading, error } = useCollections();

  if (!competition) {
    return (
      <Layout>
        <section className="pt-32 pb-20 bg-white text-center">
          <div className="container mx-auto px-5">
            <h1 className="text-4xl md:text-5xl uppercase tracking-wider mb-4" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              Competition not found
            </h1>
            <Link href="/team-stores">
              <span className="inline-flex items-center text-[#111] font-medium hover:text-[#666] cursor-pointer">
                Browse all team stores <ArrowRight size={16} className="ml-1" />
              </span>
            </Link>
          </div>
        </section>
      </Layout>
    );
  }

  // Match member teams to live Shopify collections, preserving the config order.
  const byHandle = new Map((collections || []).map((c) => [c.handle, c] as const));
  const teams = competition.teamHandles.map((h) => byHandle.get(h)).filter(Boolean) as ShopifyCollection[];

  return (
    <Layout>
      {/* Competition banner */}
      <section className="pt-32 pb-14 md:pb-16 bg-[#111] text-white">
        <div className="container mx-auto px-5 md:px-[52px]">
          <Link href="/team-stores">
            <span className="inline-flex items-center text-white/60 hover:text-white text-sm mb-6 cursor-pointer transition-colors">
              <ArrowLeft size={14} className="mr-1" /> All Team Stores
            </span>
          </Link>
          <p className="text-[#e2001a] uppercase tracking-[0.2em] text-sm font-semibold mb-4">{competition.tagline}</p>
          {competition.logo ? (
            <img
              src={competition.logo}
              alt={competition.name}
              className="h-20 sm:h-24 md:h-32 w-auto mb-5 object-contain object-left"
            />
          ) : (
            <h1 className="text-4xl sm:text-5xl md:text-7xl uppercase tracking-wider mb-5" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              {competition.name}
            </h1>
          )}
          <p className="text-lg text-white/70 max-w-2xl">{competition.description}</p>
          <div className="mt-6 text-white/50 text-sm uppercase tracking-wider">
            {teams.length} {teams.length === 1 ? "Team Store" : "Team Stores"}
          </div>
        </div>
      </section>

      {/* Team tiles */}
      <section className="py-12 md:py-20 bg-white">
        <div className="container mx-auto px-5 md:px-[52px]">
          {isLoading ? (
            <div className="text-center py-16">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#999] mb-4" />
              <p className="text-[#999]">Loading team stores...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-[#999] text-lg">Unable to load stores right now. Please try again later.</p>
            </div>
          ) : teams.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[#999] text-lg">Team stores for this competition are coming soon.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {teams.map((store) => (
                <TeamTile key={store.handle} store={store} />
              ))}
            </div>
          )}

          <div className="mt-12 text-center">
            <p className="text-[#999] mb-4">Want your village or club in the competition store?</p>
            <Link href="/quote?teamStore=yes">
              <span className="inline-flex items-center text-[#111] font-medium hover:text-[#666] cursor-pointer transition-colors">
                Start a Team Store <ArrowRight size={16} className="ml-1" />
              </span>
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
