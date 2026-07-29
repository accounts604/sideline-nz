// designer-board.ts — the pull-based job board and the designer portal around it.
//
//   GET  /designers/:token             Design Board
//   GET  /designers/:token/jobs        My Jobs
//   GET  /designers/:token/brand       Brand Kit
//   GET  /designers/:token/earnings    Earnings
//   GET  /designers/:token/standards   Standards
//   POST /designers/:token/claim       take a job; the SLA clock starts HERE
//
// Why pull rather than push: under round-robin a job was assigned and the clock
// started immediately, so a designer could be marked late for work they had
// never seen. SL-0064 died exactly that way. Claiming makes the commitment
// theirs, which is what makes an on-time record mean anything.
import { Router, json } from "express";
import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import { db } from "../db";
import { designers, designerJobs } from "@shared/schema";
import { computeDeadline } from "@shared/designer-clock";
import { DROP_CHECKLIST } from "@shared/drop-checklist";
import { renderShell, type PortalView } from "../designer-portal-shell";
import { touchDesigner } from "../last-seen";

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const boardRouter = Router();

async function designerByToken(token: string) {
  const [d] = await db.select().from(designers).where(eq(designers.token, token)).limit(1);
  // The board is a no-login surface, so this token load IS the sign-in event.
  if (d) touchDesigner(d.id);
  return d;
}

/** Jobs this designer holds and has not finished. */
async function myJobs(name: string) {
  return db
    .select()
    .from(designerJobs)
    .where(and(eq(designerJobs.designerName, name), or(eq(designerJobs.status, "in_progress"), eq(designerJobs.status, "revision"))));
}

// ---------------------------------------------------------------- claim
const claimSchema = z.object({ quoteId: z.string().regex(/^SL-[A-Za-z0-9-]+$/) });

boardRouter.post("/:token/claim", json({ limit: "8kb" }), async (req, res) => {
  try {
    const designer = await designerByToken(req.params.token);
    if (!designer) return res.status(404).json({ error: "board not found" });
    if (!designer.active) return res.status(403).json({ error: "this board is no longer active" });

    const parsed = claimSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "which job?" });
    const quoteId = parsed.data.quoteId.toUpperCase();

    const held = (await myJobs(designer.name)).length;
    if (held >= designer.wipCap) {
      return res.status(409).json({
        error: `You already have ${held} job${held === 1 ? "" : "s"} on the go. Finish ${held === 1 ? "it" : "one"} before taking another.`,
      });
    }

    const now = new Date();
    const deadline = new Date(computeDeadline(now.getTime(), designer.slaHours, designer.timezone));

    // THE RACE GUARD. Two designers hitting Claim at the same moment both reach
    // here; WHERE status='available' means exactly one UPDATE matches a row.
    const claimed = await db
      .update(designerJobs)
      .set({
        status: "in_progress", designerName: designer.name, designerEmail: designer.email,
        timezone: designer.timezone, claimedAt: now, assignedAt: now, deadlineAt: deadline, updatedAt: now,
      })
      .where(and(eq(designerJobs.quoteId, quoteId), eq(designerJobs.status, "available")))
      .returning();

    if (!claimed.length) return res.status(409).json({ error: "Someone just took that one. Pick another." });

    console.log(`[board] ${designer.name} claimed ${quoteId}, due ${deadline.toISOString()} (${designer.timezone})`);
    res.json({ ok: true, quoteId, deadlineAt: deadline.toISOString(), jobUrl: `/job/${claimed[0].token}` });
  } catch (e: any) {
    console.error("[board] claim failed:", e?.message);
    res.status(500).json({ error: "could not claim that job — try again" });
  }
});

// ---------------------------------------------------------------- shared bits
const CLAIM_JS = `
document.querySelectorAll(".btn[data-q]").forEach(function(b){
  b.addEventListener("click", async function(){
    b.disabled=true; b.textContent="Claiming…";
    try{
      var base=location.pathname.replace(/\\/$/,"");
      var r=await fetch(base+"/claim",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({quoteId:b.getAttribute("data-q")})});
      var j=await r.json(); if(!r.ok) throw new Error(j.error||"could not claim");
      location.href=j.jobUrl;
    }catch(e){
      var m=document.getElementById("msg"); if(m) m.textContent=e.message;
      b.disabled=false; b.textContent="Claim this job";
      setTimeout(function(){location.reload();},1800);
    }
  });
});
(function(){var els=document.querySelectorAll(".cd[data-due]");if(!els.length)return;
 function p(){els.forEach(function(el){var d=+el.getAttribute("data-due");if(!d){el.textContent="—";return;}
  var ms=d-Date.now(),o=ms<0,a=Math.abs(ms);
  el.textContent=(o?"+":"")+Math.floor(a/36e5)+"h "+String(Math.floor(a%36e5/6e4)).padStart(2,"0")+"m";
  el.style.color=o?"#ef4444":(a<8*36e5?"#f59e0b":"#fff");});}
 p();setInterval(p,30000);})();`;

async function shellFor(token: string, view: PortalView) {
  const designer = await designerByToken(token);
  if (!designer) return null;
  const mine = await myJobs(designer.name);
  return {
    designer,
    mine,
    common: {
      displayName: designer.displayName, token, view,
      openCount: mine.length, wipCap: designer.wipCap, tier: designer.tier, email: designer.email,
    },
  };
}

const notFound = (res: any) =>
  res.status(404).type("html").send("<h1 style='font-family:sans-serif'>Board not found</h1><p style='font-family:sans-serif'>Check the link you were sent, or ask for a new one.</p>");

const jobCard = (j: typeof designerJobs.$inferSelect) => {
  const due = j.deadlineAt ? new Date(j.deadlineAt).getTime() + j.pausedMs : 0;
  return `<article class="card mine">
    <div class="tags"><span class="tag">${esc(j.quoteId)}</span>${j.status === "revision" ? '<span class="tag r">Changes needed</span>' : ""}${j.practice ? '<span class="tag p">Practice</span>' : ""}</div>
    <h3>${esc(j.club || j.quoteId)}</h3>
    <div class="meta"><span>Time left</span><b class="cd" data-due="${due}">—</b></div>
    <a class="btn" href="/job/${esc(j.token)}">Open &amp; upload</a></article>`;
};

// ---------------------------------------------------------------- Design Board
boardRouter.get("/:token", async (req, res) => {
  try {
    const ctx = await shellFor(req.params.token, "board");
    if (!ctx) return notFound(res);
    const { designer, mine, common } = ctx;

    const open = await db.select().from(designerJobs).where(eq(designerJobs.status, "available")).orderBy(designerJobs.postedAt);
    // Rookies see practice jobs only. A real club's kit is not where somebody
    // makes their first attempt.
    const visible = designer.tier === "rookie" ? open.filter((j) => j.practice) : open;
    const gated = open.length - visible.length;
    const atCap = mine.length >= designer.wipCap;

    const card = (j: typeof designerJobs.$inferSelect) => `
      <article class="card">
        <div class="tags"><span class="tag">${esc(j.club || j.quoteId)}</span>${j.practice ? '<span class="tag p">Practice</span>' : ""}</div>
        <h3>${esc(j.club || j.quoteId)}</h3><p class="q">${esc(j.quoteId)}</p>
        <div class="meta"><span>Clock</span><b>${esc(designer.slaHours)}h from your claim</b></div>
        ${atCap
          ? `<button class="btn off" disabled>Finish your current job first</button>`
          : `<button class="btn" data-q="${esc(j.quoteId)}">Claim this job</button>`}
      </article>`;

    res.type("html").send(renderShell({
      ...common,
      title: "Design Board",
      subtitle: `Claim what you want to work on. Your ${esc(designer.slaHours)} hours starts the moment you take it, in your own timezone, with your weekend protected.`,
      body:
        (visible.length
          ? `<div class="grid">${visible.map(card).join("")}</div>`
          : `<div class="note">No jobs on the board right now. New ones appear here the moment a brief is posted.</div>`) +
        (gated > 0
          ? `<p style="color:rgba(255,255,255,.35);font-size:13px;margin-top:14px">${gated} club job${gated === 1 ? "" : "s"} hidden. Pass a practice drop to unlock real club work.</p>`
          : "") +
        `<p class="msg" id="msg"></p>`,
      extraScript: CLAIM_JS,
    }));
  } catch (e: any) {
    console.error("[board] page error:", e);
    res.status(500).type("html").send("<h1 style='font-family:sans-serif'>Something went wrong</h1>");
  }
});

// ---------------------------------------------------------------- My Jobs
boardRouter.get("/:token/jobs", async (req, res) => {
  const ctx = await shellFor(req.params.token, "jobs");
  if (!ctx) return notFound(res);
  res.type("html").send(renderShell({
    ...ctx.common,
    title: "My Jobs",
    subtitle: `${ctx.mine.length} of ${ctx.common.wipCap} slots in use. Your clock never restarts on a revision, and our review time never counts against you.`,
    body: ctx.mine.length
      ? `<div class="grid">${ctx.mine.map(jobCard).join("")}</div>`
      : `<div class="note">Nothing on the go. Claim something from the Design Board.</div>`,
    extraScript: CLAIM_JS,
  }));
});

// ---------------------------------------------------------------- Brand Kit
boardRouter.get("/:token/brand", async (req, res) => {
  const ctx = await shellFor(req.params.token, "brand");
  if (!ctx) return notFound(res);
  const files = [
    { n: "sideline-logo-master.jpeg", w: "Image 2 in the Gem feed" },
    { n: "sideline-inner-collar-tape.jpeg", w: "Image 3 in the Gem feed" },
    { n: "sideline-size-tag-ref.png", w: "size tag placement" },
  ];
  res.type("html").send(renderShell({
    ...ctx.common,
    title: "Brand Kit",
    subtitle: "The three Sideline assets that ride on every job, whichever club it is for.",
    body:
      `<div class="card"><div class="files">${files
        .map((f) => `<a class="file" href="#" onclick="return false"><span class="ph">SIDELINE</span><span class="nm">${esc(f.n)}<br><span style="color:rgba(255,255,255,.25)">${esc(f.w)}</span></span></a>`)
        .join("")}</div></div>` +
      `<div class="card" style="margin-top:14px"><h3 style="font-size:14px;margin-bottom:10px">Non-negotiables</h3><ul class="rules">
        <li><b>Sideline inner collar tape</b> is visible on every garment, inside the neckline only.</li>
        <li><b>Collar piping</b> traces the outer edge of the neckline, contrasting with the body.</li>
        <li><b>The chest stays clean.</b> Crests and sponsor logos are composited in Canva at the finishing step.</li>
        <li><b>Reference photos are colour and vibe only.</b> Never copy an old wordmark, emblem or another supplier's mark.</li>
      </ul></div>`,
  }));
});

// ---------------------------------------------------------------- Earnings
boardRouter.get("/:token/earnings", async (req, res) => {
  const ctx = await shellFor(req.params.token, "earnings");
  if (!ctx) return notFound(res);
  const all = await db.select().from(designerJobs).where(eq(designerJobs.designerName, ctx.designer.name));
  const approved = all.filter((j) => j.status === "approved");
  const onTime = approved.filter((j) => j.qcOnTime !== false);
  const awaiting = all.filter((j) => j.status === "submitted");
  const pct = approved.length ? Math.round((onTime.length / approved.length) * 100) : null;

  res.type("html").send(renderShell({
    ...ctx.common,
    title: "Earnings",
    subtitle: "NZD. Approved drops only — work sitting with us for review is pay-protected, because our review speed can never cost you.",
    body:
      `<div class="stats">
        <div class="stat"><p class="k">Caps</p><p class="v">${approved.length}</p><p class="s">drops approved</p></div>
        <div class="stat"><p class="k">On time</p><p class="v">${pct === null ? "&mdash;" : pct + "%"}</p><p class="s">${approved.length ? onTime.length + " of " + approved.length : "no history yet"}</p></div>
        <div class="stat"><p class="k">Awaiting QC</p><p class="v" style="color:#f59e0b">${awaiting.length}</p><p class="s">pay protected</p></div>
        <div class="stat"><p class="k">In progress</p><p class="v">${ctx.common.openCount}</p><p class="s">of ${ctx.common.wipCap} slots</p></div>
      </div>` +
      `<div class="note">Sideline confirms pay when a drop passes quality check. This page shows your record, not an invoice.</div>`,
  }));
});

// ---------------------------------------------------------------- Standards
boardRouter.get("/:token/standards", async (req, res) => {
  const ctx = await shellFor(req.params.token, "standards");
  if (!ctx) return notFound(res);
  res.type("html").send(renderShell({
    ...ctx.common,
    title: "Standards",
    subtitle: "The same six checks on every job. You know the exam before you sit it, and a rejection always names which of these failed.",
    body:
      `<div class="card"><ol class="checks">${DROP_CHECKLIST.map((c, i) => `<li><span class="n">${i + 1}</span>${esc(c)}</li>`).join("")}</ol></div>` +
      `<div class="card" style="margin-top:14px"><h3 style="font-size:14px;margin-bottom:10px">How you're judged</h3><ul class="rules">
        <li><b>On time</b> is measured from when you upload, never from when we review.</li>
        <li><b>Blocked by something on our side?</b> Tell us and the clock stops until it's fixed.</li>
        <li><b>Your weekend is protected.</b> A deadline landing on your Saturday or Sunday rolls to Monday 5:30pm your time.</li>
        <li><b>One revision round.</b> You are told exactly what to change, and the clock does not restart.</li>
        <li><b>Cultural corrections are free</b> and never count as a revision.</li>
        <li><b>Pay is NZD and speed-based:</b> $50 on target, $40 +12h, $30 +24h, $20 +36h, $10 beyond. Target is 12h for a 3-item set, +4h per extra item. Plus $12 per item over 3, and 2% of the order (capped $100) once it is paid.</li>
      </ul></div>`,
  }));
});

export { boardRouter };
