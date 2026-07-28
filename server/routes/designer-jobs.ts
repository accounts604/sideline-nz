// designer-jobs.ts — the Drop Designer pipeline in the app (2026-07-20 master plan).
//
//  - adminDesignerJobsRouter (/api/admin/designer-jobs, requireAdmin — the workspace
//    scripts reach it via X-Service-Token which auth.ts maps to role admin):
//      POST   /            idempotent upsert on quoteId (job creation / refresh)
//      GET    /            list (Design Review "Drops" section)
//      POST   /:quoteId/submit   stamp submittedAt (the designer's on-time proof)
//      POST   /:quoteId/qc       approve/reject — evidence-based reject requires failedItems
//  - publicJobRouter (/job/:token): server-rendered job page for the designer —
//    live countdown, brief, downloadable files, the rules. Unguessable token,
//    noindex, no auth (same pattern as /proof/:token).
//
// QC semantics: on_time = submittedAt vs (deadlineAt + pausedMs) — QC latency never
// counts against the designer. Reject increments revisions, returns status "revision",
// clears submittedAt (resubmission restamps). Second rejection is flagged for a
// Romero decision. Pay accrual stays on the workspace ledger for now — the
// sideline-app-qc-sync bridge applies app QC verdicts to quote.json + the ledger.
import { Router, json } from "express";
import { z } from "zod";
import crypto from "crypto";
import { desc, eq, or } from "drizzle-orm";
import { db } from "../db";
import { designerJobs, designers, orders } from "@shared/schema";
import { DROP_CHECKLIST, checklistLabel } from "@shared/drop-checklist";
import { expandPrompt, BASE_BLOCK, BRAND_BLOCK, DONOT_BLOCK, type PromptPack } from "@shared/mockup-prompt";
import { requireAdmin } from "../auth";
import { storage } from "../storage";

/**
 * Brand handoff (Romero directive 2026-07-21): the moment a drop passes QC,
 * everything the design flow learned about the club — colours, crest/refs,
 * the brief — is written through to club_brand_identity so the PO setup
 * finds it already there once the order is quoted/closed. Never blocks the
 * approve (best-effort, logged).
 */
async function brandHandoff(job: typeof designerJobs.$inferSelect): Promise<string> {
  const email = (job.clientEmail || "").trim().toLowerCase();
  if (!email && !job.club) return "skipped: no clientEmail/club on job";
  let account = email ? await storage.getClubAccountByEmail(email) : undefined;
  if (!account) {
    if (!email) return "skipped: no club account and no clientEmail to create one";
    // Shell account (not portal-invited): random non-bcrypt hash = login impossible
    // until a real invite flow sets a password. createClubAccount auto-seeds identity.
    account = await storage.createClubAccount({
      email,
      passwordHash: "!handoff:" + crypto.randomBytes(24).toString("hex"),
      clubName: job.club || job.quoteId,
    } as any);
  }
  const brand = (job.brand || {}) as { colors?: unknown[] };
  const files: string[] = Array.isArray(job.assetFiles) ? (job.assetFiles as string[]) : [];
  const role = (f: string) => (/collar/i.test(f) ? "collar" : /logo|crest|wordmark/i.test(f) ? "logo" : /pattern/i.test(f) ? "pattern" : "kit");
  const referenceImages = job.assetsBase
    ? files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).map((f) => ({ url: `${job.assetsBase}/${encodeURIComponent(f)}`, label: f, role: role(f) }))
    : undefined;
  await storage.ensureClubBrandIdentity(account.id, { sourceChannel: "designer_job" });
  await storage.updateClubBrandIdentity(account.id, {
    ...(Array.isArray(brand.colors) && brand.colors.length ? { colors: brand.colors } : {}),
    ...(referenceImages?.length ? { referenceImages } : {}),
    ...(job.briefMd ? { designBrief: job.briefMd } : {}),
    enrichmentStage: "design_approved",
  } as any);
  return `enriched club_brand_identity for account ${account.id} (${account.clubName})`;
}

/**
 * JSON that is safe to embed inside a <script> tag.
 *
 * JSON.stringify does NOT escape "<" or "/", so a string containing
 * "</script>" closes the tag and everything after it executes. That is stored
 * XSS on a page handed to external freelancers. Escaping < > & as unicode
 * escapes keeps the JSON semantically identical while making a breakout
 * impossible. U+2028/U+2029 are also escaped: they are valid in JSON but are
 * line terminators in JS and would be a syntax error inline.
 */
const jsonForScript = (v: unknown) =>
  JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------------------------------------------------------------- admin router
const adminDesignerJobsRouter = Router();
adminDesignerJobsRouter.use(json({ limit: "1mb" }));
adminDesignerJobsRouter.use(requireAdmin);

const upsertSchema = z.object({
  quoteId: z.string().regex(/^SL-[A-Za-z0-9-]+$/),
  token: z.string().min(8).max(64).optional(),
  club: z.string().max(120).optional(),
  designerName: z.string().max(40).optional(),
  designerEmail: z.string().email().optional(),
  orderId: z.string().uuid().optional(),
  timezone: z.string().max(64).optional(), // IANA zone, e.g. Asia/Colombo, Asia/Manila
  briefMd: z.string().max(20000).optional(),
  canvaUrl: z.string().url().optional(),
  promptPack: z.object({
    design: z.string().max(4000).optional(),
    donotExtra: z.string().max(2000).optional(),
    garments: z.array(z.object({ name: z.string().max(80), prompt: z.string().max(6000) })).max(8).optional(),
  }).optional(),
  assetsBase: z.string().url().optional(),
  assetFiles: z.array(z.string().max(200)).max(50).optional(),
  assignedAt: z.string().datetime().optional(),
  deadlineAt: z.string().datetime().optional(),
  pausedMs: z.number().int().min(0).optional(),
  pauseOpenAt: z.string().datetime().nullable().optional(),
  submittedAt: z.string().datetime().nullable().optional(),
  practice: z.boolean().optional(),
  clientEmail: z.string().email().optional(),
  brand: z.object({ colors: z.array(z.object({ role: z.string().max(20), name: z.string().max(60), hex: z.string().max(9).optional() })).max(12) }).optional(),
});

adminDesignerJobsRouter.post("/", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "invalid body" });
  const b = parsed.data;
  const quoteId = b.quoteId.toUpperCase();
  const [existing] = await db.select({ id: designerJobs.id }).from(designerJobs).where(eq(designerJobs.quoteId, quoteId)).limit(1);
  const isInsert = !existing;
  const values = {
    quoteId,
    token: b.token || crypto.randomBytes(12).toString("base64url"),
    club: b.club,
    // No hardcoded person: the assigning caller names the designer and their zone.
    // The live column still defaults to a specific designer, so an omitted name is
    // pinned to "unassigned" HERE rather than inheriting a departed person. On
    // update `undefined` is stripped, so this never clobbers an existing assignment.
    designerName: b.designerName ?? (isInsert ? "unassigned" : undefined),
    designerEmail: b.designerEmail,
    orderId: b.orderId,
    timezone: b.timezone,
    briefMd: b.briefMd,
    canvaUrl: b.canvaUrl,
    promptPack: b.promptPack,
    assetsBase: b.assetsBase,
    assetFiles: b.assetFiles,
    assignedAt: b.assignedAt ? new Date(b.assignedAt) : undefined,
    deadlineAt: b.deadlineAt ? new Date(b.deadlineAt) : undefined,
    pausedMs: b.pausedMs,
    pauseOpenAt: b.pauseOpenAt ? new Date(b.pauseOpenAt) : b.pauseOpenAt === null ? null : undefined,
    submittedAt: b.submittedAt ? new Date(b.submittedAt) : b.submittedAt === null ? null : undefined,
    practice: b.practice,
    clientEmail: b.clientEmail,
    brand: b.brand,
  } as const;
  // Idempotent upsert on UNIQUE(quote_id): content refreshes, token/QC never clobbered.
  const defined = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
  const { token: _t, quoteId: _q, ...updatable } = defined as Record<string, unknown>;
  const [row] = await db
    .insert(designerJobs)
    .values(defined as typeof designerJobs.$inferInsert)
    .onConflictDoUpdate({ target: designerJobs.quoteId, set: { ...updatable, updatedAt: new Date() } })
    .returning();
  res.json({ ok: true, job: row, url: `/job/${row.token}` });
});

adminDesignerJobsRouter.get("/", async (_req, res) => {
  const rows = await db.select().from(designerJobs).orderBy(desc(designerJobs.createdAt));
  res.json(rows);
});

// Create or update a designer. Returns their personal board URL — that link is
// the entire onboarding: no account, no password, no invite flow.
const designerSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]{2,32}$/, "lowercase slug, e.g. \"sam\" or \"ana-t\""),
  displayName: z.string().min(1).max(60),
  email: z.string().email().optional(),
  timezone: z.string().max(64).default("Pacific/Auckland"),
  slaHours: z.number().int().min(4).max(168).optional(),
  wipCap: z.number().int().min(1).max(10).optional(),
  tier: z.enum(["rookie", "designer", "senior"]).optional(),
  active: z.boolean().optional(),
});

adminDesignerJobsRouter.post("/designers", async (req, res) => {
  const parsed = designerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "invalid body" });
  const b = parsed.data;
  const values = {
    name: b.name, displayName: b.displayName, email: b.email, timezone: b.timezone,
    token: crypto.randomBytes(12).toString("base64url"),
    ...(b.slaHours !== undefined ? { slaHours: b.slaHours } : {}),
    ...(b.wipCap !== undefined ? { wipCap: b.wipCap } : {}),
    ...(b.tier !== undefined ? { tier: b.tier } : {}),
    ...(b.active !== undefined ? { active: b.active } : {}),
  };
  const { token: _t, name: _n, ...updatable } = values as Record<string, unknown>;
  const [row] = await db
    .insert(designers)
    .values(values as typeof designers.$inferInsert)
    // Idempotent on the slug: re-running never mints a new token, so an existing
    // designer's board link keeps working.
    .onConflictDoUpdate({ target: designers.name, set: { ...updatable, updatedAt: new Date() } })
    .returning();
  res.json({ ok: true, designer: row, boardUrl: `/designers/${row.token}` });
});

adminDesignerJobsRouter.get("/designers", async (_req, res) => {
  res.json(await db.select().from(designers).orderBy(desc(designers.createdAt)));
});

// Put a job on the board so anyone eligible can claim it. Deliberately does NOT
// set a deadline: the clock starts when somebody takes it.
adminDesignerJobsRouter.post("/:quoteId/post", async (req, res) => {
  const quoteId = req.params.quoteId.toUpperCase();
  const [job] = await db.select().from(designerJobs).where(eq(designerJobs.quoteId, quoteId)).limit(1);
  if (!job) return res.status(404).json({ error: "job not found" });
  if (job.status === "approved") return res.status(409).json({ error: "job already approved" });
  if (job.claimedAt) return res.status(409).json({ error: `already claimed by ${job.designerName}` });

  const now = new Date();
  const [row] = await db
    .update(designerJobs)
    .set({ status: "available", postedAt: job.postedAt || now, designerName: "unassigned", deadlineAt: null, assignedAt: null, updatedAt: now })
    .where(eq(designerJobs.quoteId, quoteId))
    .returning();
  res.json({ ok: true, quoteId, status: row.status, postedAt: row.postedAt });
});

// Manual override for when email matching gets it wrong or finds nothing.
// Accepts an order id or an order number so it is usable from a terminal.
adminDesignerJobsRouter.post("/:quoteId/link-order", async (req, res) => {
  const quoteId = req.params.quoteId.toUpperCase();
  const ref = String(req.body?.order || "").trim();
  if (!ref) return res.status(400).json({ error: "pass { order: <order id or order number> }" });

  const [job] = await db.select().from(designerJobs).where(eq(designerJobs.quoteId, quoteId)).limit(1);
  if (!job) return res.status(404).json({ error: "job not found" });

  const [order] = await db
    .select({ id: orders.id, no: orders.orderNumber })
    .from(orders)
    .where(or(eq(orders.id, ref), eq(orders.orderNumber, ref)))
    .limit(1);
  if (!order) return res.status(404).json({ error: `no order matching "${ref}"` });

  const [row] = await db
    .update(designerJobs)
    .set({ orderId: order.id, updatedAt: new Date() })
    .where(eq(designerJobs.quoteId, quoteId))
    .returning();
  res.json({ ok: true, quoteId, linkedTo: order.no, job: row });
});

adminDesignerJobsRouter.post("/:quoteId/submit", async (req, res) => {
  const quoteId = req.params.quoteId.toUpperCase();
  const [job] = await db.select().from(designerJobs).where(eq(designerJobs.quoteId, quoteId)).limit(1);
  if (!job) return res.status(404).json({ error: "job not found" });
  if (job.submittedAt) return res.json({ ok: true, already: true, submittedAt: job.submittedAt });
  const now = new Date();
  // Submitting closes any open pause (the engine evidently worked again).
  const extraPaused = job.pauseOpenAt ? now.getTime() - new Date(job.pauseOpenAt).getTime() : 0;
  const [row] = await db
    .update(designerJobs)
    .set({ submittedAt: now, status: "submitted", pausedMs: job.pausedMs + Math.max(0, extraPaused), pauseOpenAt: null, updatedAt: now })
    .where(eq(designerJobs.quoteId, quoteId))
    .returning();
  res.json({ ok: true, job: row });
});

const qcSchema = z.object({
  action: z.enum(["approve", "reject"]),
  by: z.string().max(40).default("Romero"),
  reason: z.string().max(2000).optional(),
  failedItems: z.array(z.number().int().min(1).max(6)).max(6).optional(),
});

adminDesignerJobsRouter.post("/:quoteId/qc", async (req, res) => {
  const parsed = qcSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "invalid body" });
  const { action, by, reason, failedItems } = parsed.data;
  const quoteId = req.params.quoteId.toUpperCase();
  const [job] = await db.select().from(designerJobs).where(eq(designerJobs.quoteId, quoteId)).limit(1);
  if (!job) return res.status(404).json({ error: "job not found" });
  const now = new Date();

  if (action === "approve") {
    if (job.status === "approved") return res.json({ ok: true, already: true }); // single-fire
    const onTime =
      job.submittedAt && job.deadlineAt
        ? new Date(job.submittedAt).getTime() <= new Date(job.deadlineAt).getTime() + job.pausedMs
        : null;
    const [row] = await db
      .update(designerJobs)
      .set({ status: "approved", qcBy: by, qcAt: now, qcOnTime: onTime, qcReason: null, qcFailedItems: null, updatedAt: now })
      .where(eq(designerJobs.quoteId, quoteId))
      .returning();
    let handoff = "";
    try { handoff = await brandHandoff(row); console.log(`[designer-jobs] brand handoff ${quoteId}: ${handoff}`); }
    catch (e: any) { handoff = "failed: " + e.message; console.error(`[designer-jobs] brand handoff ${quoteId} FAILED:`, e.message); }
    return res.json({ ok: true, job: row, brandHandoff: handoff });
  }

  // Evidence-based rejection: WHICH checklist items failed is mandatory.
  if (!reason || !failedItems?.length)
    return res.status(400).json({ error: "reject requires reason AND failedItems (which checklist items failed)" });
  const priorReqs = Array.isArray(job.revisionRequests) ? (job.revisionRequests as unknown[]) : [];
  const [row] = await db
    .update(designerJobs)
    .set({
      status: "revision", qcBy: by, qcAt: now, qcOnTime: null, qcReason: reason,
      qcFailedItems: failedItems, revisions: job.revisions + 1, submittedAt: null, updatedAt: now,
      // Same append-only log the client path writes to, so the job carries one
      // complete revision history regardless of who asked for the change.
      revisionRequests: [...priorReqs, { at: now.toISOString(), source: "qc", notes: reason, failedItems, round: job.revisions + 1 }],
    })
    .where(eq(designerJobs.quoteId, quoteId))
    .returning();
  res.json({ ok: true, job: row, secondRejection: row.revisions >= 2 });
});

// ---------------------------------------------------------------- public page
const publicJobRouter = Router();

/**
 * Self-serve delivery (2026-07-28 multi-freelancer refresh).
 *
 * The job token IS the credential — same trust model as /proof/:token and the
 * supplier sheet at /s/:token. A freelancer needs no account, which is the whole
 * reason this scales to a pool of designers instead of one managed person.
 *
 * Guards, because this is an unauthenticated write path:
 *  - token must resolve to a real job
 *  - an approved job is closed: no further uploads (stops a stale link being used
 *    to overwrite delivered work after it has been paid)
 *  - content types and per-file size are whitelisted server-side
 *  - the blob pathname is built HERE from the job, never taken from the client
 */
const SUBMIT_MIME: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
  "application/pdf": "pdf", "application/zip": "zip", "application/x-zip-compressed": "zip",
};
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES_PER_SUBMIT = 20;

/** Load a job by public token, enforcing the "approved jobs are closed" rule. */
type OpenJob =
  | { ok: false; status: number; message: string }
  | { ok: true; job: typeof designerJobs.$inferSelect };

async function openJobByToken(token: string): Promise<OpenJob> {
  const [job] = await db.select().from(designerJobs).where(eq(designerJobs.token, token)).limit(1);
  if (!job) return { ok: false, status: 404, message: "job not found" };
  if (job.status === "approved") return { ok: false, status: 409, message: "this job is already approved and closed" };
  return { ok: true, job };
}

const fileSchema = z.object({
  name: z.string().min(1).max(160),
  contentType: z.string().max(120),
  dataBase64: z.string().min(1),
});

// POST /job/:token/file — one file per request (keeps bodies small and lets the
// page show real per-file progress). Returns the stored blob URL.
publicJobRouter.post("/:token/file", json({ limit: "36mb" }), async (req, res) => {
  try {
    const found = await openJobByToken(req.params.token);
    if (!found.ok) return res.status(found.status).json({ error: found.message });
    const parsed = fileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "invalid body" });

    const ext = SUBMIT_MIME[parsed.data.contentType.toLowerCase()];
    if (!ext) return res.status(415).json({ error: "unsupported file type — send PNG, JPG, WEBP, PDF or ZIP" });

    const buf = Buffer.from(parsed.data.dataBase64, "base64");
    if (!buf.length) return res.status(400).json({ error: "empty file" });
    if (buf.length > MAX_FILE_BYTES) return res.status(413).json({ error: "file is over 25MB" });

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return res.status(500).json({ error: "uploads are not configured on this environment" });

    // Pathname is built server-side from the job — the client cannot choose where
    // its bytes land. Filename is sanitised; addRandomSuffix stops collisions.
    const safeName = parsed.data.name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || `file.${ext}`;
    const { put } = await import("@vercel/blob");
    const blob = await put(`designer-submissions/${found.job.quoteId}/${safeName}`, buf, {
      access: "public", addRandomSuffix: true, contentType: parsed.data.contentType, token,
    });
    res.json({ ok: true, url: blob.url, name: parsed.data.name, size: buf.length });
  } catch (e: any) {
    console.error("[designer-jobs] upload failed:", e?.message);
    res.status(500).json({ error: "upload failed — try again" });
  }
});

const submitSchema = z.object({
  files: z.array(z.object({
    url: z.string().url(), name: z.string().max(160), size: z.number().int().nonnegative(),
  })).min(1).max(MAX_FILES_PER_SUBMIT),
  note: z.string().max(2000).optional(),
});

// POST /job/:token/submit — stamps submittedAt. This is the designer's on-time
// proof, and it mirrors the admin submit exactly (same pause-closing semantics)
// so both paths produce identical state.
publicJobRouter.post("/:token/submit", json({ limit: "64kb" }), async (req, res) => {
  try {
    const found = await openJobByToken(req.params.token);
    if (!found.ok) return res.status(found.status).json({ error: found.message });
    const { job } = found;
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "invalid body" });

    if (job.submittedAt) return res.json({ ok: true, already: true, submittedAt: job.submittedAt });

    const now = new Date();
    // Submitting closes any open pause (the engine evidently worked again) —
    // identical to the admin path.
    const extraPaused = job.pauseOpenAt ? now.getTime() - new Date(job.pauseOpenAt).getTime() : 0;
    const prior = Array.isArray(job.submissions) ? (job.submissions as unknown[]) : [];
    const round = job.revisions + 1;
    const added = parsed.data.files.map((f) => ({ ...f, at: now.toISOString(), round, note: parsed.data.note || undefined }));

    const [row] = await db
      .update(designerJobs)
      .set({
        submittedAt: now, status: "submitted",
        submissions: [...prior, ...added], // append-only: a reject never erases round 1
        pausedMs: job.pausedMs + Math.max(0, extraPaused), pauseOpenAt: null, updatedAt: now,
      })
      .where(eq(designerJobs.token, req.params.token))
      .returning();

    const onTime = row.deadlineAt ? now.getTime() <= new Date(row.deadlineAt).getTime() + row.pausedMs : null;
    console.log(`[designer-jobs] ${row.quoteId} submitted by ${row.designerName} (${added.length} file(s), on_time=${onTime})`);
    res.json({ ok: true, submittedAt: row.submittedAt, onTime });
  } catch (e: any) {
    console.error("[designer-jobs] submit failed:", e?.message);
    res.status(500).json({ error: "submit failed — try again" });
  }
});

const briefToHtml = (md: string) =>
  md.split(/\r?\n/).map((l) => {
    if (/^#{2,3} /.test(l)) return `<h3>${esc(l.replace(/^#{2,3} /, ""))}</h3>`;
    if (/^- /.test(l)) return `<li>${esc(l.slice(2))}</li>`;
    if (!l.trim()) return "";
    return `<p>${esc(l)}</p>`;
  }).join("\n");

publicJobRouter.get("/:token", async (req, res) => {
  try {
    const [job] = await db.select().from(designerJobs).where(eq(designerJobs.token, req.params.token)).limit(1);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (!job) return res.status(404).send("<h1 style='font-family:sans-serif'>Link not found</h1><p style='font-family:sans-serif'>This job link is invalid — check the link in your message or ask for a new one.</p>");

    const effDeadline = job.deadlineAt ? new Date(job.deadlineAt).getTime() + job.pausedMs : 0;
    const files: string[] = Array.isArray(job.assetFiles) ? (job.assetFiles as string[]) : [];
    const imgs = files
      .map((f) => `<a class="file" href="${esc(job.assetsBase)}/${encodeURIComponent(f)}" download><img loading="lazy" src="${esc(job.assetsBase)}/${encodeURIComponent(f)}" alt="${esc(f)}"><span>${esc(f)} ⬇</span></a>`)
      .join("\n");
    const dueNZ = job.deadlineAt
      ? new Date(effDeadline).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : "TBC";

    // ---- delivery state -------------------------------------------------
    // The page is the whole loop now: brief in, files out, no middleman.
    const submissions = (Array.isArray(job.submissions) ? job.submissions : []) as Array<{ url: string; name: string; at?: string; round?: number }>;
    const sentList = submissions.length
      ? `<ul class="sent">${submissions.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>${s.round ? `<span class="rnd">round ${esc(s.round)}</span>` : ""}</li>`).join("")}</ul>`
      : "";

    const failed = (Array.isArray(job.qcFailedItems) ? job.qcFailedItems : []) as number[];
    // A rejected designer must be able to SEE what failed, in words. Previously
    // this page showed nothing at all after a reject.
    // Where the change request came from matters: a club comments in prose about
    // what they want, our QC points at numbered checklist items. Same panel, very
    // different reading, so label it.
    const reqs = (Array.isArray(job.revisionRequests) ? job.revisionRequests : []) as Array<{ source?: string; notes?: string; round?: number }>;
    const latest = reqs.length ? reqs[reqs.length - 1] : null;
    const fromClient = latest?.source === "client";
    const revisionPanel =
      job.status === "revision"
        ? `<div class="card fix"><span class="label">${fromClient ? "The club asked for changes" : "Changes needed from our check"} — round ${esc(job.revisions + 1)}</span>
${fromClient ? `<p class="hint">Straight from ${esc(job.club || "the club")}, in their words:</p>` : ""}
${job.qcReason ? (fromClient ? `<blockquote>${esc(job.qcReason)}</blockquote>` : `<p>${esc(job.qcReason)}</p>`) : ""}
${failed.length ? `<ul class="rules">${failed.map((n) => `<li><b>${esc(checklistLabel(n))}</b></li>`).join("")}</ul>` : ""}
<p class="hint">Fix these and upload again below. Your clock does not restart, and our review time never counts against you.</p></div>`
        : "";

    const approvedPanel =
      job.status === "approved"
        ? `<div class="card ok"><span class="label">Approved</span><p>This drop passed quality check${job.qcOnTime === false ? " (submitted late)" : " on time"}. Nothing more to do.</p>${sentList}</div>`
        : "";

    const submittedPanel =
      job.status === "submitted" && job.submittedAt
        ? `<div class="card ok"><span class="label">Delivered</span>
<p>Received ${esc(new Date(job.submittedAt).toLocaleString("en-NZ", { timeZone: job.timezone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))} your time. Your send time is locked in as your on-time proof, so review speed never counts against you.</p>${sentList}</div>`
        : "";

    // ---- design workspace + prompt pack ----------------------------------
    // Designers work in their OWN free Gemini account and in the Canva doc
    // Romero shares with them. They never get a key or access to his Gem, so
    // the full prompt is inlined here instead.
    const pack = (job.promptPack || {}) as PromptPack;
    const garments = Array.isArray(pack.garments) ? pack.garments : [];

    const workspacePanel = (job.canvaUrl || garments.length)
      ? `<div class="card"><span class="label">Your design workspace</span>
${job.canvaUrl ? `<p class="hint">Canva doc for this drop, shared with you. Pages are pre-named. Composite the crest and any sponsor logos here at the finishing step.</p>
<a class="btn ghost" href="${esc(job.canvaUrl)}" target="_blank" rel="noopener">Open the Canva doc</a>` : ""}
${garments.length ? `<p class="hint" style="margin-top:14px">Generate the garments in <b>Gemini</b>. A free account is fine. Paste a prompt below, and attach these three images from the files above: <b>1</b> the design reference, <b>2</b> sideline-logo-master, <b>3</b> sideline-inner-collar-tape.</p>` : ""}
</div>`
      : "";

    const promptPanel = garments.length
      ? `<div class="card"><span class="label">Prompt pack &mdash; one per garment</span>
${garments.map((g, i) => {
        const full = expandPrompt(g, pack);
        return `<div class="pgar"><div class="ptop"><span class="pnm">${esc(g.name)}</span>
<button class="copy" type="button" data-p="${i}">Copy prompt</button></div><p>${esc(full)}</p></div>`;
      }).join("")}
<p class="hint">If a render comes back with text, a logo or a busy chest, re-roll it. That is the engine ignoring the DO NOT block, not your mistake.</p></div>`
      : "";

    // Upload UI shows while the job is open for work (in progress or in revision).
    const canDeliver = job.status === "in_progress" || job.status === "revision";
    const deliverPanel = canDeliver
      ? `<div class="card"><span class="label">Deliver your work</span>
<p class="hint">PNG, JPG, WEBP, PDF or ZIP · up to 25MB each. Upload everything, then hit Submit.</p>
<input id="fi" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.zip,image/png,image/jpeg,image/webp,application/pdf,application/zip">
<label for="fi" class="btn ghost" id="pick">Choose files</label>
<ul id="list" class="sent"></ul>
<textarea id="note" rows="2" placeholder="Anything we should know? (optional)"></textarea>
<button id="go" class="btn" disabled>Submit work</button>
<p id="msg" class="hint"></p></div>`
      : "";

    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Sideline NZ — Job ${esc(job.quoteId)}: ${esc(job.club || "")}</title>
<style>
body{margin:0;background:#000;color:#F0F0F0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;line-height:1.55}
.wrap{max-width:640px;margin:0 auto;padding:26px 18px 70px}
.brand{font-weight:800;letter-spacing:.02em;font-size:18px}.brand span{color:#9A9A9A}
h1{font-size:26px;letter-spacing:-.01em;margin:14px 0 2px}
.sub{color:#9A9A9A;font-size:14px;margin:0 0 18px}
.card{background:#121212;border:1px solid #262626;border-radius:14px;padding:16px 18px;margin-bottom:14px}
.label{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#9A9A9A;margin-bottom:8px;display:block}
.due{display:flex;justify-content:space-between;align-items:center}
#cd{font-family:ui-monospace,Menlo,monospace;font-size:26px;font-weight:800;color:#5FD9C7}
#cd.warn{color:#E3B75C}#cd.late{color:#F09A8A}#cd.paused{color:#9A9A9A}
.duewhen{color:#9A9A9A;font-size:13px;text-align:right}
h3{font-size:15px;margin:12px 0 4px}p{margin:6px 0;font-size:14.5px}li{font-size:14.5px;margin:4px 0}
.files{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-top:6px}
.file{display:block;text-decoration:none;color:#B9B9B9;font-size:11.5px;background:#0A0A0A;border:1px solid #262626;border-radius:10px;padding:8px;text-align:center}
.file img{width:100%;border-radius:6px;margin-bottom:6px;display:block;background:#1C1C1C;min-height:60px}
.rules li{margin:7px 0}.rules b{color:#fff}
.card.fix{border-color:#5A4520;background:#171207}
blockquote{margin:8px 0;padding:10px 14px;border-left:3px solid #E3B75C;background:#0A0A0A;border-radius:0 8px 8px 0;font-size:14.5px}.card.ok{border-color:#20503F;background:#08150F}
.hint{color:#9A9A9A;font-size:12.5px}
.pgar{background:#0A0A0A;border:1px solid #262626;border-radius:9px;padding:12px 14px;margin-bottom:10px}
.ptop{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}
.pnm{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:#5FD9C7;font-weight:700}
.copy{background:#FFFFFF12;border:1px solid #303030;color:#EDEDED;border-radius:6px;font-size:11px;font-family:inherit;padding:4px 10px;cursor:pointer;flex:none}
.copy:hover{background:#5FD9C733}
.pgar p{margin:0;font-family:ui-monospace,Menlo,monospace;font-size:10.5px;line-height:1.6;color:#9A9A9A;max-height:104px;overflow:auto}
#fi{display:none}
.btn{display:inline-block;width:100%;box-sizing:border-box;text-align:center;background:#5FD9C7;color:#04211C;border:0;border-radius:10px;padding:13px 16px;font-size:15px;font-weight:800;cursor:pointer;margin-top:10px;font-family:inherit}
.btn:disabled{background:#1F1F1F;color:#6A6A6A;cursor:default}
.btn.ghost{background:transparent;color:#EDEDED;border:1px solid #3A3A3A;font-weight:700}
.sent{list-style:none;padding:0;margin:10px 0 0}
.sent li{font-size:13px;color:#C9C9C9;background:#0A0A0A;border:1px solid #262626;border-radius:8px;padding:8px 10px;margin:6px 0;display:flex;justify-content:space-between;gap:8px;align-items:center;word-break:break-all}
.sent li a{color:#5FD9C7;text-decoration:none}
.sent .rnd,.sent .st{color:#8A8A8A;font-size:11px;white-space:nowrap}
textarea{width:100%;box-sizing:border-box;background:#0A0A0A;border:1px solid #2E2E2E;border-radius:9px;color:#EDEDED;padding:10px;font-family:inherit;font-size:14px;margin-top:10px;resize:vertical}
.foot{color:#666;font-size:12px;margin-top:22px;font-family:ui-monospace,Menlo,monospace}
.tag{display:inline-block;font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:700;letter-spacing:.05em;padding:2px 8px;border-radius:5px;background:#FFFFFF1E;color:#EDEDED;text-transform:uppercase;margin-left:6px}
</style></head><body><div class="wrap">
<div class="brand">SIDELINE <span>NZ</span> · designer job</div>
<h1>${esc(job.club || job.quoteId)} — ${esc(job.quoteId)}${job.practice ? '<span class="tag">practice</span>' : ""}</h1>
<p class="sub">assigned ${esc(job.assignedAt ? new Date(job.assignedAt).toISOString().slice(0, 10) : "")} · everything you need is on this page</p>
<div class="card"><span class="label">Time left</span>
  <div class="due"><span id="cd">—</span><span class="duewhen">due ${esc(dueNZ)} NZT<br>(your time: <span id="lc"></span>)</span></div>
</div>
${approvedPanel}${submittedPanel}${revisionPanel}
<div class="card"><span class="label">The brief</span>${briefToHtml(job.briefMd || "Brief sent in your email — this page tracks the clock and files.")}</div>
${files.length ? `<div class="card"><span class="label">Files — references + Sideline brand kit (tap to download)</span><div class="files">${imgs}</div></div>` : ""}
${workspacePanel}
${promptPanel}
${deliverPanel}
<div class="card"><span class="label">What we check — every job, same six</span><ul class="rules">
${DROP_CHECKLIST.map((c) => `<li>${esc(c)}</li>`).join("\n")}
</ul></div>
<div class="card"><span class="label">How this works — same every job</span><ul class="rules">
<li><b>Upload your files on this page when done.</b> Your upload time is your proof of on-time — review speed never counts against you.</li>
<li><b>Blocked by anything on our side?</b> Message straight away — the clock STOPS while it's our problem.</li>
<li><b>Pay:</b> USD 15 when the set passes quality check on time · USD 30 bonus if the store passes 20 orders.</li>
<li><b>Reference photos are colour/vibe ONLY</b> — never copy old wordmarks, emblems or supplier logos. Chest stays clean; wordmark goes on in finishing.</li>
</ul></div>
<div class="foot">Sideline NZ · this link is private to you — don't share it</div>
</div>
<script>
var D=${effDeadline},PAUSED=${job.pauseOpenAt ? "true" : "false"};
function tick(){var el=document.getElementById("cd");
 if(PAUSED){el.textContent="⏸ paused";el.className="paused";return;}
 if(!D){el.textContent="—";return;}
 var ms=D-Date.now();
 if(ms<0){el.textContent="OVERDUE";el.className="late";return;}
 var h=Math.floor(ms/36e5),m=Math.floor(ms%36e5/6e4);
 el.textContent=h+"h "+(m<10?"0":"")+m+"m";el.className=h<8?"warn":"";}
if(D)document.getElementById("lc").textContent=new Date(D).toLocaleString("en-GB",{timeZone:${JSON.stringify(job.timezone)},weekday:"short",hour:"2-digit",minute:"2-digit"});
tick();setInterval(tick,30000);

// ---- copy a prompt, ready to paste into Gemini ------------------------
(function(){
  var wrap=document.querySelector(".card .pgar"); if(!wrap) return;
  var PROMPTS=${jsonForScript(garments.map((g) => expandPrompt(g, pack)))};
  document.querySelectorAll(".copy[data-p]").forEach(function(b){
    b.addEventListener("click",function(){
      var t=PROMPTS[+b.getAttribute("data-p")]||"";
      var done=function(){var o=b.textContent;b.textContent="Copied";setTimeout(function(){b.textContent=o;},1400);};
      if(navigator.clipboard){navigator.clipboard.writeText(t).then(done,done);}
      else{var ta=document.createElement("textarea");ta.value=t;document.body.appendChild(ta);ta.select();
           try{document.execCommand("copy");}catch(_){}document.body.removeChild(ta);done();}
    });
  });
})();

// ---- self-serve delivery ----------------------------------------------
// Uploads one file at a time so the designer sees real progress and a single
// large file can't take the whole batch down with it.
(function(){
 var fi=document.getElementById("fi");if(!fi)return;
 var list=document.getElementById("list"),go=document.getElementById("go"),msg=document.getElementById("msg"),pick=document.getElementById("pick");
 var queued=[],done=[],busy=false;
 function esc(s){var d=document.createElement("div");d.textContent=s;return d.innerHTML;}
 function kb(n){return n>=1048576?(n/1048576).toFixed(1)+"MB":Math.max(1,Math.round(n/1024))+"KB";}
 function render(){
  list.innerHTML=queued.map(function(f,i){
   var s=done[i]?"uploaded":(f.err?f.err:"ready");
   return "<li><span>"+esc(f.file.name)+"</span><span class='st'>"+kb(f.file.size)+" · "+s+"</span></li>";}).join("");
  go.disabled=busy||!queued.length;
 }
 fi.addEventListener("change",function(){
  queued=Array.prototype.slice.call(fi.files).map(function(f){return {file:f};});
  done=[];render();
  if(queued.length)pick.textContent=queued.length+" file"+(queued.length>1?"s":"")+" selected — choose again to replace";
 });
 function readB64(file){return new Promise(function(res,rej){
  var r=new FileReader();
  r.onload=function(){var s=String(r.result);res(s.slice(s.indexOf(",")+1));};
  r.onerror=function(){rej(new Error("could not read "+file.name));};
  r.readAsDataURL(file);});
 }
 go.addEventListener("click",async function(){
  if(busy||!queued.length)return;
  busy=true;go.disabled=true;msg.textContent="";
  try{
   for(var i=0;i<queued.length;i++){
    if(done[i])continue;
    msg.textContent="Uploading "+(i+1)+" of "+queued.length+"…";
    var f=queued[i].file;
    var b64=await readB64(f);
    var r=await fetch(location.pathname+"/file",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({name:f.name,contentType:f.type||"application/octet-stream",dataBase64:b64})});
    var j=await r.json().catch(function(){return {};});
    if(!r.ok){queued[i].err=j.error||"failed";render();throw new Error(j.error||"upload failed");}
    done[i]={url:j.url,name:j.name,size:j.size};render();
   }
   msg.textContent="Submitting…";
   var sr=await fetch(location.pathname+"/submit",{method:"POST",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({files:done.filter(Boolean),note:(document.getElementById("note")||{}).value||undefined})});
   var sj=await sr.json().catch(function(){return {};});
   if(!sr.ok)throw new Error(sj.error||"submit failed");
   msg.textContent="Done. Reloading…";
   setTimeout(function(){location.reload();},900);
  }catch(e){
   msg.textContent=(e&&e.message?e.message:"Something went wrong")+" — your uploaded files were kept, press Submit again to retry.";
   busy=false;go.disabled=false;
  }
 });
})();
</script></body></html>`);
  } catch (e: any) {
    console.error("Job page error:", e);
    res.status(500).setHeader("Content-Type", "text/html; charset=utf-8");
    res.send("<h1 style='font-family:sans-serif'>Something went wrong</h1><p style='font-family:sans-serif'>We couldn't load this job right now — try again shortly.</p>");
  }
});

export { adminDesignerJobsRouter, publicJobRouter };
