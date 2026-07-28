// designer-board.ts — the pull-based job board.
//
//   GET  /designers/:token         the designer's own board (no login, token IS the credential)
//   POST /designers/:token/claim   take a job; the SLA clock starts HERE
//
// Why pull rather than push: under the old round-robin, a job was assigned and
// the clock started immediately, so a designer could be marked late for work
// they had never seen. SL-0064 died exactly that way. Claiming makes the
// commitment theirs, which is what makes an on-time record mean anything.
import { Router, json } from "express";
import { z } from "zod";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { designers, designerJobs } from "@shared/schema";
import { computeDeadline } from "@shared/designer-clock";

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const boardRouter = Router();

async function designerByToken(token: string) {
  const [d] = await db.select().from(designers).where(eq(designers.token, token)).limit(1);
  return d;
}

/** Jobs this designer currently holds and has not finished. */
async function openJobCount(name: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(designerJobs)
    .where(and(eq(designerJobs.designerName, name), or(eq(designerJobs.status, "in_progress"), eq(designerJobs.status, "revision"))));
  return row?.n ?? 0;
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

    // WIP cap: checked before the claim, so an unproven designer cannot tie up
    // several clubs' drops at once.
    const held = await openJobCount(designer.name);
    if (held >= designer.wipCap) {
      return res.status(409).json({
        error: `You already have ${held} job${held === 1 ? "" : "s"} on the go. Finish ${held === 1 ? "it" : "one"} before taking another.`,
      });
    }

    const now = new Date();
    const deadline = new Date(computeDeadline(now.getTime(), designer.slaHours, designer.timezone));

    // THE RACE GUARD. Two designers hitting Claim at the same moment both reach
    // here; the WHERE status='available' means exactly one UPDATE matches a row.
    // The loser gets zero rows back and a clean message, never a half-claim.
    const claimed = await db
      .update(designerJobs)
      .set({
        status: "in_progress",
        designerName: designer.name,
        designerEmail: designer.email,
        timezone: designer.timezone,
        claimedAt: now,
        assignedAt: now,
        deadlineAt: deadline,
        updatedAt: now,
      })
      .where(and(eq(designerJobs.quoteId, quoteId), eq(designerJobs.status, "available")))
      .returning();

    if (!claimed.length) {
      return res.status(409).json({ error: "Someone just took that one. Pick another." });
    }

    const job = claimed[0];
    console.log(`[board] ${designer.name} claimed ${quoteId}, due ${deadline.toISOString()} (${designer.timezone})`);
    res.json({ ok: true, quoteId, deadlineAt: deadline.toISOString(), jobUrl: `/job/${job.token}` });
  } catch (e: any) {
    console.error("[board] claim failed:", e?.message);
    res.status(500).json({ error: "could not claim that job — try again" });
  }
});

// ---------------------------------------------------------------- board page
boardRouter.get("/:token", async (req, res) => {
  try {
    const designer = await designerByToken(req.params.token);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (!designer) {
      return res.status(404).send("<h1 style='font-family:sans-serif'>Board not found</h1><p style='font-family:sans-serif'>Check the link you were sent, or ask for a new one.</p>");
    }

    const open = await db
      .select()
      .from(designerJobs)
      .where(eq(designerJobs.status, "available"))
      .orderBy(designerJobs.postedAt);

    // Rookies only see practice jobs until they have a track record. A real
    // club's kit is not the place for someone's first attempt.
    const visible = designer.tier === "rookie" ? open.filter((j) => j.practice) : open;
    const gated = open.length - visible.length;

    const mine = await db
      .select()
      .from(designerJobs)
      .where(and(eq(designerJobs.designerName, designer.name), or(eq(designerJobs.status, "in_progress"), eq(designerJobs.status, "revision"))));

    const held = mine.length;
    const atCap = held >= designer.wipCap;

    const card = (j: typeof designerJobs.$inferSelect, claimable: boolean) => `
      <article class="card">
        <div class="tags"><span class="tag">${esc(j.club || j.quoteId)}</span>${j.practice ? '<span class="tag p">Practice</span>' : ""}</div>
        <h3>${esc(j.club || j.quoteId)}</h3>
        <p class="q">${esc(j.quoteId)}</p>
        <div class="meta"><span>Clock</span><b>${esc(designer.slaHours)}h from when you claim</b></div>
        ${claimable
          ? `<button class="btn" data-q="${esc(j.quoteId)}">Claim this job</button>`
          : `<button class="btn off" disabled>${atCap ? "Finish your current job first" : "Not available"}</button>`}
      </article>`;

    const mineCard = (j: typeof designerJobs.$inferSelect) => {
      const due = j.deadlineAt ? new Date(j.deadlineAt).getTime() + j.pausedMs : 0;
      return `
      <article class="card mine">
        <div class="tags"><span class="tag">${esc(j.quoteId)}</span>${j.status === "revision" ? '<span class="tag r">Changes needed</span>' : ""}</div>
        <h3>${esc(j.club || j.quoteId)}</h3>
        <div class="meta"><span>Time left</span><b class="cd" data-due="${due}">—</b></div>
        <a class="btn" href="/job/${esc(j.token)}">Open &amp; upload</a>
      </article>`;
    };

    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Sideline — ${esc(designer.displayName)}'s board</title>
<style>
body{margin:0;background:#000;color:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;font-size:15px;line-height:1.5}
.wrap{max-width:920px;margin:0 auto;padding:26px 18px 70px}
.brand{font-weight:800;font-size:18px;letter-spacing:.02em}.brand span{color:#8a8a8a}
h1{font-size:26px;margin:14px 0 2px}h2{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8a8a8a;margin:30px 0 12px}
h3{font-size:17px;margin:0 0 2px}
.sub{color:#8a8a8a;font-size:14px;margin:0 0 6px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.card{background:#111;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:15px 16px}
.card.mine{border-color:rgba(249,115,22,.35)}
.tags{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px}
.tag{font-size:10.5px;font-weight:700;border-radius:4px;padding:2px 7px;background:rgba(255,255,255,.07);color:#9a9a9a}
.tag.p{background:rgba(249,115,22,.14);color:#f97316}.tag.r{background:rgba(245,158,11,.14);color:#f59e0b}
.q{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#6a6a6a;margin:0 0 10px}
.meta{display:flex;justify-content:space-between;gap:10px;border-top:1px solid rgba(255,255,255,.07);padding-top:10px;font-size:12px;color:#8a8a8a}
.meta b{color:#fff;font-family:ui-monospace,Menlo,monospace;font-size:13px}
.btn{display:block;width:100%;box-sizing:border-box;text-align:center;margin-top:11px;border:0;border-radius:8px;padding:10px;
     background:#f97316;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;text-decoration:none}
.btn:hover{filter:brightness(1.1)}
.btn.off{background:rgba(255,255,255,.06);color:#5a5a5a;cursor:not-allowed}
.note{background:#111;border:1px dashed rgba(255,255,255,.14);border-radius:12px;padding:16px 18px;color:#8a8a8a;font-size:13.5px}
.msg{margin-top:12px;font-size:13px;color:#f59e0b;min-height:18px}
</style></head><body><div class="wrap">
<div class="brand">SIDELINE <span>NZ</span></div>
<h1>${esc(designer.displayName)}'s board</h1>
<p class="sub">Claim what you want to work on. Your ${esc(designer.slaHours)} hours starts the moment you take it, in your own timezone, with your weekend protected.</p>

<h2>My jobs (${held} of ${esc(designer.wipCap)})</h2>
${mine.length ? `<div class="grid">${mine.map(mineCard).join("")}</div>` : `<div class="note">Nothing on the go. Claim something below.</div>`}

<h2>Open board</h2>
${visible.length
  ? `<div class="grid">${visible.map((j) => card(j, !atCap)).join("")}</div>`
  : `<div class="note">No jobs on the board right now. New ones appear here the moment a brief is posted.</div>`}
${gated > 0 ? `<p class="sub" style="margin-top:12px">${gated} club job${gated === 1 ? "" : "s"} hidden — pass a practice drop to unlock real club work.</p>` : ""}
<p class="msg" id="msg"></p>
<p class="sub" style="margin-top:26px;font-size:12px">This board is private to you. Don't share the link.</p>
</div>
<script>
document.querySelectorAll(".btn[data-q]").forEach(function(b){
  b.addEventListener("click", async function(){
    b.disabled = true; b.textContent = "Claiming…";
    try{
      var r = await fetch(location.pathname + "/claim", {method:"POST",headers:{"Content-Type":"application/json"},
        body: JSON.stringify({quoteId: b.getAttribute("data-q")})});
      var j = await r.json();
      if(!r.ok) throw new Error(j.error || "could not claim");
      location.href = j.jobUrl;
    }catch(e){
      document.getElementById("msg").textContent = e.message;
      b.disabled = false; b.textContent = "Claim this job";
      setTimeout(function(){ location.reload(); }, 1800);
    }
  });
});
(function(){
  var els = document.querySelectorAll(".cd[data-due]"); if(!els.length) return;
  function paint(){ els.forEach(function(el){
    var ms = +el.getAttribute("data-due") - Date.now();
    if(!+el.getAttribute("data-due")){ el.textContent = "—"; return; }
    var over = ms < 0, a = Math.abs(ms);
    el.textContent = (over?"+":"") + Math.floor(a/36e5) + "h " + String(Math.floor(a%36e5/6e4)).padStart(2,"0") + "m";
    el.style.color = over ? "#ef4444" : (a < 8*36e5 ? "#f59e0b" : "#fff");
  }); }
  paint(); setInterval(paint, 30000);
})();
</script></body></html>`);
  } catch (e: any) {
    console.error("[board] page error:", e);
    res.status(500).setHeader("Content-Type", "text/html; charset=utf-8");
    res.send("<h1 style='font-family:sans-serif'>Something went wrong</h1><p style='font-family:sans-serif'>Try again shortly.</p>");
  }
});

export { boardRouter };
