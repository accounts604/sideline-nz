/**
 * Mockup Engine API routes
 *
 * Public:
 *   POST /api/mockups/request  — Lead form submission (triggers pipeline)
 *   GET  /api/mockups/:id/status — Poll generation status
 *
 * Admin:
 *   GET  /api/admin/mockups          — List all mockup requests
 *   GET  /api/admin/mockups/:id      — Get mockup request details + designs
 *   POST /api/admin/mockups/:id/retry — Retry a failed pipeline
 *   DELETE /api/admin/mockups/:id    — Delete a mockup request
 */
import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { mockupRequests, mockupDesigns } from "../../shared/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { runMockupPipeline } from "../mockup/orchestrator";
import { requireAdmin } from "../auth";

// ====== PUBLIC ROUTES ======

const publicRouter = Router();

const mockupRequestSchema = z.object({
  contactName: z.string().min(1, "Name is required"),
  contactEmail: z.string().email("Valid email required"),
  contactPhone: z.string().optional(),
  teamName: z.string().min(1, "Team name is required"),
  sport: z.string().min(1, "Sport is required"),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color"),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  logoUrl: z.string().url().optional(),
  notes: z.string().optional(),
});

// POST /api/mockups/request — Submit lead form, kick off pipeline
publicRouter.post("/request", async (req, res) => {
  try {
    const data = mockupRequestSchema.parse(req.body);

    // Create the mockup request record
    const [request] = await db
      .insert(mockupRequests)
      .values({
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone || null,
        teamName: data.teamName,
        sport: data.sport.toLowerCase(),
        primaryColor: data.primaryColor,
        secondaryColor: data.secondaryColor || null,
        accentColor: data.accentColor || null,
        logoUrl: data.logoUrl || null,
        notes: data.notes || null,
        status: "pending",
      })
      .returning();

    // Fire-and-forget: run pipeline in background
    runMockupPipeline(request.id).catch((err) => {
      console.error(`[Mockup] Background pipeline failed for ${request.id}:`, err.message);
    });

    res.json({
      id: request.id,
      status: "pending",
      message: "Your custom mockups are being generated! Check your email in a few minutes.",
    });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Validation error", details: err.errors });
    }
    console.error("[Mockup] Request error:", err);
    res.status(500).json({ error: "Failed to create mockup request" });
  }
});

// GET /api/mockups/:id/status — Poll status
publicRouter.get("/:id/status", async (req, res) => {
  try {
    const [request] = await db
      .select()
      .from(mockupRequests)
      .where(eq(mockupRequests.id, req.params.id));

    if (!request) {
      return res.status(404).json({ error: "Mockup request not found" });
    }

    const designs = await db
      .select()
      .from(mockupDesigns)
      .where(eq(mockupDesigns.requestId, request.id))
      .orderBy(mockupDesigns.designNumber);

    res.json({
      id: request.id,
      status: request.status,
      teamName: request.teamName,
      sport: request.sport,
      designs: designs.map((d) => ({
        designNumber: d.designNumber,
        status: d.status,
        imageUrl: d.imageUrl,
      })),
      videoUrl: request.videoUrl,
      emailSentAt: request.emailSentAt,
      createdAt: request.createdAt,
    });
  } catch (err) {
    console.error("[Mockup] Status error:", err);
    res.status(500).json({ error: "Failed to get status" });
  }
});

// ====== ADMIN ROUTES ======

const adminMockupRouter = Router();
adminMockupRouter.use(requireAdmin);

// GET /api/admin/mockups — List all requests
adminMockupRouter.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status as string;
    const search = req.query.search as string;

    let query = db.select().from(mockupRequests).orderBy(desc(mockupRequests.createdAt));

    const conditions = [];
    if (statusFilter) {
      conditions.push(eq(mockupRequests.status, statusFilter));
    }
    if (search) {
      conditions.push(
        sql`(${mockupRequests.teamName} ILIKE ${"%" + search + "%"} OR ${mockupRequests.contactEmail} ILIKE ${"%" + search + "%"} OR ${mockupRequests.contactName} ILIKE ${"%" + search + "%"})`
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const requests = await db
      .select()
      .from(mockupRequests)
      .where(whereClause)
      .orderBy(desc(mockupRequests.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(mockupRequests)
      .where(whereClause);

    res.json({
      requests,
      total: Number(count),
      page,
      totalPages: Math.ceil(Number(count) / limit),
    });
  } catch (err) {
    console.error("[Mockup] List error:", err);
    res.status(500).json({ error: "Failed to list mockup requests" });
  }
});

// GET /api/admin/mockups/stats — Dashboard stats
adminMockupRouter.get("/stats", async (req, res) => {
  try {
    const [stats] = await db
      .select({
        total: sql<number>`count(*)`,
        pending: sql<number>`count(*) filter (where ${mockupRequests.status} = 'pending')`,
        generating: sql<number>`count(*) filter (where ${mockupRequests.status} = 'generating')`,
        sent: sql<number>`count(*) filter (where ${mockupRequests.status} = 'sent')`,
        failed: sql<number>`count(*) filter (where ${mockupRequests.status} = 'failed')`,
      })
      .from(mockupRequests);

    // Average generation time for completed ones
    const [avgTime] = await db
      .select({
        avgMs: sql<number>`avg(extract(epoch from (${mockupRequests.generationCompletedAt} - ${mockupRequests.generationStartedAt})) * 1000)`,
      })
      .from(mockupRequests)
      .where(sql`${mockupRequests.generationCompletedAt} IS NOT NULL AND ${mockupRequests.generationStartedAt} IS NOT NULL`);

    res.json({
      ...stats,
      avgGenerationTimeMs: avgTime?.avgMs ? Math.round(Number(avgTime.avgMs)) : null,
    });
  } catch (err) {
    console.error("[Mockup] Stats error:", err);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// GET /api/admin/mockups/:id — Full detail
adminMockupRouter.get("/:id", async (req, res) => {
  try {
    const [request] = await db
      .select()
      .from(mockupRequests)
      .where(eq(mockupRequests.id, req.params.id));

    if (!request) {
      return res.status(404).json({ error: "Not found" });
    }

    const designs = await db
      .select()
      .from(mockupDesigns)
      .where(eq(mockupDesigns.requestId, request.id))
      .orderBy(mockupDesigns.designNumber);

    res.json({ request, designs });
  } catch (err) {
    console.error("[Mockup] Detail error:", err);
    res.status(500).json({ error: "Failed to get mockup details" });
  }
});

// POST /api/admin/mockups/:id/retry — Retry failed pipeline
adminMockupRouter.post("/:id/retry", async (req, res) => {
  try {
    const [request] = await db
      .select()
      .from(mockupRequests)
      .where(eq(mockupRequests.id, req.params.id));

    if (!request) {
      return res.status(404).json({ error: "Not found" });
    }

    if (request.status !== "failed") {
      return res.status(400).json({ error: "Can only retry failed requests" });
    }

    // Reset status
    await db
      .update(mockupRequests)
      .set({ status: "pending", errorMessage: null })
      .where(eq(mockupRequests.id, req.params.id));

    // Delete old designs
    await db
      .delete(mockupDesigns)
      .where(eq(mockupDesigns.requestId, req.params.id));

    // Re-run pipeline
    runMockupPipeline(req.params.id).catch((err) => {
      console.error(`[Mockup] Retry pipeline failed:`, err.message);
    });

    res.json({ status: "retrying" });
  } catch (err) {
    console.error("[Mockup] Retry error:", err);
    res.status(500).json({ error: "Failed to retry" });
  }
});

// DELETE /api/admin/mockups/:id
adminMockupRouter.delete("/:id", async (req, res) => {
  try {
    await db.delete(mockupDesigns).where(eq(mockupDesigns.requestId, req.params.id));
    await db.delete(mockupRequests).where(eq(mockupRequests.id, req.params.id));
    res.json({ deleted: true });
  } catch (err) {
    console.error("[Mockup] Delete error:", err);
    res.status(500).json({ error: "Failed to delete" });
  }
});

export { publicRouter as mockupPublicRouter, adminMockupRouter };
