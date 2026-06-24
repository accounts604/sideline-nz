/**
 * Autonomous WhatsApp shipment sweep — reads the DHL Express + Puffin chats via
 * macOS Accessibility (exact message TEXT, no screenshots, no vision), extracts
 * waybills + status + club mentions, and ingests them. Runs hands-off:
 *
 *   - Launched by a LaunchAgent (NOT cron — cron can't drive the GUI) on a 30-min
 *     timer; self-checks the Pakistan-time window (08:00–19:00 PKT) and the
 *     console login, and no-ops otherwise.
 *   - Opens each chat BY NAME via AX (AXButton whose description = chat name), so
 *     it never depends on a human having the right chat on screen.
 *   - Writes straight to the DB (DATABASE_URL in .env) via ingestShipmentEvent;
 *     dedup is text-based so re-reading the same messages is a no-op.
 *   - Auto-ingests status; posts a Telegram card for new/unlinked waybills to
 *     CONFIRM the PO link (never auto-guessed). A club name in the message is
 *     attached to that card as a hint.
 *   - Only trusts RECEIVED messages (from DHL/Puffin); ignores our own sent
 *     messages, which quote waybills in discussion.
 *
 * Requires a ONE-TIME Accessibility grant for the LaunchAgent's runner (see
 * scripts/whatsapp-sweep.README.md). AX reading does NOT need Screen Recording.
 *
 * Manual run (interactive Terminal already has Accessibility):
 *   npx tsx scripts/whatsapp-shipment-sweep.ts            # live
 *   npx tsx scripts/whatsapp-shipment-sweep.ts --dry      # parse only, no writes
 */
import "dotenv/config";
import * as fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

// Pull Telegram creds from the workspace TOKENS.env into process.env BEFORE the
// telegram module reads them (sideline-nz local .env doesn't carry them).
const TOKENS = "/Users/kigagent/.openclaw/workspace/telegram/TOKENS.env";
try {
  for (const line of fs.readFileSync(TOKENS, "utf-8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [k, ...v] = line.split("=");
    const key = k.trim();
    if (!process.env[key] && /BOT_TOKEN|GROUP_CHAT_ID|ENGINE_ROOM_ID|THREAD_ID/.test(key)) {
      process.env[key] = v.join("=").trim();
    }
  }
} catch { /* non-fatal */ }

import { db } from "../server/db";
import { shipments, shipmentOrders } from "../shared/schema";
import { ingestShipmentEvent } from "../server/shipments";
import { sendTelegramCard, isTelegramConfigured } from "../server/telegram";
import { normalizeDhlStatus, normalizeWaybill } from "../shared/shipment-status";

const DRY = process.argv.includes("--dry");
const CHATS = ["DHL Express", "Sideline NZ x Puffin Sports Production"];
const CLUB_KEYWORDS =
  /(kelston|kbhs|wesley|onewhero|narre\s*warren|st\.?\s*peter|te\s*papa|otahuhu|weymouth|manurewa|ponsonby|propertyscouts|aorere|tag\s*nz)/i;

function nowInPakistanHour(): number {
  const now = new Date();
  return ((now.getUTCHours() + 5) % 24) + now.getUTCMinutes() / 60; // PKT = UTC+5, no DST
}

function consoleUser(): string {
  try {
    return execFileSync("stat", ["-f%Su", "/dev/console"], { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

function osa(script: string, timeoutMs = 90_000): string {
  try {
    return execFileSync("osascript", ["-e", script], { encoding: "utf-8", timeout: timeoutMs });
  } catch (e: any) {
    return `__ERR__ ${e?.message || e}`;
  }
}

// Open a chat by name (AX click) and return its visible message texts.
function readChat(chatName: string): string[] {
  const esc = chatName.replace(/"/g, '\\"');
  osa(`
tell application "System Events" to tell process "WhatsApp"
  set els to entire contents of front window
  repeat with e in els
    try
      if role of e is "AXButton" and description of e is "${esc}" then
        click e
        exit repeat
      end if
    end try
  end repeat
end tell`);
  execFileSync("sleep", ["2"]); // let the message list render
  const out = osa(`
tell application "System Events" to tell process "WhatsApp"
  set acc to ""
  set els to entire contents of front window
  repeat with e in els
    try
      set d to description of e
      if d is not missing value and d is not "" then
        if d contains "Message from" or d contains "Received in" then
          set acc to acc & d & "\n@@@\n"
        end if
      end if
    end try
  end repeat
  return acc
end tell`);
  if (out.startsWith("__ERR__")) {
    console.error(`[sweep] AX read failed for "${chatName}": ${out}`);
    return [];
  }
  return out.split("\n@@@\n").map((s) => s.trim()).filter(Boolean);
}

// Any 10-digit run in a shipment chat is a waybill (Puffin writes the number
// then "This shipment includes…", so we can't require a keyword before it).
function extractWaybills(text: string): string[] {
  const found = new Set<string>();
  const re = /\b(\d{10})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) found.add(m[1]);
  return Array.from(found);
}

interface LinkItem {
  waybill: string;
  status: string | null;
  shipmentId: string | null;
  reason: string;
  snippet?: string;
}

async function main() {
  if (!DRY) {
    const pkt = nowInPakistanHour();
    if (pkt < 8 || pkt >= 19) {
      console.log(`[sweep] ${new Date().toISOString()} outside PKT window (now ${pkt.toFixed(1)} PKT) — no-op`);
      process.exit(0);
    }
    const cu = consoleUser();
    if (cu !== "kigagent") {
      console.error(`[sweep] ${new Date().toISOString()} console not logged in (user="${cu}") — cannot read WhatsApp`);
      process.exit(0);
    }
  }

  try { execFileSync("open", ["-a", "WhatsApp"]); execFileSync("sleep", ["3"]); } catch { /* */ }

  const needsLink: LinkItem[] = [];
  const seenLink = new Set<string>();
  let scanned = 0;
  let statusCount = 0;

  for (const chat of CHATS) {
    const texts = readChat(chat);
    for (const text of texts) {
      // Only trust RECEIVED messages — our own sent messages quote waybills.
      if (!/Message from|Received in/.test(text)) continue;
      scanned++;
      const status = normalizeDhlStatus(text);
      const hasClub = CLUB_KEYWORDS.test(text);
      for (const raw of extractWaybills(text)) {
        const wb = normalizeWaybill(raw);
        const [existing] = await db.select().from(shipments).where(eq(shipments.waybill, wb));
        let shipmentId: string | null = existing?.id ?? null;
        let isDup = false;
        if (!DRY) {
          const dedupKey = createHash("sha256").update(`wa|${wb}|${status || ""}|${text.slice(0, 120)}`).digest("hex");
          const ev = await ingestShipmentEvent({
            waybill: wb,
            eventType: status || undefined,
            eventDescription: text.slice(0, 160),
            rawText: text.slice(0, 1000),
            source: "whatsapp",
            dedupKey,
          });
          isDup = ev.duplicate;
          shipmentId = ev.shipmentId ?? shipmentId;
          if (!isDup) statusCount++;
        } else {
          console.log(`[dry] ${chat}: WB ${wb} status=${status || "-"} existing=${!!existing} club=${hasClub}`);
        }
        let linked = false;
        if (existing) {
          const links = await db.select().from(shipmentOrders).where(eq(shipmentOrders.shipmentId, existing.id));
          linked = links.length > 0;
        }
        // Flag only FRESH (non-duplicate) info for an unlinked waybill, so it
        // doesn't re-nag every run; the daily exception digest is the backstop.
        if ((DRY || !isDup) && !linked && !seenLink.has(wb)) {
          seenLink.add(wb);
          needsLink.push({
            waybill: wb,
            status,
            shipmentId,
            reason: existing ? "unlinked" : "new waybill",
            snippet: hasClub ? text.replace(/\s+/g, " ").slice(0, 140) : undefined,
          });
        }
      }
    }
  }

  console.log(`[sweep] ${new Date().toISOString()} scanned=${scanned} statusIngested=${statusCount} needsLink=${needsLink.length}`);

  if (!DRY && needsLink.length && isTelegramConfigured()) {
    const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lines: string[] = ["<b>📲 WhatsApp shipment sweep</b>", "", `<b>🔗 ${needsLink.length} waybill(s) need linking</b>`];
    const buttons: any[][] = [];
    for (const n of needsLink.slice(0, 8)) {
      lines.push(`• WB ${esc(n.waybill)}${n.status ? ` · ${esc(n.status)}` : ""} · ${esc(n.reason)}${n.snippet ? `\n   ↳ ${esc(n.snippet)}` : ""}`);
      if (n.shipmentId) buttons.push([{ text: `🔗 Link ${n.waybill.slice(-6)}`, callback_data: `wblink_${n.shipmentId}` }]);
    }
    lines.push("", "<i>To link: reply</i> <code>link WB &lt;number&gt; to PO-XXXX</code>");
    await sendTelegramCard({ text: lines.join("\n").trim(), buttons });
  }
  process.exit(0);
}

main().catch((e) => { console.error("[sweep] fatal:", e); process.exit(1); });
