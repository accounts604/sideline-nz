import {
  type User, type InsertUser,
  type Cart, type InsertCart,
  type CartItem, type InsertCartItem,
  type Order, type InsertOrder,
  type OrderItem, type InsertOrderItem,
  type GhlProduct, type InsertGhlProduct,
  type DesignFile, type InsertDesignFile,
  type DesignComment, type InsertDesignComment,
  type Notification, type InsertNotification,
  users, carts, cartItems, orders, orderItems, ghlProducts,
  designFiles, designComments, notifications
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, desc, count, ilike } from "drizzle-orm";
import { getStripeClient } from "./stripeClient";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByInviteToken(token: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserStripeInfo(userId: string, stripeCustomerId: string): Promise<User | undefined>;
  acceptInvite(userId: string, hashedPassword: string): Promise<User | undefined>;
  linkOrdersByEmail(email: string, userId: string): Promise<void>;
  
  // Carts
  getCart(id: string): Promise<Cart | undefined>;
  getCartBySession(sessionId: string, storeSlug: string): Promise<Cart | undefined>;
  createCart(cart: InsertCart): Promise<Cart>;
  
  // Cart Items
  getCartItems(cartId: string): Promise<CartItem[]>;
  getCartItem(id: string): Promise<CartItem | undefined>;
  addCartItem(item: InsertCartItem): Promise<CartItem>;
  updateCartItemQuantity(id: string, quantity: number): Promise<CartItem | undefined>;
  removeCartItem(id: string): Promise<void>;
  clearCart(cartId: string): Promise<void>;
  
  // Orders
  getOrder(id: string): Promise<Order | undefined>;
  getOrderByNumber(orderNumber: string): Promise<Order | undefined>;
  getOrderByCheckoutSession(checkoutSessionId: string): Promise<Order | undefined>;
  getOrdersBySession(sessionId: string): Promise<Order[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrderStatus(id: string, status: string): Promise<Order | undefined>;
  
  // Order Items
  getOrderItems(orderId: string): Promise<OrderItem[]>;
  createOrderItem(item: InsertOrderItem): Promise<OrderItem>;
  
  // Stripe data queries (from stripe schema)
  getStripeProducts(storeSlug?: string): Promise<any[]>;
  getStripeProduct(productId: string): Promise<any>;
  getStripePrices(productId: string): Promise<any[]>;
  
  // GHL Product mapping
  getGhlProduct(ghlProductId: string): Promise<GhlProduct | undefined>;
  getGhlProductsByStore(storeSlug: string): Promise<GhlProduct[]>;
  createGhlProduct(product: InsertGhlProduct): Promise<GhlProduct>;
  updateGhlProduct(ghlProductId: string, data: Partial<InsertGhlProduct>): Promise<GhlProduct | undefined>;
  deactivateGhlProduct(ghlProductId: string): Promise<void>;

  // Admin queries
  getAllOrders(opts: { status?: string; designStatus?: string; search?: string; limit?: number; offset?: number }): Promise<{ orders: Order[]; total: number }>;
  getOrderWithDetails(orderId: string): Promise<{ order: Order; items: OrderItem[]; designs: DesignFile[]; comments: DesignComment[] } | null>;
  updateOrder(orderId: string, data: { status?: string; designStatus?: string; adminNotes?: string }): Promise<Order | undefined>;
  getAllCustomers(opts: { search?: string; limit?: number; offset?: number }): Promise<{ customers: User[]; total: number }>;
  getCustomerWithOrders(userId: string): Promise<{ customer: User; orders: Order[] } | null>;
  updateCustomer(userId: string, data: { teamName?: string; contactPhone?: string }): Promise<User | undefined>;
  createInvite(email: string, teamName?: string): Promise<User>;
  getOrdersByUser(userId: string): Promise<Order[]>;

  // Dashboard stats
  getDashboardStats(): Promise<{ totalOrders: number; pendingOrders: number; pendingDesigns: number; totalCustomers: number }>;

  // Design files
  getDesignFile(id: string): Promise<DesignFile | undefined>;
  getDesignFilesByOrder(orderId: string): Promise<DesignFile[]>;
  getPendingDesignFiles(): Promise<(DesignFile & { orderNumber?: string | null; customerEmail?: string | null })[]>;
  createDesignFile(file: InsertDesignFile): Promise<DesignFile>;
  updateDesignFileStatus(id: string, status: string): Promise<DesignFile | undefined>;

  // Design comments
  getDesignComments(designFileId: string): Promise<DesignComment[]>;
  createDesignComment(comment: InsertDesignComment): Promise<DesignComment>;

  // Notifications
  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserStripeInfo(userId: string, stripeCustomerId: string): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ stripeCustomerId })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByInviteToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.inviteToken, token));
    return user;
  }

  async acceptInvite(userId: string, hashedPassword: string): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({
        password: hashedPassword,
        inviteToken: null,
        inviteExpiresAt: null,
        emailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async linkOrdersByEmail(email: string, userId: string): Promise<void> {
    await db.update(orders)
      .set({ userId })
      .where(and(eq(orders.customerEmail, email), sql`${orders.userId} IS NULL`));
  }

  // Carts
  async getCart(id: string): Promise<Cart | undefined> {
    const [cart] = await db.select().from(carts).where(eq(carts.id, id));
    return cart;
  }

  async getCartBySession(sessionId: string, storeSlug: string): Promise<Cart | undefined> {
    const [cart] = await db.select().from(carts)
      .where(and(eq(carts.sessionId, sessionId), eq(carts.storeSlug, storeSlug)));
    return cart;
  }

  async createCart(cart: InsertCart): Promise<Cart> {
    const [newCart] = await db.insert(carts).values(cart).returning();
    return newCart;
  }

  // Cart Items
  async getCartItems(cartId: string): Promise<CartItem[]> {
    return await db.select().from(cartItems).where(eq(cartItems.cartId, cartId));
  }

  async getCartItem(id: string): Promise<CartItem | undefined> {
    const [item] = await db.select().from(cartItems).where(eq(cartItems.id, id));
    return item;
  }

  async addCartItem(item: InsertCartItem): Promise<CartItem> {
    // Check if item already exists with same product, price, and size
    const existing = await db.select().from(cartItems)
      .where(and(
        eq(cartItems.cartId, item.cartId),
        eq(cartItems.productId, item.productId),
        eq(cartItems.priceId, item.priceId),
        item.size ? eq(cartItems.size, item.size) : sql`${cartItems.size} IS NULL`
      ));
    
    if (existing.length > 0) {
      // Update quantity
      const [updated] = await db.update(cartItems)
        .set({ quantity: existing[0].quantity + (item.quantity || 1) })
        .where(eq(cartItems.id, existing[0].id))
        .returning();
      return updated;
    }
    
    const [newItem] = await db.insert(cartItems).values(item).returning();
    return newItem;
  }

  async updateCartItemQuantity(id: string, quantity: number): Promise<CartItem | undefined> {
    const [item] = await db.update(cartItems)
      .set({ quantity })
      .where(eq(cartItems.id, id))
      .returning();
    return item;
  }

  async removeCartItem(id: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.id, id));
  }

  async clearCart(cartId: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.cartId, cartId));
  }

  // Orders
  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async getOrderByNumber(orderNumber: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));
    return order;
  }

  async getOrderByCheckoutSession(checkoutSessionId: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders)
      .where(eq(orders.stripeCheckoutSessionId, checkoutSessionId));
    return order;
  }

  async getOrdersBySession(sessionId: string): Promise<Order[]> {
    return await db.select().from(orders)
      .where(eq(orders.sessionId, sessionId))
      .orderBy(sql`${orders.createdAt} DESC`);
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [newOrder] = await db.insert(orders).values(order).returning();
    return newOrder;
  }

  async updateOrderStatus(id: string, status: string): Promise<Order | undefined> {
    const [order] = await db.update(orders)
      .set({ status, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return order;
  }

  // Order Items
  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    return await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  }

  async createOrderItem(item: InsertOrderItem): Promise<OrderItem> {
    const [newItem] = await db.insert(orderItems).values(item).returning();
    return newItem;
  }

  // Stripe data queries (direct Stripe API — replaces stripe-replit-sync)
  async getStripeProducts(storeSlug?: string): Promise<any[]> {
    try {
      const stripe = getStripeClient();
      const products = await stripe.products.list({ active: true, limit: 100 });

      const filtered = storeSlug
        ? products.data.filter((p) => p.metadata?.store_slug === storeSlug)
        : products.data;

      // Fetch prices for all products in parallel
      const results: any[] = [];
      for (const product of filtered) {
        const prices = await stripe.prices.list({ product: product.id, active: true, limit: 50 });
        if (prices.data.length === 0) {
          results.push({
            id: product.id,
            name: product.name,
            description: product.description,
            images: product.images,
            metadata: product.metadata,
            price_id: null,
            unit_amount: null,
            currency: null,
            price_metadata: null,
          });
        } else {
          for (const price of prices.data) {
            results.push({
              id: product.id,
              name: product.name,
              description: product.description,
              images: product.images,
              metadata: product.metadata,
              price_id: price.id,
              unit_amount: price.unit_amount,
              currency: price.currency,
              price_metadata: price.metadata,
            });
          }
        }
      }
      return results;
    } catch (err) {
      console.error("getStripeProducts error:", err);
      return [];
    }
  }

  async getStripeProduct(productId: string): Promise<any> {
    try {
      const stripe = getStripeClient();
      const product = await stripe.products.retrieve(productId);
      const prices = await stripe.prices.list({ product: productId, active: true, limit: 50 });

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        images: product.images,
        metadata: product.metadata,
        prices: prices.data,
        price_id: prices.data[0]?.id || null,
        unit_amount: prices.data[0]?.unit_amount || null,
        currency: prices.data[0]?.currency || null,
      };
    } catch (err) {
      console.error("getStripeProduct error:", err);
      return null;
    }
  }

  async getStripePrices(productId: string): Promise<any[]> {
    try {
      const stripe = getStripeClient();
      const prices = await stripe.prices.list({
        product: productId,
        active: true,
        limit: 50,
      });
      return prices.data.map((p) => ({
        id: p.id,
        unit_amount: p.unit_amount,
        currency: p.currency,
        metadata: p.metadata,
      }));
    } catch (err) {
      console.error("getStripePrices error:", err);
      return [];
    }
  }

  // GHL Product mapping
  async getGhlProduct(ghlProductId: string): Promise<GhlProduct | undefined> {
    const [product] = await db.select().from(ghlProducts).where(eq(ghlProducts.ghlProductId, ghlProductId));
    return product;
  }

  async getGhlProductsByStore(storeSlug: string): Promise<GhlProduct[]> {
    return await db.select().from(ghlProducts)
      .where(and(eq(ghlProducts.storeSlug, storeSlug), eq(ghlProducts.active, true)));
  }

  async createGhlProduct(product: InsertGhlProduct): Promise<GhlProduct> {
    const [newProduct] = await db.insert(ghlProducts).values(product).returning();
    return newProduct;
  }

  async updateGhlProduct(ghlProductId: string, data: Partial<InsertGhlProduct>): Promise<GhlProduct | undefined> {
    const [updated] = await db.update(ghlProducts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(ghlProducts.ghlProductId, ghlProductId))
      .returning();
    return updated;
  }

  async deactivateGhlProduct(ghlProductId: string): Promise<void> {
    await db.update(ghlProducts)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(ghlProducts.ghlProductId, ghlProductId));
  }

  // Admin queries
  async getAllOrders(opts: { status?: string; designStatus?: string; search?: string; limit?: number; offset?: number }): Promise<{ orders: Order[]; total: number }> {
    const conditions = [];
    if (opts.status) conditions.push(eq(orders.status, opts.status));
    if (opts.designStatus) conditions.push(eq(orders.designStatus, opts.designStatus));
    if (opts.search) {
      conditions.push(
        sql`(${orders.orderNumber} ILIKE ${'%' + opts.search + '%'} OR ${orders.customerEmail} ILIKE ${'%' + opts.search + '%'} OR ${orders.customerName} ILIKE ${'%' + opts.search + '%'})`
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db.select({ count: count() }).from(orders).where(where);
    const result = await db.select().from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(opts.limit || 50)
      .offset(opts.offset || 0);

    return { orders: result, total: totalResult.count };
  }

  async getOrderWithDetails(orderId: string): Promise<{ order: Order; items: OrderItem[]; designs: DesignFile[]; comments: DesignComment[] } | null> {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) return null;

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const designs = await db.select().from(designFiles).where(eq(designFiles.orderId, orderId)).orderBy(desc(designFiles.createdAt));

    const designIds = designs.map(d => d.id);
    let comments: DesignComment[] = [];
    if (designIds.length > 0) {
      comments = await db.select().from(designComments)
        .where(sql`${designComments.designFileId} IN (${sql.join(designIds.map(id => sql`${id}`), sql`, `)})`)
        .orderBy(desc(designComments.createdAt));
    }

    return { order, items, designs, comments };
  }

  async updateOrder(orderId: string, data: { status?: string; designStatus?: string; adminNotes?: string }): Promise<Order | undefined> {
    const [order] = await db.update(orders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
    return order;
  }

  async getAllCustomers(opts: { search?: string; limit?: number; offset?: number }): Promise<{ customers: User[]; total: number }> {
    const conditions = [eq(users.role, "customer")];
    if (opts.search) {
      conditions.push(
        sql`(${users.email} ILIKE ${'%' + opts.search + '%'} OR ${users.teamName} ILIKE ${'%' + opts.search + '%'})`
      );
    }
    const where = and(...conditions);

    const [totalResult] = await db.select({ count: count() }).from(users).where(where);
    const result = await db.select().from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(opts.limit || 50)
      .offset(opts.offset || 0);

    return { customers: result, total: totalResult.count };
  }

  async getCustomerWithOrders(userId: string): Promise<{ customer: User; orders: Order[] } | null> {
    const [customer] = await db.select().from(users).where(eq(users.id, userId));
    if (!customer) return null;

    const customerOrders = await db.select().from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));

    return { customer, orders: customerOrders };
  }

  async updateCustomer(userId: string, data: { teamName?: string; contactPhone?: string }): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async createInvite(email: string, teamName?: string): Promise<User> {
    const crypto = await import("crypto");
    const inviteToken = crypto.randomBytes(32).toString("hex");
    const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [user] = await db.insert(users).values({
      username: email,
      email,
      password: "", // No password until invite accepted
      role: "customer",
      teamName: teamName || null,
      inviteToken,
      inviteExpiresAt,
    }).returning();
    return user;
  }

  async getOrdersByUser(userId: string): Promise<Order[]> {
    return await db.select().from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));
  }

  // Dashboard stats
  async getDashboardStats(): Promise<{ totalOrders: number; pendingOrders: number; pendingDesigns: number; totalCustomers: number }> {
    const [totalOrders] = await db.select({ count: count() }).from(orders);
    const [pendingOrders] = await db.select({ count: count() }).from(orders).where(eq(orders.status, "pending"));
    const [pendingDesigns] = await db.select({ count: count() }).from(designFiles).where(eq(designFiles.status, "pending"));
    const [totalCustomers] = await db.select({ count: count() }).from(users).where(eq(users.role, "customer"));

    return {
      totalOrders: totalOrders.count,
      pendingOrders: pendingOrders.count,
      pendingDesigns: pendingDesigns.count,
      totalCustomers: totalCustomers.count,
    };
  }

  // Design files
  async getDesignFile(id: string): Promise<DesignFile | undefined> {
    const [file] = await db.select().from(designFiles).where(eq(designFiles.id, id));
    return file;
  }

  async getDesignFilesByOrder(orderId: string): Promise<DesignFile[]> {
    return await db.select().from(designFiles)
      .where(eq(designFiles.orderId, orderId))
      .orderBy(desc(designFiles.createdAt));
  }

  async getPendingDesignFiles(): Promise<(DesignFile & { orderNumber?: string | null; customerEmail?: string | null })[]> {
    const result = await db.select({
      id: designFiles.id,
      orderId: designFiles.orderId,
      userId: designFiles.userId,
      label: designFiles.label,
      fileName: designFiles.fileName,
      fileUrl: designFiles.fileUrl,
      fileSize: designFiles.fileSize,
      mimeType: designFiles.mimeType,
      status: designFiles.status,
      version: designFiles.version,
      parentFileId: designFiles.parentFileId,
      createdAt: designFiles.createdAt,
      orderNumber: orders.orderNumber,
      customerEmail: orders.customerEmail,
    })
      .from(designFiles)
      .leftJoin(orders, eq(designFiles.orderId, orders.id))
      .where(eq(designFiles.status, "pending"))
      .orderBy(desc(designFiles.createdAt));

    return result;
  }

  async createDesignFile(file: InsertDesignFile): Promise<DesignFile> {
    const [newFile] = await db.insert(designFiles).values(file).returning();
    return newFile;
  }

  async updateDesignFileStatus(id: string, status: string): Promise<DesignFile | undefined> {
    const [file] = await db.update(designFiles)
      .set({ status })
      .where(eq(designFiles.id, id))
      .returning();
    return file;
  }

  // Design comments
  async getDesignComments(designFileId: string): Promise<DesignComment[]> {
    return await db.select().from(designComments)
      .where(eq(designComments.designFileId, designFileId))
      .orderBy(desc(designComments.createdAt));
  }

  async createDesignComment(comment: InsertDesignComment): Promise<DesignComment> {
    const [newComment] = await db.insert(designComments).values(comment).returning();
    return newComment;
  }

  // Notifications
  async getNotifications(userId: string): Promise<Notification[]> {
    return await db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [n] = await db.insert(notifications).values(notification).returning();
    return n;
  }

  async markNotificationRead(id: string): Promise<void> {
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
  }
}

export const storage = new DatabaseStorage();
