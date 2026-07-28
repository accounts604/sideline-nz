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

/** Human-readable brief, in the house format the job page renders. */
function buildBrief(r: MockupRequest): string {
  const colours = [
    r.primaryColor && `primary ${r.primaryColor}`,
    r.secondaryColor && `secondary ${r.secondaryColor}`,
    r.accentColor && `accent ${r.accentColor}`,
  ].filter(Boolean).join(", ");

  return [
    "## The job — 3 hero concepts (front view, one per colourway)",
    `- Club: ${r.teamName}`,
    `- Sport: ${r.sport}`,
    `- Colours: ${colours || "not specified — ask before starting"}`,
    "## Style",
    "- Chest stays CLEAN — the crest goes on in the finishing step",
    "- Every garment shows the Sideline inner collar tape (brand kit attached)",
    "- Reference images are colour and vibe only. Never copy an old wordmark, emblem or supplier logo",
    ...(r.notes ? ["## What they asked for", `- ${r.notes.replace(/\n+/g, " ")}`] : []),
    "## Deliver",
    "- 3 PNG files, portrait 4:5, clean or transparent background, front view",
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
