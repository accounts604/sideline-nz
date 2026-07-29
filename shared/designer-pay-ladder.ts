// The Sideline drop pay ladder. NZD — the system previously said USD in six
// places and that was simply wrong (Romero, 2026-07-30). At ~1.65 NZD/USD the
// difference on a top-tier drop is about $30, so it is not a labelling nicety.
//
// Two things are paid, and they are deliberately separate:
//   SPEED  — how fast an APPROVED set came back. Speed cannot buy its way past
//            QC, because the clock only stops on the submission that is approved.
//   EFFORT — a 5-item range is more work than a 3-colourway concept round.
//
// Paying one number for both is what makes a flat rate unfair, and on a
// claim-based board it is worse than unfair: the 5-item jobs simply never get
// claimed and rot while everyone takes the 3-item ones.

/** NZD per set, by speed band. Index 0 is fastest. */
export const SPEED_BANDS_NZD = [50, 40, 30, 20, 10] as const;

/** NZD per item beyond the 3-item minimum. */
export const PER_EXTRA_ITEM_NZD = 12;

/** A set is 3 to 5 items. Fewer is not a set; more is split and paid as two. */
export const MIN_ITEMS = 3;
export const MAX_ITEMS = 5;

/** Base target for a 3-item set, plus this much per additional item. */
export const BASE_TARGET_HOURS = 12;
export const HOURS_PER_EXTRA_ITEM = 4;

/**
 * Hours a set of `items` is expected to take. Scaling this is the point: a
 * five-garment range judged on a three-colourway stopwatch is not a speed
 * measurement, it is a penalty for taking the bigger job.
 */
export function targetHours(items: number): number {
  const n = Math.max(MIN_ITEMS, items);
  return BASE_TARGET_HOURS + (n - MIN_ITEMS) * HOURS_PER_EXTRA_ITEM;
}

export interface LadderResult {
  items: number;
  targetHours: number;
  elapsedHours: number;
  band: number;          // 0 = fastest, 4 = beyond
  speedNzd: number;
  extraItemsNzd: number;
  totalNzd: number;
  label: string;
}

/**
 * What a completed set pays. `elapsed` is WORKING hours: claim to the approved
 * submission, minus any engine-down pause. Review latency is excluded by
 * construction — we never measure to our own verdict.
 */
export function computeDropPay(items: number, elapsed: number): LadderResult {
  const n = Math.min(MAX_ITEMS, Math.max(MIN_ITEMS, Math.round(items) || MIN_ITEMS));
  const target = targetHours(n);

  let band = SPEED_BANDS_NZD.length - 1;
  for (let i = 0; i < SPEED_BANDS_NZD.length - 1; i++) {
    if (elapsed <= target + i * 12) { band = i; break; }
  }

  const speedNzd = SPEED_BANDS_NZD[band];
  const extraItemsNzd = (n - MIN_ITEMS) * PER_EXTRA_ITEM_NZD;
  const withinTarget = elapsed <= target;

  return {
    items: n,
    targetHours: target,
    elapsedHours: Math.round(elapsed * 10) / 10,
    band,
    speedNzd,
    extraItemsNzd,
    totalNzd: speedNzd + extraItemsNzd,
    label: withinTarget
      ? `On target (${Math.round(elapsed)}h of ${target}h)`
      : band === SPEED_BANDS_NZD.length - 1
        ? `Late (${Math.round(elapsed)}h, target ${target}h)`
        : `${Math.round(elapsed)}h against a ${target}h target`,
  };
}

/** Cut of a paid order. Design effort does not scale with order size, so it caps. */
export const ORDER_CUT_PCT = 0.02;
export const ORDER_CUT_CAP_NZD = 100;

export function computeOrderCut(orderTotalNzd: number): number {
  if (!Number.isFinite(orderTotalNzd) || orderTotalNzd <= 0) return 0;
  return Math.round(Math.min(orderTotalNzd * ORDER_CUT_PCT, ORDER_CUT_CAP_NZD) * 100) / 100;
}
