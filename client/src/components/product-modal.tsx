import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { createShopifyCart, formatPrice, type ShopifyProduct } from "@/lib/shopify";

interface ProductModalProps {
  product: ShopifyProduct | null;
  open: boolean;
  onClose: () => void;
}

export function ProductModal({ product, open, onClose }: ProductModalProps) {
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!product) return null;

  const variants = product.variants.edges.map((e) => e.node);
  const hasMultipleVariants = variants.length > 1;
  const activeVariant = selectedVariant
    ? variants.find((v) => v.id === selectedVariant)
    : variants[0];

  async function handleBuyNow() {
    if (!activeVariant) return;
    setLoading(true);
    setError(null);
    try {
      const cart = await createShopifyCart([
        { merchandiseId: activeVariant.id, quantity: 1 },
      ]);
      window.location.href = cart.checkoutUrl;
    } catch (e: any) {
      setError(e.message || "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-lg p-0 overflow-hidden max-h-[90vh] flex flex-col"
        style={{ borderRadius: "8px" }}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-white/80 p-1.5 hover:bg-white transition-colors"
        >
          <X size={16} />
        </button>

        {/* Product Image */}
        <div className="aspect-square bg-white overflow-hidden shrink-0">
          {product.featuredImage ? (
            <img
              src={product.featuredImage.url}
              alt={product.featuredImage.altText || product.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm">
              No image
            </div>
          )}
        </div>

        {/* Scrollable details + accordion */}
        <div className="overflow-y-auto flex-1">
          {/* Details */}
          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-[#111] uppercase tracking-wide">
                {product.title}
              </h3>
              <p className="text-xl font-bold text-[#111] mt-1">
                {activeVariant
                  ? formatPrice(activeVariant.price.amount, activeVariant.price.currencyCode)
                  : formatPrice(
                      product.priceRange.minVariantPrice.amount,
                      product.priceRange.minVariantPrice.currencyCode
                    )}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                or 4 x ${(Math.ceil(parseFloat(activeVariant ? activeVariant.price.amount : product.priceRange.minVariantPrice.amount) / 4 * 100) / 100).toFixed(2)} with{" "}
                <span style={{ color: "#B2FCE4", fontWeight: 700 }}>Afterpay</span>
              </p>
            </div>

            {/* Variant / Size Selection */}
            {hasMultipleVariants && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Size / Option
                </p>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => {
                    const isSelected = (selectedVariant || variants[0]?.id) === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVariant(v.id)}
                        disabled={!v.availableForSale}
                        className={
                          "px-4 py-2 text-sm border rounded transition-all " +
                          (isSelected
                            ? "bg-[#111] text-white border-[#111]"
                            : v.availableForSale
                              ? "bg-white text-[#333] border-gray-200 hover:border-[#111]"
                              : "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed line-through")
                        }
                      >
                        {v.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <Button
              onClick={handleBuyNow}
              disabled={loading || !activeVariant?.availableForSale}
              className="w-full bg-[#111] hover:bg-[#333] text-white font-semibold py-6 text-sm uppercase tracking-wider"
              style={{ borderRadius: "6px" }}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : activeVariant?.availableForSale ? (
                "Buy Now — Checkout"
              ) : (
                "Sold Out"
              )}
            </Button>
          </div>

          {/* Accordion sections */}
          <Accordion
            type="single"
            collapsible
            defaultValue="description"
            className="bg-[#111] text-white"
          >
            <AccordionItem value="description" className="border-b border-white/10 px-6">
              <AccordionTrigger className="text-white hover:no-underline text-xs uppercase tracking-widest font-semibold [&>svg]:text-white">
                Description
              </AccordionTrigger>
              <AccordionContent className="text-gray-300 text-sm leading-relaxed">
                {product.description || "No description available."}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="size-guide" className="border-b border-white/10 px-6">
              <AccordionTrigger className="text-white hover:no-underline text-xs uppercase tracking-widest font-semibold [&>svg]:text-white">
                Size Guide
              </AccordionTrigger>
              <AccordionContent className="text-gray-300 text-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-2 pr-4 text-gray-400 font-semibold uppercase tracking-wider">Size</th>
                        <th className="text-left py-2 pr-4 text-gray-400 font-semibold uppercase tracking-wider">Chest (cm)</th>
                        <th className="text-left py-2 pr-4 text-gray-400 font-semibold uppercase tracking-wider">Waist (cm)</th>
                        <th className="text-left py-2 text-gray-400 font-semibold uppercase tracking-wider">Hips (cm)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["XS / 8", "76–81", "61–66", "84–89"],
                        ["S / 10", "82–87", "67–72", "90–95"],
                        ["M / 12", "88–93", "73–78", "96–101"],
                        ["L / 14", "94–99", "79–84", "102–107"],
                        ["XL / 16", "100–106", "85–91", "108–114"],
                        ["2XL", "107–113", "92–98", "115–121"],
                        ["3XL", "114–120", "99–105", "122–128"],
                      ].map(([size, chest, waist, hips]) => (
                        <tr key={size} className="border-b border-white/5">
                          <td className="py-2 pr-4 font-medium text-white">{size}</td>
                          <td className="py-2 pr-4">{chest}</td>
                          <td className="py-2 pr-4">{waist}</td>
                          <td className="py-2">{hips}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-gray-400 text-xs italic">
                  Measure your body, not your clothing. If between sizes, size up.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="shipping" className="border-b border-white/10 px-6">
              <AccordionTrigger className="text-white hover:no-underline text-xs uppercase tracking-widest font-semibold [&>svg]:text-white">
                Shipping & Delivery
              </AccordionTrigger>
              <AccordionContent className="text-gray-300 text-sm leading-relaxed space-y-2">
                <p>All orders are made to order. Estimated delivery 4–5 weeks from campaign close date.</p>
                <p>New Zealand delivery only. Shipping is covered by Sideline NZ.</p>
                <p>All orders tracked and confirmed via email.</p>
                <p>Auckland local pickup available — dates announced at campaign close.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="profit-share" className="border-b border-white/10 px-6">
              <AccordionTrigger className="text-white hover:no-underline text-xs uppercase tracking-widest font-semibold [&>svg]:text-white">
                Club Profit Share
              </AccordionTrigger>
              <AccordionContent className="text-gray-300 text-sm leading-relaxed space-y-2">
                <p>Every order earns your club a return. Profit share is calculated after all production costs at campaign close.</p>
                <p>Minimum 50 units required. Tiers:</p>
                <ul className="mt-1 space-y-1 text-xs">
                  <li className="flex justify-between border-b border-white/5 py-1"><span>50–99 units</span><span className="text-white font-semibold">6%</span></li>
                  <li className="flex justify-between border-b border-white/5 py-1"><span>100–149 units</span><span className="text-white font-semibold">8%</span></li>
                  <li className="flex justify-between border-b border-white/5 py-1"><span>150–199 units</span><span className="text-white font-semibold">10%</span></li>
                  <li className="flex justify-between py-1"><span>200+ units</span><span className="text-white font-semibold">12%</span></li>
                </ul>
                <p className="text-xs text-gray-400 mt-2">Paid to club treasurer once all orders fulfilled.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="returns" className="px-6">
              <AccordionTrigger className="text-white hover:no-underline text-xs uppercase tracking-widest font-semibold [&>svg]:text-white">
                Returns & Faulty Items
              </AccordionTrigger>
              <AccordionContent className="text-gray-300 text-sm leading-relaxed space-y-2">
                <p>All items are custom made to order — no returns unless faulty or incorrect.</p>
                <p>Faulty or incorrect items must be reported within 7 days of delivery with photo evidence.</p>
                <p>Contact <span className="text-white">info@sidelinenz.com</span></p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </DialogContent>
    </Dialog>
  );
}
