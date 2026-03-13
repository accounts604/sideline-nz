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
  productionStage: text("production_stage").default("order_received"),
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),
  estimatedDeliveryDate: timestamp("estimated_delivery_date"),
  // PO-specific fields
  poReference: text("po_reference"), // e.g. "Onewhero Rugby Juniors 2026"
  accountName: text("account_name"), // Account / team name on PO
  isRepeatOrder: boolean("is_repeat_order").default(false),
  poComments: text("po_comments"), // e.g. "Bulk Order"
  deliveryAttention: text("delivery_attention"), // Attention: person name
  deliveryAddress: text("delivery_address"), // Full delivery address text
  deliveryEmail: text("delivery_email"),
  deliveryPhone: text("delivery_phone"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  paidAt: timestamp("paid_at"),
});

export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// Order items — each represents a product line on the PO (e.g. "Rugby Jersey Grade 6,7,8")
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
  // PO product-line fields
  productColors: jsonb("product_colors"), // [{ hex: "#333561", name: "Navy" }]
  brandingMethod: text("branding_method"), // "Full Sublimation", "Screen Print", "Embroidery", etc.
  frontDesignUrl: text("front_design_url"), // Front design proof image
  backDesignUrl: text("back_design_url"), // Back design proof image
  elementUrls: jsonb("element_urls"), // [{ name: "Onewhero RFC", url: "..." }, { name: "Summit Homes", url: "..." }]
  gradeGroup: text("grade_group"), // "Grade 6,7,8", "Grade 9", "Grade 13", "Seniors"
  designNotes: text("design_notes"), // Any notes about this product line
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

// Order size breakdowns — detailed per-item size/quantity/player info
export const orderSizeBreakdowns = pgTable("order_size_breakdowns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderItemId: varchar("order_item_id").notNull().references(() => orderItems.id),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  size: text("size").notNull(),
  quantity: integer("quantity").notNull().default(1),
  playerName: text("player_name"),
  playerNumber: text("player_number"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOrderSizeBreakdownSchema = createInsertSchema(orderSizeBreakdowns).omit({ id: true, createdAt: true });
export type InsertOrderSizeBreakdown = z.infer<typeof insertOrderSizeBreakdownSchema>;
export type OrderSizeBreakdown = typeof orderSizeBreakdowns.$inferSelect;

// Production stages — track order through production pipeline
export const productionStages = pgTable("production_stages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  stage: text("stage").notNull(), // order_received, design_review, design_confirmed, in_production, printing, quality_check, packing, shipped, delivered
  status: text("status").notNull().default("pending"), // pending, in_progress, completed, skipped
  enteredAt: timestamp("entered_at"),
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by").references(() => users.id),
  notes: text("notes"),
  estimatedDate: timestamp("estimated_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProductionStageSchema = createInsertSchema(productionStages).omit({ id: true, createdAt: true });
export type InsertProductionStage = z.infer<typeof insertProductionStageSchema>;
export type ProductionStage = typeof productionStages.$inferSelect;

// Quality checks — QC checkpoints at each production stage
export const qualityChecks = pgTable("quality_checks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  productionStageId: varchar("production_stage_id").references(() => productionStages.id),
  checkType: text("check_type").notNull(), // pre_production, mid_production, final, packaging
  status: text("status").notNull().default("pending"), // pending, passed, failed, conditional
  checkedBy: varchar("checked_by").references(() => users.id),
  notes: text("notes"),
  photoUrls: jsonb("photo_urls"), // array of photo URLs
  issues: text("issues"), // description of any issues found
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertQualityCheckSchema = createInsertSchema(qualityChecks).omit({ id: true, createdAt: true });
export type InsertQualityCheck = z.infer<typeof insertQualityCheckSchema>;
export type QualityCheck = typeof qualityChecks.$inferSelect;

// Order messages — threaded chat per order (customer ↔ admin + chatbot)
export const orderMessages = pgTable("order_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  userId: varchar("user_id").references(() => users.id), // null for system/bot messages
  senderRole: text("sender_role").notNull(), // admin, customer, system, bot
  message: text("message").notNull(),
  attachmentUrl: text("attachment_url"),
  attachmentName: text("attachment_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOrderMessageSchema = createInsertSchema(orderMessages).omit({ id: true, createdAt: true });
export type InsertOrderMessage = z.infer<typeof insertOrderMessageSchema>;
export type OrderMessage = typeof orderMessages.$inferSelect;

// Order activity log — full audit trail
export const orderActivity = pgTable("order_activity", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  userId: varchar("user_id").references(() => users.id),
  action: text("action").notNull(), // status_change, design_uploaded, design_reviewed, qc_completed, message_sent, stage_advanced, etc.
  details: jsonb("details"), // { from: "paid", to: "processing" } etc.
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOrderActivitySchema = createInsertSchema(orderActivity).omit({ id: true, createdAt: true });
export type InsertOrderActivity = z.infer<typeof insertOrderActivitySchema>;
export type OrderActivity = typeof orderActivity.$inferSelect;

// Mockup requests — lead form submissions that trigger AI mockup generation
export const mockupRequests = pgTable("mockup_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Lead info
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone"),
  teamName: text("team_name").notNull(),
  sport: text("sport").notNull(), // rugby, netball, cricket, basketball, hockey, football, etc.
  primaryColor: text("primary_color").notNull(), // hex
  secondaryColor: text("secondary_color"), // hex
  accentColor: text("accent_color"), // hex
  logoUrl: text("logo_url"), // uploaded team logo
  notes: text("notes"), // additional requirements
  // Processing state
  status: text("status").notNull().default("pending"), // pending, generating, designs_ready, video_ready, sent, failed
  errorMessage: text("error_message"),
  // Outputs
  videoUrl: text("video_url"), // ffmpeg montage video URL
  voiceoverUrl: text("voiceover_url"), // Eleven Labs audio URL
  emailSentAt: timestamp("email_sent_at"),
  // CRM integration
  ghlContactId: text("ghl_contact_id"),
  ghlTagsSynced: boolean("ghl_tags_synced").default(false),
  clickupTaskId: text("clickup_task_id"),
  // Timing
  generationStartedAt: timestamp("generation_started_at"),
  generationCompletedAt: timestamp("generation_completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMockupRequestSchema = createInsertSchema(mockupRequests).omit({ id: true, createdAt: true });
export type InsertMockupRequest = z.infer<typeof insertMockupRequestSchema>;
export type MockupRequest = typeof mockupRequests.$inferSelect;

// Mockup designs — individual AI-generated designs for a mockup request
export const mockupDesigns = pgTable("mockup_designs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => mockupRequests.id),
  designNumber: integer("design_number").notNull(), // 1-4
  prompt: text("prompt").notNull(), // The prompt sent to Gemini
  imageUrl: text("image_url"), // Generated image URL (Vercel Blob)
  thumbnailUrl: text("thumbnail_url"),
  status: text("status").notNull().default("pending"), // pending, generating, completed, failed
  errorMessage: text("error_message"),
  generationTimeMs: integer("generation_time_ms"), // How long Gemini took
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMockupDesignSchema = createInsertSchema(mockupDesigns).omit({ id: true, createdAt: true });
export type InsertMockupDesign = z.infer<typeof insertMockupDesignSchema>;
export type MockupDesign = typeof mockupDesigns.$inferSelect;

// Quote templates — reusable product/pricing bundles for quick quoting
export const quoteTemplates = pgTable("quote_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // "Rugby Club Full Kit", "School Sports Package"
  description: text("description"),
  sport: text("sport"), // rugby, netball, etc. or null for generic
  category: text("category").notNull().default("custom"), // custom, club, school, events
  items: jsonb("items").notNull(), // [{ name, description, unitPrice, minQty, sizes, brandingMethod }]
  validUntilDays: integer("valid_until_days").default(30),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertQuoteTemplateSchema = createInsertSchema(quoteTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQuoteTemplate = z.infer<typeof insertQuoteTemplateSchema>;
export type QuoteTemplate = typeof quoteTemplates.$inferSelect;

// Quotes — generated proposals sent to customers
export const quotes = pgTable("quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteNumber: text("quote_number").notNull().unique(), // QT-001
  templateId: varchar("template_id").references(() => quoteTemplates.id),
  // Customer info
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone"),
  teamName: text("team_name"),
  sport: text("sport"),
  // Quote details
  status: text("status").notNull().default("draft"), // draft, sent, viewed, accepted, rejected, expired
  subtotal: integer("subtotal").notNull().default(0), // cents
  discount: integer("discount").default(0), // cents
  discountLabel: text("discount_label"), // "10% Volume Discount"
  shipping: integer("shipping").default(0),
  tax: integer("tax").default(0),
  total: integer("total").notNull().default(0), // cents
  currency: text("currency").default("nzd"),
  // Notes / terms
  adminNotes: text("admin_notes"), // internal notes
  customerNotes: text("customer_notes"), // visible to customer
  terms: text("terms"), // terms and conditions
  validUntil: timestamp("valid_until"),
  // Tracking
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  acceptedAt: timestamp("accepted_at"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  convertedToOrderId: varchar("converted_to_order_id").references(() => orders.id),
  // Access
  accessToken: text("access_token").notNull(), // public URL token for customer viewing
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertQuoteSchema = createInsertSchema(quotes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotes.$inferSelect;

// Quote items — line items on a quote
export const quoteItems = pgTable("quote_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: varchar("quote_id").notNull().references(() => quotes.id),
  productName: text("product_name").notNull(),
  description: text("description"),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: integer("unit_price").notNull(), // cents
  totalPrice: integer("total_price").notNull(), // cents (qty * unit)
  sizes: text("sizes"), // "S, M, L, XL"
  brandingMethod: text("branding_method"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertQuoteItemSchema = createInsertSchema(quoteItems).omit({ id: true, createdAt: true });
export type InsertQuoteItem = z.infer<typeof insertQuoteItemSchema>;
export type QuoteItem = typeof quoteItems.$inferSelect;

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
