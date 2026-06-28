import type { Express } from "express";
import { createServer, type Server } from "http";
import ghlRouter from "./ghl";
import storeRouter from "./store";
import shopifyRouter from "./shopify";
import authRouter from "./auth";
import adminRouter from "./admin";
import customerRouter from "./customer";
import uploadsRouter from "./uploads";
import { mockupPublicRouter, adminMockupRouter } from "./mockups";
import { adminQuoteRouter, templateRouter, publicQuoteRouter } from "./quotes";
import clubPortalRouter from "./club-portal";
import supplierRouter from "./supplier";
import shipmentsRouter from "./shipments";
import { publicApprovalRouter } from "./approvals";
import chatbotRouter from "./chatbot";
import notifyRouter from "./notify";
import cronRouter from "./cron";
import { createHash } from "crypto";

// Non-reversible fingerprint of the DATABASE_URL host — lets us confirm WHICH
// database the running app is connected to (via /api/health) without ever
// exposing the host or any credential. Guards against a local/live DB split.
export function dbHostFingerprint(): string {
  try {
    const host = (process.env.DATABASE_URL || "").replace(/.*@([^/?]+).*/, "$1");
    return host ? createHash("sha256").update(host).digest("hex").slice(0, 12) : "none";
  } catch { return "unknown"; }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Health check for Railway/monitoring
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString(), db: dbHostFingerprint() });
  });

  // GHL form submissions + product sync
  app.use("/api/ghl", ghlRouter);

  // Shopify Storefront API proxy
  app.use("/api/shopify", shopifyRouter);

  // Store: Stripe config, products, cart, checkout, orders
  app.use("/api", storeRouter);

  // Authentication
  app.use("/api/auth", authRouter);

  // Admin portal (Phase 2)
  app.use("/api/admin", adminRouter);

  // Admin mockup management
  app.use("/api/admin/mockups", adminMockupRouter);

  // DHL shipment tracking → PO matching
  app.use("/api/admin/shipments", shipmentsRouter);

  // Customer portal (Phase 3)
  app.use("/api/portal", customerRouter);

  // File uploads (Phase 3)
  app.use("/api/uploads", uploadsRouter);

  // Mockup engine (public lead form)
  app.use("/api/mockups", mockupPublicRouter);

  // Smart Quote system
  app.use("/api/admin/quotes", adminQuoteRouter);
  app.use("/api/admin/quote-templates", templateRouter);
  app.use("/api/quotes", publicQuoteRouter);

  // Club Portal (Phase 4)
  app.use("/api/club-portal", clubPortalRouter);

  // Supplier portal (Phase 5 — sideline order management portal)
  app.use("/api/supplier", supplierRouter);

  // Public client-approval links (no auth — validated by random URL token)
  app.use("/api/approve", publicApprovalRouter);

  // Chatbot API for GHL Conversational AI (Jarvesi web chat)
  app.use("/api/chatbot", chatbotRouter);

  // Public register-interest signups from closed supporter-campaign drops
  app.use("/api/notify", notifyRouter);

  // Scheduled / cron-triggered jobs (admin cookie OR X-Cron-Secret header)
  app.use("/api/cron", cronRouter);

  return httpServer;
}
