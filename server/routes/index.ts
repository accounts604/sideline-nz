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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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

  // Customer portal (Phase 3)
  app.use("/api/portal", customerRouter);

  // File uploads (Phase 3)
  app.use("/api/uploads", uploadsRouter);

  // Mockup engine (public lead form)
  app.use("/api/mockups", mockupPublicRouter);

  return httpServer;
}
