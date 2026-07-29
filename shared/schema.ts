import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, numeric, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table with roles and Stripe customer reference
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(), // bcrypt hash
  email: text("email").unique(),
  role: text("role").notNull().default("customer"), // "admin" | "customer" | "supplier"
  teamName: text("team_name"),
  contactPhone: text("contact_phone"),
  ccEmail: text("cc_email"), // Supplier secondary contact (CC on PO emails)
  // Suppliers only: product categories this supplier handles, used as fallback
  // when raising a PO with no explicit assignedSupplierId — first supplier whose
  // categories include the order's primary category gets auto-assigned.
  // Category strings must match shared/product-catalog.ts category names exactly.
  supplierCategories: text("supplier_categories").array(),
  stripeCustomerId: text("stripe_customer_id"),
  ghlContactId: text("ghl_contact_id"),
  emailVerified: boolean("email_verified").default(false),
  inviteToken: text("invite_token"),
  inviteExpiresAt: timestamp("invite_expires_at"),
  // Stamped on any authenticated request so admin can see who has gone quiet.
  lastSeenAt: timestamp("last_seen_at"),
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
  clubAccountId: varchar("club_account_id").references(() => clubAccounts.id), // Club portal orders
  // Three-level hierarchy: Club/School (clubId) -> Team (teamId) -> Order (this
  // row). A team has many orders over time; this order's name (accountName)
  // resembles the order/occasion (e.g. "September Tour"), not the parent.
  clubId: varchar("club_id").references(() => clubs.id),
  teamId: varchar("team_id").references(() => teams.id),
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
  // Legacy single-shipment fields. As of the DHL shipment-tracking feature
  // these are a denormalised MIRROR of the `shipments` tables (the new source
  // of truth, which model many-to-many waybill↔PO consolidation). On link we
  // set these to the order's primary/most-recent waybill for back-compat with
  // the PO grid, supplier chip, and customer notifications.
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),
  estimatedDeliveryDate: timestamp("estimated_delivery_date"),
  // Club Portal fields
  clubPortalStatus: text("club_portal_status").default("brief_received"), // brief_received, mockup_in_progress, mockup_ready, revision_in_progress, design_approved, in_production, shipped, delivered
  mockupUrl: text("mockup_url"), // Vercel Blob URL for mockup image
  revisionNotes: text("revision_notes"), // Club's revision notes
  mockupApprovedAt: timestamp("mockup_approved_at"),
  // PO-specific fields
  orderType: text("order_type").default("bulk-order"), // "team-store" | "bulk-order" | "sample-run"
  poReference: text("po_reference"), // Auto-assigned: PO-YYYY-NNNN
  accountName: text("account_name"), // Account / team / company name on PO (maps to GHL companyName)
  // Customer contact — mirrors GHL contact shape for clean one-to-one sync
  customerFirstName: text("customer_first_name"),
  customerLastName: text("customer_last_name"),
  companyEmail: text("company_email"), // billing/accounts email at the club or company
  companyPhone: text("company_phone"), // company switchboard (vs customer's personal phone)
  isRepeatOrder: boolean("is_repeat_order").default(false),
  poComments: text("po_comments"), // e.g. "Bulk Order"
  deliveryAttention: text("delivery_attention"), // Attention: person name
  deliveryAddress: text("delivery_address"), // Full delivery address text
  deliveryEmail: text("delivery_email"),
  deliveryPhone: text("delivery_phone"),
  // Customer due date ("Door to Customer") — drives every upstream milestone
  // via shared/po-milestones.ts. Stored as a simple date string (YYYY-MM-DD).
  dueDate: text("due_date"),
  // Sideline order portal — GHL-mirrored pipeline + supplier assignment
  ghlOpportunityId: text("ghl_opportunity_id"), // GHL deal ID — links order to its pipeline card
  pipelineStage: text("pipeline_stage"), // Mirror of GHL stage name from shared/pipeline.ts; GHL is source of truth
  assignedSupplierId: varchar("assigned_supplier_id").references(() => users.id), // users.role = "supplier"
  // File Vault — per-PO Google Drive folder (Date.Company.Contact)
  driveFolderId: text("drive_folder_id"),
  driveFolderUrl: text("drive_folder_url"),
  driveFolderName: text("drive_folder_name"),
  // Artwork approval — drives the Approval band on the Production Sheet PDF
  artworkApproved: boolean("artwork_approved").default(false),
  artworkApprovedBy: text("artwork_approved_by"),
  artworkApprovedAt: timestamp("artwork_approved_at"),
  // Sample/Bulk PO split — see migrations/po-sample-bulk-split.sql.
  // poKind defaults to "single" so legacy orders flow through the original
  // raise-po path unchanged. "sample" = qty-1 sample run; "bulk" = the
  // production run that was duplicated from the sample.
  poKind: text("po_kind").notNull().default("single"), // "single" | "sample" | "bulk"
  parentOrderId: varchar("parent_order_id"), // bulk → its sample
  poDispatchedAt: timestamp("po_dispatched_at"),
  poHeldAt: timestamp("po_held_at"),
  poHoldReason: text("po_hold_reason"),
  poHeldBy: varchar("po_held_by").references(() => users.id),
  sampleApprovedByClientAt: timestamp("sample_approved_by_client_at"),
  depositPaidAt: timestamp("deposit_paid_at"),
  // Pre-computed bulk size totals stashed when a sample PO is built from a
  // closed Shopify supporter drop. Shape: { [orderItemId]: { [size]: qty } }.
  // ensureBulkPoFromSample reads this when fanning out the bulk so qtys land
  // populated instead of blank. Only set on sample rows.
  bulkSizeBreakdown: jsonb("bulk_size_breakdown"),
  // Source Shopify collection handle this PO was built from (closed-drop flow).
  sourceCollectionHandle: text("source_collection_handle"),
  // Supplier invoice tracking. supplier_unit_cost_cents on order_items is the
  // per-line stamp at raise-PO; this set of columns captures the invoice we
  // received from the supplier (which may differ — currency conversion drift,
  // negotiated rebates, off-pricelist items) plus payment status. See
  // migrations/supplier-invoice-fields.sql.
  supplierInvoicePaidAt: timestamp("supplier_invoice_paid_at"),
  supplierInvoicePaidBy: varchar("supplier_invoice_paid_by").references(() => users.id),
  supplierInvoicePaymentRef: text("supplier_invoice_payment_ref"),
  supplierInvoiceTotalCents: integer("supplier_invoice_total_cents"),
  supplierInvoiceCurrency: text("supplier_invoice_currency"),
  supplierInvoiceFileUrl: text("supplier_invoice_file_url"),
  supplierInvoiceFileName: text("supplier_invoice_file_name"),
  supplierInvoiceUploadedAt: timestamp("supplier_invoice_uploaded_at"),
  // Payment receipt — proof we paid the supplier (bank slip / Wise PDF /
  // screenshot). Lives in the same Drive 08. Invoicing/ folder as the
  // supplier invoice itself. Separate file from supplier_invoice_file_*
  // because the supplier sends one document (their bill) and we generate
  // the other (our proof of payment).
  paymentReceiptFileUrl: text("payment_receipt_file_url"),
  paymentReceiptFileName: text("payment_receipt_file_name"),
  paymentReceiptUploadedAt: timestamp("payment_receipt_uploaded_at"),
  // Customer-side invoice. For direct POs we record the Xero invoice ref
  // and/or upload a PDF. For supporter-campaign POs (has clubAccountId)
  // the customer-side data lives in Shopify orders tagged club:<slug> —
  // fetched live via fetchSupporterOrdersByTag, no DB column.
  customerInvoiceXeroRef: text("customer_invoice_xero_ref"),
  customerInvoiceFileUrl: text("customer_invoice_file_url"),
  customerInvoiceFileName: text("customer_invoice_file_name"),
  customerInvoiceUploadedAt: timestamp("customer_invoice_uploaded_at"),
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
  brandingMethod: text("branding_method"), // See shared/branding-methods.ts
  productType: text("product_type"), // Canonical product id from shared/product-catalog.ts
  material: text("material"), // Garment material / fabric spec (e.g. "180gsm Interlock Polyester")
  frontDesignUrl: text("front_design_url"), // LEGACY — read via getMockups() in shared/design-assets.ts. New writes go to mockupImages.
  backDesignUrl: text("back_design_url"),   // LEGACY — same as frontDesignUrl.
  designPrints: jsonb("design_prints"),     // DesignAsset[] — 2D vector flats (factory production files). Pure new data (2026-04-24), no legacy.
  mockupImages: jsonb("mockup_images"),     // DesignAsset[] — 3D vendor renders. New writes go here; falls back to frontDesignUrl/backDesignUrl via getMockups() if empty.
  elementUrls: jsonb("element_urls"),       // LogoElement[] — { name, url, position?, application?, sizeMm?, threadColours?: string[], artworkFile? }
  gradeGroup: text("grade_group"), // DEPRECATED — kept for back-compat; no longer shown in UI (2026-04-16)
  designNotes: text("design_notes"), // Any notes about this product line
  designBrief: text("design_brief"), // AI-generated description of design layout, positions, elements (Gemini)
  sizeChartType: text("size_chart_type"), // key from shared/size-charts.ts; auto-set from productType, admin can override
  // Supplier-side cost stamped on the line when raise-PO fires. unitAmount
  // remains the client-facing price; these fields capture what we actually
  // pay the supplier for the line, so margin analytics + Shopify cost
  // write-back have a clean source. Populated from the latest matching
  // supplier_prices row when the assigned supplier has one for this productType.
  supplierUnitCostCents: integer("supplier_unit_cost_cents"),
  supplierCostCurrency: text("supplier_cost_currency"),     // ISO 4217, e.g. 'USD'
  supplierCostSourceId: varchar("supplier_cost_source_id"), // supplier_prices.id (not enforced as FK so deleting a price doesn't lose the stamp)
  supplierCostAppliedAt: timestamp("supplier_cost_applied_at"),
  // Per-line supplier override. When set, this line dispatches to this supplier
  // regardless of orders.assigned_supplier_id. raise-PO groups items by their
  // resolved supplier (precedence: this column → orders.assigned_supplier_id →
  // category-based default in users.supplier_categories) and sends one PO email
  // per supplier with only their lines. Null = follow order-level default.
  assignedSupplierId: varchar("assigned_supplier_id").references(() => users.id),
});

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;

// Logo Placement — shape of each entry in orderItems.elementUrls.
// Only { name, url } were originally captured; the placement fields were
// added 2026-04-24 and are optional so historical orders still render.
//
// LOGO_POSITIONS is the suggested set shown as autocomplete options in the
// admin UI + gets dedicated columns in the PO grid. Position is stored as a
// free-form string so custom placements ("Left Hip", "Back Neck Tape", etc.)
// can be entered — these render in a "Custom Placements" strip below the
// preset grid. Multiple logos can share the same position (e.g. two sponsor
// logos on Center Back); the grid stacks them in the same cell.
export const LOGO_POSITIONS = [
  "Left Chest",
  "Right Chest",
  "Center Chest",
  "Front Pocket",
  "Left Sleeve",
  "Right Sleeve",
  "Center Back",
  "Top Back",
  "Bottom",
] as const;
export type LogoPosition = typeof LOGO_POSITIONS[number];
export type LogoElement = {
  name: string;
  url: string;
  position?: string;          // Free-form. Matches a LOGO_POSITIONS entry → renders in the grid column; else → "Custom Placements" strip.
  application?: string;       // "Embroidery" | "Screen Print" | "Sublimation" | "Heat Transfer"
  sizeMm?: string;            // e.g. "85 × 60 mm"
  threadColours?: string[];   // e.g. ["PMS Black", "PMS 130", "White"]
  artworkFile?: string;       // e.g. "NWF-LOGO-v2.ai"
};

// Sideline's own brand mark is a standing brand element on every PO: it sits on
// the Center Back of tops and the lower back (Bottom) of pants/shorts. Canonical
// absolute URL so it renders identically in the admin UI, the PO PDF, and the
// customer proof. Swap the URL here if the woven "work logo" gets its own asset.
export const SIDELINE_BRAND_LOGO_URL = "https://sidelinenz.com/sideline-logo-vertical.png";
export function sidelineBrandBackPosition(product?: string | null): LogoPosition {
  return /\b(pant|short|jogger|trouser|trackpant|legging)/i.test(product || "") ? "Bottom" : "Center Back";
}
export function sidelineBrandElement(product?: string | null): LogoElement {
  return {
    name: "Sideline NZ",
    url: SIDELINE_BRAND_LOGO_URL,
    position: sidelineBrandBackPosition(product),
    application: "Embroidery",
  };
}

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
  label: text("label").notNull(), // "jersey", "shorts", "socks", "logo", "other" — garment/subject
  folder: text("folder"), // "logos" | "mockups" | "size-run" | "tech-pack" | "other" — file vault folder (role-scoped reads)
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(), // Vercel Blob URL
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  version: integer("version").notNull().default(1),
  parentFileId: varchar("parent_file_id"), // Links re-uploads to original
  // AI-suggested canonical name (in-app AI worker output, accepted by admin).
  // Format: "<year> <club> <product> [- <side>]". Used by Drive folder builder
  // and supplier PO email so filenames stay consistent regardless of the raw
  // Vercel Blob URL (which has a random suffix and can't be renamed).
  canonicalName: text("canonical_name"),
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

// Designers — the roster behind the claim board. A designer has no login: their
// personal board token IS the credential, same trust model as /job/<token> and
// the supplier sheet at /s/<token>. Revoke by rotating the token.
export const designers = pgTable("designers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Stable slug used in designer_jobs.designer_name. Never change it once they
  // have jobs, or their history detaches from them.
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  token: text("token").notNull().unique(), // personal board link
  timezone: text("timezone").notNull().default("Pacific/Auckland"),
  slaHours: integer("sla_hours").notNull().default(48),
  // How many jobs they may hold at once. Start new people at 1 so an unproven
  // designer cannot tie up several clubs' drops before anyone notices.
  wipCap: integer("wip_cap").notNull().default(1),
  // rookie | designer | senior — gates which jobs they can see on the board.
  tier: text("tier").notNull().default("rookie"),
  active: boolean("active").notNull().default(true),
  // Stamped when they open their board — the no-login surfaces need this too.
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDesignerSchema = createInsertSchema(designers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDesigner = z.infer<typeof insertDesignerSchema>;
export type Designer = typeof designers.$inferSelect;

// Admin impersonation audit trail. Switching into someone's session is a real
// privilege; without a log, a mistake made inside their account is
// indistinguishable from that person doing it themselves.
export const impersonationLog = pgTable("impersonation_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id").notNull().references(() => users.id),
  targetKind: text("target_kind").notNull(), // user | club_account
  targetId: varchar("target_id").notNull(),
  targetLabel: text("target_label"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  ip: text("ip"),
  userAgent: text("user_agent"),
});
export type ImpersonationLog = typeof impersonationLog.$inferSelect;

// Designer jobs — the Drop Designer pipeline (SL-#### quote → assigned drop → QC → pay).
// One row per drop; UNIQUE(quote_id) makes duplicate job creation structurally impossible
// (the 2026-07-20 master plan idempotency rule). Public page served at /job/<token>.
export const designerJobs = pgTable("designer_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: text("quote_id").notNull().unique(), // SL-####
  token: text("token").notNull().unique(), // unguessable public-page token
  // The order this design became, once the quote converts. Without this link the
  // app cannot tell WHICH designer made the mockups a client is commenting on, so
  // client feedback had to be relayed by hand. Nullable: a job exists before an
  // order does, and speculative mockups may never produce one.
  orderId: varchar("order_id").references(() => orders.id),
  club: text("club"),
  designerName: text("designer_name").notNull().default("unassigned"),
  // Where to reach the designer when the client asks for changes. Without it the
  // loop still works (their job page shows the request) but nobody tells them.
  designerEmail: text("designer_email"),
  // Append-only log of every change request, from either direction:
  // [{at, source:"client"|"qc", notes, failedItems?, round}]. Append-only so a
  // later round never erases what was asked for in an earlier one.
  revisionRequests: jsonb("revision_requests"),
  // Designer's IANA timezone. Drives the "your time" clock on the job page and the
  // weekend-safe deadline math, so the rig is no longer hardcoded to one person's
  // country (2026-07-28 multi-freelancer refresh).
  timezone: text("timezone").notNull().default("Asia/Colombo"),
  briefMd: text("brief_md"), // markdown brief rendered on the public job page
  // The shared Canva design workspace for this drop. Romero shares one doc per
  // job with the designer; this is where the pages are pre-named and where the
  // crest and sponsor logos get composited at the finishing step.
  canvaUrl: text("canva_url"),
  // { design, donotExtra, garments:[{name,prompt}] } — the per-club half of the
  // mockup prompt. BASE/BRAND/DONOT are constants in shared/mockup-prompt.ts
  // because they never change.
  promptPack: jsonb("prompt_pack"),
  assetsBase: text("assets_base"), // absolute URL folder holding refs + brand kit
  assetFiles: jsonb("asset_files"), // string[] of filenames under assetsBase
  assignedAt: timestamp("assigned_at"),
  // Claim board (2026-07-28). A job is POSTED to the board, then CLAIMED by a
  // designer who chooses to take it. The SLA clock starts at the claim, not the
  // posting, so nobody is ever late for a job they had not seen.
  postedAt: timestamp("posted_at"),
  claimedAt: timestamp("claimed_at"),
  // Times this job has been auto-released back to the board after a missed
  // deadline. Cheap signal for someone claiming work they cannot finish.
  releaseCount: integer("release_count").notNull().default(0),
  deadlineAt: timestamp("deadline_at"), // weekend-safe, computed at CLAIM time
  pausedMs: integer("paused_ms").notNull().default(0), // closed engine-down pauses (extends deadline)
  pauseOpenAt: timestamp("pause_open_at"), // open pause start, null when running
  status: text("status").notNull().default("in_progress"), // available | in_progress | submitted | revision | approved | rejected | released
  submittedAt: timestamp("submitted_at"), // on_time is ALWAYS judged from this, never QC latency
  // Work the designer delivered through the job page itself: [{url,name,size,at}].
  // Kept append-only across revision rounds so a reject never destroys evidence of
  // what was sent the first time.
  submissions: jsonb("submissions"),
  // Stage keys of SLA nudges already sent, so a 30-minute cron cannot send the
  // same warning 48 times.
  slaNudgesSent: jsonb("sla_nudges_sent"),
  revisions: integer("revisions").notNull().default(0),
  qcBy: text("qc_by"),
  qcAt: timestamp("qc_at"),
  qcOnTime: boolean("qc_on_time"),
  qcReason: text("qc_reason"),
  qcFailedItems: jsonb("qc_failed_items"), // number[] of failed checklist items (evidence-based reject)
  practice: boolean("practice").notNull().default(false),
  clientEmail: text("client_email"), // club contact — used to find/create the club account for brand handoff
  // { colors:[{role,name,hex?}], concepts?:[...] } — captured at quote/design time,
  // written through to club_brand_identity when the drop passes QC.
  brand: jsonb("brand"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Designer pay ledger. UNIQUE(job_id, kind) makes paying twice for one drop
// structurally impossible rather than merely guarded in code — the July 2026
// auto-assign incident showed retry loops do happen.
export const designerLedger = pgTable("designer_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => designerJobs.id, { onDelete: "cascade" }),
  designerName: text("designer_name").notNull(),
  kind: text("kind").notNull(), // drop | bonus | clawback
  amountUsd: numeric("amount_usd", { precision: 10, scale: 2 }).notNull(),
  onTime: boolean("on_time"),
  note: text("note"),
  accruedAt: timestamp("accrued_at").notNull().defaultNow(),
  paidAt: timestamp("paid_at"),
}, (t) => ({ jobKind: unique("designer_ledger_job_kind_unique").on(t.jobId, t.kind) }));
export type DesignerLedgerRow = typeof designerLedger.$inferSelect;

export const insertDesignerJobSchema = createInsertSchema(designerJobs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDesignerJob = z.infer<typeof insertDesignerJobSchema>;
export type DesignerJob = typeof designerJobs.$inferSelect;

// Order size breakdowns — detailed per-item size/quantity/player info
export const orderSizeBreakdowns = pgTable("order_size_breakdowns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderItemId: varchar("order_item_id").notNull().references(() => orderItems.id),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  size: text("size").notNull(),
  quantity: integer("quantity").notNull().default(1),
  playerName: text("player_name"),
  playerNumber: text("player_number"),
  // Where on the garment the player's name goes. Free-text so we accept any
  // value, but the UI picker offers a canonical set (NAME_PLACEMENT_OPTIONS).
  namePlacement: text("name_placement"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Canonical placement options for the size-row UI picker. Free-text "Other"
// is supported by storing whatever the admin types.
export const NAME_PLACEMENT_OPTIONS = [
  "Back Upper",
  "Back Mid",
  "Back Below Number",
  "Left Chest",
  "Right Chest",
  "Front Center",
  "Left Sleeve",
  "Right Sleeve",
  "None",
] as const;
export type NamePlacement = (typeof NAME_PLACEMENT_OPTIONS)[number] | string;

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

// Register-interest signups from closed supporter-campaign drops on the
// teamstore. Populated by POST /api/notify/:clubSlug; UNIQUE on
// (clubSlug, email) at the DB level so re-submits collide gracefully.
export const notifySignups = pgTable("notify_signups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubSlug: text("club_slug").notNull(),
  email: text("email").notNull(),
  collectionHandle: text("collection_handle").notNull(),
  source: text("source"),
  userAgent: text("user_agent"),
  referrer: text("referrer"),
  createdAt: timestamp("created_at").defaultNow(),
  notifiedAt: timestamp("notified_at"),
});
export type InsertOrderActivity = z.infer<typeof insertOrderActivitySchema>;
export type OrderActivity = typeof orderActivity.$inferSelect;

// Integration Events — audit trail for every external API call the app
// makes (GHL, Drive, Gmail, Resend, APIEase, Stripe, Shopify, Xero, ...).
// Writes both success and failure rows so we can answer:
//   - "did the GHL opportunity actually get created for order X?"
//   - "which outbound emails failed this week?"
//   - "how slow has Drive been lately?"
// Added 2026-04-24 as the foundation for the ongoing integration-health audit.
export const integrationEvents = pgTable("integration_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").defaultNow(),
  system: text("system").notNull(),          // "ghl" | "drive" | "gmail" | "resend" | "apiease" | "stripe" | "shopify" | "xero" | "vercel-blob" | "dhl" | "whatsapp"
  action: text("action").notNull(),          // "upsertContact" | "createFolder" | "sendSupplierPo" | "mirrorBlob" | ...
  status: text("status").notNull(),          // "success" | "failed"
  orderId: varchar("order_id"),              // loose FK — NOT enforced; log survives order delete
  userId: varchar("user_id"),                // who triggered it, if applicable
  durationMs: integer("duration_ms"),        // wall time of the call
  error: text("error"),                      // null on success; error.message on failure
  meta: jsonb("meta"),                       // arbitrary structured context (HTTP status, response snippet, params)
});

export const insertIntegrationEventSchema = createInsertSchema(integrationEvents).omit({ id: true, createdAt: true });
export type InsertIntegrationEvent = z.infer<typeof insertIntegrationEventSchema>;
export type IntegrationEvent = typeof integrationEvents.$inferSelect;

// DHL shipment tracking — see migrations/dhl-shipment-tracking.sql.
//
// Puffin manufactures POs and ships them via DHL, often CONSOLIDATING several
// POs into one waybill (and a single PO can span several parcels). The legacy
// orders.trackingNumber single field cannot model that, so these tables are the
// source of truth and orders.trackingNumber becomes a denormalised mirror.
//
// The reliable anchor is the waybill Puffin gives us AT DISPATCH (linked to the
// PO(s) here). DHL's WhatsApp status messages are parsed best-effort and arrive
// via shipment_events; they enrich the timeline but never drive expectations.
export const shipments = pgTable("shipments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  waybill: text("waybill").notNull().unique(), // DHL tracking number — the identity anchor (normalised, see normalizeWaybill)
  carrier: text("carrier").notNull().default("dhl"),
  status: text("status").notNull().default("created"), // shared/shipment-status.ts SHIPMENT_STATUSES
  lastEventCode: text("last_event_code"), // raw DHL event code, if parseable
  lastEventDescription: text("last_event_description"), // human text of the last event
  lastEventAt: timestamp("last_event_at"),
  estimatedDeliveryDate: timestamp("estimated_delivery_date"),
  deliveredAt: timestamp("delivered_at"),
  sourceChannel: text("source_channel").notNull().default("supplier"), // SHIPMENT_SOURCE_CHANNELS
  isOrphan: boolean("is_orphan").notNull().default(false), // DHL event arrived for a waybill with no linked PO yet
  trackingUrl: text("tracking_url"),
  rawMeta: jsonb("raw_meta"), // raw source payloads (supplier submission, last WhatsApp parse)
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertShipmentSchema = createInsertSchema(shipments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type Shipment = typeof shipments.$inferSelect;

// Many-to-many link between a waybill (shipment) and the PO(s) it carries.
// expectedItems is a snapshot of the PO's order_items taken at link time, so
// verification has a stable baseline even if the PO is later edited.
export const shipmentOrders = pgTable("shipment_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shipmentId: varchar("shipment_id").notNull().references(() => shipments.id, { onDelete: "cascade" }),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  expectedParcelCount: integer("expected_parcel_count"), // how many parcels Puffin said this PO would take, if known
  expectedItems: jsonb("expected_items"), // [{ orderItemId, productName, size, qty }] snapshot at link time
  verificationStatus: text("verification_status").notNull().default("unverified"), // VERIFICATION_STATUSES
  verificationReport: jsonb("verification_report"), // computed diff output (see computeShipmentVerification)
  verifiedAt: timestamp("verified_at"),
  linkedBy: varchar("linked_by").references(() => users.id),
  linkSource: text("link_source").notNull().default("supplier"), // "supplier" | "admin" | "whatsapp-late-link"
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertShipmentOrderSchema = createInsertSchema(shipmentOrders).omit({ id: true, createdAt: true });
export type InsertShipmentOrder = z.infer<typeof insertShipmentOrderSchema>;
export type ShipmentOrder = typeof shipmentOrders.$inferSelect;

// One physical parcel within a shipment. Optional (DHL/WhatsApp often omits
// per-piece detail); when present it powers true per-PO content verification.
export const shipmentParcels = pgTable("shipment_parcels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shipmentId: varchar("shipment_id").notNull().references(() => shipments.id, { onDelete: "cascade" }),
  shipmentOrderId: varchar("shipment_order_id").references(() => shipmentOrders.id, { onDelete: "set null" }), // which PO this parcel belongs to (nullable)
  pieceId: text("piece_id"), // DHL piece/parcel ID if provided
  description: text("description"), // free text or from packing list
  declaredItems: jsonb("declared_items"), // [{ productName, size, qty }] actually packed
  weightGrams: integer("weight_grams"),
  status: text("status"), // optional per-piece status
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertShipmentParcelSchema = createInsertSchema(shipmentParcels).omit({ id: true, createdAt: true });
export type InsertShipmentParcel = z.infer<typeof insertShipmentParcelSchema>;
export type ShipmentParcel = typeof shipmentParcels.$inferSelect;

// Append-only event log + dedup guard. Repeated WhatsApp scrapes show the same
// messages, so dedupKey (sha256 of waybill|status|minute) is UNIQUE and is the
// authoritative idempotency guard. shipmentId is null for orphan events (a DHL
// message for a waybill we never captured).
export const shipmentEvents = pgTable("shipment_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shipmentId: varchar("shipment_id").references(() => shipments.id, { onDelete: "cascade" }),
  rawWaybill: text("raw_waybill").notNull(), // normalised waybill from the event
  status: text("status"), // normalised status, or null if unrecognised
  eventCode: text("event_code"),
  eventDescription: text("event_description"),
  occurredAt: timestamp("occurred_at"),
  location: text("location"),
  source: text("source").notNull().default("whatsapp"), // SHIPMENT_SOURCE_CHANNELS
  confidence: integer("confidence"), // 0-100 parse confidence (vision/text extraction)
  dedupKey: text("dedup_key").notNull().unique(),
  rawText: text("raw_text"), // original WhatsApp message text
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertShipmentEventSchema = createInsertSchema(shipmentEvents).omit({ id: true, createdAt: true });
export type InsertShipmentEvent = z.infer<typeof insertShipmentEventSchema>;
export type ShipmentEvent = typeof shipmentEvents.$inferSelect;

// clubs — the real CLUB or SCHOOL (e.g. "Richmond Rovers", "Aorere College").
// Owns the SHARED primary logo + colours. club_accounts are the TEAMS under a
// club (Senior As, Under 16s, Girls Premier Netball) — they link via clubId, a
// team inherits the club primary and adds its own secondary. There is ALWAYS a
// club/school then a team. See reference_sideline_clubs_vs_teams + clubs-teams.sql.
export const clubs = pgTable("clubs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),         // "Richmond Rovers" | "Aorere College"
  kind: text("kind").notNull().default("club"),  // "club" | "school"
  primaryLogoUrl: text("primary_logo_url"),       // the shared crest, applied to every team's PO
  primaryLogoLabel: text("primary_logo_label"),
  colors: jsonb("colors"),                        // shared club colours
  // Parent / org details (the parent IS the GHL business). website/address/main
  // contact; ghlBusinessId links to GHL as system-of-record. deliveryAddress
  // defaults new POs' ship-to. See reference_sideline_clubs_vs_teams.
  website: text("website"),
  deliveryAddress: text("delivery_address"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  ghlBusinessId: text("ghl_business_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertClubSchema = createInsertSchema(clubs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClub = z.infer<typeof insertClubSchema>;
export type Club = typeof clubs.$inferSelect;

// teams — the MIDDLE level: a team belongs to a club/school and owns a LIST of
// orders over time (Club/School -> Team -> Orders). Holds team-specific marks
// (secondary logos); inherits the club's primary + colours. See
// reference_sideline_clubs_vs_teams.
export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => clubs.id),
  name: text("name").notNull(),                 // "U12s", "1st XV", "Senior As"
  secondaryLogoUrl: text("secondary_logo_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertTeamSchema = createInsertSchema(teams).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

// Club Portal Accounts — a TEAM (links to its club via clubId). Separate login.
export const clubAccounts = pgTable("club_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").references(() => clubs.id), // parent club/school
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  clubName: text("club_name").notNull(),
  contactId: text("contact_id"), // GHL contact ID
  shopifyStoreUrl: text("shopify_store_url"), // Their Shopify store URL
  // Supporter campaign — Shopify order tag this club's orders carry (e.g. "club:onewhero-rfc").
  // Set via Shopify Flow on order creation; used server-side to filter Admin API queries.
  shopifyOrderTag: text("shopify_order_tag").unique(),
  // Shopify collection handle (e.g. "onewhero-rfc-supporters") for the
  // supporter drop. The poll-supporter-collections cron watches this — when
  // it flips to unpublished, the closed-drop PO build fires.
  supporterCollectionHandle: text("supporter_collection_handle"),
  // Last-seen published state of the supporter collection. The cron uses the
  // published→unpublished transition (not the absolute state) to fire, so it
  // doesn't keep building POs for collections that were never published.
  supporterCollectionPublished: boolean("supporter_collection_published"),
  // Set when the closed-drop build fires so re-publishing then re-closing
  // doesn't auto-fire a duplicate. Cleared manually if a fresh drop reuses
  // the same handle.
  supporterDropClosedAt: timestamp("supporter_drop_closed_at"),
  // Profit share in basis points (800 = 8%). Avoids pg numeric quirks.
  profitShareTierBps: integer("profit_share_tier_bps").notNull().default(800),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertClubAccountSchema = createInsertSchema(clubAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClubAccount = z.infer<typeof insertClubAccountSchema>;
export type ClubAccount = typeof clubAccounts.$inferSelect;

// club_logo_assets — Canva-sourced logo assets assigned to a club. The
// PO-raise hook reads this to auto-attach the primary logo to the order's
// Drive folder + orders.logoUrl. See migrations/club-logo-assets.sql.
export const clubLogoAssets = pgTable("club_logo_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubAccountId: varchar("club_account_id").notNull().references(() => clubAccounts.id, { onDelete: "cascade" }),
  canvaDesignId: text("canva_design_id").notNull(),
  canvaPageIndex: integer("canva_page_index"), // 1-based; NULL = single-page design
  kind: text("kind").notNull().default("primary"), // primary | secondary | sponsor
  displayLabel: text("display_label"),
  previewUrl: text("preview_url"),
  // Per-asset placement + production artwork (Sideline Studio Phase 2) — so a
  // specific variant carries its own defaults instead of canva-logos.ts hardcodes.
  defaultPosition: text("default_position"),        // e.g. "Left Chest"
  defaultApplication: text("default_application"),  // e.g. "Embroidery"
  defaultSizeMm: text("default_size_mm"),           // e.g. "85 x 60 mm"
  artworkFileUrl: text("artwork_file_url"),         // production vector for THIS mark
  threadColours: jsonb("thread_colours"),           // string[] — default thread spec
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertClubLogoAssetSchema = createInsertSchema(clubLogoAssets).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClubLogoAsset = z.infer<typeof insertClubLogoAssetSchema>;
export type ClubLogoAsset = typeof clubLogoAssets.$inferSelect;

// club_brand_identity — the per-club "Brand Identity" header (Sideline Studio).
// 1:1 with club_accounts. Created at lead time, enriched at mockup/design,
// read by every order/PO + the AI mockup engine — so the pipeline stores a
// club's logos/colours/designs ONCE instead of re-hunting them at every step.
// club_logo_assets stays the per-club logo "rows" under this header.
// See docs/sideline-studio.md + migrations/club-brand-identity.sql.
export const clubBrandIdentity = pgTable("club_brand_identity", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubAccountId: varchar("club_account_id").notNull().references(() => clubAccounts.id, { onDelete: "cascade" }).unique(),
  // [{ role:"primary"|"secondary"|"accent"|"neutral", hex, name, pms?, thread? }]
  colors: jsonb("colors"),
  // [{ role:"heading"|"body"|"number", family, source?, fileUrl? }]
  fonts: jsonb("fonts"),
  // { clubLogo:{ position, application, sizeMm }, sideline:{ sizeMm } }
  placementDefaults: jsonb("placement_defaults"),
  // [{ label, fileUrl, kind:"ai"|"eps"|"pdf"|"svg"|"png", forLogoAssetId? }]
  artworkFiles: jsonb("artwork_files"),
  // [{ label, canvaDesignId, previewUrl, productType? }]
  designTemplates: jsonb("design_templates"),
  // [{ logoAssetId, sponsorName, placement?, contractNote?, activeUntil? }]
  sponsors: jsonb("sponsors"),
  designBrief: text("design_brief"),                 // carried from intake / mockup form / Gemini
  // [{ url, label, role:"kit"|"collar"|"pattern"|"logo" }] — feeds AI generation
  referenceImages: jsonb("reference_images"),
  // the AI render standard for this club (no logos, inner-collar lining, 4K 4:5, …)
  renderSpec: jsonb("render_spec"),
  enrichmentStage: text("enrichment_stage").notNull().default("lead"), // lead | mockup | design_approved | production_ready
  sourceChannel: text("source_channel"),             // lead_intake | free_mockup_form | mockup_request | manual
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertClubBrandIdentitySchema = createInsertSchema(clubBrandIdentity).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClubBrandIdentity = z.infer<typeof insertClubBrandIdentitySchema>;
export type ClubBrandIdentity = typeof clubBrandIdentity.$inferSelect;

// xero_connections — Xero OAuth tokens. Single row in practice (one Sideline
// org → one Xero org). See migrations/xero-connections.sql.
export const xeroConnections = pgTable("xero_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: text("tenant_id").notNull().unique(),
  tenantName: text("tenant_name"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  scopes: text("scopes"),
  connectedAt: timestamp("connected_at").defaultNow(),
  connectedBy: varchar("connected_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type XeroConnection = typeof xeroConnections.$inferSelect;

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

// Approval tokens — one-time/short-lived links for clients to approve mockups
// without logging in. Issued when admin clicks "Send for approval"; consumed
// when the client clicks Approve or Request Changes on /approve/:token.
export const approvalTokens = pgTable("approval_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  token: text("token").notNull().unique(), // random URL-safe string
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  // Outcome (set when the client submits)
  decision: text("decision"), // "approved" | "changes_requested" | null
  changesNotes: text("changes_notes"),
  createdBy: varchar("created_by").references(() => users.id), // admin who issued the link
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertApprovalTokenSchema = createInsertSchema(approvalTokens).omit({ id: true, createdAt: true });
export type InsertApprovalToken = z.infer<typeof insertApprovalTokenSchema>;
export type ApprovalToken = typeof approvalTokens.$inferSelect;

// ─── Ezra (in-app copilot) ───────────────────────────────────────────
//
// Phase A foundation. One conversation per (user, optional context anchor).
// Messages cover every turn including tool calls — the conversation IS the
// audit trail. Phase E (Telegram bridge) reuses the same tables; conversations
// from Telegram carry channel='telegram' and channel_ref=<chat_id>.

export const ezraConversations = pgTable("ezra_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // not FK so service-token sessions don't break
  title: text("title"),
  scopeKind: text("scope_kind"),    // 'order' | 'club' | 'global' | 'telegram'
  scopeId: text("scope_id"),        // orderId / clubAccountId / null
  channel: text("channel"),         // 'web' | 'telegram'
  channelRef: text("channel_ref"),  // telegram chat_id
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertEzraConversationSchema = createInsertSchema(ezraConversations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEzraConversation = z.infer<typeof insertEzraConversationSchema>;
export type EzraConversation = typeof ezraConversations.$inferSelect;

export const EZRA_MESSAGE_ROLES = ["user", "assistant", "tool_call", "tool_result", "system"] as const;
export type EzraMessageRole = (typeof EZRA_MESSAGE_ROLES)[number];

export const ezraMessages = pgTable("ezra_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => ezraConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),                  // EzraMessageRole
  content: text("content"),
  toolName: text("tool_name"),
  toolArgs: jsonb("tool_args"),
  toolResult: jsonb("tool_result"),
  toolCallId: text("tool_call_id"),
  finishReason: text("finish_reason"),           // 'stop' | 'tool_calls' | 'error' | null
  error: text("error"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertEzraMessageSchema = createInsertSchema(ezraMessages).omit({ id: true, createdAt: true });
export type InsertEzraMessage = z.infer<typeof insertEzraMessageSchema>;
export type EzraMessage = typeof ezraMessages.$inferSelect;

// Supplier pricelist — admin-maintained unit costs per supplier, populated from
// invoices the supplier sends. Multiple rows per (supplier, productType) are
// allowed for variants (sizeOrVariant) and price changes over time; the
// effective_from timestamp wins ties — latest row applicable to a line gets used.
export const supplierPrices = pgTable("supplier_prices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  supplierId: varchar("supplier_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  productType: text("product_type").notNull(),     // canonical id from shared/product-catalog.ts (e.g. "beanie")
  sizeOrVariant: text("size_or_variant"),          // null = applies to all sizes
  unitCostCents: integer("unit_cost_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  sourceInvoiceRef: text("source_invoice_ref"),    // free-text, e.g. "Alibaba order 273423355501021608" or "Invoice DN-2026-04-001"
  effectiveFrom: timestamp("effective_from").notNull().defaultNow(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const insertSupplierPriceSchema = createInsertSchema(supplierPrices).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSupplierPrice = z.infer<typeof insertSupplierPriceSchema>;
export type SupplierPrice = typeof supplierPrices.$inferSelect;
