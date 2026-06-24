# WhatsApp shipment sweep (autonomous)

Reads the **DHL Express** + **Sideline NZ x Puffin Sports Production** WhatsApp
chats on the Mac mini and ingests waybill status / new waybills — hands-off, no
human needed to have WhatsApp on screen.

## How it reads WhatsApp (no screenshots, no vision)
macOS Accessibility exposes each chat as an `AXButton` *by name* and each message
as readable text. The script (`scripts/whatsapp-shipment-sweep.ts`):
1. `open -a WhatsApp`
2. AX-clicks the chat by its exact name (so it never depends on what's on screen)
3. reads the visible message descriptions as text
4. extracts 10-digit waybills + status (`normalizeDhlStatus`) + Puffin club mentions
5. **only trusts RECEIVED messages** (`Message from` / `Received in`) — our own
   sent messages quote waybills in discussion and must be ignored
6. `ingestShipmentEvent` straight to the DB (text-based dedupKey → re-reads are no-ops)
7. posts a Telegram card for new/unlinked waybills or Puffin club-content to confirm-link

## Scheduling — LaunchAgent, NOT cron
cron can't drive the GUI (`-10810`). A **LaunchAgent** runs inside the logged-in
session. Installed at `~/Library/LaunchAgents/ai.kig.sideline-wa-sweep.plist`:
- `StartInterval` 1800 (every 30 min)
- the script self-checks the **Pakistan 08:00–19:00 window** and the console login,
  and no-ops outside them (DST-safe: computes PKT from UTC, not NZ local)

Install / reload:
```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/ai.kig.sideline-wa-sweep.plist 2>/dev/null
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.kig.sideline-wa-sweep.plist
launchctl kickstart -k gui/$(id -u)/ai.kig.sideline-wa-sweep   # run now
```
Logs: `~/Library/Logs/sideline-wa-sweep.log`.

## Permissions
- **Accessibility** for the runner (`node`/`osascript`) — verified working from the
  agent on 2026-06-24 (no manual grant was needed). If a future macOS update
  revokes it, the run logs an AX error; re-grant in *System Settings → Privacy &
  Security → Accessibility*. (Screen Recording is NOT needed — no screenshots.)

## Manual run
```bash
npx tsx scripts/whatsapp-shipment-sweep.ts --dry   # parse only, skips gates + writes
npx tsx scripts/whatsapp-shipment-sweep.ts         # live
```

## Notes / limits
- WhatsApp virtualises the message list, so the sweep sees only currently-rendered
  (latest) messages — fine for forward monitoring (new updates land at the bottom),
  not a full-history backfill.
- The Telegram **Link** button / `link WB…` command still need the prod
  `SERVICE_TOKEN` aligned with the bridge token (separate fix). Auto-ingest works
  regardless.
