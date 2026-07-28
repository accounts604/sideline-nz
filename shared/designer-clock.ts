// The Drop Designer SLA clock, in the app.
//
// Ported from ~/.openclaw/workspace/core/designer-clock.js so the app is
// authoritative at the moment a job is CLAIMED. That matters now the board is
// pull-based: the deadline is set when the designer takes the job, not when it
// was posted, so it has to be computed server-side at claim time.
//
// Rules:
//  - N hours from the claim, weekend-safe in the DESIGNER'S OWN timezone: a
//    deadline landing on their Sat/Sun rolls to Monday 17:30 local.
//  - Engine downtime pauses the clock; paused time extends the deadline.
//  - on_time = SUBMIT timestamp vs effective deadline. Review latency never
//    counts against the designer.
//
// The workspace JS version is regression-tested against 2920 samples across a
// year; this port is verified against the same rules in scripts/test-designer-clock.ts.

export const DEFAULT_TZ = "Asia/Colombo";
export const DEFAULT_SLA_HOURS = 48;

/** Minutes `tz` is ahead of UTC at instant `atMs` (DST-correct). */
export function tzOffsetMin(tz: string, atMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
    .formatToParts(new Date(atMs))
    .reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
  const asUTC = Date.UTC(
    +parts.year, +parts.month - 1, +parts.day,
    +parts.hour % 24, +parts.minute, +parts.second,
  );
  return Math.round((asUTC - Math.floor(atMs / 1000) * 1000) / 60000);
}

/** The instant when local wall-clock in `tz` reads y-m-d h:mm (DST-corrected). */
function instantFromLocal(tz: string, y: number, m: number, d: number, h: number, min: number, nearMs: number): number {
  let guess = Date.UTC(y, m, d, h, min) - tzOffsetMin(tz, nearMs) * 60e3;
  // One correction pass handles a DST boundary between the guess and the answer.
  guess = Date.UTC(y, m, d, h, min) - tzOffsetMin(tz, guess) * 60e3;
  return guess;
}

/**
 * Deadline `hours` after `fromMs`, rolled off the designer's weekend.
 * A deadline landing on their Saturday or Sunday moves to Monday 17:30 local.
 */
export function computeDeadline(fromMs: number, hours = DEFAULT_SLA_HOURS, tz = DEFAULT_TZ): number {
  const d = fromMs + hours * 3600e3;
  const local = new Date(d + tzOffsetMin(tz, d) * 60e3);
  const day = local.getUTCDay(); // 0=Sun, 6=Sat in LOCAL wall time
  if (day !== 6 && day !== 0) return d;
  const daysToMon = day === 6 ? 2 : 1;
  return instantFromLocal(
    tz,
    local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + daysToMon,
    17, 30, d,
  );
}

/** Effective deadline for a job, extending by any paused (engine-down) time. */
export function effectiveDeadline(deadlineAt: Date | string, pausedMs = 0): number {
  return new Date(deadlineAt).getTime() + pausedMs;
}

/** Was this submission on time? null when unknowable. */
export function isOnTime(
  submittedAt: Date | string | null | undefined,
  deadlineAt: Date | string | null | undefined,
  pausedMs = 0,
): boolean | null {
  if (!submittedAt || !deadlineAt) return null;
  return new Date(submittedAt).getTime() <= effectiveDeadline(deadlineAt, pausedMs);
}

/**
 * Elapsed WORKING hours a designer took, which is what the pay ladder is scored
 * on. Review latency is excluded by construction: we only ever measure from the
 * claim to their submission, never to our verdict.
 */
export function elapsedHours(claimedAt: Date | string, submittedAt: Date | string, pausedMs = 0): number {
  const ms = new Date(submittedAt).getTime() - new Date(claimedAt).getTime() - pausedMs;
  return Math.max(0, ms) / 3600e3;
}
