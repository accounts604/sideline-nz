import { Router } from "express";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { hashPassword } from "../auth";
import { z } from "zod";
import { notifyDesignApproved, notifyDesignRejected, notifyOrderStatusChange } from "../notifications";
import { sendInviteEmail, sendSupplierPoRaisedEmail, sendSupplierPoDispatchGmail } from "../email";
import { db } from "../db";
import { orders, orderActivity, designFiles, orderItems } from "@shared/schema";
import { eq } from "drizzle-orm";
import { updateGhlOpportunityStage } from "./ghl";
import { createApprovalToken } from "./approvals";
import { withPoNumberRetry, buildPoReference } from "../po-number";
import {
  createClientFolder,
  listFilesInFolder,
  listFilesRecursive,
  isDriveConfigured,
  buildClientFolderName,
  mirrorBlobToPoFolder,
} from "../google-drive";
import { extractColorsFromImage } from "../mockup/color-extract";
import { generateDesignBrief } from "../mockup/design-brief";
import { uploadPoPdfToDrive } from "../po-pdf";
import {
  searchGhlContacts,
  findGhlContactByEmail,
  getGhlContact,
  upsertGhlContact,
  createGhlOpportunity,
  type GhlContact,
} from "../ghl-contacts";
import { SIDELINE_PIPELINE_ID, SIDELINE_STAGE_IDS } from "../ghl-config";
import { isSidelinePipelineStage, type SidelinePipelineStage } from "@shared/pipeline";

const router = Router();

// All admin routes require admin authentication
router.use(requireAdmin);

// GET /dashboard — stats
router.get("/dashboard", async (_req, res) => {
  try {
    const stats = await storage.getDashboardStats();
    res.json(stats);
  } catch (err) {
    console.error("Admin dashboard error:", err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

// GET /orders — all orders, filterable/paginated
router.get("/orders", async (req, res) => {
  try {
    const { status, designStatus, search, limit, offset } = req.query;
    const result = await storage.getAllOrders({
      status: status as string | undefined,
      designStatus: designStatus as string | undefined,
      search: search as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json(result);
  } catch (err) {
    console.error("Admin orders error:", err);
    res.status(500).json({ error: "Failed to load orders" });
  }
});

// GET /orders/:id — order + items + designs + comments
router.get("/orders/:id", async (req, res) => {
  try {
    const result = await storage.getOrderWithDetails(req.params.id);
    if (!result) return res.status(404).json({ error: "Order not found" });
    res.json(result);
  } catch (err) {
    console.error("Admin order detail error:", err);
    res.status(500).json({ error: "Failed to load order" });
  }
});

// PATCH /orders/:id — update status, admin notes, PO fields, tracking
const updateOrderSchema = z.object({
  status: z.string().optional(),
  designStatus: z.string().optional(),
  adminNotes: z.string().optional(),
  trackingNumber: z.string().optional(),
  trackingUrl: z.string().optional(),
  estimatedDeliveryDate: z.string().transform(v => v ? new Date(v) : undefined).optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().optional(),
  customerFirstName: z.string().optional(),
  customerLastName: z.string().optional(),
  customerPhone: z.string().optional(),
  companyEmail: z.string().optional(),
  companyPhone: z.string().optional(),
  poReference: z.string().optional(),
  accountName: z.string().optional(),
  isRepeatOrder: z.boolean().optional(),
  poComments: z.string().optional(),
  deliveryAttention: z.string().optional(),
  deliveryAddress: z.string().optional(),
  deliveryEmail: z.string().optional(),
  deliveryPhone: z.string().optional(),
  dueDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
  orderType: z.enum(["team-store", "bulk-order", "sample-run"]).optional(),
  artworkApproved: z.boolean().optional(),
  artworkApprovedBy: z.union([z.string(), z.null()]).optional(),
  artworkApprovedAt: z.union([z.string().transform(v => v ? new Date(v) : null), z.null()]).optional(),
});

// DELETE /orders/:id — cascades through items, breakdowns, designs, stages,
// qc, messages, activity. Drive folder is intentionally left behind as an
// audit trail; clean that up manually if needed.
router.delete("/orders/:id", async (req, res) => {
  try {
    const ok = await storage.deleteOrder(req.params.id);
    if (!ok) return res.status(404).json({ error: "Order not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("Admin delete order error:", err);
    res.status(500).json({ error: "Failed to delete order" });
  }
});

// POST /orders/:id/duplicate — clone order + items (not size breakdowns, not
// designs, not activity — those are order-specific history). New order gets
// a fresh orderNumber, no poReference, status=pending, pipelineStage=null.
// Useful for repeat runs where the same club re-orders the same product mix.
router.post("/orders/:id/duplicate", async (req, res) => {
  try {
    const source = await storage.getOrderWithDetails(req.params.id);
    if (!source) return res.status(404).json({ error: "Order not found" });
    const { order: src, items: srcItems } = source;

    const { id: _id, orderNumber: _n, createdAt: _c, updatedAt: _u, paidAt: _p, poReference: _po,
            driveFolderId: _df, driveFolderUrl: _du, driveFolderName: _dn,
            ghlOpportunityId: _gh, pipelineStage: _ps, assignedSupplierId: _as,
            artworkApproved: _aa, artworkApprovedBy: _ab, artworkApprovedAt: _at,
            ...orderCopy } = src as any;

    const newOrderNumber = `SNZ-DUP-${Date.now().toString(36).toUpperCase()}`;
    const newOrder = await storage.createOrder({
      ...orderCopy,
      orderNumber: newOrderNumber,
      status: "pending",
      designStatus: null,
      isRepeatOrder: true,
    } as any);

    for (const it of srcItems) {
      const { id: _iid, orderId: _oid, ...itemCopy } = it as any;
      await storage.createOrderItem({ ...itemCopy, orderId: newOrder.id } as any);
    }

    res.json({ ok: true, order: newOrder });
  } catch (err) {
    console.error("Admin duplicate order error:", err);
    res.status(500).json({ error: "Failed to duplicate order" });
  }
});

router.patch("/orders/:id", async (req, res) => {
  try {
    const data = updateOrderSchema.parse(req.body);
    const oldOrder = await storage.getOrder(req.params.id);
    const order = await storage.updateOrder(req.params.id, data);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Notify customer on status change
    if (data.status && data.status !== oldOrder?.status && order.userId) {
      notifyOrderStatusChange({
        userId: order.userId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        newStatus: data.status,
        customerEmail: order.customerEmail,
      }).catch(err => console.error("Notify order status error:", err));
    }

    res.json(order);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin update order error:", err);
    res.status(500).json({ error: "Failed to update order" });
  }
});

// POST /orders/:id/design-review — approve/reject design file + comment
const designReviewSchema = z.object({
  designFileId: z.string(),
  action: z.enum(["approved", "rejected"]),
  comment: z.string().optional(),
});

router.post("/orders/:id/design-review", async (req, res) => {
  try {
    const { designFileId, action, comment } = designReviewSchema.parse(req.body);
    const user = (req as any).user;

    // Update design file status
    const file = await storage.updateDesignFileStatus(designFileId, action);
    if (!file) return res.status(404).json({ error: "Design file not found" });

    // Create comment record
    if (comment || action) {
      await storage.createDesignComment({
        designFileId,
        userId: user.userId,
        comment: comment || `Design ${action}`,
        action,
      });
    }

    // Notify the customer (DB + email + GHL)
    if (file.userId) {
      const order = await storage.getOrder(file.orderId);
      const customer = await storage.getUser(file.userId);
      const notifyOpts = {
        userId: file.userId,
        orderId: file.orderId,
        designFileId: file.id,
        label: file.label,
        orderNumber: order?.orderNumber || "",
        customerEmail: customer?.email || order?.customerEmail,
      };

      if (action === "approved") {
        await notifyDesignApproved(notifyOpts);
      } else {
        await notifyDesignRejected({ ...notifyOpts, comment });
      }
    }

    // Check if all designs for this order are approved
    const allDesigns = await storage.getDesignFilesByOrder(file.orderId);
    const latestByLabel = new Map<string, typeof allDesigns[0]>();
    for (const d of allDesigns) {
      const existing = latestByLabel.get(d.label);
      if (!existing || (d.createdAt && existing.createdAt && d.createdAt > existing.createdAt)) {
        latestByLabel.set(d.label, d);
      }
    }
    const latestDesigns = Array.from(latestByLabel.values());
    const allApproved = latestDesigns.length > 0 &&
      latestDesigns.every(d => d.status === "approved");

    if (allApproved) {
      await storage.updateOrder(file.orderId, { designStatus: "approved" });
    } else if (action === "rejected") {
      await storage.updateOrder(file.orderId, { designStatus: "needs_revision" });
    }

    res.json({ file, allApproved });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin design review error:", err);
    res.status(500).json({ error: "Failed to review design" });
  }
});

// ============ FILE VAULT (Google Drive per-PO folders) ============

// GET /vault — list POs that have a Drive folder attached (+ optional creation preview)
router.get("/vault", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        poReference: orders.poReference,
        accountName: orders.accountName,
        customerEmail: orders.customerEmail,
        customerFirstName: orders.customerFirstName,
        customerLastName: orders.customerLastName,
        driveFolderId: orders.driveFolderId,
        driveFolderUrl: orders.driveFolderUrl,
        driveFolderName: orders.driveFolderName,
        pipelineStage: orders.pipelineStage,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .orderBy(orders.createdAt);

    res.json({
      configured: isDriveConfigured(),
      orders: rows.reverse(), // most recent first
    });
  } catch (err) {
    console.error("Admin vault list error:", err);
    res.status(500).json({ error: "Failed to load vault" });
  }
});

// GET /vault/:orderId/files?folderId=... — list Drive items in the order's root
// folder (default) or any sub-folder the admin has drilled into. The sub-folder
// must resolve via the Drive API — we don't recursively validate ownership
// because access is already gated by the admin parent folder.
router.get("/vault/:orderId/files", async (req, res) => {
  try {
    const [row] = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        poReference: orders.poReference,
        accountName: orders.accountName,
        driveFolderId: orders.driveFolderId,
        driveFolderUrl: orders.driveFolderUrl,
        driveFolderName: orders.driveFolderName,
      })
      .from(orders)
      .where(eq(orders.id, req.params.orderId))
      .limit(1);

    if (!row) return res.status(404).json({ error: "Order not found" });
    if (!row.driveFolderId) {
      return res.json({ order: row, files: [], missing: true });
    }

    // When the admin drills into a specific sub-folder, list its contents
    // directly. When no folderId is passed we return root folders + ALL
    // files recursively (1 level deep) so dropped uploads in sub-folders
    // like "02. Mockups" / "03. Logos" are visible without clicking in.
    const folderId = (req.query.folderId as string) || row.driveFolderId;
    const recursive = req.query.recursive !== "false" && !req.query.folderId;
    const files = recursive
      ? await listFilesRecursive(row.driveFolderId)
      : await listFilesInFolder(folderId);

    // For the root view, also include the sub-folders themselves so the UI
    // can render browse-tiles alongside the flattened files list.
    let subfolders: any[] = [];
    if (recursive) {
      const all = await listFilesInFolder(row.driveFolderId);
      subfolders = all.filter((f) => f.mimeType === "application/vnd.google-apps.folder");
    }

    res.json({
      order: row,
      files,
      subfolders,
      folderId,
      rootFolderId: row.driveFolderId,
      recursive,
      missing: false,
    });
  } catch (err) {
    console.error("Admin vault files error:", err);
    res.status(500).json({ error: "Failed to load vault files" });
  }
});

// POST /vault/:orderId/create-folder — retroactively create the Drive folder for an
// order that didn't get one (e.g. created before this feature, or Drive was down).
router.post("/vault/:orderId/create-folder", async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, req.params.orderId))
      .limit(1);

    if (!row) return res.status(404).json({ error: "Order not found" });
    if (row.driveFolderId) return res.json({ ok: true, folderId: row.driveFolderId, already: true });

    const dateStr = (row.createdAt ? new Date(row.createdAt) : new Date()).toISOString().slice(0, 10);
    const companyForFolder = row.accountName?.trim() || "Sideline";
    const contactForFolder =
      [row.customerFirstName, row.customerLastName].filter(Boolean).join(" ").trim() ||
      row.customerName?.trim() ||
      row.customerEmail ||
      "Unnamed Contact";

    const folder = await createClientFolder({
      date: dateStr,
      companyName: companyForFolder,
      contactName: contactForFolder,
    });
    if (!folder) return res.status(500).json({ error: "Drive folder creation failed — check GOOGLE_* env vars" });

    await storage.updateOrder(row.id, {
      driveFolderId: folder.id,
      driveFolderUrl: folder.webViewLink,
      driveFolderName: folder.name,
    });

    res.json({ ok: true, folder });
  } catch (err) {
    console.error("Admin vault create-folder error:", err);
    res.status(500).json({ error: "Failed to create Drive folder" });
  }
});

// ============ GHL CONTACT SYNC ============
// These endpoints let the admin UI check/pull customers from GHL before
// creating a new local record. GHL is the CRM source of truth — portal
// mirrors it by email + ghlContactId link.

// GET /ghl/search?q=... — search GHL contacts (typeahead)
router.get("/ghl/search", async (req, res) => {
  try {
    const q = ((req.query.q as string) || "").trim();
    if (q.length < 2) return res.json({ contacts: [], total: 0 });

    // Also surface whether we already have a local user linked to each GHL contact
    const result = await searchGhlContacts(q, 10);
    const emails = result.contacts
      .map((c) => c.email)
      .filter((e): e is string => !!e);

    const localLinks: Record<string, { userId: string; teamName: string | null }> = {};
    for (const email of emails) {
      const local = await storage.getUserByEmail(email);
      if (local) localLinks[email] = { userId: local.id, teamName: local.teamName };
    }

    res.json({
      contacts: result.contacts.map((c) => ({
        id: c.id,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        companyName: c.companyName,
        tags: c.tags,
        linkedUser: c.email ? localLinks[c.email] || null : null,
      })),
      total: result.total,
    });
  } catch (err) {
    console.error("Admin GHL search error:", err);
    res.status(500).json({ error: "GHL search failed" });
  }
});

// GET /ghl/lookup?email=... — exact email match (used by invite form live check)
router.get("/ghl/lookup", async (req, res) => {
  try {
    const email = ((req.query.email as string) || "").trim();
    if (!email) return res.status(400).json({ error: "email required" });

    const ghlContact = await findGhlContactByEmail(email);
    const local = await storage.getUserByEmail(email);

    res.json({
      ghl: ghlContact
        ? {
            id: ghlContact.id,
            email: ghlContact.email,
            firstName: ghlContact.firstName,
            lastName: ghlContact.lastName,
            phone: ghlContact.phone,
            companyName: ghlContact.companyName,
            tags: ghlContact.tags,
          }
        : null,
      local: local
        ? { id: local.id, email: local.email, teamName: local.teamName, ghlContactId: local.ghlContactId }
        : null,
    });
  } catch (err) {
    console.error("Admin GHL lookup error:", err);
    res.status(500).json({ error: "GHL lookup failed" });
  }
});

// POST /ghl/import — pull a GHL contact into local users as a customer (+ send invite)
const ghlImportSchema = z.object({
  ghlContactId: z.string().min(1),
  sendInvite: z.boolean().optional().default(true),
});

router.post("/ghl/import", async (req, res) => {
  try {
    const { ghlContactId, sendInvite } = ghlImportSchema.parse(req.body);

    const contact = await getGhlContact(ghlContactId);
    if (!contact || !contact.email) {
      return res.status(404).json({ error: "GHL contact not found or missing email" });
    }

    // Already linked locally?
    const existing = await storage.getUserByEmail(contact.email);
    if (existing) {
      // Backfill the link if we didn't have it yet
      if (!existing.ghlContactId) {
        await storage.updateCustomer(existing.id, { ghlContactId: contact.id });
      }
      return res.status(200).json({
        id: existing.id,
        email: existing.email,
        imported: false,
        reason: "already_linked",
      });
    }

    const teamName = contact.companyName || [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || undefined;
    const phone = contact.phone || undefined;

    const user = await storage.createInvite(contact.email, teamName, "customer", contact.id, phone);

    if (sendInvite && user.inviteToken) {
      sendInviteEmail(contact.email, user.inviteToken, teamName).catch((err) =>
        console.error("Failed to send invite email:", err),
      );
    }

    res.status(201).json({
      id: user.id,
      email: user.email,
      ghlContactId: contact.id,
      inviteToken: user.inviteToken,
      inviteExpiresAt: user.inviteExpiresAt,
      imported: true,
    });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin GHL import error:", err);
    res.status(500).json({ error: "Failed to import GHL contact" });
  }
});

// GET /customers — all customer accounts
router.get("/customers", async (req, res) => {
  try {
    const { search, limit, offset } = req.query;
    const result = await storage.getAllCustomers({
      search: search as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json(result);
  } catch (err) {
    console.error("Admin customers error:", err);
    res.status(500).json({ error: "Failed to load customers" });
  }
});

// GET /customers/:id — customer + their orders
router.get("/customers/:id", async (req, res) => {
  try {
    const result = await storage.getCustomerWithOrders(req.params.id);
    if (!result) return res.status(404).json({ error: "Customer not found" });
    res.json(result);
  } catch (err) {
    console.error("Admin customer detail error:", err);
    res.status(500).json({ error: "Failed to load customer" });
  }
});

// PATCH /customers/:id — edit team details
const updateCustomerSchema = z.object({
  teamName: z.string().optional(),
  contactPhone: z.string().optional(),
});

router.patch("/customers/:id", async (req, res) => {
  try {
    const data = updateCustomerSchema.parse(req.body);
    const customer = await storage.updateCustomer(req.params.id, data);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    // Mirror edit to GHL (fire-and-forget — local write is authoritative for the response)
    if (customer.email) {
      upsertGhlContact({
        email: customer.email,
        phone: data.contactPhone ?? customer.contactPhone ?? undefined,
        companyName: data.teamName ?? customer.teamName ?? undefined,
      })
        .then(async (result) => {
          if (result.contactId && !customer.ghlContactId) {
            await storage.updateCustomer(customer.id, { ghlContactId: result.contactId });
          }
        })
        .catch((err) => console.error("[admin PATCH customer] GHL sync failed:", err));
    }

    res.json(customer);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin update customer error:", err);
    res.status(500).json({ error: "Failed to update customer" });
  }
});

// POST /customers/invite — create account + invite link + upsert GHL contact
const inviteSchema = z.object({
  email: z.string().email(),
  teamName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
});

router.post("/customers/invite", async (req, res) => {
  try {
    const { email, teamName, firstName, lastName, phone } = inviteSchema.parse(req.body);

    // Check if email already exists locally
    const existing = await storage.getUserByEmail(email);
    if (existing) return res.status(409).json({ error: "An account with this email already exists" });

    // Upsert GHL contact first so we can store the link on create
    const ghlResult = await upsertGhlContact({
      email,
      firstName,
      lastName,
      phone,
      companyName: teamName,
      tags: ["sideline-customer"],
    });

    const user = await storage.createInvite(email, teamName, "customer", ghlResult.contactId || undefined, phone);

    // Send invite email
    if (user.inviteToken) {
      sendInviteEmail(email, user.inviteToken, teamName).catch(err =>
        console.error("Failed to send invite email:", err)
      );
    }

    res.status(201).json({
      id: user.id,
      email: user.email,
      ghlContactId: ghlResult.contactId,
      ghlCreated: ghlResult.created,
      inviteToken: user.inviteToken,
      inviteExpiresAt: user.inviteExpiresAt,
    });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin invite error:", err);
    res.status(500).json({ error: "Failed to create invite" });
  }
});

// POST /suppliers/invite — create supplier account + invite link
// Same pattern as /customers/invite but creates a user with role="supplier".
// The supplier accepts the invite at /supplier/accept-invite/:token and lands on /supplier after setting a password.
const supplierInviteSchema = z.object({
  email: z.string().email(),
  supplierName: z.string().min(1, "Supplier name is required"), // stored on users.teamName
});

router.post("/suppliers/invite", async (req, res) => {
  try {
    const { email, supplierName } = supplierInviteSchema.parse(req.body);

    const existing = await storage.getUserByEmail(email);
    if (existing) return res.status(409).json({ error: "An account with this email already exists" });

    const user = await storage.createInvite(email, supplierName, "supplier");

    // Send the same invite email — sendInviteEmail already builds a /accept-invite?token=... link.
    // Once the supplier clicks it, the /supplier/accept-invite page will handle the redirect to /supplier.
    // (If you want supplier-specific copy, we can fork sendInviteEmail later.)
    if (user.inviteToken) {
      sendInviteEmail(email, user.inviteToken, supplierName).catch(err =>
        console.error("Failed to send supplier invite email:", err),
      );
    }

    res.status(201).json({
      id: user.id,
      email: user.email,
      role: user.role,
      inviteToken: user.inviteToken,
      inviteExpiresAt: user.inviteExpiresAt,
    });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin supplier invite error:", err);
    res.status(500).json({ error: "Failed to create supplier invite" });
  }
});

// GET /orders/:id/invoice — admin invoice view
router.get("/orders/:id/invoice", async (req, res) => {
  try {
    const result = await storage.getOrderWithDetails(req.params.id);
    if (!result) return res.status(404).json({ error: "Order not found" });

    let customer = null;
    if (result.order.userId) {
      const user = await storage.getUser(result.order.userId);
      if (user) {
        customer = { email: user.email, teamName: user.teamName, contactPhone: user.contactPhone };
      }
    }

    res.json({
      order: result.order,
      items: result.items,
      customer: customer || {
        email: result.order.customerEmail,
        teamName: null,
        contactPhone: null,
      },
      company: {
        name: "Sideline NZ Ltd",
        address: "New Zealand",
        email: "info@sidelinenz.com",
        website: "sidelinenz.com",
      },
    });
  } catch (err) {
    console.error("Admin invoice error:", err);
    res.status(500).json({ error: "Failed to load invoice" });
  }
});

// ============ ORDER ITEM PRODUCT-LINE DETAILS ============

// PATCH /orders/:id/items/:itemId — update product-line design details
const updateItemSchema = z.object({
  productColors: z.array(z.object({ hex: z.string(), name: z.string().optional() })).optional(),
  brandingMethod: z.string().optional(),
  productType: z.string().optional(),
  material: z.string().optional(),
  productName: z.string().optional(),
  frontDesignUrl: z.union([z.string(), z.null()]).optional(),
  backDesignUrl: z.union([z.string(), z.null()]).optional(),
  elementUrls: z.array(z.object({
    name: z.string(),
    url: z.string(),
    position: z.string().optional(),
    application: z.string().optional(),
    sizeMm: z.string().optional(),
    threadColours: z.array(z.string()).optional(),
    artworkFile: z.string().optional(),
  })).optional(),
  designPrints: z.array(z.object({ label: z.string(), url: z.string() })).optional(),
  mockupImages: z.array(z.object({ label: z.string(), url: z.string() })).optional(),
  gradeGroup: z.string().optional(),
  designNotes: z.string().optional(),
  designBrief: z.string().optional(),
  sizeChartType: z.string().optional(),
});

router.patch("/orders/:id/items/:itemId", async (req, res) => {
  try {
    const data = updateItemSchema.parse(req.body);
    const user = (req as any).user;
    const updated = await storage.updateOrderItem(req.params.itemId, data);
    if (!updated) return res.status(404).json({ error: "Item not found" });

    // Mirror any new design asset into the PO's Drive folder, routed by type:
    //   front/back designs → "02. Mockups"
    //   element uploads    → "03. Logos"
    // Fire-and-forget — the PATCH response never blocks on Drive.
    const mirrorJobs: Array<{ url: string; slot: "mockups" | "logos" }> = [];
    if (data.frontDesignUrl) mirrorJobs.push({ url: data.frontDesignUrl, slot: "mockups" });
    if (data.backDesignUrl)  mirrorJobs.push({ url: data.backDesignUrl,  slot: "mockups" });
    if (data.mockupImages?.length) {
      for (const m of data.mockupImages) mirrorJobs.push({ url: m.url, slot: "mockups" });
    }
    if (data.designPrints?.length) {
      for (const p of data.designPrints) mirrorJobs.push({ url: p.url, slot: "mockups" });
    }
    if (data.elementUrls?.length) {
      for (const el of data.elementUrls) mirrorJobs.push({ url: el.url, slot: "logos" });
    }
    if (mirrorJobs.length) {
      (async () => {
        const [ord] = await db
          .select({ id: orders.id, driveFolderId: orders.driveFolderId })
          .from(orders)
          .where(eq(orders.id, req.params.id))
          .limit(1);
        if (!ord?.driveFolderId) return;
        for (const job of mirrorJobs) {
          await mirrorBlobToPoFolder({
            poFolderId: ord.driveFolderId,
            slot: job.slot,
            blobUrl: job.url,
          });
        }
      })().catch((err) => console.error("[item-patch] Drive mirror failed:", err));
    }

    await storage.logOrderActivity({
      orderId: req.params.id,
      userId: user.userId,
      action: "item_updated",
      details: { itemId: req.params.itemId, fields: Object.keys(data), mirroredCount: mirrorJobs.length },
    });

    res.json(updated);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin update item error:", err);
    res.status(500).json({ error: "Failed to update item" });
  }
});

// POST /orders/:id/items/:itemId/extract-colors
// AI-extract dominant colours from the item's design image.
// Body: { imageUrl?: string, apply?: boolean, side?: "front" | "back" | "custom" }
//   - imageUrl: override source. Defaults to item.frontDesignUrl → backDesignUrl.
//   - apply (default true): write the result to item.productColors
//   - side: which field to read from when imageUrl is not supplied
const extractColorsSchema = z.object({
  imageUrl: z.string().url().optional(),
  apply: z.boolean().optional().default(true),
  side: z.enum(["front", "back"]).optional(),
});

router.post("/orders/:id/items/:itemId/extract-colors", async (req, res) => {
  try {
    const { imageUrl, apply, side } = extractColorsSchema.parse(req.body);
    const user = (req as any).user;

    const [item] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, req.params.itemId))
      .limit(1);

    if (!item) return res.status(404).json({ error: "Item not found" });

    const sourceUrl =
      imageUrl ||
      (side === "back" ? item.backDesignUrl : side === "front" ? item.frontDesignUrl : null) ||
      item.frontDesignUrl ||
      item.backDesignUrl;

    if (!sourceUrl) return res.status(400).json({ error: "No design image on this item to analyse" });

    const colors = await extractColorsFromImage(sourceUrl);
    if (!colors) {
      return res.status(502).json({ error: "Colour extraction failed — check GEMINI_API_KEY or try a different image" });
    }

    if (apply) {
      await storage.updateOrderItem(req.params.itemId, { productColors: colors } as any);
      await storage.logOrderActivity({
        orderId: req.params.id,
        userId: user?.userId,
        action: "colors_extracted",
        details: { itemId: req.params.itemId, sourceUrl, colorCount: colors.length },
      });
    }

    res.json({ colors, sourceUrl, applied: apply });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin extract-colors error:", err);
    res.status(500).json({ error: "Failed to extract colours" });
  }
});

// POST /orders/:id/items/:itemId/generate-brief
// AI design brief — Gemini reads front + back mockup images and writes a
// structured description of the design layout. Stored on item.designBrief.
router.post("/orders/:id/items/:itemId/generate-brief", async (req, res) => {
  try {
    const user = (req as any).user;
    const [item] = await db.select().from(orderItems).where(eq(orderItems.id, req.params.itemId)).limit(1);
    if (!item) return res.status(404).json({ error: "Item not found" });

    const imageUrls: string[] = [];
    if (item.frontDesignUrl) imageUrls.push(item.frontDesignUrl);
    if (item.backDesignUrl) imageUrls.push(item.backDesignUrl);
    if (!imageUrls.length) return res.status(400).json({ error: "Upload front or back design first" });

    const brief = await generateDesignBrief(imageUrls);
    if (!brief) return res.status(502).json({ error: "Design brief generation failed — check GEMINI_API_KEY" });

    await storage.updateOrderItem(req.params.itemId, { designBrief: brief } as any);
    await storage.logOrderActivity({
      orderId: req.params.id,
      userId: user?.userId,
      action: "design_brief_generated",
      details: { itemId: req.params.itemId, wordCount: brief.split(/\s+/).length },
    });

    res.json({ brief });
  } catch (err: any) {
    console.error("Admin generate-brief error:", err);
    res.status(500).json({ error: "Failed to generate design brief" });
  }
});

// GET /orders/next-po-reference — preview the next auto-assigned PO reference
// (client calls this to show the value once the PO form has enough detail).
router.get("/orders/next-po-reference", async (_req, res) => {
  try {
    const reference = await buildPoReference();
    res.json({ reference });
  } catch (err) {
    console.error("Admin next-po-reference error:", err);
    res.status(500).json({ error: "Failed to preview PO reference" });
  }
});

// POST /orders/create-po — create a new purchase order from scratch (admin-initiated)
const createPoSchema = z.object({
  storeSlug: z.string(),
  orderType: z.enum(["team-store", "bulk-order", "sample-run"]).optional().default("bulk-order"),
  customerEmail: z.string().email().optional(),
  customerName: z.string().optional(), // full name (kept for back-compat / display)
  customerFirstName: z.string().optional(),
  customerLastName: z.string().optional(),
  customerPhone: z.string().optional(),
  poReference: z.string().optional(),
  accountName: z.string().optional(), // company / team / club name
  companyEmail: z.string().email().optional(),
  companyPhone: z.string().optional(),
  isRepeatOrder: z.boolean().optional(),
  poComments: z.string().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // customer "Door to Customer" date
  deliveryAttention: z.string().optional(),
  deliveryAddress: z.string().optional(),
  deliveryEmail: z.string().optional(),
  deliveryPhone: z.string().optional(),
  items: z.array(z.object({
    productName: z.string(),
    productType: z.string().optional(),
    material: z.string().optional(),
    quantity: z.number().int().min(1),
    unitAmount: z.number().int().min(0),
    brandingMethod: z.string().optional(),
    gradeGroup: z.string().optional(), // deprecated but still accepted
  })).min(1),
});

router.post("/orders/create-po", async (req, res) => {
  try {
    const data = createPoSchema.parse(req.body);
    const user = (req as any).user;

    // Auto-assign a numeric PO reference (PO-YYYY-NNNN) if the admin didn't
    // supply one. The UI no longer exposes this field — the server owns it.
    const poReference = data.poReference?.trim() || (await buildPoReference());

    // Derive first/last name when only combined customerName was sent (UI
    // backfill), or combined customerName when only first/last were sent.
    const firstName = data.customerFirstName?.trim() || data.customerName?.trim().split(" ")[0];
    const lastName =
      data.customerLastName?.trim() ||
      data.customerName?.trim().split(" ").slice(1).join(" ") || undefined;
    const fullName = data.customerName?.trim() || [firstName, lastName].filter(Boolean).join(" ") || undefined;

    // Calculate totals
    const subtotal = data.items.reduce((sum, i) => sum + (i.unitAmount * i.quantity), 0);

    // PO number: SL-YYYY-[CLIENT]-[SEQ] (see server/po-number.ts).
    // Slug is derived from accountName if present (usually the team/club name),
    // falling back to customerName. withPoNumberRetry handles the rare race
    // where two admins create POs at the same time and collide on the sequence.
    const clientForSlug = data.accountName || data.customerName || null;
    const order = await withPoNumberRetry(clientForSlug, async (orderNumber) =>
      storage.createOrder({
        orderNumber,
        storeSlug: data.storeSlug,
        orderType: data.orderType,
        status: "processing",
        subtotal,
        total: subtotal,
        currency: "nzd",
        customerEmail: data.customerEmail ?? null,
        customerName: fullName ?? null,
        customerFirstName: firstName ?? null,
        customerLastName: lastName ?? null,
        companyEmail: data.companyEmail ?? null,
        companyPhone: data.companyPhone ?? null,
        poReference,
        accountName: data.accountName ?? null,
        isRepeatOrder: data.isRepeatOrder ?? false,
        poComments: data.poComments ?? null,
        dueDate: data.dueDate ?? null,
        deliveryAttention: data.deliveryAttention ?? null,
        deliveryAddress: data.deliveryAddress ?? null,
        deliveryEmail: data.deliveryEmail ?? null,
        deliveryPhone: data.deliveryPhone ?? null,
      } as any),
    );

    // Create order items
    for (const item of data.items) {
      await storage.createOrderItem({
        orderId: order.id,
        productId: "manual",
        priceId: "manual",
        productName: item.productName,
        productType: item.productType ?? null,
        material: item.material ?? null,
        quantity: item.quantity,
        unitAmount: item.unitAmount,
        currency: "nzd",
        gradeGroup: item.gradeGroup ?? null,
        brandingMethod: item.brandingMethod ?? null,
      } as any);
    }

    // Auto-create the per-client Google Drive folder (File Vault).
    // Name convention (Romero 2026-04-15): YYYY-MM-DD.Company.Contact
    // If Drive isn't configured this is a no-op — the order still saves.
    try {
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10);
      const companyForFolder = data.accountName?.trim() || "Sideline";
      const contactForFolder = [firstName, lastName].filter(Boolean).join(" ").trim() || data.customerEmail || "Unnamed Contact";
      const folder = await createClientFolder({
        date: dateStr,
        companyName: companyForFolder,
        contactName: contactForFolder,
      });
      if (folder) {
        await storage.updateOrder(order.id, {
          driveFolderId: folder.id,
          driveFolderUrl: folder.webViewLink,
          driveFolderName: folder.name,
        });
      }
    } catch (err) {
      console.error("[create-po] Drive folder creation failed (non-fatal):", err);
    }

    // Link to customer if email matches + sync GHL contact + create opportunity.
    // GHL is source of truth for the pipeline — the opportunity links the order
    // to its pipeline card so the stage webhook can mirror changes both ways.
    let ghlContactId: string | null = null;
    if (data.customerEmail) {
      const customer = await storage.getUserByEmail(data.customerEmail);
      if (customer) {
        ghlContactId = customer.ghlContactId || null;
        await storage.linkOrdersByEmail(data.customerEmail, customer.id);
      }

      // Upsert GHL contact (find-or-create) with the full contact shape so the
      // GHL record mirrors the PO fields one-to-one. Company email + company
      // phone are pushed as custom fields so the GHL-side workflows can use
      // them without needing a separate "company" record.
      const customFields: Array<{ key: string; field_value: string }> = [];
      if (data.companyEmail) customFields.push({ key: "company_email", field_value: data.companyEmail });
      if (data.companyPhone) customFields.push({ key: "company_phone", field_value: data.companyPhone });

      const upsert = await upsertGhlContact({
        email: data.customerEmail,
        firstName,
        lastName,
        phone: data.customerPhone,
        companyName: data.accountName,
        tags: ["sideline-customer", "portal-po"],
        customFields: customFields.length ? customFields : undefined,
      });
      if (upsert.contactId) {
        ghlContactId = upsert.contactId;
        // Backfill local link if we have a local user but no ghlContactId yet
        if (customer && !customer.ghlContactId) {
          await storage.updateCustomer(customer.id, { ghlContactId: upsert.contactId });
        }
      }
    }

    // Create the opportunity at "Lead Received" (first stage); stage can be
    // advanced via /admin/orders/:id/stage or the GHL webhook once work begins.
    if (ghlContactId) {
      const opp = await createGhlOpportunity({
        contactId: ghlContactId,
        pipelineId: SIDELINE_PIPELINE_ID,
        stageId: SIDELINE_STAGE_IDS["Lead Received"],
        name: poReference || data.accountName || order.orderNumber || "Sideline Order",
        monetaryValue: Math.round(subtotal / 100),
        status: "open",
      });
      if (opp.opportunityId) {
        await storage.updateOrder(order.id, {
          ghlOpportunityId: opp.opportunityId,
          pipelineStage: "Lead Received",
        });
      }
    }

    // Initialize production pipeline
    await storage.initializeProductionPipeline(order.id);

    await storage.logOrderActivity({
      orderId: order.id,
      userId: user.userId,
      action: "po_created",
      details: { poReference, itemCount: data.items.length },
    });

    res.status(201).json(order);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin create PO error:", err);
    res.status(500).json({ error: "Failed to create purchase order" });
  }
});

// POST /orders/:id/items — add a single garment line item to an existing order.
// Used from the admin single-sheet view when building up a PO incrementally
// (vs. create-po which creates the entire order + all items at once).
const addItemSchema = z.object({
  productName: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  unitAmount: z.number().int().min(0).default(0),
  gradeGroup: z.string().optional(),
  brandingMethod: z.string().optional(),
  designNotes: z.string().optional(),
});

router.post("/orders/:id/items", async (req, res) => {
  try {
    const data = addItemSchema.parse(req.body);
    const user = (req as any).user;
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const item = await storage.createOrderItem({
      orderId: order.id,
      productId: "manual",
      priceId: "manual",
      productName: data.productName,
      quantity: data.quantity,
      unitAmount: data.unitAmount,
      currency: "nzd",
      gradeGroup: data.gradeGroup ?? null,
      brandingMethod: data.brandingMethod ?? null,
      designNotes: data.designNotes ?? null,
    } as any);

    await storage.logOrderActivity({
      orderId: order.id,
      userId: user.userId,
      action: "item_added",
      details: { itemId: item.id, productName: data.productName },
    });

    res.status(201).json(item);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin add item error:", err);
    res.status(500).json({ error: "Failed to add item" });
  }
});

// ============ SIZE BREAKDOWNS ============

// POST /orders/:id/size-breakdowns — add size breakdown for an order item
const sizeBreakdownSchema = z.object({
  orderItemId: z.string(),
  size: z.string(),
  quantity: z.number().int().min(1),
  playerName: z.string().optional(),
  playerNumber: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/orders/:id/size-breakdowns", async (req, res) => {
  try {
    const data = sizeBreakdownSchema.parse(req.body);
    const user = (req as any).user;
    const breakdown = await storage.createSizeBreakdown({
      ...data,
      orderId: req.params.id,
      playerName: data.playerName ?? null,
      playerNumber: data.playerNumber ?? null,
      notes: data.notes ?? null,
    });

    await storage.logOrderActivity({
      orderId: req.params.id,
      userId: user.userId,
      action: "size_breakdown_added",
      details: { size: data.size, quantity: data.quantity, playerName: data.playerName, playerNumber: data.playerNumber },
    });

    res.status(201).json(breakdown);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin size breakdown error:", err);
    res.status(500).json({ error: "Failed to create size breakdown" });
  }
});

// PATCH /orders/:id/size-breakdowns/:bid — update a breakdown
router.patch("/orders/:id/size-breakdowns/:bid", async (req, res) => {
  try {
    const updated = await storage.updateSizeBreakdown(req.params.bid, req.body);
    if (!updated) return res.status(404).json({ error: "Breakdown not found" });
    res.json(updated);
  } catch (err) {
    console.error("Admin update breakdown error:", err);
    res.status(500).json({ error: "Failed to update breakdown" });
  }
});

// DELETE /orders/:id/size-breakdowns/:bid — delete a breakdown
router.delete("/orders/:id/size-breakdowns/:bid", async (req, res) => {
  try {
    await storage.deleteSizeBreakdown(req.params.bid);
    res.json({ success: true });
  } catch (err) {
    console.error("Admin delete breakdown error:", err);
    res.status(500).json({ error: "Failed to delete breakdown" });
  }
});

// ============ PRODUCTION PIPELINE ============

// POST /orders/:id/production/initialize — create production pipeline for an order
router.post("/orders/:id/production/initialize", async (req, res) => {
  try {
    const user = (req as any).user;
    const existing = await storage.getProductionStages(req.params.id);
    if (existing.length > 0) return res.status(409).json({ error: "Pipeline already initialized" });

    const stages = await storage.initializeProductionPipeline(req.params.id);

    await storage.logOrderActivity({
      orderId: req.params.id,
      userId: user.userId,
      action: "production_initialized",
      details: { stageCount: stages.length },
    });

    res.status(201).json(stages);
  } catch (err) {
    console.error("Admin init pipeline error:", err);
    res.status(500).json({ error: "Failed to initialize pipeline" });
  }
});

// POST /orders/:id/production/advance — advance to next production stage
router.post("/orders/:id/production/advance", async (req, res) => {
  try {
    const user = (req as any).user;
    const { notes } = req.body || {};
    const stages = await storage.getProductionStages(req.params.id);
    if (stages.length === 0) return res.status(400).json({ error: "Pipeline not initialized" });

    const currentIdx = stages.findIndex(s => s.status === "in_progress");
    if (currentIdx === -1) return res.status(400).json({ error: "No active stage" });
    if (currentIdx >= stages.length - 1) return res.status(400).json({ error: "Already at final stage" });

    const now = new Date();

    // Complete current stage
    await storage.updateProductionStage(stages[currentIdx].id, {
      status: "completed",
      completedAt: now,
      completedBy: user.userId,
      notes: notes || null,
    });

    // Start next stage
    const nextStage = stages[currentIdx + 1];
    await storage.updateProductionStage(nextStage.id, {
      status: "in_progress",
      enteredAt: now,
    });

    // Update order's production stage
    await storage.updateOrder(req.params.id, { productionStage: nextStage.stage } as any);

    // Log activity
    await storage.logOrderActivity({
      orderId: req.params.id,
      userId: user.userId,
      action: "stage_advanced",
      details: { from: stages[currentIdx].stage, to: nextStage.stage, notes },
    });

    // Notify customer about production progress
    const order = await storage.getOrder(req.params.id);
    if (order?.userId) {
      const stageLabels: Record<string, string> = {
        design_confirmed: "Your designs have been confirmed",
        in_production: "Your order is now in production",
        printing: "Your order is being printed/embroidered",
        quality_check: "Your order is undergoing quality checks",
        packing: "Your order is being packed",
        shipped: "Your order has been shipped",
        delivered: "Your order has been delivered",
      };

      const label = stageLabels[nextStage.stage];
      if (label) {
        await storage.createNotification({
          userId: order.userId,
          type: "production_update",
          title: "Production Update",
          message: `${label} — Order ${order.orderNumber}`,
          orderId: order.id,
        });
      }
    }

    const updated = await storage.getProductionStages(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error("Admin advance stage error:", err);
    res.status(500).json({ error: "Failed to advance stage" });
  }
});

// PATCH /orders/:id/production/:stageId — update a specific production stage
router.patch("/orders/:id/production/:stageId", async (req, res) => {
  try {
    const updated = await storage.updateProductionStage(req.params.stageId, req.body);
    if (!updated) return res.status(404).json({ error: "Stage not found" });
    res.json(updated);
  } catch (err) {
    console.error("Admin update stage error:", err);
    res.status(500).json({ error: "Failed to update stage" });
  }
});

// ============ QUALITY CONTROL ============

// POST /orders/:id/qc — create a quality check
const qcSchema = z.object({
  productionStageId: z.string().optional(),
  checkType: z.enum(["pre_production", "mid_production", "final", "packaging"]),
  status: z.enum(["pending", "passed", "failed", "conditional"]).default("pending"),
  notes: z.string().optional(),
  photoUrls: z.array(z.string()).optional(),
  issues: z.string().optional(),
});

router.post("/orders/:id/qc", async (req, res) => {
  try {
    const data = qcSchema.parse(req.body);
    const user = (req as any).user;

    const check = await storage.createQualityCheck({
      orderId: req.params.id,
      productionStageId: data.productionStageId ?? null,
      checkType: data.checkType,
      status: data.status,
      checkedBy: user.userId,
      notes: data.notes ?? null,
      photoUrls: data.photoUrls ?? null,
      issues: data.issues ?? null,
    });

    await storage.logOrderActivity({
      orderId: req.params.id,
      userId: user.userId,
      action: "qc_created",
      details: { checkType: data.checkType, status: data.status },
    });

    // Notify customer if QC failed
    if (data.status === "failed") {
      const order = await storage.getOrder(req.params.id);
      if (order?.userId) {
        await storage.createNotification({
          userId: order.userId,
          type: "qc_issue",
          title: "Quality Check Issue",
          message: `A quality issue was found on your order ${order.orderNumber}. Our team is working on it.`,
          orderId: order.id,
        });
      }
    }

    res.status(201).json(check);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin QC create error:", err);
    res.status(500).json({ error: "Failed to create QC check" });
  }
});

// PATCH /orders/:id/qc/:checkId — update a quality check
router.patch("/orders/:id/qc/:checkId", async (req, res) => {
  try {
    const user = (req as any).user;
    const existing = await storage.getQualityCheck(req.params.checkId);
    if (!existing) return res.status(404).json({ error: "QC check not found" });

    const updated = await storage.updateQualityCheck(req.params.checkId, {
      ...req.body,
      checkedBy: user.userId,
      resolvedAt: req.body.status === "passed" ? new Date() : undefined,
    });

    await storage.logOrderActivity({
      orderId: req.params.id,
      userId: user.userId,
      action: "qc_updated",
      details: { checkId: req.params.checkId, status: req.body.status },
    });

    res.json(updated);
  } catch (err) {
    console.error("Admin QC update error:", err);
    res.status(500).json({ error: "Failed to update QC check" });
  }
});

// ============ ORDER MESSAGES ============

// GET /orders/:id/messages — get all messages for an order
router.get("/orders/:id/messages", async (req, res) => {
  try {
    const messages = await storage.getOrderMessages(req.params.id);
    res.json(messages);
  } catch (err) {
    console.error("Admin messages error:", err);
    res.status(500).json({ error: "Failed to load messages" });
  }
});

// POST /orders/:id/messages — send a message on an order
const messageSchema = z.object({
  message: z.string().min(1),
  attachmentUrl: z.string().url().optional(),
  attachmentName: z.string().optional(),
});

router.post("/orders/:id/messages", async (req, res) => {
  try {
    const data = messageSchema.parse(req.body);
    const user = (req as any).user;

    const msg = await storage.createOrderMessage({
      orderId: req.params.id,
      userId: user.userId,
      senderRole: "admin",
      message: data.message,
      attachmentUrl: data.attachmentUrl ?? null,
      attachmentName: data.attachmentName ?? null,
    });

    // Notify customer about new message
    const order = await storage.getOrder(req.params.id);
    if (order?.userId) {
      await storage.createNotification({
        userId: order.userId,
        type: "new_message",
        title: "New Message",
        message: `New message on order ${order.orderNumber}`,
        orderId: order.id,
      });
    }

    res.status(201).json(msg);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin message error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ============ ORDER ACTIVITY LOG ============

// GET /orders/:id/activity — get activity log for an order
router.get("/orders/:id/activity", async (req, res) => {
  try {
    const activity = await storage.getOrderActivityLog(req.params.id);
    res.json(activity);
  } catch (err) {
    console.error("Admin activity error:", err);
    res.status(500).json({ error: "Failed to load activity" });
  }
});

// GET /designs/pending — all pending design files (review queue)
router.get("/designs/pending", async (_req, res) => {
  try {
    const files = await storage.getPendingDesignFiles();
    res.json(files);
  } catch (err) {
    console.error("Admin pending designs error:", err);
    res.status(500).json({ error: "Failed to load pending designs" });
  }
});

// ====== Supplier management (Sideline portal step 4) ======

// GET /suppliers — list all users with role = supplier.
// Returns the data the admin UI needs to pick a supplier from a dropdown
// when raising a PO. Small list, no pagination needed (typically a handful).
router.get("/suppliers", async (_req, res) => {
  try {
    const list = await storage.listSuppliers();
    res.json({
      suppliers: list.map((u) => ({
        id: u.id,
        email: u.email,
        supplierName: u.teamName,
        // `password === ""` means the invite hasn't been accepted yet
        inviteAccepted: u.password !== "",
        createdAt: u.createdAt,
      })),
    });
  } catch (err) {
    console.error("Admin list suppliers error:", err);
    res.status(500).json({ error: "Failed to load suppliers" });
  }
});

// POST /orders/:id/assign-supplier — set orders.assignedSupplierId.
// Separate from raise-po so you can pre-assign before raising (or reassign after).
// Does NOT push to GHL — assignment alone isn't a pipeline event.
const assignSupplierSchema = z.object({
  supplierId: z.string().min(1, "supplierId is required"),
});

router.post("/orders/:id/assign-supplier", async (req, res) => {
  try {
    const { supplierId } = assignSupplierSchema.parse(req.body);

    // Validate the target user exists and is a supplier
    const supplier = await storage.getUser(supplierId);
    if (!supplier || supplier.role !== "supplier") {
      return res.status(400).json({ error: "Invalid supplier ID" });
    }

    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const previousSupplierId = order.assignedSupplierId;
    await db.update(orders)
      .set({ assignedSupplierId: supplierId, updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    await db.insert(orderActivity).values({
      orderId: order.id,
      userId: (req as any).user?.userId,
      action: "supplier_assigned",
      details: { from: previousSupplierId, to: supplierId, supplierName: supplier.teamName },
    });

    res.json({ ok: true, supplierId });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin assign supplier error:", err);
    res.status(500).json({ error: "Failed to assign supplier" });
  }
});

// POST /orders/:id/generate-pdf — generate PO PDF and upload to Drive (01. Brief)
// Can be called any time — not just on dispatch. Useful for re-generating after
// edits, or for orders that were created before PDF gen was wired.
router.post("/orders/:id/generate-pdf", async (req, res) => {
  try {
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!order.driveFolderId) return res.status(400).json({ error: "No Drive folder — create one first" });

    const result = await uploadPoPdfToDrive(order.id, order.driveFolderId);
    if (!result) return res.status(502).json({ error: "PDF generation or Drive upload failed" });

    await storage.logOrderActivity({
      orderId: order.id,
      userId: (req as any).user?.userId,
      action: "po_pdf_generated",
      details: { pdfId: result.pdfId },
    });

    res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("Admin generate-pdf error:", err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

// POST /orders/:id/raise-po — the main action that ties step 2 (GHL sync) and
// step 3 (supplier portal) together:
//   1. Validates the order has a supplier assigned (body.supplierId or order.assignedSupplierId)
//   2. Sets orders.assignedSupplierId if not already set
//   3. Pushes GHL opportunity to "PO Raised" stage (GHL webhook then mirrors
//      it back into orders.pipelineStage — we don't write pipelineStage ourselves)
//   4. Emails the supplier with a link to the portal
//   5. Writes an activity log row
//
// If GHL push fails (creds missing, network, etc), the order is still marked
// PO-raised internally via orderActivity — GHL sync will catch up on the next
// manual stage move. Don't fail the whole request just because GHL is down.
const raisePoSchema = z.object({
  supplierId: z.string().optional(), // optional if already assigned
});

router.post("/orders/:id/raise-po", async (req, res) => {
  try {
    const { supplierId: bodySupplierId } = raisePoSchema.parse(req.body ?? {});

    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const supplierId = bodySupplierId || order.assignedSupplierId;
    if (!supplierId) {
      return res.status(400).json({ error: "No supplier assigned — pass supplierId in the body or assign first" });
    }

    const supplier = await storage.getUser(supplierId);
    if (!supplier || supplier.role !== "supplier") {
      return res.status(400).json({ error: "Invalid supplier ID" });
    }

    // 1. Assign if not already
    if (order.assignedSupplierId !== supplierId) {
      await db.update(orders)
        .set({ assignedSupplierId: supplierId, updatedAt: new Date() })
        .where(eq(orders.id, order.id));
    }

    // 2. Push GHL to PO Raised (if the order is linked to a GHL opportunity)
    let ghlPushResult: { success: boolean; reason?: string } = { success: false, reason: "no_ghl_link" };
    if (order.ghlOpportunityId) {
      ghlPushResult = await updateGhlOpportunityStage(order.ghlOpportunityId, "PO Raised");
    }

    // 3. Email the supplier via Gmail API from orders@sidelinenz.com.
    // CC's the supplier's ccEmail (secondary contact) + self-cc orders@ so
    // the thread lives in the shared orders inbox.
    let gmailMessageId: string | null = null;
    if (supplier.email) {
      try {
        const items = await storage.getOrderItems(order.id);
        gmailMessageId = await sendSupplierPoDispatchGmail({
          to: supplier.email,
          cc: supplier.ccEmail || undefined,
          supplierName: supplier.teamName,
          orderNumber: order.orderNumber,
          poReference: order.poReference,
          accountName: order.accountName,
          dueDate: order.dueDate,
          deliveryAddress: order.deliveryAddress,
          driveFolderUrl: order.driveFolderUrl,
          items: items.map((it: any) => ({
            productName: it.productName,
            material: it.material,
            brandingMethod: it.brandingMethod,
            quantity: it.quantity,
            productColors: it.productColors,
          })),
        });
      } catch (err) {
        console.error("Failed to send supplier PO email:", err);
      }
    }

    // 4. Generate PO PDF and upload to Drive folder (01. Brief)
    let poPdfResult: { pdfId: string; pdfUrl: string } | null = null;
    if (order.driveFolderId) {
      poPdfResult = await uploadPoPdfToDrive(order.id, order.driveFolderId).catch((err) => {
        console.error("[raise-po] PDF upload failed:", err);
        return null;
      });
    }

    // 5. Log the action
    await db.insert(orderActivity).values({
      orderId: order.id,
      userId: (req as any).user?.userId,
      action: "po_raised_to_supplier",
      details: {
        supplierId,
        supplierName: supplier.teamName,
        supplierEmail: supplier.email,
        supplierCcEmail: supplier.ccEmail || null,
        gmailMessageId,
        poPdfId: poPdfResult?.pdfId || null,
        ghlPushed: ghlPushResult.success,
        ghlPushReason: ghlPushResult.reason,
      },
    });

    res.json({
      ok: true,
      supplierId,
      supplierEmail: supplier.email,
      supplierCcEmail: supplier.ccEmail || null,
      emailSent: !!gmailMessageId,
      gmailMessageId,
      poPdfUploaded: !!poPdfResult,
      poPdfUrl: poPdfResult?.pdfUrl || null,
      ghlPushed: ghlPushResult.success,
      ghlPushReason: ghlPushResult.reason,
    });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin raise PO error:", err);
    res.status(500).json({ error: "Failed to raise PO" });
  }
});

// ====== File vault (Sideline portal step 7) ======
//
// Admin-side upload of design files with folder tagging. Mirrors the customer
// upload flow (server/routes/customer.ts) but without the order-ownership check
// and with a required `folder` field so files land in the right bucket:
//   - mockups   → visible to clients via the approval link
//   - tech-pack → visible to assigned suppliers
//   - logos / size-run / other → admin only
//
// The client uses @vercel/blob client upload against /api/uploads/token to
// push the file, then POSTs the metadata here.
const adminUploadDesignSchema = z.object({
  label: z.string().min(1),
  folder: z.enum(["logos", "mockups", "size-run", "tech-pack", "other"]),
  fileName: z.string(),
  fileUrl: z.string().url(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
});

router.post("/orders/:id/designs", async (req, res) => {
  try {
    const user = (req as any).user;
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const data = adminUploadDesignSchema.parse(req.body);

    const designFile = await storage.createDesignFile({
      orderId: order.id,
      userId: user.userId,
      label: data.label,
      folder: data.folder,
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      fileSize: data.fileSize ?? null,
      mimeType: data.mimeType ?? null,
      status: "approved", // admin-uploaded files don't need review
      version: 1,
    });

    // Mirror legacy File Vault uploads into the PO's Drive folder too, so
    // the Drive sub-folder is the single source of truth regardless of
    // which upload path was used. Fire-and-forget.
    if (order.driveFolderId) {
      const slotMap: Record<typeof data.folder, "mockups" | "logos" | "artwork" | "approvals" | undefined> = {
        mockups: "mockups",
        logos: "logos",
        "tech-pack": "artwork",
        "size-run": undefined, // no direct match — lands in root
        other: undefined,
      };
      const slot = slotMap[data.folder];
      mirrorBlobToPoFolder({
        poFolderId: order.driveFolderId,
        slot,
        blobUrl: data.fileUrl,
        fileName: data.fileName,
      }).catch((err) => console.error("[designs-upload] Drive mirror failed:", err));
    }

    await db.insert(orderActivity).values({
      orderId: order.id,
      userId: user.userId,
      action: "admin_uploaded_file",
      details: { fileId: designFile.id, folder: data.folder, fileName: data.fileName },
    });

    res.status(201).json(designFile);
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin upload design error:", err);
    res.status(500).json({ error: "Failed to upload design" });
  }
});

// PATCH /designs/:id/folder — move an existing file between folders.
// Useful for re-tagging files uploaded before folders existed, or fixing mistakes.
const updateFolderSchema = z.object({
  folder: z.enum(["logos", "mockups", "size-run", "tech-pack", "other"]).nullable(),
});

router.patch("/designs/:id/folder", async (req, res) => {
  try {
    const { folder } = updateFolderSchema.parse(req.body);
    const [updated] = await db
      .update(designFiles)
      .set({ folder })
      .where(eq(designFiles.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Design file not found" });
    res.json({ ok: true, folder: updated.folder });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin update folder error:", err);
    res.status(500).json({ error: "Failed to update folder" });
  }
});

// POST /orders/:id/send-for-approval — issues a tokenized approval link,
// emails the client, and pushes GHL to "Mockup Sent".
// Client clicks the link, lands on /approve/:token (public), approves or
// requests changes. See server/routes/approvals.ts for the full lifecycle.
const sendForApprovalSchema = z.object({
  clientEmail: z.string().email().optional(), // defaults to order.customerEmail if omitted
});

router.post("/orders/:id/send-for-approval", async (req, res) => {
  try {
    const { clientEmail: bodyEmail } = sendForApprovalSchema.parse(req.body ?? {});

    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const clientEmail = bodyEmail || order.customerEmail || order.deliveryEmail;
    if (!clientEmail) {
      return res.status(400).json({
        error: "No client email on file — pass clientEmail in the body or set customerEmail on the order",
      });
    }

    // Sanity check: is there at least one mockup file on the order?
    const files = await storage.getDesignFilesByOrder(order.id);
    const hasMockup = files.some((f) => f.folder === "mockups");
    if (!hasMockup) {
      return res.status(400).json({
        error: "No mockup files uploaded yet. Upload at least one file with folder=mockups first.",
      });
    }

    const { token, expiresAt } = await createApprovalToken({
      orderId: order.id,
      createdBy: (req as any).user?.userId,
      clientEmail,
      clientName: order.customerName,
      orderNumber: order.orderNumber,
      ghlOpportunityId: order.ghlOpportunityId,
    });

    const baseUrl = process.env.BASE_URL || "https://sidelinenz.com";
    res.json({
      ok: true,
      token,
      expiresAt,
      link: `${baseUrl}/approve/${token}`,
      clientEmail,
    });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid data", details: err.errors });
    console.error("Admin send-for-approval error:", err);
    res.status(500).json({ error: "Failed to send approval link" });
  }
});

// ====== CLUB MANAGERS (supporter-campaign portal) ======
//
// Romero creates a manager record per club. The returned password is shown
// once — share it with the club via WhatsApp/Telegram, then it's hashed-only.
// Tag is the Shopify order tag the club's supporter orders carry, e.g.
// "club:onewhero-rfc". Tier is in basis points (800 = 8%).

const createClubManagerSchema = z.object({
  email: z.string().email(),
  clubName: z.string().min(1).max(100),
  shopifyOrderTag: z.string().min(1).max(80).regex(/^[a-zA-Z0-9:_-]+$/, "Invalid tag — alphanumerics, colon, dash, underscore only"),
  shopifyStoreUrl: z.string().url().optional(),
  contactId: z.string().optional(),
  profitShareTierBps: z.number().int().min(0).max(10000).optional(),
  password: z.string().min(8).optional(), // optional — auto-generated if absent
});

function generatePassword(): string {
  // 12 chars, no ambiguous lookalikes (0/O/1/l/I).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

router.post("/club-managers", async (req, res) => {
  try {
    const parsed = createClubManagerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.errors });

    const { email, clubName, shopifyOrderTag, shopifyStoreUrl, contactId, profitShareTierBps, password } = parsed.data;

    const existing = await storage.getClubAccountByEmail(email);
    if (existing) return res.status(409).json({ error: "A club account already exists with that email" });

    const initialPassword = password || generatePassword();
    const passwordHash = await hashPassword(initialPassword);

    const account = await storage.createClubAccount({
      email,
      clubName,
      passwordHash,
      shopifyOrderTag,
      shopifyStoreUrl,
      contactId,
      profitShareTierBps: profitShareTierBps ?? 800,
    } as any);

    res.json({
      id: account.id,
      email: account.email,
      clubName: account.clubName,
      shopifyOrderTag: account.shopifyOrderTag,
      profitShareTierBps: account.profitShareTierBps,
      // Returned ONCE — share via WhatsApp/Telegram then forget.
      initialPassword,
    });
  } catch (err) {
    console.error("Create club manager error:", err);
    res.status(500).json({ error: "Failed to create club manager" });
  }
});

router.get("/club-managers", async (_req, res) => {
  try {
    const accounts = await storage.getAllClubAccounts();
    // Strip passwordHash before returning.
    res.json(accounts.map((a) => ({
      id: a.id,
      email: a.email,
      clubName: a.clubName,
      shopifyOrderTag: a.shopifyOrderTag,
      shopifyStoreUrl: a.shopifyStoreUrl,
      profitShareTierBps: a.profitShareTierBps,
      contactId: a.contactId,
      createdAt: a.createdAt,
    })));
  } catch (err) {
    console.error("List club managers error:", err);
    res.status(500).json({ error: "Failed to list club managers" });
  }
});

const reportRequestSchema = z.object({
  clubAccountId: z.string().min(1),
  from: z.string().optional(),
  to: z.string().optional(),
  previewOnly: z.boolean().optional(),
});

router.post("/reports/club-drop-summary", async (req, res) => {
  try {
    const parsed = reportRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.errors });

    const { generateDropSummary } = await import("../reports/drop-summary");
    const result = await generateDropSummary(parsed.data);

    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err: any) {
    console.error("Drop summary error:", err);
    res.status(500).json({ error: "Failed to generate drop summary", message: String(err?.message || err) });
  }
});

export default router;
