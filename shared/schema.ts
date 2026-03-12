import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table with roles and Stripe customer reference
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(), // bcrypt hash
  email: text("email").unique(),
  role: text("role").notNull().default("customer"), // "admin" | "customer"
  teamName: text("team_name"),
  contactPhone: text("contact_phone"),
  stripeCustomerId: text("stripe_customer_id"),
  emailVerified: boolean("email_verified").default(false),
  inviteToken: text("invite_token"),
  inviteExpiresAt: timestamp("invite_expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  role: true,
  teamName: true,
  contactPhone: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Shopping carts - anonymous or user-linked
export const carts = pgTable("carts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: text("session_id").notNull(), // Browser session token
  userId: varchar("user_id").references(() => users.id),
  storeSlug: text("store_slug").notNull(), // Which team store
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCartSchema = createInsertSchema(carts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCart = z.infer<typeof insertCartSchema>;
export type Cart = typeof carts.$inferSelect;

// Cart items
export const cartItems = pgTable("cart_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cartId: varchar("cart_id").notNull().references(() => carts.id),
  productId: text("product_id").notNull(), // Stripe product ID
  priceId: text("price_id").notNull(), // Stripe price ID
  productName: text("product_name").notNull(),
  productImage: text("product_image"),
  size: text("size"), // Size variant
  quantity: integer("quantity").notNull().default(1),
  unitAmount: integer("unit_amount").notNull(), // Price in cents
  currency: text("currency").notNull().default("nzd"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCartItemSchema = createInsertSchema(cartItems).omit({ id: true, createdAt: true });
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export type CartItem = typeof cartItems.$inferSelect;

// Orders
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: text("order_number").notNull().unique(), // Human-readable order number
  sessionId: text("session_id"),
  userId: varchar("user_id").references(() => users.id),
  storeSlug: text("store_slug").notNull(),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  status: text("status").notNull().default("pending"), // pending, paid, processing, shipped, delivered, cancelled
  subtotal: integer("subtotal").notNull(), // In cents
  shipping: integer("shipping").notNull().default(0),
  tax: integer("tax").notNull().default(0),
  total: integer("total").notNull(),
  currency: text("currency").notNull().default("nzd"),
  customerEmail: text("customer_email"),
  customerName: text("customer_name"),
  shippingAddress: jsonb("shipping_address"),
  designStatus: text("design_status").default("not_started"), // not_started, pending_review, approved, needs_revision
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  paidAt: timestamp("paid_at"),
});

export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// Order items
export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  productId: text("product_id").notNull(),
  priceId: text("price_id").notNull(),
  productName: text("product_name").notNull(),
  productImage: text("product_image"),
  size: text("size"),
  quantity: integer("quantity").notNull(),
  unitAmount: integer("unit_amount").notNull(),
  currency: text("currency").notNull().default("nzd"),
});

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;

// GHL Product Mapping - maps GHL products to Stripe products
export const ghlProducts = pgTable("ghl_products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ghlProductId: text("ghl_product_id").notNull().unique(), // GHL's product ID
  stripeProductId: text("stripe_product_id"), // Stripe product ID after creation
  storeSlug: text("store_slug").notNull(), // Which team store this belongs to
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  priceInCents: integer("price_in_cents").notNull(),
  sizes: text("sizes").array(), // Available sizes
  category: text("category"), // jersey, training, supporter, accessories
  active: boolean("active").notNull().default(true),
  stripePriceIds: jsonb("stripe_price_ids"), // Map of size -> Stripe price ID
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGhlProductSchema = createInsertSchema(ghlProducts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGhlProduct = z.infer<typeof insertGhlProductSchema>;
export type GhlProduct = typeof ghlProducts.$inferSelect;

// Design files uploaded per order
export const designFiles = pgTable("design_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  label: text("label").notNull(), // "jersey", "shorts", "socks", "logo", "other"
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(), // Vercel Blob URL
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  version: integer("version").notNull().default(1),
  parentFileId: varchar("parent_file_id"), // Links re-uploads to original
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDesignFileSchema = createInsertSchema(designFiles).omit({ id: true, createdAt: true });
export type InsertDesignFile = z.infer<typeof insertDesignFileSchema>;
export type DesignFile = typeof designFiles.$inferSelect;

// Design review comments
export const designComments = pgTable("design_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  designFileId: varchar("design_file_id").notNull().references(() => designFiles.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  comment: text("comment").notNull(),
  action: text("action"), // "approved", "rejected", or null (just a comment)
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDesignCommentSchema = createInsertSchema(designComments).omit({ id: true, createdAt: true });
export type InsertDesignComment = z.infer<typeof insertDesignCommentSchema>;
export type DesignComment = typeof designComments.$inferSelect;

// Notifications
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // design_approved, design_rejected, order_shipped, etc.
  title: text("title").notNull(),
  message: text("message"),
  orderId: varchar("order_id").references(() => orders.id),
  designFileId: varchar("design_file_id").references(() => designFiles.id),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;
