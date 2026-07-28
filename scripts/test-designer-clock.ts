// Regression guard: the TS port must agree with the workspace JS clock exactly.
import { computeDeadline, tzOffsetMin, isOnTime, elapsedHours } from "../shared/designer-clock";
import { createRequire } from "module";
const wsClock = createRequire(import.meta.url)("/Users/kigagent/.openclaw/workspace/core/designer-clock.js");

let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (!cond) { fail++; console.log("  FAIL " + name + (extra ? "  " + extra : "")); }
  else console.log("  ok   " + name);
};

console.log("\n[1] TS port vs workspace JS, every 3h across a year, 5 zones");
for (const tz of ["Asia/Colombo", "Asia/Manila", "Pacific/Auckland", "America/New_York", "Europe/London"]) {
  let diffs = 0, n = 0;
  const start = Date.UTC(2026, 0, 1);
  for (let t = start; t < start + 365 * 864e5; t += 3 * 3600e3) {
    n++;
    if (computeDeadline(t, 48, tz) !== wsClock.computeDeadline(t, 48, tz)) diffs++;
  }
  ok(`${tz} — ${n} samples identical`, diffs === 0, `diffs=${diffs}`);
}

console.log("\n[2] weekend roll lands Monday 17:30 local");
for (const tz of ["Asia/Colombo", "Asia/Manila", "Pacific/Auckland", "America/New_York"]) {
  let rolled: number | null = null;
  for (let t = Date.UTC(2026, 6, 1); t < Date.UTC(2026, 6, 30); t += 3600e3) {
    const raw = t + 48 * 3600e3;
    if (new Date(raw + tzOffsetMin(tz, raw) * 60e3).getUTCDay() === 6) { rolled = computeDeadline(t, 48, tz); break; }
  }
  const s = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(rolled!));
  ok(`${tz} -> ${s}`, /Mon/.test(s) && /17:30/.test(s), s);
}

console.log("\n[3] on-time and elapsed semantics");
const claim = "2026-07-28T00:00:00.000Z";
const deadline = "2026-07-30T00:00:00.000Z";
ok("submitted before deadline = on time", isOnTime("2026-07-29T00:00:00Z", deadline) === true);
ok("submitted after deadline = late", isOnTime("2026-07-31T00:00:00Z", deadline) === false);
ok("pause extends the deadline", isOnTime("2026-07-30T06:00:00Z", deadline, 12 * 3600e3) === true);
ok("unknowable returns null", isOnTime(null, deadline) === null);
ok("elapsed excludes paused time", Math.round(elapsedHours(claim, "2026-07-28T12:00:00Z", 2 * 3600e3)) === 10);
ok("elapsed never negative", elapsedHours(claim, "2026-07-27T00:00:00Z") === 0);

console.log(fail ? `\n${fail} FAILURE(S)\n` : "\nALL PASS\n");
process.exit(fail ? 1 : 0);
