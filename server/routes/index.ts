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
import supplierSheetRouter from "./supplier-sheet";
import shipmentsRouter from "./shipments";
import { publicApprovalRouter, publicProofRouter } from "./approvals";
import { adminDesignerJobsRouter, publicJobRouter } from "./designer-jobs";
import chatbotRouter from "./chatbot";
import notifyRouter from "./notify";
import cronRouter from "./cron";
import blogRouter from "./blog";
import { createHash } from "crypto";
import { db } from "../db";
import { sql } from "drizzle-orm";

// Non-reversible fingerprint of the DATABASE_URL host — lets us confirm WHICH
// database the running app is connected to (via /api/health) without ever
// exposing the host or any credential. Guards against a local/live DB split.
export function dbHostFingerprint(): string {
  try {
    const host = (process.env.DATABASE_URL || "").replace(/.*@([^/?]+).*/, "$1");
    return host ? createHash("sha256").update(host).digest("hex").slice(0, 12) : "none";
  } catch { return "unknown"; }
}

export function commitSha(): string {
  return process.env.RAILWAY_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "dev";
}

// Real health: actually touch the DB and assert a load-bearing column exists, in
// ONE query (stays inside healthcheckTimeout). dbUp=false => DB unreachable, so
// the handler returns 503 and Railway restarts. schemaOk=false => DB up but
// missing required schema: handler returns 200 + flag so a monitor alerts
// WITHOUT restart-looping the app on drift.
export async function buildHealth(): Promise<{ status: string; db: string; commit: string; dbUp: boolean; schemaOk: boolean; detail?: string }> {
  const base = { db: dbHostFingerprint(), commit: commitSha() };
  try {
    const r: any = await db.execute(sql`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='club_id') AS schema_ok`);
    const row = (r.rows || r)[0] || {};
    const schemaOk = row.schema_ok === true || row.schema_ok === "t";
    return { ...base, status: schemaOk ? "ok" : "schema-drift", dbUp: true, schemaOk, detail: schemaOk ? undefined : "orders.club_id missing" };
  } catch (e: any) {
    return { ...base, status: "db-unreachable", dbUp: false, schemaOk: false, detail: String(e?.message || e).slice(0, 120) };
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Health check for Railway/monitoring — real DB touch + schema assertion.
  app.get("/api/health", async (_req, res) => {
    const h = await buildHealth();
    res.status(h.dbUp ? 200 : 503).json({ ...h, timestamp: new Date().toISOString() });
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
  // No-login supplier tracking sheet. Token-scoped, read is production-only and
  // write is limited to ship date / tracking / note. See server/routes/supplier-sheet.ts.
  app.use("/api/sheet", supplierSheetRouter);

  // Public client-approval links (no auth — validated by random URL token)
  app.use("/api/approve", publicApprovalRouter);

  // Public customer DESIGN PROOF page (no auth — token in URL). Served as raw
  // HTML before the SPA fallback so /proof/<token> renders the interactive
  // proof, not the React app.
  app.use("/proof", publicProofRouter);

  // Designer jobs (Drop Designer pipeline): admin/service API + the designer's
  // public job page (no auth — unguessable token in URL, same pattern as /proof).
  app.use("/api/admin/designer-jobs", adminDesignerJobsRouter);
  app.use("/job", publicJobRouter);

  // Chatbot API for GHL Conversational AI (Jarvesi web chat)
  app.use("/api/chatbot", chatbotRouter);

  // Public register-interest signups from closed supporter-campaign drops
  app.use("/api/notify", notifyRouter);

  // Scheduled / cron-triggered jobs (admin cookie OR X-Cron-Secret header)
  app.use("/api/cron", cronRouter);

  // Server-rendered blog (SEO) — must beat the SPA fallback
  app.use(blogRouter);

  return httpServer;
}
