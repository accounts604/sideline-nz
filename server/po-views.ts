// PO view tracking — records when a supplier or customer actually opens a PO,
// so admin can see "supplier last viewed 2h ago" instead of guessing whether
// the dispatch email was ever read.
//
// Writes plain order_activity rows (action "po_viewed_by_supplier" /
// "po_viewed_by_customer") — no schema change. Deduped to at most ONE row per
// viewer per PO per 60 minutes so a refresh-happy viewer doesn't flood the
// activity feed. Always best-effort: a tracking failure must never break the
// read path, so callers fire-and-forget (`void recordPoView(...)`) and every
// error is swallowed after a console log.

import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "./db";
import { orderActivity } from "@shared/schema";
import { storage } from "./storage";

export const PO_VIEWED_BY_SUPPLIER = "po_viewed_by_supplier";
export const PO_VIEWED_BY_CUSTOMER = "po_viewed_by_customer";

const DEDUPE_WINDOW_MS = 60 * 60 * 1000; // one event per viewer per PO per hour

export async function recordPoView(opts: {
  orderId: string;
  action: typeof PO_VIEWED_BY_SUPPLIER | typeof PO_VIEWED_BY_CUSTOMER;
  /** Portal user id when the viewer is logged in; null for public link views */
  userId?: string | null;
  /** Stable dedupe key — userId for portal views, "token:<token>" for link views */
  viewerKey: string;
  /** Extra identity context stored in details.viewer (email, name, via, ...) */
  viewer?: Record<string, unknown>;
  userAgent?: string;
  path?: string;
}): Promise<void> {
  try {
    // Dedupe — skip if this viewer already logged a view on this PO recently.
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
    const recent = await db
      .select({ id: orderActivity.id, details: orderActivity.details })
      .from(orderActivity)
      .where(and(
        eq(orderActivity.orderId, opts.orderId),
        eq(orderActivity.action, opts.action),
        gt(orderActivity.createdAt, since),
      ))
      .orderBy(desc(orderActivity.createdAt))
      .limit(10);
    if (recent.some((r) => (r.details as any)?.viewerKey === opts.viewerKey)) return;

    // Resolve viewer identity for the log row (portal views only).
    let viewer = opts.viewer;
    if (!viewer && opts.userId) {
      const user = await storage.getUser(opts.userId);
      viewer = user
        ? { id: user.id, email: user.email, name: user.teamName ?? undefined }
        : { id: opts.userId };
    }

    await db.insert(orderActivity).values({
      orderId: opts.orderId,
      userId: opts.userId ?? null,
      action: opts.action,
      details: {
        viewerKey: opts.viewerKey,
        viewer: viewer ?? null,
        userAgent: opts.userAgent,
        path: opts.path,
      },
    });
  } catch (e) {
    console.error("PO view tracking error:", e);
  }
}

// Latest view timestamps per audience — surfaced on the admin PO detail so the
// header can show "Supplier last viewed: ...". Derived from activity, no
// schema change.
export async function getLastPoViewTimes(orderId: string): Promise<{
  lastSupplierViewAt: Date | null;
  lastCustomerViewAt: Date | null;
}> {
  const rows = await db
    .select({ action: orderActivity.action, createdAt: orderActivity.createdAt })
    .from(orderActivity)
    .where(and(
      eq(orderActivity.orderId, orderId),
      inArray(orderActivity.action, [PO_VIEWED_BY_SUPPLIER, PO_VIEWED_BY_CUSTOMER]),
    ))
    .orderBy(desc(orderActivity.createdAt));
  const firstFor = (action: string) => rows.find((r) => r.action === action)?.createdAt ?? null;
  return {
    lastSupplierViewAt: firstFor(PO_VIEWED_BY_SUPPLIER),
    lastCustomerViewAt: firstFor(PO_VIEWED_BY_CUSTOMER),
  };
}
