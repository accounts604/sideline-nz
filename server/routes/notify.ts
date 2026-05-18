// Public "notify me when this club drops again" signup endpoint.
//
// The teamstore swaps a closed supporter-campaign drop's buy box for a
// register-interest form (see snippets/register-interest-form.liquid).
// Submissions land here. Unique on (clubSlug, email) so re-submits are a
// no-op — we return ok:true with deduped:true rather than an error so the
// public form UX stays clean.

import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { notifySignups } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";

const router = Router();

const SignupSchema = z.object({
  email: z.string().email().max(254),
  collectionHandle: z.string().min(1).max(255),
  source: z.enum(["collection_page", "product_page", "api"]).optional(),
});

// Trivial IP-bucketed rate limit so a casual scraper can't flood the table.
// Bucket = 10 attempts / IP / 10 min, in-memory (resets on deploy).
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const ipBuckets = new Map<string, { count: number; windowStart: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    ipBuckets.set(ip, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

// POST /api/notify/:clubSlug
// Body: { email, collectionHandle, source? }
router.post("/:clubSlug", async (req, res) => {
  const clubSlug = String(req.params.clubSlug).trim().toLowerCase();
  if (!/^[a-z0-9-]{2,80}$/.test(clubSlug)) {
    return res.status(400).json({ error: "Invalid club slug" });
  }
  const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0].trim()) || req.socket.remoteAddress || "unknown";
  if (rateLimited(ip)) {
    return res.status(429).json({ error: "Too many signups from this address — try again in a few minutes" });
  }

  try {
    const data = SignupSchema.parse(req.body ?? {});
    const email = data.email.trim().toLowerCase();
    const ua = req.headers["user-agent"]?.toString().slice(0, 500) ?? null;
    const referrer = req.headers["referer"]?.toString().slice(0, 500) ?? null;

    // Insert; on conflict (clubSlug, email) bump nothing — silently deduped.
    const inserted = await db.insert(notifySignups).values({
      clubSlug,
      email,
      collectionHandle: data.collectionHandle.trim(),
      source: data.source ?? "api",
      userAgent: ua,
      referrer,
    }).onConflictDoNothing({ target: [notifySignups.clubSlug, notifySignups.email] }).returning({ id: notifySignups.id });

    const deduped = inserted.length === 0;
    return res.json({ ok: true, deduped });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid form data", details: err.errors });
    }
    console.error("[notify] signup error:", err);
    return res.status(500).json({ error: "Failed to record signup" });
  }
});

// GET /api/notify/:clubSlug/count — handy lightweight stat for the storefront
// to show "X people waiting for the next drop" social proof on the banner.
router.get("/:clubSlug/count", async (req, res) => {
  const clubSlug = String(req.params.clubSlug).trim().toLowerCase();
  if (!/^[a-z0-9-]{2,80}$/.test(clubSlug)) {
    return res.status(400).json({ error: "Invalid club slug" });
  }
  try {
    const rows = await db.select({ count: sql<number>`count(*)::int` })
      .from(notifySignups).where(eq(notifySignups.clubSlug, clubSlug));
    res.json({ ok: true, clubSlug, count: rows[0]?.count ?? 0 });
  } catch (err: any) {
    console.error("[notify] count error:", err);
    res.status(500).json({ error: "Failed to count signups" });
  }
});

export default router;
