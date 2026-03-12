import { Router } from "express";
import { storage } from "../storage";
import { getUncachableStripeClient, getStripePublishableKey } from "../stripeClient";
import { z } from "zod";

const router = Router();

// Generate unique order numbers
function generateOrderNumber(): string {
  const prefix = "SNZ";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// ====== STRIPE CONFIG ======
router.get("/stripe/config", async (req, res) => {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  } catch (e: any) {
    console.error("Stripe config error:", e);
    res.status(500).json({ error: "Stripe not configured" });
  }
});

// ====== PRODUCTS ======
router.get("/products", async (req, res) => {
  try {
    const storeSlug = req.query.store as string | undefined;
    const products = await storage.getStripeProducts(storeSlug);

    const grouped = products.reduce((acc: any, row: any) => {
      if (!acc[row.id]) {
        acc[row.id] = {
          id: row.id,
          name: row.name,
          description: row.description,
          images: row.images,
          metadata: row.metadata,
          prices: [],
        };
      }
      if (row.price_id) {
        acc[row.id].prices.push({
          id: row.price_id,
          unitAmount: row.unit_amount,
          currency: row.currency,
          metadata: row.price_metadata,
        });
      }
      return acc;
    }, {});

    res.json({ data: Object.values(grouped) });
  } catch (e: any) {
    console.error("Products error:", e);
    res.status(500).json({ error: e.message });
  }
});

router.get("/products/:productId", async (req, res) => {
  try {
    const product = await storage.getStripeProduct(req.params.productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const prices = await storage.getStripePrices(req.params.productId);
    res.json({
      ...product,
      prices: prices.map((p: any) => ({
        id: p.id,
        unitAmount: p.unit_amount,
        currency: p.currency,
        metadata: p.metadata,
      })),
    });
  } catch (e: any) {
    console.error("Product error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ====== CART ======
const cartItemSchema = z.object({
  productId: z.string(),
  priceId: z.string(),
  productName: z.string(),
  productImage: z.string().optional(),
  size: z.string().optional(),
  quantity: z.number().min(1).default(1),
  unitAmount: z.number(),
  currency: z.string().default("nzd"),
});

router.get("/cart", async (req, res) => {
  try {
    const sessionId = req.headers["x-session-id"] as string;
    const storeSlug = req.query.store as string;

    if (!sessionId || !storeSlug) {
      return res.status(400).json({ error: "Session ID and store slug required" });
    }

    let cart = await storage.getCartBySession(sessionId, storeSlug);
    if (!cart) {
      cart = await storage.createCart({ sessionId, storeSlug });
    }

    const items = await storage.getCartItems(cart.id);
    const subtotal = items.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0);

    res.json({
      id: cart.id,
      storeSlug: cart.storeSlug,
      items,
      subtotal,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    });
  } catch (e: any) {
    console.error("Cart error:", e);
    res.status(500).json({ error: e.message });
  }
});

router.post("/cart/items", async (req, res) => {
  try {
    const sessionId = req.headers["x-session-id"] as string;
    const storeSlug = req.query.store as string;

    if (!sessionId || !storeSlug) {
      return res.status(400).json({ error: "Session ID and store slug required" });
    }

    const itemData = cartItemSchema.parse(req.body);

    let cart = await storage.getCartBySession(sessionId, storeSlug);
    if (!cart) {
      cart = await storage.createCart({ sessionId, storeSlug });
    }

    const item = await storage.addCartItem({
      cartId: cart.id,
      ...itemData,
    });

    const items = await storage.getCartItems(cart.id);
    const subtotal = items.reduce((sum, i) => sum + i.unitAmount * i.quantity, 0);

    res.json({
      id: cart.id,
      items,
      subtotal,
      itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    });
  } catch (e: any) {
    console.error("Add to cart error:", e);
    res.status(500).json({ error: e.message });
  }
});

router.patch("/cart/items/:itemId", async (req, res) => {
  try {
    const sessionId = req.headers["x-session-id"] as string;
    if (!sessionId) {
      return res.status(400).json({ error: "Session ID required" });
    }

    const { quantity } = req.body;

    if (typeof quantity !== "number" || quantity < 0) {
      return res.status(400).json({ error: "Invalid quantity" });
    }

    const item = await storage.getCartItem(req.params.itemId);
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    const cart = await storage.getCart(item.cartId);
    if (!cart || cart.sessionId !== sessionId) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (quantity < 1) {
      await storage.removeCartItem(req.params.itemId);
    } else {
      await storage.updateCartItemQuantity(req.params.itemId, quantity);
    }

    res.json({ success: true });
  } catch (e: any) {
    console.error("Update cart error:", e);
    res.status(500).json({ error: e.message });
  }
});

router.delete("/cart/items/:itemId", async (req, res) => {
  try {
    const sessionId = req.headers["x-session-id"] as string;
    if (!sessionId) {
      return res.status(400).json({ error: "Session ID required" });
    }

    const item = await storage.getCartItem(req.params.itemId);
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    const cart = await storage.getCart(item.cartId);
    if (!cart || cart.sessionId !== sessionId) {
      return res.status(403).json({ error: "Access denied" });
    }

    await storage.removeCartItem(req.params.itemId);
    res.json({ success: true });
  } catch (e: any) {
    console.error("Remove from cart error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ====== CHECKOUT ======
router.post("/checkout", async (req, res) => {
  try {
    const sessionId = req.headers["x-session-id"] as string;
    const storeSlug = req.query.store as string;

    if (!sessionId || !storeSlug) {
      return res.status(400).json({ error: "Session ID and store slug required" });
    }

    const cart = await storage.getCartBySession(sessionId, storeSlug);
    if (!cart) {
      return res.status(400).json({ error: "Cart not found" });
    }

    const items = await storage.getCartItems(cart.id);
    if (items.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const stripe = await getUncachableStripeClient();

    const subtotal = items.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0);
    const shipping = 850; // $8.50 flat rate
    const total = subtotal + shipping;

    const orderNumber = generateOrderNumber();
    const order = await storage.createOrder({
      orderNumber,
      sessionId,
      storeSlug,
      status: "pending",
      subtotal,
      shipping,
      tax: 0,
      total,
      currency: "nzd",
    });

    for (const item of items) {
      await storage.createOrderItem({
        orderId: order.id,
        productId: item.productId,
        priceId: item.priceId,
        productName: item.productName,
        productImage: item.productImage,
        size: item.size,
        quantity: item.quantity,
        unitAmount: item.unitAmount,
        currency: item.currency,
      });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: items.map((item) => ({
        price_data: {
          currency: item.currency,
          product_data: {
            name: item.productName + (item.size ? ` - ${item.size}` : ""),
            images: item.productImage ? [item.productImage] : [],
          },
          unit_amount: item.unitAmount,
        },
        quantity: item.quantity,
      })),
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: shipping, currency: "nzd" },
            display_name: "Standard Shipping",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 5 },
              maximum: { unit: "business_day", value: 10 },
            },
          },
        },
      ],
      shipping_address_collection: {
        allowed_countries: ["NZ"],
      },
      success_url: `${baseUrl}/team-stores/${storeSlug}/order-confirmation?order=${order.orderNumber}`,
      cancel_url: `${baseUrl}/team-stores/${storeSlug}/cart`,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        storeSlug,
      },
    });

    await storage.updateOrderStatus(order.id, "pending");

    const { db } = await import("../db");
    const { orders } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    await db
      .update(orders)
      .set({ stripeCheckoutSessionId: checkoutSession.id })
      .where(eq(orders.id, order.id));

    await storage.clearCart(cart.id);

    res.json({ url: checkoutSession.url, orderNumber: order.orderNumber });
  } catch (e: any) {
    console.error("Checkout error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ====== ORDERS ======
router.get("/orders", async (req, res) => {
  try {
    const sessionId = req.headers["x-session-id"] as string;
    if (!sessionId) {
      return res.status(400).json({ error: "Session ID required" });
    }

    const orders = await storage.getOrdersBySession(sessionId);
    res.json({ data: orders });
  } catch (e: any) {
    console.error("Orders error:", e);
    res.status(500).json({ error: e.message });
  }
});

router.get("/orders/:orderNumber", async (req, res) => {
  try {
    const order = await storage.getOrderByNumber(req.params.orderNumber);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const items = await storage.getOrderItems(order.id);
    res.json({ ...order, items });
  } catch (e: any) {
    console.error("Order error:", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
