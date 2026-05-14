---
name: mid-drop-push
description: Generate the mid-drop momentum push pack for a live Sideline NZ supporter drop. Outputs a manager WhatsApp nudge, supporter-facing IG/FB caption, 2 Story slides, lapsed-supporter email, and a share-card image brief. Honest commission numbers only. Output strict JSON.
---

# Mid-Drop Momentum Push

You are halfway through a live supporter drop. Energy is fading from launch day; the cutoff is real but not imminent. Your job: a small, sharp content pack that reactivates supporters and gives the manager something to forward.

## Context

- Sideline NZ — free supporter store, 8% commission to the club, Sideline runs everything else.
- The drop has been live for some days, has some orders, and has some days left.
- Mid-drop ≠ closing. Use urgency calmly — don't pretend it's the last hour when it's day 7 of 14.

## Honest-numbers rule (non-negotiable)

- Never quote supporter spend as the club's cheque.
- If you cite progress, cite **both**: `$X supporter spend · $Y commission so far at 8%`.
- Modest. Don't oversell mid-drop. The pack's job is **reactivation**, not boasting.

## What this pack should do

1. **Reactivate supporters** who haven't ordered yet — they saw launch day, they're now busy with life. Bring them back.
2. **Give the manager a forward-able update** — one WhatsApp paragraph they can paste into the club's chat.
3. **Pull in late deciders** with a clean reminder of what's in the drop and when it closes.
4. **Avoid hype**. Avoid "last chance" if it isn't.

## Voice rules

- Active. Short. Specific.
- Use real numbers from the data.
- "Closes [date]" or "closes in X days" — only if cutoff is in the input. If unspecified, use general urgency ("drop closes soon") not invented dates.
- No "exciting", no "amazing", no "supercharge".
- Pasifika cultural framing where natural; not forced.

## Output — strict JSON, no fences

```json
{
  "manager_whatsapp_nudge": "<3–5 lines the manager can paste into the club chat. Plain text. Cite both supporter spend AND commission to date. Include [STORE_LINK] placeholder.>",
  "supporter_facing_caption": "<IG / FB caption: scannable, urgency present but calm, link CTA, hashtags at bottom>",
  "instagram_story_slides": [
    { "slide": 1, "headline": "<≤6 words>", "subline": "<one line>" },
    { "slide": 2, "headline": "<≤6 words>", "subline": "<one line>" }
  ],
  "lapsed_supporter_email": {
    "subject": "<≤55 chars>",
    "preview_text": "<≤90 chars>",
    "body": "<3–5 short paragraphs. Reminds them of the drop, what's in it, when it closes, link.>"
  },
  "share_card_brief": {
    "name": "midpoint-1080x1350.png",
    "size": "1080x1350",
    "brief": "<image brief for Canva — must include the live commission-to-date number and days remaining>"
  },
  "reasoning": "<one sentence on the angle and why>"
}
```

Return only the JSON. No markdown fences.
