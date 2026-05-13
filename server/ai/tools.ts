// Typed context fetchers for the AI worker.
//
// Today the worker uses these as plain function calls inside runTask — we
// don't expose them to the model as Anthropic-style tools because the Gemini
// provider doesn't yet have a tool-use loop. When we add Claude or a richer
// Gemini function-calling flow, expose these here as ToolDef objects and let
// the model decide which to call.

import { db } from "../db";
import { orders, clubAccounts, designFiles } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function getOrder(orderId: string) {
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return rows[0] || null;
}

export async function getClubAccount(clubAccountId: string) {
  const rows = await db.select().from(clubAccounts).where(eq(clubAccounts.id, clubAccountId)).limit(1);
  return rows[0] || null;
}

export async function getClubAccountByTag(tag: string) {
  const rows = await db.select().from(clubAccounts).where(eq(clubAccounts.shopifyOrderTag, tag)).limit(1);
  return rows[0] || null;
}

export async function getDesignFile(id: string) {
  const rows = await db.select().from(designFiles).where(eq(designFiles.id, id)).limit(1);
  return rows[0] || null;
}

// Resolve the canonical "club name" string we use in canonical asset names.
// Prefers clubAccounts.clubName (human-readable), falls back to derived from
// tag, falls back to "Unknown Club".
export function resolveClubDisplayName(club: { clubName?: string | null; shopifyOrderTag?: string | null } | null | undefined): string {
  if (!club) return "Unknown Club";
  if (club.clubName) return club.clubName;
  if (club.shopifyOrderTag) {
    // club:onewhero-rfc → "Onewhero Rfc" (rough; the canonical clubs roster
    // is the source of truth — this is just a defensive fallback)
    const slug = club.shopifyOrderTag.replace(/^club:/, "");
    return slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return "Unknown Club";
}
