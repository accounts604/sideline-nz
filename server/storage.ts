import { 
  type User, type InsertUser, 
  type Cart, type InsertCart,
  type CartItem, type InsertCartItem,
  type Order, type InsertOrder,
  type OrderItem, type InsertOrderItem,
  type GhlProduct, type InsertGhlProduct,
  users, carts, cartItems, orders, orderItems, ghlProducts 
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserStripeInfo(userId: string, stripeCustomerId: string): Promise<User | undefined>;
  
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

  // Stripe data queries (from stripe schema managed by stripe-replit-sync)
  async getStripeProducts(storeSlug?: string): Promise<any[]> {
    // Query products from stripe schema, optionally filtered by metadata.store_slug
    // Include price metadata for size information
    if (storeSlug) {
      const result = await db.execute(sql`
        SELECT p.*, pr.id as price_id, pr.unit_amount, pr.currency, pr.metadata as price_metadata
        FROM stripe.products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true AND p.metadata->>'store_slug' = ${storeSlug}
        ORDER BY p.name
      `);
      return result.rows;
    }
    
    const result = await db.execute(sql`
      SELECT p.*, pr.id as price_id, pr.unit_amount, pr.currency, pr.metadata as price_metadata
      FROM stripe.products p
      LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true
      ORDER BY p.name
    `);
    return result.rows;
  }

  async getStripeProduct(productId: string): Promise<any> {
    const result = await db.execute(sql`
      SELECT p.*, pr.id as price_id, pr.unit_amount, pr.currency
      FROM stripe.products p
      LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.id = ${productId}
    `);
    return result.rows[0] || null;
  }

  async getStripePrices(productId: string): Promise<any[]> {
    const result = await db.execute(sql`
      SELECT * FROM stripe.prices 
      WHERE product = ${productId} AND active = true
      ORDER BY unit_amount
    `);
    return result.rows;
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
}

export const storage = new DatabaseStorage();
