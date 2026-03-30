# KIG Agent System — Full Restructure Plan
**Date:** 2026-03-27 | **Status:** Ready for implementation

---

## Architecture: Separation of Concerns

**Jarvesi = REACTIVE** — handles inbound messages and real-time events
**Cdub (Cowork) = PROACTIVE** — handles scheduled intelligence, briefings, reviews

```
INBOUND (Jarvesi)                    SCHEDULED (Cdub/Cowork)
├── WhatsApp messages                ├── Morning briefing (6:30am weekdays)
├── Telegram messages                ├── Friday review (3pm Fridays)
├── GHL webhook events               ├── Invoice chase (9am Tuesdays)
├── ClickUp webhook events           ├── Email draft queue check (NEW)
└── Gmail webhook (triage only)      └── Weekly systems health (NEW)
```

---

## CRON JOBS — Action Plan

### KILL (broken or redundant)

| Cron | Current Schedule | Why Kill |
|------|-----------------|----------|
| `trend-check.sh` | Every 2 hours | Script doesn't exist. 28 consecutive failures. Dead code. |
| `* * * * *` git auto-commit | Every MINUTE | Way too aggressive. Pushes everything including sensitive files. Racing with bridge script. |

**Action:** Remove both entries from `crontab -e`

### KEEP ON JARVESI (infrastructure only)

| Cron | Current Schedule | Why Keep |
|------|-----------------|----------|
| `kig_brain_sync.sh` | Every 60s (via crontab) | Core infrastructure — syncs kig-brain to GitHub. Reduce to every 5 minutes. |
| `jarvesi-synthesis.sh` | 2am daily | Keep but FIX broken modules (daily-memory, feedback-tracker). This is Jarvesi's nightly self-maintenance. |
| `db-cleanup.js` | Sundays 3am | Keep — database maintenance. |

**Action:** Fix the `* * * * *` entry to `*/5 * * * *` for brain sync. Fix synthesis script's missing modules.

### MOVE TO COWORK (scheduled intelligence)

| Task | Current Location | New Location | Schedule |
|------|-----------------|--------------|----------|
| Morning briefing | Both (Jarvesi synthesis + Cowork scheduled task) | **Cowork only** | 6:30am weekdays (already exists) |
| Friday review | Cowork scheduled task | **Cowork** (keep) | 3pm Fridays (already exists) |
| Invoice chase | Cowork scheduled task | **Cowork** (keep) | 9am Tuesdays (already exists) |
| Email draft queue | None | **Cowork** (NEW) | 2pm weekdays — checks for unsent drafts, alerts Romero |
| Systems health | None | **Cowork** (NEW) | Mondays 8am — checks cron failures, disk space, API key expiry |

**Action:** Disable morning brief step in `jarvesi-synthesis.sh` (Steps 3 + 6). Cowork handles it with better access to Gmail/Calendar/ClickUp APIs.

### ALERT MONITORS — STAY DISABLED

The 3 alert monitors (peak, off-peak, quiet) were disabled at Romero's request. Leave them off unless he asks to re-enable.

---

## CHANNEL ROUTING RULES

### WhatsApp (Primary — Romero ↔ Jarvesi)
- **Use for:** Quick decisions, deal updates, escalations, approvals
- **Format:** 3-4 lines max, multi-choice (A/B/C), lead with fact
- **Time rules:** 9am-5pm responsive, 5-7pm slow, 7pm+ crisis only
- **Direction:** Bidirectional — Jarvesi can initiate for escalations

### Telegram (Agents — Read-only reports)
- **Use for:** Agent status reports, automated notifications, system alerts
- **Bots:** JarvesiKIG_bot (primary), EnochKIG_bot, PUPKIG_bot (agent-specific)
- **Format:** Structured reports, no conversation expected
- **Direction:** Mostly outbound (agents → Romero). Romero can query agents directly.

### Cowork/Cdub (Strategic — Deep work sessions)
- **Use for:** Planning, document creation, data analysis, system design, multi-step tasks
- **Format:** Detailed, structured, with file outputs
- **Direction:** Romero-initiated. Cdub sends proactive alerts via scheduled tasks.

### Email (Records — Drafts for approval)
- **Use for:** Client communication, formal follow-ups, invoices
- **Rule:** NEVER send without Romero's explicit approval. Draft only.
- **Direction:** Agents draft → Romero approves → Romero sends

### GHL (CRM — Automated pipeline)
- **Use for:** Lead tracking, contact updates, pipeline management
- **Direction:** Webhooks trigger Jarvesi actions. Agents update contacts.

### ClickUp (Tasks — Project tracking)
- **Use for:** Task creation, status updates, overdue monitoring
- **Direction:** Webhooks trigger Jarvesi awareness. Cdub reads for briefings.

---

## TELEGRAM PROVISIONING (Steps to activate)

Telegram code exists in `core/telegram-bridge.js` but needs tokens:

1. **Create `workspace/telegram/TOKENS.env`:**
```env
JARVESI_TOKEN=<bot token from @BotFather for JarvesiKIG_bot>
ENOCH_TOKEN=<bot token for EnochKIG_bot>
PUP_TOKEN=<bot token for PUPKIG_bot>
ROMERO_USER_ID=<Romero's Telegram numeric user ID>
```

2. **Get Romero's Telegram user ID:** Message @userinfobot on Telegram — it replies with your numeric ID.

3. **Get bot tokens:** Open Telegram → @BotFather → `/mybot` → select each bot → API Token.

4. **Test:** Restart Jarvesi (`launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway`), then send `/ping` to JarvesiKIG_bot on Telegram.

5. **Fix synthesis Step 6:** Update `jarvesi-synthesis.sh` to read from `TOKENS.env` for morning brief delivery.

---

## SECURITY FIX

### API Key in Gateway Plist
`sk-ant-api03-HIZ0...` is hardcoded in `~/Library/LaunchAgents/ai.openclaw.gateway.plist`.

**Fix:**
1. Move key to `~/.openclaw/.env` (already has restrictive permissions)
2. Update plist to pass as environment variable from `.env` file
3. Or use macOS Keychain: `security add-generic-password -s "anthropic-api" -a "kigagent" -w "sk-ant-api03-..."`
4. Update gateway startup to read from keychain

---

## IMPLEMENTATION ORDER

| Step | Task | Time | Requires Mac |
|------|------|------|-------------|
| 1 | Kill broken crons (trend-check, every-minute git) | 2 min | Yes |
| 2 | Slow brain sync to every 5 min | 1 min | Yes |
| 3 | Fix synthesis script missing modules | 30 min | Yes (Claude Code) |
| 4 | Add webhook handoff code (Cdub ↔ Jarvesi real-time ping) | 10 min | Yes (Claude Code) |
| 5 | Create Telegram TOKENS.env | 5 min | Yes (needs bot tokens) |
| 6 | Test Telegram bots | 10 min | Yes |
| 7 | Create new Cowork scheduled tasks (draft queue, health check) | 15 min | No (Cdub can do) |
| 8 | Move API key out of plist | 10 min | Yes |
| 9 | Disable morning brief in synthesis (Cowork handles it) | 5 min | Yes |

**Total estimated time: ~1.5 hours when back at Mac**

Steps 1-2 are the quickest wins with biggest impact (stop the noise).
Step 7 I can do right now since I'm Cowork.

---

## POST-RESTRUCTURE STATE

```
Mac Mini runs:
├── OpenClaw Gateway (port 18789) — always on
│   ├── WhatsApp webhook → Jarvesi (reactive)
│   ├── Telegram bots → Jarvesi + agents (reactive)
│   ├── GHL webhook → brand routing
│   ├── ClickUp webhook → task awareness
│   └── Gmail webhook → triage
├── Ollama (local LLMs) — always on
├── Kokoro TTS — always on
├── PostgreSQL — always on
├── Tailscale VPN — always on
└── Cron jobs:
    ├── Brain sync (every 5 min)
    ├── Nightly synthesis (2am — self-maintenance only)
    └── DB cleanup (Sundays 3am)

Cowork/Cdub runs:
├── Morning briefing (6:30am weekdays)
├── Friday review (3pm Fridays)
├── Invoice chase (9am Tuesdays)
├── Draft queue check (2pm weekdays) — NEW
├── Systems health (8am Mondays) — NEW
└── On-demand: strategic work, documents, analysis

Shared via:
└── kig-brain/ (GitHub) ← bridge script syncs both directions
```

---

## REAL-TIME HANDOFF: Cdub ↔ Jarvesi (Webhook Ping)

The memory bridge syncs via git (5-min cycle). For real-time awareness when one agent completes something the other needs to know about, we use webhook pings.

### Cdub → Jarvesi (HTTP POST)

When Cdub finishes a scheduled task or important work, POST to Jarvesi's existing endpoint:

```
POST http://localhost:18789/webhooks/task-complete
```

Payload:
```json
{
  "task_id": "cdub_20260327_friday-review",
  "source_agent": "cdub",
  "target_agent": "jarvesi",
  "action_type": "friday_review | invoice_chase | draft_created | decision_made",
  "summary": "Completed Friday review — 3 deals flagged, 20 unsent drafts detected",
  "priority": "high | normal | low",
  "notify_romero": true,
  "timestamp": "2026-03-27T17:00:00.000Z"
}
```

Jarvesi receives it, logs to SQLite, writes to daily log, and optionally alerts Romero on WhatsApp if `notify_romero: true` and `priority: high`.

**Changes needed:** ~15 lines added to `/webhooks/task-complete` handler in webhook-server.js — add `source_agent` check, SQLite log, daily log append, conditional WhatsApp alert.

### Jarvesi → Cdub (File Drop)

When Jarvesi handles a WhatsApp decision from Romero, it writes a handoff file:

```
kig-brain/handoffs/YYYY-MM-DD_<action>.md
```

Format:
```markdown
---
from: jarvesi
to: cdub
action_type: romero_decision | deal_update | new_instruction
priority: high
timestamp: 2026-03-27T17:05:00Z
read: false
---
Romero approved the Lin email draft via WhatsApp at 5:03pm.
Send tomorrow morning.
```

Cdub's bridge pull reads `handoffs/` at session start. For urgent items, Jarvesi already alerts Romero on WhatsApp, and Romero tells Cdub directly.

**Changes needed:** ~10 lines in cowork_memory_bridge.sh (add handoffs/ to pull output) + ~25 lines for a `cdub-notify.sh` helper script Cdub calls to POST the webhook.

**Total: ~50 lines of code across 3 files.**
