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
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { designerJobs } from "@shared/schema";
import { requireAdmin } from "../auth";

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
  briefMd: z.string().max(20000).optional(),
  assetsBase: z.string().url().optional(),
  assetFiles: z.array(z.string().max(200)).max(50).optional(),
  assignedAt: z.string().datetime().optional(),
  deadlineAt: z.string().datetime().optional(),
  pausedMs: z.number().int().min(0).optional(),
  pauseOpenAt: z.string().datetime().nullable().optional(),
  submittedAt: z.string().datetime().nullable().optional(),
  practice: z.boolean().optional(),
});

adminDesignerJobsRouter.post("/", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "invalid body" });
  const b = parsed.data;
  const values = {
    quoteId: b.quoteId.toUpperCase(),
    token: b.token || crypto.randomBytes(12).toString("base64url"),
    club: b.club,
    designerName: b.designerName || "ashan",
    briefMd: b.briefMd,
    assetsBase: b.assetsBase,
    assetFiles: b.assetFiles,
    assignedAt: b.assignedAt ? new Date(b.assignedAt) : undefined,
    deadlineAt: b.deadlineAt ? new Date(b.deadlineAt) : undefined,
    pausedMs: b.pausedMs,
    pauseOpenAt: b.pauseOpenAt ? new Date(b.pauseOpenAt) : b.pauseOpenAt === null ? null : undefined,
    submittedAt: b.submittedAt ? new Date(b.submittedAt) : b.submittedAt === null ? null : undefined,
    practice: b.practice,
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
    return res.json({ ok: true, job: row });
  }

  // Evidence-based rejection: WHICH checklist items failed is mandatory.
  if (!reason || !failedItems?.length)
    return res.status(400).json({ error: "reject requires reason AND failedItems (which checklist items failed)" });
  const [row] = await db
    .update(designerJobs)
    .set({
      status: "revision", qcBy: by, qcAt: now, qcOnTime: null, qcReason: reason,
      qcFailedItems: failedItems, revisions: job.revisions + 1, submittedAt: null, updatedAt: now,
    })
    .where(eq(designerJobs.quoteId, quoteId))
    .returning();
  res.json({ ok: true, job: row, secondRejection: row.revisions >= 2 });
});

// ---------------------------------------------------------------- public page
const publicJobRouter = Router();

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
.foot{color:#666;font-size:12px;margin-top:22px;font-family:ui-monospace,Menlo,monospace}
.tag{display:inline-block;font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:700;letter-spacing:.05em;padding:2px 8px;border-radius:5px;background:#FFFFFF1E;color:#EDEDED;text-transform:uppercase;margin-left:6px}
</style></head><body><div class="wrap">
<div class="brand">SIDELINE <span>NZ</span> · designer job</div>
<h1>${esc(job.club || job.quoteId)} — ${esc(job.quoteId)}${job.practice ? '<span class="tag">practice</span>' : ""}</h1>
<p class="sub">assigned ${esc(job.assignedAt ? new Date(job.assignedAt).toISOString().slice(0, 10) : "")} · everything you need is on this page</p>
<div class="card"><span class="label">Time left</span>
  <div class="due"><span id="cd">—</span><span class="duewhen">due ${esc(dueNZ)} NZT<br>(your time: <span id="lc"></span>)</span></div>
</div>
<div class="card"><span class="label">The brief</span>${briefToHtml(job.briefMd || "Brief sent in your email — this page tracks the clock and files.")}</div>
${files.length ? `<div class="card"><span class="label">Files — references + Sideline brand kit (tap to download)</span><div class="files">${imgs}</div></div>` : ""}
<div class="card"><span class="label">How this works — same every job</span><ul class="rules">
<li><b>Reply on WhatsApp/email with your files when done.</b> Your send time is your proof of on-time — review speed never counts against you.</li>
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
if(D)document.getElementById("lc").textContent=new Date(D).toLocaleString("en-GB",{timeZone:"Asia/Colombo",weekday:"short",hour:"2-digit",minute:"2-digit"});
tick();setInterval(tick,30000);
</script></body></html>`);
  } catch (e: any) {
    console.error("Job page error:", e);
    res.status(500).setHeader("Content-Type", "text/html; charset=utf-8");
    res.send("<h1 style='font-family:sans-serif'>Something went wrong</h1><p style='font-family:sans-serif'>We couldn't load this job right now — try again shortly.</p>");
  }
});

export { adminDesignerJobsRouter, publicJobRouter };
