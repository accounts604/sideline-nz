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
  type OrderSizeBreakdown, type InsertOrderSizeBreakdown,
  type ProductionStage, type InsertProductionStage,
  type QualityCheck, type InsertQualityCheck,
  type OrderMessage, type InsertOrderMessage,
  type OrderActivity, type InsertOrderActivity,
  type ClubAccount, type InsertClubAccount,
  type SupplierPrice, type InsertSupplierPrice,
  users, carts, cartItems, orders, orderItems, ghlProducts,
  designFiles, designComments, notifications,
  orderSizeBreakdowns, productionStages, qualityChecks, orderMessages, orderActivity,
  clubAccounts, supplierPrices,
  clubLogoAssets,
  type ClubLogoAsset, type InsertClubLogoAsset,
  clubBrandIdentity,
  type ClubBrandIdentity, type InsertClubBrandIdentity,
  clubs,
  type Club, type InsertClub,
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

  // Club Accounts (Club Portal)
  getClubAccount(id: string): Promise<ClubAccount | undefined>;
  getClubAccountByEmail(email: string): Promise<ClubAccount | undefined>;
  getAllClubAccounts(): Promise<ClubAccount[]>;
  createClubAccount(account: InsertClubAccount): Promise<ClubAccount>;
  updateClubAccount(id: string, data: Partial<InsertClubAccount>): Promise<ClubAccount | undefined>;
  getClubOrder(clubAccountId: string): Promise<Order | undefined>;

  // Club logo assets
  listClubLogoAssets(clubAccountId: string): Promise<ClubLogoAsset[]>;
  getPrimaryClubLogo(clubAccountId: string): Promise<ClubLogoAsset | undefined>;
  createClubLogoAsset(data: InsertClubLogoAsset): Promise<ClubLogoAsset>;
  updateClubLogoAsset(id: string, data: Partial<InsertClubLogoAsset>): Promise<ClubLogoAsset | undefined>;
  deleteClubLogoAsset(id: string): Promise<boolean>;
  listClubsMissingPrimaryLogo(): Promise<Array<{ id: string; clubName: string; shopifyOrderTag: string | null }>>;

  // Club brand identity (Sideline Studio) — 1:1 brand header per club.
  getClubBrandIdentity(clubAccountId: string): Promise<ClubBrandIdentity | undefined>;
  ensureClubBrandIdentity(clubAccountId: string, seed?: Partial<InsertClubBrandIdentity>): Promise<ClubBrandIdentity>;
  updateClubBrandIdentity(clubAccountId: string, data: Partial<InsertClubBrandIdentity>): Promise<ClubBrandIdentity | undefined>;

  // Clubs / Teams — club/school owns the shared primary; teams link via clubId.
  getClubForTeam(clubAccountId: string): Promise<Club | undefined>;
  ensureClub(name: string, kind?: string): Promise<Club>;
  linkTeamToClub(clubAccountId: string, clubId: string): Promise<void>;
  setClubPrimaryLogo(clubId: string, url: string, label?: string): Promise<void>;
  ensureTeam(clubId: string, name: string): Promise<string>;
  ensureRepAccountForClub(clubId: string): Promise<string | null>;

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
  updateOrderItem(id: string, data: Partial<InsertOrderItem>): Promise<OrderItem | undefined>;
  
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
  getAllOrders(opts: {
    status?: string;
    stage?: string;
    designStatus?: string;
    search?: string;
    createdFrom?: string;
    createdTo?: string;
    dueFrom?: string;
    dueTo?: string;
    overdue?: boolean;
    sortBy?: "createdAt" | "dueDate";
    sortDir?: "asc" | "desc";
    limit?: number;
    offset?: number;
  }): Promise<{ orders: Order[]; total: number }>;
  getOrderWithDetails(orderId: string): Promise<{
    order: Order; items: OrderItem[]; designs: DesignFile[]; comments: DesignComment[];
    sizeBreakdowns: OrderSizeBreakdown[]; stages: ProductionStage[];
    qcChecks: QualityCheck[]; messages: OrderMessage[]; activity: OrderActivity[];
  } | null>;
  updateOrder(orderId: string, data: Partial<Record<string, any>>): Promise<Order | undefined>;
  deleteOrder(orderId: string): Promise<boolean>;
  deleteOrderItem(itemId: string): Promise<boolean>;
  getAllCustomers(opts: { search?: string; limit?: number; offset?: number }): Promise<{ customers: User[]; total: number }>;
  getCustomerWithOrders(userId: string): Promise<{ customer: User; orders: Order[] } | null>;
  updateCustomer(userId: string, data: { teamName?: string; contactPhone?: string; ghlContactId?: string }): Promise<User | undefined>;
  createInvite(email: string, teamName?: string, role?: "customer" | "supplier", ghlContactId?: string, contactPhone?: string): Promise<User>;
  getOrdersByUser(userId: string): Promise<Order[]>;
  getOrdersByAssignedSupplier(supplierId: string): Promise<Order[]>;
  listSuppliers(): Promise<User[]>;
  findSupplierForCategory(category: string): Promise<User | undefined>;
  updateSupplierCategories(supplierId: string, categories: string[]): Promise<User | undefined>;

  // Supplier pricelist
  listSupplierPrices(supplierId: string): Promise<SupplierPrice[]>;
  createSupplierPrice(price: InsertSupplierPrice): Promise<SupplierPrice>;
  updateSupplierPrice(id: string, data: Partial<InsertSupplierPrice>): Promise<SupplierPrice | undefined>;
  deleteSupplierPrice(id: string): Promise<void>;
  findSupplierPriceForLine(supplierId: string, productType: string, sizeOrVariant: string | null): Promise<SupplierPrice | undefined>;

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

  // Order Size Breakdowns
  getSizeBreakdowns(orderId: string): Promise<OrderSizeBreakdown[]>;
  getSizeBreakdownsByItem(orderItemId: string): Promise<OrderSizeBreakdown[]>;
  createSizeBreakdown(breakdown: InsertOrderSizeBreakdown): Promise<OrderSizeBreakdown>;
  updateSizeBreakdown(id: string, data: Partial<InsertOrderSizeBreakdown>): Promise<OrderSizeBreakdown | undefined>;
  deleteSizeBreakdown(id: string): Promise<void>;

  // Production Stages
  getProductionStages(orderId: string): Promise<ProductionStage[]>;
  getProductionStage(id: string): Promise<ProductionStage | undefined>;
  createProductionStage(stage: InsertProductionStage): Promise<ProductionStage>;
  updateProductionStage(id: string, data: Partial<InsertProductionStage>): Promise<ProductionStage | undefined>;
  initializeProductionPipeline(orderId: string): Promise<ProductionStage[]>;

  // Quality Checks
  getQualityChecks(orderId: string): Promise<QualityCheck[]>;
  getQualityCheck(id: string): Promise<QualityCheck | undefined>;
  createQualityCheck(check: InsertQualityCheck): Promise<QualityCheck>;
  updateQualityCheck(id: string, data: Partial<InsertQualityCheck>): Promise<QualityCheck | undefined>;

  // Order Messages
  getOrderMessages(orderId: string): Promise<OrderMessage[]>;
  createOrderMessage(message: InsertOrderMessage): Promise<OrderMessage>;

  // Order Activity
  getOrderActivityLog(orderId: string): Promise<OrderActivity[]>;
  logOrderActivity(activity: InsertOrderActivity): Promise<OrderActivity>;
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

  // Club Accounts
  async getClubAccount(id: string): Promise<ClubAccount | undefined> {
    const [account] = await db.select().from(clubAccounts).where(eq(clubAccounts.id, id));
    return account;
  }

  async getClubAccountByEmail(email: string): Promise<ClubAccount | undefined> {
    const [account] = await db.select().from(clubAccounts).where(eq(clubAccounts.email, email));
    return account;
  }

  async getAllClubAccounts(): Promise<ClubAccount[]> {
    return db.select().from(clubAccounts).orderBy(desc(clubAccounts.createdAt));
  }

  async createClubAccount(account: InsertClubAccount): Promise<ClubAccount> {
    const [created] = await db.insert(clubAccounts).values(account).returning();
    // Sideline Studio: every club gets a Brand Identity header at creation, so
    // its logos/colours/designs have one home from lead time. Idempotent +
    // fail-soft — never block club creation on it.
    await this.ensureClubBrandIdentity(created.id, { sourceChannel: "lead_intake" }).catch(() => {});
    return created;
  }

  async updateClubAccount(id: string, data: Partial<InsertClubAccount>): Promise<ClubAccount | undefined> {
    const [updated] = await db.update(clubAccounts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(clubAccounts.id, id))
      .returning();
    return updated;
  }

  async getClubOrder(clubAccountId: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders)
      .where(eq(orders.clubAccountId, clubAccountId))
      .orderBy(desc(orders.createdAt))
      .limit(1);
    return order;
  }

  // Club logo assets — Canva-sourced logos linked to a club_account.
  async listClubLogoAssets(clubAccountId: string): Promise<ClubLogoAsset[]> {
    return db.select().from(clubLogoAssets)
      .where(eq(clubLogoAssets.clubAccountId, clubAccountId))
      .orderBy(desc(clubLogoAssets.kind), desc(clubLogoAssets.createdAt));
  }

  async getPrimaryClubLogo(clubAccountId: string): Promise<ClubLogoAsset | undefined> {
    const [row] = await db.select().from(clubLogoAssets)
      .where(and(eq(clubLogoAssets.clubAccountId, clubAccountId), eq(clubLogoAssets.kind, "primary")))
      .limit(1);
    return row;
  }

  async createClubLogoAsset(data: InsertClubLogoAsset): Promise<ClubLogoAsset> {
    // Demote any existing primary if this row is being inserted as primary.
    // Partial unique index would otherwise reject. Single-statement-ish — we
    // accept the small race window because admin writes are sequential per club.
    if (data.kind === "primary") {
      await db.update(clubLogoAssets)
        .set({ kind: "secondary", updatedAt: new Date() })
        .where(and(eq(clubLogoAssets.clubAccountId, data.clubAccountId), eq(clubLogoAssets.kind, "primary")));
    }
    const [created] = await db.insert(clubLogoAssets).values(data).returning();
    return created;
  }

  // Club brand identity (Sideline Studio) — the 1:1 brand header per club.
  async getClubBrandIdentity(clubAccountId: string): Promise<ClubBrandIdentity | undefined> {
    const [row] = await db.select().from(clubBrandIdentity)
      .where(eq(clubBrandIdentity.clubAccountId, clubAccountId)).limit(1);
    return row;
  }

  // Idempotent on the unique club_account_id — safe to call at lead creation
  // even if a record already exists.
  async ensureClubBrandIdentity(clubAccountId: string, seed?: Partial<InsertClubBrandIdentity>): Promise<ClubBrandIdentity> {
    const existing = await this.getClubBrandIdentity(clubAccountId);
    if (existing) return existing;
    const [row] = await db.insert(clubBrandIdentity)
      .values({ clubAccountId, ...(seed || {}) } as any).returning();
    return row;
  }

  async updateClubBrandIdentity(clubAccountId: string, data: Partial<InsertClubBrandIdentity>): Promise<ClubBrandIdentity | undefined> {
    const [row] = await db.update(clubBrandIdentity)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(clubBrandIdentity.clubAccountId, clubAccountId)).returning();
    return row;
  }

  // Clubs / Teams — a club/school owns the shared primary logo; teams link to it.
  async getClubForTeam(clubAccountId: string): Promise<Club | undefined> {
    const [team] = await db.select({ clubId: clubAccounts.clubId }).from(clubAccounts).where(eq(clubAccounts.id, clubAccountId)).limit(1);
    if (!team?.clubId) return undefined;
    const [club] = await db.select().from(clubs).where(eq(clubs.id, team.clubId)).limit(1);
    return club;
  }
  async ensureClub(name: string, kind: string = "club"): Promise<Club> {
    const [existing] = await db.select().from(clubs).where(eq(clubs.name, name)).limit(1);
    if (existing) return existing;
    const [row] = await db.insert(clubs).values({ name, kind } as any).returning();
    return row;
  }
  async linkTeamToClub(clubAccountId: string, clubId: string): Promise<void> {
    await db.update(clubAccounts).set({ clubId, updatedAt: new Date() } as any).where(eq(clubAccounts.id, clubAccountId));
  }
  async setClubPrimaryLogo(clubId: string, url: string, label?: string): Promise<void> {
    await db.update(clubs).set({ primaryLogoUrl: url, primaryLogoLabel: label || null, updatedAt: new Date() } as any).where(eq(clubs.id, clubId));
  }
  // Find-or-create a team under a club (the middle level: Club -> Team -> Orders).
  async ensureTeam(clubId: string, name: string): Promise<string> {
    const ex = (await db.execute(sql`SELECT id FROM teams WHERE club_id=${clubId} AND name=${name} LIMIT 1`) as any).rows?.[0];
    if (ex) return ex.id;
    const ins = (await db.execute(sql`INSERT INTO teams (club_id, name) VALUES (${clubId}, ${name}) RETURNING id`) as any).rows?.[0];
    return ins?.id;
  }
  // Resolve or lazily create a club's asset-container account (so any club can
  // carry brand assets + receive the dispatch logo auto-attach gated on clubAccountId).
  async ensureRepAccountForClub(clubId: string): Promise<string | null> {
    const club = (await db.execute(sql`SELECT id, name FROM clubs WHERE id=${clubId}`) as any).rows?.[0];
    if (!club) return null;
    const ex = (await db.execute(sql`SELECT id, club_name FROM club_accounts WHERE club_id=${clubId}`) as any).rows || [];
    if (ex.length) { const rep = ex.find((a: any) => a.club_name === club.name) || ex[0]; return rep.id; }
    const email = `brand-${clubId}@brand.sideline.local`;
    const hash = (await import("crypto")).randomUUID();
    const ins = (await db.execute(sql`INSERT INTO club_accounts (club_id, email, password_hash, club_name, profit_share_tier_bps) VALUES (${clubId}, ${email}, ${hash}, ${club.name}, 800) ON CONFLICT (email) DO UPDATE SET club_id=${clubId} RETURNING id`) as any).rows?.[0];
    return ins?.id || null;
  }

  async updateClubLogoAsset(id: string, data: Partial<InsertClubLogoAsset>): Promise<ClubLogoAsset | undefined> {
    if (data.kind === "primary") {
      const [existing] = await db.select().from(clubLogoAssets).where(eq(clubLogoAssets.id, id));
      if (existing) {
        await db.update(clubLogoAssets)
          .set({ kind: "secondary", updatedAt: new Date() })
          .where(and(
            eq(clubLogoAssets.clubAccountId, existing.clubAccountId),
            eq(clubLogoAssets.kind, "primary"),
            sql`${clubLogoAssets.id} <> ${id}`,
          ));
      }
    }
    const [updated] = await db.update(clubLogoAssets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(clubLogoAssets.id, id))
      .returning();
    return updated;
  }

  async deleteClubLogoAsset(id: string): Promise<boolean> {
    const result = await db.delete(clubLogoAssets).where(eq(clubLogoAssets.id, id)).returning();
    return result.length > 0;
  }

  async listClubsMissingPrimaryLogo(): Promise<Array<{ id: string; clubName: string; shopifyOrderTag: string | null }>> {
    const rows: any = await db.execute(sql`
      SELECT ca.id, ca.club_name, ca.shopify_order_tag
        FROM club_accounts ca
       WHERE NOT EXISTS (
         SELECT 1 FROM club_logo_assets l
          WHERE l.club_account_id = ca.id AND l.kind = 'primary'
       )
       ORDER BY ca.club_name
    `);
    const out: any[] = Array.isArray(rows) ? rows : (rows.rows ?? []);
    return out.map((r) => ({ id: r.id, clubName: r.club_name, shopifyOrderTag: r.shopify_order_tag }));
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

  async updateOrderItem(id: string, data: Partial<InsertOrderItem>): Promise<OrderItem | undefined> {
    const [item] = await db.update(orderItems).set(data).where(eq(orderItems.id, id)).returning();
    return item;
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
  async getAllOrders(opts: {
    status?: string;
    stage?: string;
    designStatus?: string;
    search?: string;
    createdFrom?: string;
    createdTo?: string;
    dueFrom?: string;
    dueTo?: string;
    overdue?: boolean;
    sortBy?: "createdAt" | "dueDate";
    sortDir?: "asc" | "desc";
    limit?: number;
    offset?: number;
  }): Promise<{ orders: Order[]; total: number }> {
    const conditions = [];
    if (opts.status) conditions.push(eq(orders.status, opts.status));
    if (opts.stage) conditions.push(eq(orders.pipelineStage, opts.stage));
    if (opts.designStatus) conditions.push(eq(orders.designStatus, opts.designStatus));
    if (opts.search) {
      conditions.push(
        sql`(${orders.orderNumber} ILIKE ${'%' + opts.search + '%'} OR ${orders.customerEmail} ILIKE ${'%' + opts.search + '%'} OR ${orders.customerName} ILIKE ${'%' + opts.search + '%'} OR ${orders.poReference} ILIKE ${'%' + opts.search + '%'} OR ${orders.accountName} ILIKE ${'%' + opts.search + '%'})`
      );
    }
    if (opts.createdFrom) {
      conditions.push(sql`${orders.createdAt} >= ${new Date(opts.createdFrom).toISOString()}`);
    }
    if (opts.createdTo) {
      // Inclusive end of day so a YYYY-MM-DD picker covers the whole day
      const end = new Date(opts.createdTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(sql`${orders.createdAt} <= ${end.toISOString()}`);
    }
    if (opts.dueFrom) conditions.push(sql`${orders.dueDate} >= ${opts.dueFrom}`);
    if (opts.dueTo) conditions.push(sql`${orders.dueDate} <= ${opts.dueTo}`);
    if (opts.overdue) {
      // dueDate is YYYY-MM-DD text — direct string compare with today works.
      const today = new Date().toISOString().slice(0, 10);
      conditions.push(sql`${orders.dueDate} IS NOT NULL AND ${orders.dueDate} < ${today} AND ${orders.pipelineStage} NOT IN ('Delivered','Invoice Sent','Paid','Completed','Cancelled')`);
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const sortDir = opts.sortDir === "asc" ? "asc" : "desc";
    const sortColumn = opts.sortBy === "dueDate" ? orders.dueDate : orders.createdAt;
    const orderClause = sortDir === "asc" ? sql`${sortColumn} ASC NULLS LAST` : sql`${sortColumn} DESC NULLS LAST`;

    const [totalResult] = await db.select({ count: count() }).from(orders).where(where);
    const result = await db.select().from(orders)
      .where(where)
      .orderBy(orderClause)
      .limit(opts.limit || 50)
      .offset(opts.offset || 0);

    // Supplier-cost rollup per order — sums supplier_unit_cost_cents * quantity
    // across all lines that have a confirmed cost. Lines without a cost (apparel
    // awaiting Puffin quote) are counted separately so the UI can flag them.
    const ids = result.map(r => r.id);
    const rollups = new Map<string, { supplierUsdCents: number; pendingLines: number }>();
    if (ids.length > 0) {
      const rollupRows: any = await db.execute(sql`
        SELECT order_id,
               COALESCE(SUM(CASE WHEN supplier_unit_cost_cents IS NOT NULL THEN supplier_unit_cost_cents * quantity ELSE 0 END), 0)::bigint AS supplier_usd_cents,
               COUNT(*) FILTER (WHERE supplier_unit_cost_cents IS NULL)::int AS pending_lines
          FROM order_items
         WHERE order_id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
         GROUP BY order_id
      `);
      // Driver returns array directly on Neon serverless; some drivers wrap in .rows.
      const rows: any[] = Array.isArray(rollupRows) ? rollupRows : (rollupRows.rows ?? []);
      for (const row of rows) {
        rollups.set(row.order_id, {
          supplierUsdCents: Number(row.supplier_usd_cents) || 0,
          pendingLines: Number(row.pending_lines) || 0,
        });
      }
    }
    const enriched = result.map(o => ({
      ...o,
      supplierUsdCents: rollups.get(o.id)?.supplierUsdCents ?? 0,
      pendingCostLines: rollups.get(o.id)?.pendingLines ?? 0,
    }));

    return { orders: enriched as any, total: totalResult.count };
  }

  async getOrderWithDetails(orderId: string): Promise<{
    order: Order; items: OrderItem[]; designs: DesignFile[]; comments: DesignComment[];
    sizeBreakdowns: OrderSizeBreakdown[]; stages: ProductionStage[];
    qcChecks: QualityCheck[]; messages: OrderMessage[]; activity: OrderActivity[];
  } | null> {
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

    const sizeBreakdowns = await db.select().from(orderSizeBreakdowns).where(eq(orderSizeBreakdowns.orderId, orderId));
    const stages = await db.select().from(productionStages).where(eq(productionStages.orderId, orderId)).orderBy(productionStages.createdAt);
    const qcChecks = await db.select().from(qualityChecks).where(eq(qualityChecks.orderId, orderId)).orderBy(desc(qualityChecks.createdAt));
    const messages = await db.select().from(orderMessages).where(eq(orderMessages.orderId, orderId)).orderBy(orderMessages.createdAt);
    const activityLog = await db.select().from(orderActivity).where(eq(orderActivity.orderId, orderId)).orderBy(desc(orderActivity.createdAt)).limit(50);

    return { order, items, designs, comments, sizeBreakdowns, stages, qcChecks, messages, activity: activityLog };
  }

  async updateOrder(orderId: string, data: Partial<Record<string, any>>): Promise<Order | undefined> {
    const [order] = await db.update(orders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
    return order;
  }

  // Delete a single order line item + its size breakdowns.
  async deleteOrderItem(itemId: string): Promise<boolean> {
    const [existing] = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.id, itemId));
    if (!existing) return false;
    await db.delete(orderSizeBreakdowns).where(eq(orderSizeBreakdowns.orderItemId, itemId));
    await db.delete(orderItems).where(eq(orderItems.id, itemId));
    return true;
  }

  // Hard-delete an order + every row that references it. We cascade manually
  // rather than ON DELETE CASCADE so the scope is explicit and reviewable.
  // Returns false if the order didn't exist.
  async deleteOrder(orderId: string): Promise<boolean> {
    const existing = await this.getOrder(orderId);
    if (!existing) return false;

    // Fetch design file ids first — design_comments references them.
    const designRows = await db.select({ id: designFiles.id }).from(designFiles).where(eq(designFiles.orderId, orderId));
    const designIds = designRows.map(d => d.id);
    if (designIds.length > 0) {
      await db.delete(designComments).where(
        sql`${designComments.designFileId} IN (${sql.join(designIds.map(id => sql`${id}`), sql`, `)})`
      );
    }

    await db.delete(designFiles).where(eq(designFiles.orderId, orderId));
    await db.delete(orderSizeBreakdowns).where(eq(orderSizeBreakdowns.orderId, orderId));
    await db.delete(productionStages).where(eq(productionStages.orderId, orderId));
    await db.delete(qualityChecks).where(eq(qualityChecks.orderId, orderId));
    await db.delete(orderMessages).where(eq(orderMessages.orderId, orderId));
    await db.delete(orderActivity).where(eq(orderActivity.orderId, orderId));
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));
    return true;
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

  async updateCustomer(userId: string, data: { teamName?: string; contactPhone?: string; ghlContactId?: string }): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async createInvite(
    email: string,
    teamName?: string,
    role: "customer" | "supplier" = "customer",
    ghlContactId?: string,
    contactPhone?: string,
  ): Promise<User> {
    const crypto = await import("crypto");
    const inviteToken = crypto.randomBytes(32).toString("hex");
    const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [user] = await db.insert(users).values({
      username: email,
      email,
      password: "", // No password until invite accepted
      role,
      teamName: teamName || null,
      contactPhone: contactPhone || null,
      ghlContactId: ghlContactId || null,
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

  async getOrdersByAssignedSupplier(supplierId: string): Promise<Order[]> {
    return await db.select().from(orders)
      .where(eq(orders.assignedSupplierId, supplierId))
      .orderBy(desc(orders.createdAt));
  }

  async listSuppliers(): Promise<User[]> {
    return await db.select().from(users)
      .where(eq(users.role, "supplier"))
      .orderBy(desc(users.createdAt));
  }

  // Find the first supplier whose supplier_categories array contains the given
  // category. Used by raise-po as the fallback when no supplier is assigned.
  // Returns undefined if no supplier handles that category.
  async findSupplierForCategory(category: string): Promise<User | undefined> {
    const [row] = await db.select().from(users)
      .where(and(
        eq(users.role, "supplier"),
        sql`${users.supplierCategories} @> ARRAY[${category}]::text[]`,
      ))
      .orderBy(desc(users.createdAt))
      .limit(1);
    return row;
  }

  async updateSupplierCategories(supplierId: string, categories: string[]): Promise<User | undefined> {
    const [row] = await db.update(users)
      .set({ supplierCategories: categories, updatedAt: new Date() })
      .where(and(eq(users.id, supplierId), eq(users.role, "supplier")))
      .returning();
    return row;
  }

  // ===== Supplier pricelist =====

  async listSupplierPrices(supplierId: string): Promise<SupplierPrice[]> {
    return await db.select().from(supplierPrices)
      .where(eq(supplierPrices.supplierId, supplierId))
      .orderBy(desc(supplierPrices.effectiveFrom));
  }

  async createSupplierPrice(price: InsertSupplierPrice): Promise<SupplierPrice> {
    const [row] = await db.insert(supplierPrices).values(price).returning();
    return row;
  }

  async updateSupplierPrice(id: string, data: Partial<InsertSupplierPrice>): Promise<SupplierPrice | undefined> {
    const [row] = await db.update(supplierPrices)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(supplierPrices.id, id))
      .returning();
    return row;
  }

  async deleteSupplierPrice(id: string): Promise<void> {
    await db.delete(supplierPrices).where(eq(supplierPrices.id, id));
  }

  // Pick the supplier_price row that best matches a given line. Variant-specific
  // rows beat null-variant rows; ties are broken by latest effective_from.
  // Returns undefined if no row applies.
  async findSupplierPriceForLine(
    supplierId: string,
    productType: string,
    sizeOrVariant: string | null,
  ): Promise<SupplierPrice | undefined> {
    const rows = await db.select().from(supplierPrices)
      .where(and(
        eq(supplierPrices.supplierId, supplierId),
        eq(supplierPrices.productType, productType),
      ))
      .orderBy(desc(supplierPrices.effectiveFrom));
    if (!rows.length) return undefined;
    if (sizeOrVariant) {
      const variantMatch = rows.find((r) => r.sizeOrVariant === sizeOrVariant);
      if (variantMatch) return variantMatch;
    }
    const generic = rows.find((r) => r.sizeOrVariant === null);
    return generic ?? rows[0];
  }

  // Dashboard stats
  async getDashboardStats() {
    const [totalOrders] = await db.select({ count: count() }).from(orders);
    const [pendingOrders] = await db.select({ count: count() }).from(orders).where(eq(orders.status, "pending"));
    const [pendingDesigns] = await db.select({ count: count() }).from(designFiles).where(eq(designFiles.status, "pending"));
    const [totalCustomers] = await db.select({ count: count() }).from(users).where(eq(users.role, "customer"));
    const [bulkOrders] = await db.select({ count: count() }).from(orders).where(eq(orders.orderType, "bulk-order"));
    const [teamStoreOrders] = await db.select({ count: count() }).from(orders).where(eq(orders.orderType, "team-store"));
    const [sampleRuns] = await db.select({ count: count() }).from(orders).where(eq(orders.orderType, "sample-run"));
    const [totalSuppliers] = await db.select({ count: count() }).from(users).where(eq(users.role, "supplier"));

    // Pipeline stage breakdown (non-null stages only)
    const stageRows = await db
      .select({ stage: orders.pipelineStage, count: count() })
      .from(orders)
      .where(sql`${orders.pipelineStage} IS NOT NULL`)
      .groupBy(orders.pipelineStage);
    const byStage: Record<string, number> = {};
    for (const r of stageRows) if (r.stage) byStage[r.stage] = r.count;

    return {
      totalOrders: totalOrders.count,
      pendingOrders: pendingOrders.count,
      pendingDesigns: pendingDesigns.count,
      totalCustomers: totalCustomers.count,
      bulkOrders: bulkOrders.count,
      teamStoreOrders: teamStoreOrders.count,
      sampleRuns: sampleRuns.count,
      totalSuppliers: totalSuppliers.count,
      byStage,
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
      folder: designFiles.folder,
      fileName: designFiles.fileName,
      fileUrl: designFiles.fileUrl,
      fileSize: designFiles.fileSize,
      mimeType: designFiles.mimeType,
      status: designFiles.status,
      version: designFiles.version,
      parentFileId: designFiles.parentFileId,
      canonicalName: designFiles.canonicalName,
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

  // Order Size Breakdowns
  async getSizeBreakdowns(orderId: string): Promise<OrderSizeBreakdown[]> {
    return await db.select().from(orderSizeBreakdowns)
      .where(eq(orderSizeBreakdowns.orderId, orderId))
      .orderBy(orderSizeBreakdowns.size);
  }

  async getSizeBreakdownsByItem(orderItemId: string): Promise<OrderSizeBreakdown[]> {
    return await db.select().from(orderSizeBreakdowns)
      .where(eq(orderSizeBreakdowns.orderItemId, orderItemId))
      .orderBy(orderSizeBreakdowns.size);
  }

  async createSizeBreakdown(breakdown: InsertOrderSizeBreakdown): Promise<OrderSizeBreakdown> {
    const [row] = await db.insert(orderSizeBreakdowns).values(breakdown).returning();
    return row;
  }

  async updateSizeBreakdown(id: string, data: Partial<InsertOrderSizeBreakdown>): Promise<OrderSizeBreakdown | undefined> {
    const [row] = await db.update(orderSizeBreakdowns).set(data).where(eq(orderSizeBreakdowns.id, id)).returning();
    return row;
  }

  async deleteSizeBreakdown(id: string): Promise<void> {
    await db.delete(orderSizeBreakdowns).where(eq(orderSizeBreakdowns.id, id));
  }

  // Production Stages
  async getProductionStages(orderId: string): Promise<ProductionStage[]> {
    return await db.select().from(productionStages)
      .where(eq(productionStages.orderId, orderId))
      .orderBy(productionStages.createdAt);
  }

  async getProductionStage(id: string): Promise<ProductionStage | undefined> {
    const [stage] = await db.select().from(productionStages).where(eq(productionStages.id, id));
    return stage;
  }

  async createProductionStage(stage: InsertProductionStage): Promise<ProductionStage> {
    const [row] = await db.insert(productionStages).values(stage).returning();
    return row;
  }

  async updateProductionStage(id: string, data: Partial<InsertProductionStage>): Promise<ProductionStage | undefined> {
    const [row] = await db.update(productionStages).set(data).where(eq(productionStages.id, id)).returning();
    return row;
  }

  async initializeProductionPipeline(orderId: string): Promise<ProductionStage[]> {
    const stages = [
      "order_received",
      "design_review",
      "design_confirmed",
      "in_production",
      "printing",
      "quality_check",
      "packing",
      "shipped",
      "delivered",
    ];

    // Idempotent — if any stages exist for this order, return them as-is.
    // Lets the raise-PO hook call this unconditionally without duplicating.
    const existing = await db.select().from(productionStages).where(eq(productionStages.orderId, orderId));
    if (existing.length > 0) return existing;

    const created: ProductionStage[] = [];
    for (let i = 0; i < stages.length; i++) {
      const [row] = await db.insert(productionStages).values({
        orderId,
        stage: stages[i],
        status: i === 0 ? "in_progress" : "pending",
        enteredAt: i === 0 ? new Date() : null,
      }).returning();
      created.push(row);
    }

    // Set order's production stage
    await db.update(orders).set({ productionStage: "order_received", updatedAt: new Date() }).where(eq(orders.id, orderId));

    return created;
  }

  // Quality Checks
  async getQualityChecks(orderId: string): Promise<QualityCheck[]> {
    return await db.select().from(qualityChecks)
      .where(eq(qualityChecks.orderId, orderId))
      .orderBy(desc(qualityChecks.createdAt));
  }

  async getQualityCheck(id: string): Promise<QualityCheck | undefined> {
    const [check] = await db.select().from(qualityChecks).where(eq(qualityChecks.id, id));
    return check;
  }

  async createQualityCheck(check: InsertQualityCheck): Promise<QualityCheck> {
    const [row] = await db.insert(qualityChecks).values(check).returning();
    return row;
  }

  async updateQualityCheck(id: string, data: Partial<InsertQualityCheck>): Promise<QualityCheck | undefined> {
    const [row] = await db.update(qualityChecks).set(data).where(eq(qualityChecks.id, id)).returning();
    return row;
  }

  // Order Messages
  async getOrderMessages(orderId: string): Promise<OrderMessage[]> {
    return await db.select().from(orderMessages)
      .where(eq(orderMessages.orderId, orderId))
      .orderBy(orderMessages.createdAt);
  }

  async createOrderMessage(message: InsertOrderMessage): Promise<OrderMessage> {
    const [row] = await db.insert(orderMessages).values(message).returning();
    return row;
  }

  // Order Activity
  async getOrderActivityLog(orderId: string): Promise<OrderActivity[]> {
    return await db.select().from(orderActivity)
      .where(eq(orderActivity.orderId, orderId))
      .orderBy(desc(orderActivity.createdAt));
  }

  async logOrderActivity(activity: InsertOrderActivity): Promise<OrderActivity> {
    const [row] = await db.insert(orderActivity).values(activity).returning();
    return row;
  }
}

export const storage = new DatabaseStorage();
