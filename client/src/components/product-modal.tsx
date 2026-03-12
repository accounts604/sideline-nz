import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
        className="sm:max-w-lg p-0 overflow-hidden"
        style={{ borderRadius: "8px" }}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-white/80 p-1.5 hover:bg-white transition-colors"
        >
          <X size={16} />
        </button>

        {/* Product Image */}
        <div className="aspect-square bg-[#f5f5f5] overflow-hidden">
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
          </div>

          {product.description && (
            <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
              {product.description}
            </p>
          )}

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
      </DialogContent>
    </Dialog>
  );
}
