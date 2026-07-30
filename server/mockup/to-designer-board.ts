// A free-mockup request becomes a job on the designer board.
//
// Replaces the AI mockup engine (retired 2026-07-28). That engine had a 100%
// failure rate in production: two real leads, Rise Together Fitness and
// St Paul's College, both submitted the form and both got nothing. A lead
// source that silently fails is worse than no lead source.
//
// The intake already captures everything a design brief needs — team, sport,
// colours, logo, notes — so it maps almost one to one onto a designer job.
// Romero's call: use the Design Studio and learn from what designers actually
// produce, rather than from a generator that never worked.
import { db } from "../db";
import { designerJobs, type MockupRequest } from "@shared/schema";

/**
 * Human-readable brief, in the house format the job page renders.
 *
 * Everything below the job/colours header is Romero's standing practice, transcribed
 * from his own Gemini sessions and finished Canva decks on 2026-07-30 rather than
 * invented. The earlier version of this brief told a designer WHAT to make but never
 * the house rules or what a finished page looks like, so those were the things that
 * came back wrong.
 *
 * The four pre-submit checks are the four things Romero confirmed he actually fixes on
 * a refine (blur, coverage, colour, blending). Putting them in the brief lets a
 * designer clear them before submitting instead of burning a revision round.
 */
function buildBrief(r: MockupRequest): string {
  const colours = [
    r.primaryColor && `primary ${r.primaryColor}`,
    r.secondaryColor && `secondary ${r.secondaryColor}`,
    r.accentColor && `accent ${r.accentColor}`,
  ].filter(Boolean).join(", ");

  return [
    "## The job: 3 hero concepts (front view, one per colourway)",
    `- Club: ${r.teamName}`,
    `- Sport: ${r.sport}`,
    `- Colours: ${colours || "not specified, ask before starting"}`,
    "- 3 items. Target 12 hours from when YOU claim it, not from when it was posted",

    "## The reference",
    // No reference column on mockup_requests yet, so the brief has to ask for it out
    // loud. Romero's rule (2026-07-30): a design is only ever built from a reference
    // the club supplied or he approved, never invented. No reference, no design.
    r.logoUrl
      ? "- Club assets are attached to this job"
      : "- NO reference or club asset attached. Ask for one before you start",
    "- Take from a reference: colours, pattern language, the vibe",
    "- Never take from it: any wordmark, crest, emblem, sponsor or supplier mark",
    "- REINTERPRET, do not copy. Copying a reference directly comes out BLURRY every time, and a literal copy of an old kit is not a new concept",
    "- Never invent a cultural pattern. If there is no reference for it, ask",

    "## Non-negotiables",
    "- STRAIGHT FRONT FACING. Square to camera, centred, symmetrical. No angle, no three-quarter, no rotation, no perspective tilt",
    "- Chest stays completely BARE. No crest, badge, emblem, wordmark or sponsor. The crest is composited in Canva afterwards, so adding one is a reject not a bonus",
    "- No placeholder text. No YOUR LOGO HERE, MAJOR SPONSOR, TEAMNAME or 00. The Sideline blank templates HAVE these on them. Remove them",
    "- Invisible ghost mannequin, garment holds its 3D shape. No hanger, no hook, no visible mannequin, no body, no hands, no person, no scene, no props",
    "- One garment, one view, one image. Never two views in a single render",
    "- Keep pattern scale and placement consistent across the three so they read as one family",
    // QC point 1. Only visible where the collar stands open (polos, open necks). A hood
    // or a high crew neck covers it, so do not force it there.
    "- Show the Sideline inner collar tape and size tag wherever the collar stands open enough to see inside the neck, copied from the attached brand kit. Do not invent the wording. A hood or a high crew neck hides it, so do not force it there",

    "## Check these four before you submit",
    "These are the four things that come back on a refine. Clear them yourself and you skip a round.",
    "1. SHARP, not blurry. Soft print usually means you copied instead of reinterpreting. Ask for 4k high res",
    "2. COVERAGE. The pattern fills its zone right up to the panel edge, no dead space",
    "3. COLOUR. The primary matches the spec exactly, not a near-enough shade",
    "4. BLENDED, not stuck on. It should look sublimated into the fabric, not laid on top like a sticker",

    ...(r.notes ? ["## What they asked for", `- ${r.notes.replace(/\n+/g, " ")}`] : []),

    "## Deliver",
    "- 3 PNG files, portrait 4:5 (1080 x 1350), transparent or clean plain background, front view",
    "- Upload on this page. Your upload time is your proof of speed, so do not email files",

    "## What done looks like",
    "- Open any finished `<Club> x Sideline NZ` deck in the shared Canva and look at a garment page. Clean garment, bare chest, Sideline mark and crest added afterwards",
    "- If your render could drop into one of those pages untouched, you are done",

    "## If you get stuck",
    "- Blocked by something on our side? Say so and the clock stops until it is fixed",
    "- Cultural elements are real pattern languages, not decoration. If one is not right we fix it free and it never counts as a revision against you",
  ].join("\n");
}

/**
 * Create the board job. Idempotent on quoteId, which is derived from the
 * request id, so a retried submission cannot post the same brief twice.
 * Posted as `available` with NO deadline: the clock starts when someone claims it.
 */
export async function postRequestToBoard(r: MockupRequest): Promise<string> {
  const quoteId = `SL-WEB-${r.id.slice(0, 6).toUpperCase()}`;
  const now = new Date();
  const [row] = await db
    .insert(designerJobs)
    .values({
      quoteId,
      token: Buffer.from(r.id.replace(/-/g, ""), "hex").toString("base64url").slice(0, 16),
      club: r.teamName,
      clientEmail: r.contactEmail,
      briefMd: buildBrief(r),
      assetFiles: r.logoUrl ? [r.logoUrl] : undefined,
      brand: {
        colors: [
          { role: "primary", name: "Primary", hex: r.primaryColor },
          ...(r.secondaryColor ? [{ role: "secondary", name: "Secondary", hex: r.secondaryColor }] : []),
          ...(r.accentColor ? [{ role: "accent", name: "Accent", hex: r.accentColor }] : []),
        ],
      },
      status: "available",
      postedAt: now,
      designerName: "unassigned",
      practice: false,
    } as typeof designerJobs.$inferInsert)
    .onConflictDoNothing({ target: designerJobs.quoteId })
    .returning();

  return row ? `posted ${quoteId} to the board` : `${quoteId} was already on the board`;
}

/** Same thing, when the caller only has the request id (the GHL webhook path). */
export async function postRequestToBoardById(requestId: string): Promise<string> {
  const { mockupRequests } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  const [r] = await db.select().from(mockupRequests).where(eq(mockupRequests.id, requestId)).limit(1);
  if (!r) return `no mockup request ${requestId}`;
  return postRequestToBoard(r);
}
