import { useParams, Link, Redirect } from "wouter";
import { useState, useEffect } from "react";
import Layout from "@/components/layout";
import { ShoppingBag, ArrowLeft, ArrowRight, Users, Calendar, Package, Loader2, Clock, AlertTriangle, Gift } from "lucide-react";
import { getCampaign, isCampaignClosed, getTimeRemaining, type StoreCampaign } from "@/lib/campaigns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCollectionByHandle } from "@/hooks/use-shopify";
import { formatPrice, type ShopifyProduct } from "@/lib/shopify";
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

function CampaignBanner({ campaign }: { campaign: StoreCampaign }) {
  const [timeLeft, setTimeLeft] = useState(getTimeRemaining(campaign));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(getTimeRemaining(campaign));
    }, 1000);
    return () => clearInterval(timer);
  }, [campaign]);

  const closed = isCampaignClosed(campaign);
  const cutoffDate = new Date(campaign.cutoff);
  const formattedDate = cutoffDate.toLocaleDateString("en-NZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const formattedTime = cutoffDate.toLocaleTimeString("en-NZ", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (closed) {
    return (
      <section style={{ background: "#1a1a1a", borderBottom: "2px solid #333" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 20px", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "8px" }}>
            <AlertTriangle size={18} style={{ color: "#f59e0b" }} />
            <span style={{ fontSize: "14px", fontWeight: 700, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "1.5px" }}>
              Orders Closed
            </span>
          </div>
          <p style={{ fontSize: "14px", color: "#999", margin: 0 }}>
            This campaign closed on {formattedDate} at {formattedTime}. Production is now underway.
          </p>
          <p style={{ fontSize: "13px", color: "#666", marginTop: "8px" }}>
            Estimated delivery: {campaign.estimatedDelivery}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section style={{ background: "#111", borderBottom: "2px solid #22c55e" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 20px" }}>
        {/* Countdown row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
          <Clock size={16} style={{ color: "#22c55e" }} />
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: "1.5px" }}>
            Pre-Order Open
          </span>
          <span style={{ color: "#444" }}>|</span>
          <span style={{ fontSize: "13px", color: "#aaa" }}>
            Orders close <strong style={{ color: "#fff" }}>{formattedDate}</strong> at <strong style={{ color: "#fff" }}>{formattedTime}</strong>
          </span>
        </div>

        {/* Countdown timer */}
        {timeLeft && (
          <div style={{ display: "flex", justifyContent: "center", gap: "16px", marginTop: "16px" }}>
            {[
              { label: "Days", value: timeLeft.days },
              { label: "Hours", value: timeLeft.hours },
              { label: "Mins", value: timeLeft.minutes },
              { label: "Secs", value: timeLeft.seconds },
            ].map((unit) => (
              <div key={unit.label} style={{ textAlign: "center", minWidth: "56px" }}>
                <div style={{
                  fontSize: "24px", fontWeight: 800, color: "#fff",
                  background: "#1a1a1a", borderRadius: "8px", padding: "8px 12px",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {String(unit.value).padStart(2, "0")}
                </div>
                <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginTop: "4px" }}>
                  {unit.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Incentives */}
        {campaign.incentives && campaign.incentives.length > 0 && (
          <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
            {campaign.incentives.map((incentive, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#aaa" }}>
                <Gift size={12} style={{ color: "#22c55e", flexShrink: 0 }} />
                {incentive}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ProductCard({
  product,
  storeHandle,
  disabled,
}: {
  product: ShopifyProduct;
  storeHandle: string;
  disabled?: boolean;
}) {
  const Wrapper = disabled ? "div" : "a";
  const linkProps = disabled
    ? {}
    : {
        href: `https://teamstore.sidelinenz.com/collections/${storeHandle}/products/${product.handle}`,
        target: "_blank",
        rel: "noopener noreferrer",
      };

  return (
    <Wrapper
      {...linkProps as any}
      data-testid={"product-card-" + product.handle}
      style={{ cursor: disabled ? "default" : "pointer", textAlign: "center", display: "block", textDecoration: "none", opacity: disabled ? 0.6 : 1 }}
      className="group w-full"
    >
      <div style={{
        aspectRatio: "1", background: "#ffffff", borderRadius: "8px", overflow: "hidden",
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
          <ArrowRight size={14} style={{ color: "#fff" }} />
        </div>
      </div>
      <h4 style={{ fontSize: "13px", fontWeight: 600, color: "#111", marginBottom: "4px", lineHeight: 1.3, textTransform: "uppercase" }}>
        {product.title}
      </h4>
      <p style={{ fontSize: "15px", fontWeight: 700, color: "#111" }}>
        {formatPrice(product.priceRange.minVariantPrice.amount, product.priceRange.minVariantPrice.currencyCode)}
      </p>
    </Wrapper>
  );
}

export default function TeamStoreDetailPage() {
  const params = useParams<{ slug: string }>();
  const handle = params.slug || "";
  const { data, isLoading, error } = useCollectionByHandle(handle);

  const [explainerModalOpen, setExplainerModalOpen] = useState(false);

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
  const campaign = getCampaign(handle);
  const campaignClosed = campaign ? isCampaignClosed(campaign) : false;

  return (
    <StoreGate storeName={collection.title} storeHandle={handle}>
    <Layout>
      {/* Campaign Banner */}
      {campaign && <CampaignBanner campaign={campaign} />}

      {/* Hero / Feature Image */}
      {collection.image && (
        <section style={{ position: "relative", width: "100%", background: "#fff" }}>
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
              {campaignClosed ? (
                <span
                  style={{ fontSize: "13px", fontWeight: 600, color: "#999", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: "6px", padding: "10px 20px", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px", cursor: "not-allowed" }}
                >
                  Orders Closed
                </span>
              ) : (
                <a
                  href={`https://teamstore.sidelinenz.com/collections/${handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="button-shop-now"
                  style={{ fontSize: "13px", fontWeight: 600, color: "#fff", background: "#111", border: "1px solid #111", borderRadius: "6px", padding: "10px 20px", cursor: "pointer", whiteSpace: "nowrap", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  className="hover:opacity-80 transition-opacity"
                >
                  Shop Now <ArrowRight size={14} />
                </a>
              )}
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
                  storeHandle={handle}
                  disabled={campaignClosed}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Ordering, Shipping & Club Profit Share */}
      <section style={{ background: "#111", color: "#fff" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "72px 20px" }}>

          {/* Section Heading */}
          <p style={{ fontSize: "11px", letterSpacing: "3px", textTransform: "uppercase", color: "#888", marginBottom: "8px" }}>Information</p>
          <h2 style={{ fontSize: "clamp(22px, 3vw, 32px)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "64px", borderBottom: "1px solid #2a2a2a", paddingBottom: "24px" }}>
            Ordering, Shipping &amp; Club Profit Share
          </h2>

          <div style={{ display: "grid", gap: "56px" }}>

            {/* Your club earns */}
            <div>
              <h3 style={{ fontSize: "13px", letterSpacing: "2.5px", textTransform: "uppercase", color: "#e5e5e5", marginBottom: "16px", fontWeight: 700 }}>
                Your Club Earns Every Time Someone Orders
              </h3>
              <p style={{ fontSize: "15px", color: "#aaa", lineHeight: 1.8, maxWidth: "700px" }}>
                Every order placed through this store generates a cash return for your club. No fundraisers. No admin. Your community orders their gear — your club gets paid. Profit share is calculated after each order is fulfilled, based on actual production costs. Paid to your club treasurer at the close of each campaign.
              </p>
            </div>

            {/* What Sideline Covers */}
            <div>
              <h3 style={{ fontSize: "13px", letterSpacing: "2.5px", textTransform: "uppercase", color: "#e5e5e5", marginBottom: "20px", fontWeight: 700 }}>
                What Sideline Covers
              </h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "10px" }}>
                {["Custom gear production", "Order fulfilment & direct shipping", "Social media campaign to drive orders"].map((item) => (
                  <li key={item} style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "15px", color: "#aaa" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fff", flexShrink: 0, display: "inline-block" }} />
                    {item}
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: "14px", fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "1px", marginTop: "20px" }}>
                Your club just collects the return.
              </p>
            </div>

            {/* Profit Share Table */}
            <div>
              <h3 style={{ fontSize: "13px", letterSpacing: "2.5px", textTransform: "uppercase", color: "#e5e5e5", marginBottom: "12px", fontWeight: 700 }}>
                Club Profit Share
              </h3>
              <p style={{ fontSize: "14px", color: "#888", lineHeight: 1.7, maxWidth: "640px", marginBottom: "24px" }}>
                Profit share is calculated after all costs are confirmed at the close of each campaign — including production, shipping, and campaign costs.
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", maxWidth: "540px", borderCollapse: "collapse", fontSize: "14px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
                      <th style={{ textAlign: "left", padding: "10px 16px 10px 0", color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", fontSize: "11px" }}>Units Ordered (Per Campaign)</th>
                      <th style={{ textAlign: "left", padding: "10px 0", color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", fontSize: "11px" }}>Profit Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { units: "50–99 units", share: "6% of profits" },
                      { units: "100–149 units", share: "8% of profits" },
                      { units: "150–199 units", share: "10% of profits" },
                      { units: "200+ units", share: "12% of profits" },
                    ].map((row, i) => (
                      <tr key={row.units} style={{ borderBottom: "1px solid #1e1e1e", background: i % 2 === 0 ? "transparent" : "#161616" }}>
                        <td style={{ padding: "14px 16px 14px 0", color: "#ccc" }}>{row.units}</td>
                        <td style={{ padding: "14px 0", color: "#fff", fontWeight: 600 }}>{row.share}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: "12px", color: "#666", marginTop: "14px", lineHeight: 1.6, maxWidth: "540px" }}>
                *Minimum 50 units per campaign required to trigger payout. Paid directly to the club once all orders in the campaign are fulfilled.
              </p>
            </div>

            {/* How Ordering Works */}
            <div>
              <h3 style={{ fontSize: "13px", letterSpacing: "2.5px", textTransform: "uppercase", color: "#e5e5e5", marginBottom: "20px", fontWeight: 700 }}>
                How Ordering Works
              </h3>
              <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "12px" }}>
                {[
                  "Campaign opens — your community places orders through the store",
                  "Campaign closes — production begins on all confirmed orders",
                  "Gear is produced and shipped directly to each customer",
                  "Profit is calculated and paid to the club",
                ].map((step, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: "16px", fontSize: "15px", color: "#aaa", lineHeight: 1.6 }}>
                    <span style={{ minWidth: "24px", height: "24px", borderRadius: "50%", border: "1px solid #333", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "#888", fontWeight: 700, marginTop: "1px" }}>
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
              <p style={{ fontSize: "13px", color: "#888", marginTop: "20px" }}>
                Estimated delivery: <span style={{ color: "#ccc", fontWeight: 600 }}>{campaign?.estimatedDelivery ?? "4–5 weeks from campaign close date"}</span>
              </p>
            </div>

            {/* Shipping & Pickup */}
            <div style={{ display: "grid", gap: "32px" }} className="shipping-grid">
              <div>
                <h3 style={{ fontSize: "13px", letterSpacing: "2.5px", textTransform: "uppercase", color: "#e5e5e5", marginBottom: "16px", fontWeight: 700 }}>
                  Shipping
                </h3>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "10px" }}>
                  {[
                    "New Zealand delivery only",
                    "Shipping costs are covered by Sideline NZ as part of the campaign",
                    "All orders are tracked and confirmed via email",
                  ].map((item) => (
                    <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: "12px", fontSize: "15px", color: "#aaa", lineHeight: 1.6 }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#555", flexShrink: 0, marginTop: "8px", display: "inline-block" }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 style={{ fontSize: "13px", letterSpacing: "2.5px", textTransform: "uppercase", color: "#e5e5e5", marginBottom: "16px", fontWeight: 700 }}>
                  Local Pickup — Auckland
                </h3>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "10px" }}>
                  {[
                    "Selected pickup days will be announced at the close of each campaign",
                    "Pickup location: Sideline NZ HQ",
                    "Pickup option available at checkout for local orders",
                  ].map((item) => (
                    <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: "12px", fontSize: "15px", color: "#aaa", lineHeight: 1.6 }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#555", flexShrink: 0, marginTop: "8px", display: "inline-block" }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Terms & Conditions */}
            <div style={{ borderTop: "1px solid #1e1e1e", paddingTop: "40px" }}>
              <h3 style={{ fontSize: "13px", letterSpacing: "2.5px", textTransform: "uppercase", color: "#e5e5e5", marginBottom: "20px", fontWeight: 700 }}>
                Terms &amp; Conditions
              </h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "10px" }}>
                {[
                  "All items are made to order — no returns on custom gear unless faulty or incorrect",
                  "Faulty or incorrect items must be reported within 7 days of delivery with photo evidence",
                  "Profit share applies to fulfilled and delivered orders only",
                  "Cancelled or refunded orders are excluded from profit share calculations",
                  "Production, shipping, and campaign costs are deducted before profit share is calculated",
                  "Sideline NZ reserves the right to update pricing and terms with reasonable notice",
                  "By placing an order through this store you agree to these terms",
                ].map((term) => (
                  <li key={term} style={{ display: "flex", alignItems: "flex-start", gap: "12px", fontSize: "14px", color: "#777", lineHeight: 1.7 }}>
                    <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#444", flexShrink: 0, marginTop: "9px", display: "inline-block" }} />
                    {term}
                  </li>
                ))}
              </ul>
            </div>

          </div>
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
          .shipping-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </Layout>
    </StoreGate>
  );
}
