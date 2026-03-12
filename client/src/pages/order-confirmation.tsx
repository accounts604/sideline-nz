import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { getTeamStoreBySlug } from "@/data/team-stores";
import { CheckCircle, Package, Truck, ArrowLeft, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/cart-context";

interface OrderItem {
  id: string;
  productName: string;
  productImage: string | null;
  size: string | null;
  quantity: number;
  unitAmount: number;
  currency: string;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  shipping: number;
  total: number;
  currency: string;
  customerEmail: string | null;
  customerName: string | null;
  createdAt: string;
  items: OrderItem[];
}

export default function OrderConfirmationPage() {
  const params = useParams<{ slug: string }>();
  const store = getTeamStoreBySlug(params.slug || "");
  
  // Get order number from URL query
  const searchParams = new URLSearchParams(window.location.search);
  const orderNumber = searchParams.get("order");

  const { data: order, isLoading, error } = useQuery<Order>({
    queryKey: ["order", orderNumber],
    queryFn: async () => {
      if (!orderNumber) throw new Error("No order number");
      const res = await fetch(`/api/orders/${orderNumber}`);
      if (!res.ok) throw new Error("Order not found");
      return res.json();
    },
    enabled: !!orderNumber,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading order...</div>
        </div>
      </Layout>
    );
  }

  if (error || !order) {
    return (
      <Layout>
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
          <Package className="h-16 w-16 text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold text-primary mb-2">Order Not Found</h1>
          <p className="text-muted-foreground mb-6">We couldn't find this order.</p>
          <Link href={`/team-stores/${params.slug}`}>
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Store
            </Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const isPaid = order.status === "paid" || order.status === "processing" || order.status === "shipped" || order.status === "delivered";

  return (
    <Layout>
      <section className={`py-12 sm:py-16 bg-gradient-to-b from-primary to-primary/95`}>
        <div className="container mx-auto px-4">
          <Link href={`/team-stores/${params.slug}`}>
            <span className="inline-flex items-center text-white/70 hover:text-white mb-6 cursor-pointer text-sm">
              <ArrowLeft size={16} className="mr-1" /> Back to {store?.name || "Store"}
            </span>
          </Link>

          <div className="flex flex-col items-center text-center text-white">
            <div className={`w-20 h-20 rounded-full ${isPaid ? "bg-green-500" : "bg-yellow-500"} flex items-center justify-center mb-6`}>
              {isPaid ? (
                <CheckCircle className="h-10 w-10 text-white" />
              ) : (
                <Package className="h-10 w-10 text-white" />
              )}
            </div>
            
            <h1 className="font-heading text-2xl sm:text-3xl mb-2 tracking-wider">
              {isPaid ? "Order Confirmed!" : "Order Pending"}
            </h1>
            <p className="text-white/80 text-lg mb-4">
              {isPaid
                ? "Thank you for your purchase. We're preparing your order."
                : "Your order is being processed. Please complete payment if needed."}
            </p>
            <p className="text-white/60 font-mono">
              Order #{order.orderNumber}
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 bg-muted/20">
        <div className="container mx-auto px-4 max-w-3xl">
          {/* Order Status */}
          <div className="bg-white rounded-2xl border border-border p-6 mb-6">
            <h2 className="font-heading text-lg text-primary mb-4 tracking-wider">Order Status</h2>
            
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-3 h-3 rounded-full ${isPaid ? "bg-green-500" : "bg-yellow-500"}`} />
                  <span className="font-medium capitalize">{order.status}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {order.status === "pending" && "Awaiting payment confirmation"}
                  {order.status === "paid" && "Payment received, preparing your order"}
                  {order.status === "processing" && "Your order is being prepared"}
                  {order.status === "shipped" && "Your order is on its way"}
                  {order.status === "delivered" && "Your order has been delivered"}
                </p>
              </div>
              <Truck className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>

          {/* Order Items */}
          <div className="bg-white rounded-2xl border border-border p-6 mb-6">
            <h2 className="font-heading text-lg text-primary mb-4 tracking-wider">Order Items</h2>
            
            <div className="space-y-4">
              {order.items.map((item) => (
                <div key={item.id} className="flex gap-4" data-testid={`order-item-${item.id}`}>
                  <div className="w-16 h-16 bg-muted rounded-md flex items-center justify-center shrink-0">
                    {item.productImage ? (
                      <img src={item.productImage} alt={item.productName} className="w-full h-full object-cover rounded-md" />
                    ) : (
                      <ShoppingBag className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium">{item.productName}</h4>
                    {item.size && <p className="text-sm text-muted-foreground">Size: {item.size}</p>}
                    <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatPrice(item.unitAmount * item.quantity, item.currency)}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t mt-6 pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatPrice(order.subtotal, order.currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Shipping</span>
                <span>{formatPrice(order.shipping, order.currency)}</span>
              </div>
              <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                <span>Total</span>
                <span>{formatPrice(order.total, order.currency)}</span>
              </div>
            </div>
          </div>

          {/* Contact info */}
          {order.customerEmail && (
            <div className="bg-white rounded-2xl border border-border p-6">
              <h2 className="font-heading text-lg text-primary mb-4 tracking-wider">Confirmation Sent</h2>
              <p className="text-muted-foreground">
                A confirmation email has been sent to <strong>{order.customerEmail}</strong>.
              </p>
            </div>
          )}

          <div className="mt-8 text-center">
            <Link href={`/team-stores/${params.slug}`}>
              <Button variant="outline" className="mr-4">
                Continue Shopping
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
