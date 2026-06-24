// DHL / Puffin email watcher — the reliable backbone of the shipment watcher.
//
// DHL emails every status event (delivery, customs/duty, in-transit) to the
// Sideline inbox, each carrying the 10-digit waybill + "from PUFFIN SPORTS".
// Puffin also emails production/shipment updates. This is a structured,
// API-accessible feed — far more reliable than scraping WhatsApp — so it's the
// backbone; the WhatsApp sweep is only a best-effort supplement.
//
// Behaviour (per Romero, 2026-06-24):
//   - AUTO-ingest DHL status events for any waybill (dedup via shipment_events).
//   - A NEW or still-unlinked waybill, or a Puffin email naming clubs, is
//     surfaced as a Telegram card to CONFIRM the content→PO link (never
//     auto-guessed — see the Te Papapa mix-up).
//
// Idempotent: re-scanning the same emails every 30 min is safe — each DHL
// email maps to one dedupKey (waybill|status|minute), so repeats are ignored.

import { eq } from "drizzle-orm";
import { db } from "./db";
import { shipments, shipmentOrders } from "@shared/schema";
import { searchGmailMessages, getGmailThread } from "./gmail";
import { ingestShipmentEvent } from "./shipments";
import { normalizeDhlStatus, normalizeWaybill } from "@shared/shipment-status";

const DHL_SENDER = /@([a-z0-9.-]*\.)?dhl\.com$/i;
const PUFFIN_SENDER = /@puffin-sports\.com$/i;
const CLUB_KEYWORDS =
  /(kelston|kbhs|wesley|onewhero|narre\s*warren|st\.?\s*peter|te\s*papa|otahuhu|weymouth|manurewa|ponsonby|propertyscouts|aorere|tag\s*nz)/i;

// DHL waybills are 10 digits. In DHL emails any 10-digit run is a waybill; in
// Puffin emails we only trust 10-digit numbers sitting next to a shipping word.
function extractWaybills(text: string, strict: boolean): string[] {
  const found = new Set<string>();
  if (strict) {
    const re = /(?:waybill|shipment|awb|tracking|dhl)[^0-9]{0,24}(\d{10})\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) found.add(m[1]);
  } else {
    const re = /\b(\d{10})\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) found.add(m[1]);
  }
  return Array.from(found);
}

export interface EmailWatchResult {
  scanned: number;
  statusUpdates: Array<{ waybill: string; status: string | null; linked: boolean }>;
  needsLink: Array<{ waybill: string; status: string | null; shipmentId: string | null; reason: string }>;
  contentFlags: Array<{ from: string; subject: string; waybills: string[]; snippet: string }>;
}

export async function runDhlEmailWatch(opts?: { sinceDays?: number }): Promise<EmailWatchResult> {
  const sinceDays = opts?.sinceDays ?? 2;
  const result: EmailWatchResult = { scanned: 0, statusUpdates: [], needsLink: [], contentFlags: [] };

  const q = `newer_than:${sinceDays}d (from:dhl.com OR from:puffin-sports.com)`;
  const msgs = await searchGmailMessages(q, 40);

  const seenThreads = new Set<string>();
  const seenNeedsLink = new Set<string>();
  for (const { threadId } of msgs) {
    if (seenThreads.has(threadId)) continue;
    seenThreads.add(threadId);
    const thread = await getGmailThread(threadId);
    for (const m of thread) {
      const isDhl = DHL_SENDER.test(m.fromEmail);
      const isPuffin = PUFFIN_SENDER.test(m.fromEmail);
      if (!isDhl && !isPuffin) continue;
      result.scanned++;

      const text = `${m.subject}\n${m.body || m.snippet}`;
      const status = normalizeDhlStatus(text);
      const waybills = extractWaybills(text, isPuffin);

      // Puffin email that names clubs alongside a waybill → content-link confirm.
      if (isPuffin && CLUB_KEYWORDS.test(text) && waybills.length) {
        result.contentFlags.push({
          from: m.fromEmail,
          subject: m.subject.slice(0, 120),
          waybills,
          snippet: (m.snippet || "").slice(0, 180),
        });
      }

      for (const raw of waybills) {
        const wb = normalizeWaybill(raw);
        const [existing] = await db.select().from(shipments).where(eq(shipments.waybill, wb));
        const ev = await ingestShipmentEvent({
          waybill: wb,
          eventType: status || undefined,
          eventDescription: m.subject.slice(0, 180),
          occurredAt: new Date(m.internalDate),
          rawText: text.slice(0, 1000),
          source: "email",
        });
        if (ev.duplicate) continue;

        if (!existing) {
          if (!seenNeedsLink.has(wb)) {
            seenNeedsLink.add(wb);
            result.needsLink.push({ waybill: wb, status, shipmentId: ev.shipmentId, reason: "new waybill" });
          }
          continue;
        }
        const links = await db.select().from(shipmentOrders).where(eq(shipmentOrders.shipmentId, existing.id));
        result.statusUpdates.push({ waybill: wb, status, linked: links.length > 0 });
        if (!links.length && !seenNeedsLink.has(wb)) {
          seenNeedsLink.add(wb);
          result.needsLink.push({ waybill: wb, status, shipmentId: existing.id, reason: "unlinked" });
        }
      }
    }
  }
  return result;
}

// Build the Telegram card body + buttons for the items needing a human link.
// Returns null when there's nothing to surface (a quiet run posts nothing).
export function buildEmailWatchCard(result: EmailWatchResult): { text: string; buttons: any[][] } | null {
  if (!result.needsLink.length && !result.contentFlags.length) return null;
  const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines: string[] = ["<b>📦 DHL/Puffin watcher</b>", ""];
  const buttons: any[][] = [];

  if (result.needsLink.length) {
    lines.push(`<b>🔗 ${result.needsLink.length} waybill(s) need linking</b>`);
    for (const n of result.needsLink.slice(0, 8)) {
      lines.push(`• WB ${esc(n.waybill)}${n.status ? ` · ${esc(n.status)}` : ""} · ${esc(n.reason)}`);
      if (n.shipmentId) buttons.push([{ text: `🔗 Link ${n.waybill.slice(-6)}`, callback_data: `wblink_${n.shipmentId}` }]);
    }
    lines.push("");
  }
  if (result.contentFlags.length) {
    lines.push(`<b>📝 Puffin email naming clubs (confirm contents)</b>`);
    for (const c of result.contentFlags.slice(0, 6)) {
      lines.push(`• ${esc(c.subject)} · WB ${c.waybills.map(esc).join(", ")}`);
    }
    lines.push("");
  }
  lines.push("<i>To link: reply</i> <code>link WB &lt;number&gt; to PO-XXXX</code>");
  return { text: lines.join("\n").trim(), buttons };
}
