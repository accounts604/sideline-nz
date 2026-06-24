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
 *   - Auto-ingests status; posts a Telegram card for new/unlinked waybills or
 *     Puffin club-content to CONFIRM the PO link (never auto-guessed).
 *
 * Requires a ONE-TIME Accessibility grant for the LaunchAgent's runner (see
 * scripts/whatsapp-sweep.README in this repo / the plist comment). AX reading
 * does NOT need Screen Recording.
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
const PUFFIN_CHAT = "Sideline NZ x Puffin Sports Production";
const CLUB_KEYWORDS =
  /(kelston|kbhs|wesley|onewhero|narre\s*warren|st\.?\s*peter|te\s*papa|otahuhu|weymouth|manurewa|ponsonby|propertyscouts|aorere|tag\s*nz)/i;

function nowInPakistanHour(): number {
  // PKT = UTC+5, no DST. DST-safe regardless of NZ local time.
  const utcH = new Date().getUTCHours();
  const utcM = new Date().getUTCMinutes();
  return (utcH + 5) % 24 + utcM / 60;
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
  // give the message list a moment to render
  execFileSync("sleep", ["2"]);
  const out = osa(`
tell application "System Events" to tell process "WhatsApp"
  set acc to ""
  set els to entire contents of front window
  repeat with e in els
    try
      set d to description of e
      if d is not missing value and d is not "" then
        if d contains "Message from" or d contains "Your message" or d contains "waybill" or d contains "shipment" then
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

function extractWaybills(text: string, strict: boolean): string[] {
  const found = new Set<string>();
  const re = strict ? /(?:waybill|shipment|awb|tracking|dhl)[^0-9]{0,24}(\d{10})\b/gi : /\b(\d{10})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) found.add(m[1]);
  return Array.from(found);
}

async function main() {
  // Pre-flight (skip gates in --dry so it can be tested any time).
  if (!DRY) {
    const pkt = nowInPakistanHour();
    if (pkt < 8 || pkt >= 19) {
      console.log(`[sweep] outside PKT window (now ${pkt.toFixed(1)} PKT) — no-op`);
      process.exit(0);
    }
    const cu = consoleUser();
    if (cu !== "kigagent") {
      console.error(`[sweep] console not logged in (user="${cu}") — cannot read WhatsApp`);
      process.exit(0);
    }
  }

  try { execFileSync("open", ["-a", "WhatsApp"]); execFileSync("sleep", ["3"]); } catch { /* */ }

  const needsLink: Array<{ waybill: string; status: string | null; shipmentId: string | null; reason: string }> = [];
  const contentFlags: Array<{ chat: string; waybills: string[]; snippet: string }> = [];
  const seenLink = new Set<string>();
  let scanned = 0;
  let statusCount = 0;

  for (const chat of CHATS) {
    const texts = readChat(chat);
    const isPuffin = chat === PUFFIN_CHAT;
    for (const text of texts) {
      // Only trust RECEIVED messages (from DHL/Puffin). Our own sent messages
      // often quote waybills while discussing them and would otherwise be
      // re-ingested as bogus status events (e.g. our follow-up naming 6917093481).
      if (!/Message from|Received in/.test(text)) continue;
      scanned++;
      const status = normalizeDhlStatus(text);
      const waybills = extractWaybills(text, isPuffin);

      if (isPuffin && CLUB_KEYWORDS.test(text) && waybills.length) {
        contentFlags.push({ chat, waybills, snippet: text.slice(0, 160) });
      }
      for (const raw of waybills) {
        const wb = normalizeWaybill(raw);
        const dedupKey = createHash("sha256").update(`wa|${wb}|${status || ""}|${text.slice(0, 120)}`).digest("hex");
        const [existing] = await db.select().from(shipments).where(eq(shipments.waybill, wb));
        if (DRY) {
          console.log(`[dry] ${chat}: WB ${wb} status=${status || "-"} existing=${!!existing}`);
          continue;
        }
        const ev = await ingestShipmentEvent({
          waybill: wb,
          eventType: status || undefined,
          eventDescription: text.slice(0, 160),
          rawText: text.slice(0, 1000),
          source: "whatsapp",
          dedupKey,
        });
        if (ev.duplicate) continue;
        statusCount++;
        if (!existing && !seenLink.has(wb)) {
          seenLink.add(wb);
          needsLink.push({ waybill: wb, status, shipmentId: ev.shipmentId, reason: "new waybill (WhatsApp)" });
        } else if (existing) {
          const links = await db.select().from(shipmentOrders).where(eq(shipmentOrders.shipmentId, existing.id));
          if (!links.length && !seenLink.has(wb)) {
            seenLink.add(wb);
            needsLink.push({ waybill: wb, status, shipmentId: existing.id, reason: "unlinked" });
          }
        }
      }
    }
  }

  console.log(`[sweep] scanned=${scanned} statusIngested=${statusCount} needsLink=${needsLink.length} contentFlags=${contentFlags.length}`);

  if (!DRY && (needsLink.length || contentFlags.length) && isTelegramConfigured()) {
    const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lines: string[] = ["<b>📲 WhatsApp shipment sweep</b>", ""];
    const buttons: any[][] = [];
    if (needsLink.length) {
      lines.push(`<b>🔗 ${needsLink.length} waybill(s) need linking</b>`);
      for (const n of needsLink.slice(0, 8)) {
        lines.push(`• WB ${esc(n.waybill)}${n.status ? ` · ${esc(n.status)}` : ""} · ${esc(n.reason)}`);
        if (n.shipmentId) buttons.push([{ text: `🔗 Link ${n.waybill.slice(-6)}`, callback_data: `wblink_${n.shipmentId}` }]);
      }
      lines.push("");
    }
    if (contentFlags.length) {
      lines.push(`<b>📝 Puffin named clubs (confirm contents)</b>`);
      for (const c of contentFlags.slice(0, 6)) lines.push(`• WB ${c.waybills.map(esc).join(", ")} · ${esc(c.snippet)}`);
      lines.push("");
    }
    lines.push("<i>To link: reply</i> <code>link WB &lt;number&gt; to PO-XXXX</code>");
    await sendTelegramCard({ text: lines.join("\n").trim(), buttons });
  }
  process.exit(0);
}

main().catch((e) => { console.error("[sweep] fatal:", e); process.exit(1); });
