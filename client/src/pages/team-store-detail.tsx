import { useParams, Link, Redirect } from "wouter";
import { useState } from "react";
import Layout from "@/components/layout";
import { ShoppingBag, ArrowLeft, ArrowRight, Users, Calendar, Package, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCollectionByHandle } from "@/hooks/use-shopify";
import { formatPrice, type ShopifyProduct } from "@/lib/shopify";
import { ProductModal } from "@/components/product-modal";
import { StoreGate } from "@/components/store-gate";

function TeamStoreExplainerModal({
  isOpen,
  onClose
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl font-heading">Online Team Stores made simple</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <p className="text-muted-foreground">
            We create a custom online store for your club or school so parents and supporters can order directly. No admin, no payments for you to manage.
          </p>

          <div className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h4 className="font-medium text-primary">Individual ordering & payments</h4>
                <p className="text-sm text-muted-foreground">Parents order and pay directly - no collecting money or chasing payments.</p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h4 className="font-medium text-primary">Fixed cut-off dates</h4>
                <p className="text-sm text-muted-foreground">We manage order windows and deadlines so you don't have to.</p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h4 className="font-medium text-primary">Bulk production & delivery</h4>
                <p className="text-sm text-muted-foreground">Orders are batched for efficient production and delivered together.</p>
              </div>
            </div>
          </div>

          <Link href="/quote">
            <Button className="w-full bg-accent hover:bg-accent/90" size="lg" data-testid="button-modal-start-project">
              Include Team Store in my project
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProductCard({
  product,
  onSelect,
}: {
  product: ShopifyProduct;
  onSelect: (product: ShopifyProduct) => void;
}) {
  return (
    <button
      onClick={() => onSelect(product)}
      data-testid={"product-card-" + product.handle}
      style={{ cursor: "pointer", textAlign: "center", display: "block", background: "none", border: "none", padding: 0 }}
      className="group w-full"
    >
      <div style={{
        aspectRatio: "1", background: "#f5f5f5", borderRadius: "8px", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px",
        position: "relative",
      }}>
        {product.featuredImage ? (
          <img
            src={product.featuredImage.url}
            alt={product.featuredImage.altText || product.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.3s" }}
            className="group-hover:scale-105"
          />
        ) : (
          <ShoppingBag size={48} style={{ color: "#ccc" }} />
        )}
        <div style={{
          position: "absolute", bottom: "10px", right: "10px",
          background: "#111", borderRadius: "50%", width: "32px", height: "32px",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: 0, transition: "opacity 0.3s",
        }} className="group-hover:!opacity-100">
          <ShoppingBag size={14} style={{ color: "#fff" }} />
        </div>
      </div>
      <h4 style={{ fontSize: "13px", fontWeight: 600, color: "#111", marginBottom: "4px", lineHeight: 1.3, textTransform: "uppercase" }}>
        {product.title}
      </h4>
      <p style={{ fontSize: "15px", fontWeight: 700, color: "#111" }}>
        {formatPrice(product.priceRange.minVariantPrice.amount, product.priceRange.minVariantPrice.currencyCode)}
      </p>
    </button>
  );
}

export default function TeamStoreDetailPage() {
  const params = useParams<{ slug: string }>();
  const handle = params.slug || "";
  const { data, isLoading, error } = useCollectionByHandle(handle);

  const [explainerModalOpen, setExplainerModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ShopifyProduct | null>(null);

  if (isLoading) {
    return (
      <Layout>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#999" }} />
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    return <Redirect to="/team-stores" />;
  }

  const { collection, products } = data;

  return (
    <StoreGate storeName={collection.title}>
    <Layout>
      {/* Hero / Feature Image */}
      {collection.image && (
        <section style={{ position: "relative", width: "100%", background: "#000" }}>
          <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
            <img
              src={collection.image.url}
              alt={collection.image.altText || collection.title}
              style={{ width: "100%", height: "auto", maxHeight: "500px", objectFit: "cover", display: "block" }}
            />
          </div>
        </section>
      )}

      {/* Store Header */}
      <section style={{ background: "#fff", borderBottom: "1px solid #e5e5e5" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 20px" }} className="store-header-inner">
          <Link href="/team-stores">
            <span style={{ display: "inline-flex", alignItems: "center", color: "#999", fontSize: "13px", cursor: "pointer", marginBottom: "16px" }} className="hover:text-black transition-colors">
              <ArrowLeft size={14} style={{ marginRight: "4px" }} /> Back to Team Stores
            </span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <h1 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "1px", margin: 0 }}>
                {collection.title}
              </h1>
              {collection.description && (
                <p style={{ fontSize: "15px", color: "#666", marginTop: "8px", maxWidth: "600px" }}>{collection.description}</p>
              )}
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                onClick={() => setExplainerModalOpen(true)}
                data-testid="button-how-it-works"
                style={{ fontSize: "13px", color: "#666", background: "none", border: "1px solid #ddd", borderRadius: "6px", padding: "10px 20px", cursor: "pointer", whiteSpace: "nowrap" }}
                className="hover:border-black hover:text-black transition-all"
              >
                How it works
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section Divider */}
      <div style={{ height: "1px", background: "#e5e5e5" }} />

      {/* Filter Bar */}
      <section style={{ background: "#fff", borderBottom: "1px solid #e5e5e5" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "#111", textTransform: "uppercase", letterSpacing: "1px" }}>All Items</span>
            <span style={{ fontSize: "13px", color: "#999" }}>({products.length})</span>
          </div>
          <span style={{ fontSize: "13px", color: "#999" }}>Featured</span>
        </div>
      </section>

      {/* Products Grid */}
      <section style={{ background: "#fff", minHeight: "60vh" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 20px 80px" }}>
          {products.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px" }}>
              <ShoppingBag size={48} style={{ color: "#ddd", margin: "0 auto 16px" }} />
              <p style={{ fontSize: "16px", color: "#999" }}>No products available in this store yet.</p>
              <p style={{ fontSize: "14px", color: "#bbb", marginTop: "8px" }}>Check back soon — new gear drops regularly.</p>
            </div>
          ) : (
            <div className="store-products-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "32px 20px" }}>
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onSelect={setSelectedProduct}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Section Divider */}
      <div style={{ height: "1px", background: "#e5e5e5" }} />

      {/* CTA Section */}
      <section style={{ background: "#f9f9f9" }}>
        <div style={{ maxWidth: "700px", margin: "0 auto", padding: "64px 20px", textAlign: "center" }}>
          <p style={{ fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", color: "#999", marginBottom: "16px" }}>Optional add-on</p>
          <h3 style={{ fontSize: "22px", fontWeight: 700, color: "#111", marginBottom: "12px" }}>
            Want a store like this for your club or school?
          </h3>
          <p style={{ fontSize: "15px", color: "#666", lineHeight: 1.7, marginBottom: "32px" }}>
            We create custom online team stores so parents and supporters can order directly. No admin headaches, no chasing payments — we handle everything.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/quote?teamStore=yes">
              <Button
                size="lg"
                data-testid="button-add-to-project"
                style={{ background: "#111", color: "#fff", borderRadius: "6px", fontSize: "13px", fontWeight: 600, letterSpacing: "0.5px", padding: "14px 32px", height: "auto" }}
              >
                Add to my project
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Button
              variant="outline"
              size="lg"
              onClick={() => setExplainerModalOpen(true)}
              data-testid="button-see-how-works"
              style={{ background: "#fff", color: "#333", border: "1px solid #ddd", borderRadius: "6px", fontSize: "13px", fontWeight: 500, padding: "14px 32px", height: "auto" }}
            >
              See how it works
            </Button>
          </div>
        </div>
      </section>

      <TeamStoreExplainerModal
        isOpen={explainerModalOpen}
        onClose={() => setExplainerModalOpen(false)}
      />

      <ProductModal
        product={selectedProduct}
        open={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />

      <style>{`
        @media (min-width: 640px) {
          .store-products-grid {
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 40px 28px !important;
          }
        }
        @media (min-width: 1024px) {
          .store-products-grid {
            grid-template-columns: repeat(4, 1fr) !important;
            gap: 48px 32px !important;
          }
        }
      `}</style>
    </Layout>
    </StoreGate>
  );
}
