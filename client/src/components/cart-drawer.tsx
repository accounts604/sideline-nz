import { useCart, formatPrice } from "@/lib/cart-context";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ShoppingBag, Plus, Minus, X, Loader2 } from "lucide-react";

export function CartDrawer() {
  const {
    isOpen,
    closeCart,
    items,
    subtotal,
    itemCount,
    isLoading,
    updateQuantity,
    removeItem,
    checkout,
    storeSlug,
  } = useCart();

  const handleCheckout = async () => {
    const url = await checkout();
    if (url) {
      window.location.href = url;
    }
  };

  const shipping = 850; // $8.50 flat rate
  const total = subtotal + (items.length > 0 ? shipping : 0);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeCart()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Your Cart {itemCount > 0 && `(${itemCount})`}
          </SheetTitle>
          <SheetDescription>
            {items.length === 0 ? "Your cart is empty" : "Review your items"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <ShoppingBag className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Add some items to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-4 p-4 bg-muted/30 rounded-lg"
                  data-testid={`cart-item-${item.id}`}
                >
                  <div className="w-16 h-16 bg-muted rounded-md flex items-center justify-center shrink-0">
                    {item.productImage ? (
                      <img
                        src={item.productImage}
                        alt={item.productName}
                        className="w-full h-full object-cover rounded-md"
                      />
                    ) : (
                      <ShoppingBag className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">{item.productName}</h4>
                    {item.size && (
                      <p className="text-xs text-muted-foreground">Size: {item.size}</p>
                    )}
                    <p className="text-sm font-semibold mt-1">
                      {formatPrice(item.unitAmount, item.currency)}
                    </p>

                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="w-7 h-7 rounded-full bg-background border flex items-center justify-center hover:bg-muted"
                        data-testid={`button-decrease-${item.id}`}
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center text-sm font-medium">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="w-7 h-7 rounded-full bg-background border flex items-center justify-center hover:bg-muted"
                        data-testid={`button-increase-${item.id}`}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-muted-foreground hover:text-destructive self-start"
                    data-testid={`button-remove-${item.id}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t pt-4 space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span>{formatPrice(shipping)}</span>
              </div>
              <div className="flex justify-between font-semibold text-base pt-2 border-t">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleCheckout}
              disabled={isLoading}
              data-testid="button-checkout"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Checkout"
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Secure checkout powered by Stripe
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
