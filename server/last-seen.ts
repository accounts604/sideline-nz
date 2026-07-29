// last-seen stamping.
//
// Order activity is rich but every event is scoped to an ORDER, so there was no
// way to ask "when did this club last look at anything" or "who has gone quiet".
// That is the question that matters when overseeing four audiences at once.
//
// Deliberately cheap: at most one write per account per hour, fire-and-forget,
// and a failure can never affect the request it is attached to. A tracking
// write that can break a customer's page is worse than no tracking.
import { sql, eq } from "drizzle-orm";
import { db } from "./db";
import { users, clubAccounts, designers } from "@shared/schema";

const seen = new Map<string, number>();
const HOUR = 3600_000;

function throttled(key: string): boolean {
  const now = Date.now();
  const last = seen.get(key) ?? 0;
  if (now - last < HOUR) return true;
  seen.set(key, now);
  // Keep the map from growing without bound on a long-lived process.
  if (seen.size > 5000) seen.forEach((t, k) => { if (now - t > HOUR) seen.delete(k); });
  return false;
}

export function touchUser(userId: string | null | undefined): void {
  if (!userId || throttled("u:" + userId)) return;
  void db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, userId))
    .catch((e) => console.error("[last-seen] user:", e?.message));
}

export function touchClubAccount(id: string | null | undefined): void {
  if (!id || throttled("c:" + id)) return;
  void db.update(clubAccounts).set({ lastSeenAt: new Date() }).where(eq(clubAccounts.id, id))
    .catch((e) => console.error("[last-seen] club:", e?.message));
}

export function touchDesigner(id: string | null | undefined): void {
  if (!id || throttled("d:" + id)) return;
  void db.update(designers).set({ lastSeenAt: new Date() }).where(eq(designers.id, id))
    .catch((e) => console.error("[last-seen] designer:", e?.message));
}
