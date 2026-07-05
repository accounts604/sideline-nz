import { Link } from "wouter";
import Layout from "@/components/layout";
import Seo from "@/components/seo";
import { MapPin, ArrowRight, Search, Loader2 } from "lucide-react";
import { useState } from "react";
import { useCollections } from "@/hooks/use-shopify";
import type { ShopifyCollection } from "@/lib/shopify";

function TeamStoreCard({ store }: { store: ShopifyCollection }) {
  return (
    <a href={"https://teamstore.sidelinenz.com/collections/" + store.handle} target="_blank" rel="noopener noreferrer">
      <div
        className="group relative cursor-pointer overflow-hidden border border-[#e5e5e5] hover:border-[#111] transition-colors"
        style={{ borderRadius: "8px" }}
        data-testid={"card-team-store-" + store.handle}
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
          <h3
            className="text-white text-lg md:text-xl uppercase tracking-wider mb-1"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            {store.title}
          </h3>
          <div className="flex items-center text-white/70 text-sm font-medium group-hover:text-white transition-colors">
            View Store <ArrowRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
    </a>
  );
}

export default function TeamStoresPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: collections, isLoading, error } = useCollections();

  const filteredStores = (collections || []).filter(
    (store) =>
      store.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      store.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Layout>
      <Seo title="Team Stores" description="Shop the official online team stores for clubs and schools partnered with Sideline NZ. Supporter jerseys, hoodies, caps and more, made to order." path="/team-stores" />
      <section className="pt-32 pb-16 md:pb-20 bg-white text-[#111]">
        <div className="container mx-auto px-5 md:px-[52px] text-center">
          <h1
            className="text-4xl sm:text-5xl md:text-6xl text-[#111] mb-4 uppercase tracking-wider mt-2"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            Team Stores
          </h1>
          <p className="text-lg text-[#666] max-w-2xl mx-auto mb-10">
            Browse our online team stores for clubs and schools partnered with Sideline.
          </p>

          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999]" size={20} />
            <input
              type="text"
              placeholder="Search by club or school..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 text-[#111] bg-[#f5f5f5] border border-[#e5e5e5] focus:border-[#111] outline-none text-[16px]"
              style={{ borderRadius: "6px" }}
              data-testid="input-search-stores"
            />
          </div>
        </div>
      </section>

      <section className="py-12 md:py-20 bg-white">
        <div className="container mx-auto px-5 md:px-[52px]">
          {isLoading ? (
            <div className="text-center py-16">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#999] mb-4" />
              <p className="text-[#999]">Loading stores...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-[#999] text-lg">Unable to load stores right now. Please try again later.</p>
            </div>
          ) : filteredStores.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[#999] text-lg">
                {searchQuery ? 'No stores found matching "' + searchQuery + '"' : "No stores available yet."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {filteredStores.map((store) => (
                <TeamStoreCard key={store.handle} store={store} />
              ))}
            </div>
          )}

          <div className="mt-12 text-center">
            <p className="text-[#999] mb-4">
              Want your club or school to have their own store?
            </p>
            <Link href="/quote?teamStore=yes">
              <span className="inline-flex items-center text-[#111] font-medium hover:text-[#666] cursor-pointer transition-colors">
                Start a Team Store Project <ArrowRight size={16} className="ml-1" />
              </span>
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
