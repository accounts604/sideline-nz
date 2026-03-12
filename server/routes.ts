import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { z } from "zod";

// Generate unique order numbers
function generateOrderNumber(): string {
  const prefix = "SNZ";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // GHL API Integration
  const GHL_API_BASE = "https://services.leadconnectorhq.com";
  
  async function createGhlContact(contactData: any, tags: string[] = []) {
    const apiKey = process.env.SIDELINE_GHL_API_KEY;
    const locationId = process.env.SIDELINE_GHL_LOCATION_ID;
    
    if (!apiKey || !locationId) {
      console.log("GHL credentials not configured - logging submission:", contactData);
      return { success: false, reason: "credentials_missing" };
    }
    
    const ghlPayload = {
      locationId,
      firstName: contactData.name?.split(" ")[0] || "",
      lastName: contactData.name?.split(" ").slice(1).join(" ") || "",
      email: contactData.email,
      phone: contactData.phone,
      tags,
      source: contactData.source || "sidelinenz.com",
      customFields: [] as { key: string; field_value: string }[],
    };
    
    const customFieldMappings: Record<string, string> = {
      user_type: "user_type",
      role: "role", 
      organization: "organization",
      member_count: "member_count",
      current_supplier: "current_supplier",
      sports: "sports",
      mockup_interest: "mockup_interest",
      needs: "needs",
      estimated_quantity: "estimated_quantity",
      teams_involved: "teams_involved",
      kit_items: "kit_items",
      personalisation: "personalisation",
      supporter_audience: "supporter_audience",
      style_preference: "style_preference",
      fundraising_interest: "fundraising_interest",
      sponsorship_interest: "sponsorship_interest",
      timing: "timing",
      season_start: "season_start",
      design_stage: "design_stage",
      budget_range: "budget_range",
      approval_process: "approval_process",
      main_concern: "main_concern",
      notes: "notes",
      school_event_date: "school_event_date",
      slt_friendly: "slt_friendly",
      team_store_interest: "team_store_interest",
      team_store_audience: "team_store_audience",
      team_store_goal: "team_store_goal",
      enquiry_type: "enquiry_type",
      message: "message",
      submitted_at: "submitted_at",
    };
    
    for (const [formKey, ghlKey] of Object.entries(customFieldMappings)) {
      if (contactData[formKey]) {
        const value = Array.isArray(contactData[formKey]) 
          ? contactData[formKey].join(", ")
          : String(contactData[formKey]);
        ghlPayload.customFields.push({ key: ghlKey, field_value: value });
      }
    }
    
    try {
      const response = await fetch(`${GHL_API_BASE}/contacts/`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Version": "2021-07-28",
        },
        body: JSON.stringify(ghlPayload),
      });
      
      const responseText = await response.text();
      
      if (!response.ok) {
        console.error("GHL API error:", response.status, responseText);
        return { success: false, reason: "api_error", status: response.status, details: responseText };
      }
      
      const result = JSON.parse(responseText);
      console.log("GHL contact created:", result.contact?.id || result.id);
      return { success: true, contactId: result.contact?.id || result.id };
    } catch (error: any) {
      console.error("GHL API request failed:", error.message);
      return { success: false, reason: "request_failed", error: error.message };
    }
  }
  
  const projectSubmissionSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Valid email is required"),
    phone: z.string().min(1, "Phone is required"),
    user_type: z.string().optional(),
    role: z.string().optional(),
    organization: z.string().optional(),
    member_count: z.string().optional(),
    current_supplier: z.string().optional(),
    sports: z.string().optional(),
    mockup_interest: z.string().optional(),
    needs: z.string().optional(),
    estimated_quantity: z.string().optional(),
    kit_quantity: z.string().optional(),
    supporter_quantity: z.string().optional(),
    teams_involved: z.string().optional(),
    kit_items: z.string().optional(),
    personalisation: z.string().optional(),
    supporter_audience: z.string().optional(),
    style_preference: z.string().optional(),
    fundraising_interest: z.string().optional(),
    sponsorship_interest: z.string().optional(),
    timing: z.string().optional(),
    season_start: z.string().optional(),
    design_stage: z.string().optional(),
    budget_range: z.string().optional(),
    notes: z.string().optional(),
    approval_process: z.string().optional(),
    main_concern: z.string().optional(),
    school_event_date: z.string().optional(),
    slt_friendly: z.string().optional(),
    team_store_interest: z.string().optional(),
    team_store_audience: z.string().optional(),
    team_store_goal: z.string().optional(),
  });

  app.post("/api/ghl/submit-project", async (req, res) => {
    try {
      const parsed = projectSubmissionSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.errors[0]?.message || "Invalid submission data";
        return res.status(400).json({ error: firstError });
      }

      const payload = parsed.data;

      const enriched = {
        ...payload,
        source: "sidelinenz.com start-a-project",
        submitted_at: new Date().toISOString(),
      };

      const result = await createGhlContact(enriched, ["Website Lead", "Start a Project"]);
      
      if (!result.success && result.reason === "credentials_missing") {
        console.log("GHL not configured - form data logged above");
      }

      res.json({ ok: true, id: result.contactId || crypto.randomUUID() });
    } catch (e: any) {
      console.error("Submit project error:", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  const contactFormSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Valid email is required"),
    phone: z.string().min(1, "Phone is required"),
    enquiry_type: z.string().optional(),
    message: z.string().optional(),
  });

  app.post("/api/ghl/contact", async (req, res) => {
    try {
      const parsed = contactFormSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.errors[0]?.message || "Invalid submission data";
        return res.status(400).json({ error: firstError });
      }

      const payload = parsed.data;
      
      const enriched = {
        ...payload,
        source: "sidelinenz.com contact-form",
        submitted_at: new Date().toISOString(),
      };

      const result = await createGhlContact(enriched, ["Website Lead", "Contact Form"]);
      
      if (!result.success && result.reason === "credentials_missing") {
        console.log("GHL not configured - form data logged above");
      }

      res.json({ ok: true, id: result.contactId || crypto.randomUUID() });
    } catch (e: any) {
      console.error("Contact form error:", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  const mockupRequestSchema = z.object({
    club_name: z.string().min(1, "Club name is required"),
    sport: z.string().min(1, "Sport is required"),
    email: z.string().email("Valid email is required"),
  });

  app.post("/api/ghl/mockup-request", async (req, res) => {
    try {
      const parsed = mockupRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.errors[0]?.message || "Invalid submission data";
        return res.status(400).json({ error: firstError });
      }

      const payload = parsed.data;

      const enriched = {
        organization: payload.club_name,
        sports: payload.sport,
        email: payload.email,
        mockup_interest: "Yes please",
        source: "sidelinenz.com hub-mockup-form",
        submitted_at: new Date().toISOString(),
      };

      const result = await createGhlContact(enriched, ["Website Lead", "Free Mockup Request"]);

      if (!result.success && result.reason === "credentials_missing") {
        console.log("GHL not configured - mockup request logged above");
      }

      res.json({ ok: true, id: result.contactId || crypto.randomUUID() });
    } catch (e: any) {
      console.error("Mockup request error:", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  // ====== GHL PRODUCT SYNC ======
  // Webhook endpoint for GHL to send product updates
  // This creates/updates products in Stripe when products are added/modified in GHL
  const ghlProductSchema = z.object({
    action: z.enum(["create", "update", "delete"]).default("create"),
    ghl_product_id: z.string(),
    store_slug: z.string(),
    name: z.string(),
    description: z.string().optional(),
    price: z.number(), // Price in dollars (will be converted to cents)
    image_url: z.string().optional(),
    sizes: z.array(z.string()).optional().default(["XS", "S", "M", "L", "XL", "2XL"]),
    category: z.string().optional(),
  });

  app.post("/api/ghl/product-sync", async (req, res) => {
    try {
      // Verify webhook secret for security
      const webhookSecret = process.env.GHL_PRODUCT_WEBHOOK_SECRET;
      const providedSecret = req.headers["x-ghl-secret"] as string;
      
      if (webhookSecret && providedSecret !== webhookSecret) {
        console.error("GHL product sync: Invalid webhook secret");
        return res.status(401).json({ error: "Unauthorized" });
      }

      const payload = ghlProductSchema.parse(req.body);
      console.log("GHL product sync received:", payload);

      // Handle delete action
      if (payload.action === "delete") {
        const existing = await storage.getGhlProduct(payload.ghl_product_id);
        if (existing?.stripeProductId) {
          // Deactivate in Stripe
          const stripe = await getUncachableStripeClient();
          await stripe.products.update(existing.stripeProductId, { active: false });
        }
        await storage.deactivateGhlProduct(payload.ghl_product_id);
        return res.json({ success: true, action: "deleted" });
      }

      // Check if product already exists
      const existing = await storage.getGhlProduct(payload.ghl_product_id);
      const priceInCents = Math.round(payload.price * 100);

      const stripe = await getUncachableStripeClient();

      if (existing) {
        // Update existing product
        if (existing.stripeProductId) {
          await stripe.products.update(existing.stripeProductId, {
            name: payload.name,
            description: payload.description || undefined,
            images: payload.image_url ? [payload.image_url] : undefined,
            metadata: {
              store_slug: payload.store_slug,
              category: payload.category || "",
              ghl_product_id: payload.ghl_product_id,
            },
          });

          // Check if price or sizes changed - need to recreate price records
          const existingSizes = existing.sizes || [];
          const sizesChanged = JSON.stringify(existingSizes.sort()) !== JSON.stringify([...payload.sizes].sort());
          const priceChanged = priceInCents !== existing.priceInCents;
          
          if (priceChanged || sizesChanged) {
            // Deactivate old prices
            const oldPriceIds = existing.stripePriceIds as Record<string, string> || {};
            for (const priceId of Object.values(oldPriceIds)) {
              await stripe.prices.update(priceId, { active: false });
            }

            // Create new prices for each size
            const newPriceIds: Record<string, string> = {};
            for (const size of payload.sizes) {
              const price = await stripe.prices.create({
                product: existing.stripeProductId,
                unit_amount: priceInCents,
                currency: "nzd",
                metadata: { size },
              });
              newPriceIds[size] = price.id;
            }

            await storage.updateGhlProduct(payload.ghl_product_id, {
              name: payload.name,
              description: payload.description,
              imageUrl: payload.image_url,
              priceInCents,
              sizes: payload.sizes,
              category: payload.category,
              stripePriceIds: newPriceIds,
            });
          } else {
            await storage.updateGhlProduct(payload.ghl_product_id, {
              name: payload.name,
              description: payload.description,
              imageUrl: payload.image_url,
              category: payload.category,
            });
          }
        }

        return res.json({ success: true, action: "updated", stripeProductId: existing.stripeProductId });
      }

      // Create new Stripe product
      const stripeProduct = await stripe.products.create({
        name: payload.name,
        description: payload.description || undefined,
        images: payload.image_url ? [payload.image_url] : undefined,
        metadata: {
          store_slug: payload.store_slug,
          category: payload.category || "",
          ghl_product_id: payload.ghl_product_id,
        },
      });

      // Create prices for each size
      const stripePriceIds: Record<string, string> = {};
      for (const size of payload.sizes) {
        const price = await stripe.prices.create({
          product: stripeProduct.id,
          unit_amount: priceInCents,
          currency: "nzd",
          metadata: { size },
        });
        stripePriceIds[size] = price.id;
      }

      // Save to GHL products table
      await storage.createGhlProduct({
        ghlProductId: payload.ghl_product_id,
        stripeProductId: stripeProduct.id,
        storeSlug: payload.store_slug,
        name: payload.name,
        description: payload.description,
        imageUrl: payload.image_url,
        priceInCents,
        sizes: payload.sizes,
        category: payload.category,
        active: true,
        stripePriceIds,
      });

      console.log(`GHL product created in Stripe: ${stripeProduct.id}`);
      res.json({ success: true, action: "created", stripeProductId: stripeProduct.id });
    } catch (e: any) {
      console.error("GHL product sync error:", e);
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  // Get GHL products for a store (useful for debugging)
  app.get("/api/ghl/products/:storeSlug", async (req, res) => {
    try {
      const products = await storage.getGhlProductsByStore(req.params.storeSlug);
      res.json({ data: products });
    } catch (e: any) {
      console.error("GHL products error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ====== STRIPE CONFIG ======
  app.get("/api/stripe/config", async (req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (e: any) {
      console.error("Stripe config error:", e);
      res.status(500).json({ error: "Stripe not configured" });
    }
  });

  // ====== PRODUCTS ======
  app.get("/api/products", async (req, res) => {
    try {
      const storeSlug = req.query.store as string | undefined;
      const products = await storage.getStripeProducts(storeSlug);
      
      // Group by product and include price metadata for size variants
      const grouped = products.reduce((acc: any, row: any) => {
        if (!acc[row.id]) {
          acc[row.id] = {
            id: row.id,
            name: row.name,
            description: row.description,
            images: row.images,
            metadata: row.metadata,
            prices: []
          };
        }
        if (row.price_id) {
          acc[row.id].prices.push({
            id: row.price_id,
            unitAmount: row.unit_amount,
            currency: row.currency,
            metadata: row.price_metadata // Include price metadata for size info
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

  app.get("/api/products/:productId", async (req, res) => {
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
          metadata: p.metadata
        }))
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

  // Get or create cart
  app.get("/api/cart", async (req, res) => {
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
      
      const subtotal = items.reduce((sum, item) => sum + (item.unitAmount * item.quantity), 0);
      
      res.json({
        id: cart.id,
        storeSlug: cart.storeSlug,
        items,
        subtotal,
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0)
      });
    } catch (e: any) {
      console.error("Cart error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Add item to cart
  app.post("/api/cart/items", async (req, res) => {
    try {
      const sessionId = req.headers["x-session-id"] as string;
      const storeSlug = req.query.store as string;
      
      if (!sessionId || !storeSlug) {
        return res.status(400).json({ error: "Session ID and store slug required" });
      }
      
      const itemData = cartItemSchema.parse(req.body);
      
      // Get or create cart
      let cart = await storage.getCartBySession(sessionId, storeSlug);
      if (!cart) {
        cart = await storage.createCart({ sessionId, storeSlug });
      }
      
      const item = await storage.addCartItem({
        cartId: cart.id,
        ...itemData
      });
      
      const items = await storage.getCartItems(cart.id);
      const subtotal = items.reduce((sum, i) => sum + (i.unitAmount * i.quantity), 0);
      
      res.json({
        id: cart.id,
        items,
        subtotal,
        itemCount: items.reduce((sum, i) => sum + i.quantity, 0)
      });
    } catch (e: any) {
      console.error("Add to cart error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Update cart item quantity
  app.patch("/api/cart/items/:itemId", async (req, res) => {
    try {
      const sessionId = req.headers["x-session-id"] as string;
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }
      
      const { quantity } = req.body;
      
      // Validate quantity
      if (typeof quantity !== "number" || quantity < 0) {
        return res.status(400).json({ error: "Invalid quantity" });
      }
      
      // Get the item and verify it belongs to user's cart
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

  // Remove item from cart
  app.delete("/api/cart/items/:itemId", async (req, res) => {
    try {
      const sessionId = req.headers["x-session-id"] as string;
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }
      
      // Get the item and verify it belongs to user's cart
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
  app.post("/api/checkout", async (req, res) => {
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
      
      // Calculate totals
      const subtotal = items.reduce((sum, item) => sum + (item.unitAmount * item.quantity), 0);
      const shipping = 850; // $8.50 flat rate
      const total = subtotal + shipping;
      
      // Create order
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
      
      // Create order items
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
      
      // Create Stripe Checkout Session
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      
      const checkoutSession = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: items.map(item => ({
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
      
      // Update order with checkout session ID
      await storage.updateOrderStatus(order.id, "pending");
      
      // Store checkout session ID on order (direct DB update)
      const { db } = await import("./db");
      const { orders } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(orders)
        .set({ stripeCheckoutSessionId: checkoutSession.id })
        .where(eq(orders.id, order.id));
      
      // Clear cart
      await storage.clearCart(cart.id);
      
      res.json({ url: checkoutSession.url, orderNumber: order.orderNumber });
    } catch (e: any) {
      console.error("Checkout error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ====== ORDERS ======
  app.get("/api/orders", async (req, res) => {
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

  app.get("/api/orders/:orderNumber", async (req, res) => {
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

  // ── Shopify Storefront API Proxy ──
  const SHOPIFY_STORE_URL = process.env.VITE_SHOPIFY_STORE_URL || "";
  const SHOPIFY_TOKEN = process.env.VITE_SHOPIFY_TOKEN || "";
  const shopifyEndpoint = `https://${SHOPIFY_STORE_URL}/api/2024-01/graphql.json`;

  async function shopifyFetch(query: string, variables?: Record<string, unknown>) {
    const res = await fetch(shopifyEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": SHOPIFY_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error("Shopify API error: " + res.status);
    const json = await res.json();
    if (json.errors) throw new Error("Shopify GraphQL error: " + JSON.stringify(json.errors));
    return json.data;
  }

  app.get("/api/shopify/collections", async (_req, res) => {
    try {
      const data = await shopifyFetch(`
        query { collections(first: 50) { edges { node {
          handle title description image { url altText }
        } } } }
      `);
      res.json(data.collections.edges.map((e: any) => e.node));
    } catch (e: any) {
      console.error("Shopify collections error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/shopify/collections/:handle", async (req, res) => {
    try {
      const data = await shopifyFetch(`
        query CollectionByHandle($handle: String!) {
          collection(handle: $handle) {
            handle title description image { url altText }
            products(first: 50) { edges { node {
              id handle title description tags
              featuredImage { url altText }
              priceRange { minVariantPrice { amount currencyCode } }
              variants(first: 20) { edges { node { id title availableForSale price { amount currencyCode } } } }
            } } }
          }
        }
      `, { handle: req.params.handle });
      if (!data.collection) return res.status(404).json({ error: "Collection not found" });
      res.json({
        collection: {
          handle: data.collection.handle,
          title: data.collection.title,
          description: data.collection.description,
          image: data.collection.image,
        },
        products: data.collection.products.edges.map((e: any) => e.node),
      });
    } catch (e: any) {
      console.error("Shopify collection error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/shopify/products", async (_req, res) => {
    try {
      const productFragment = `id handle title description tags featuredImage { url altText } priceRange { minVariantPrice { amount currencyCode } } variants(first: 20) { edges { node { id title availableForSale price { amount currencyCode } } } }`;

      const featuredData = await shopifyFetch(`
        query { products(first: 10, query: "tag:featured") { edges { node { ${productFragment} } } } }
      `);
      const featured = featuredData.products.edges.map((e: any) => e.node);
      if (featured.length > 0) return res.json(featured);

      const allData = await shopifyFetch(`
        query { products(first: 10) { edges { node { ${productFragment} } } } }
      `);
      res.json(allData.products.edges.map((e: any) => e.node));
    } catch (e: any) {
      console.error("Shopify products error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}
