---
name: public-case-study
description: Turn a closed Sideline NZ supporter drop into a public-facing SEO case study page. Outputs URL slug, SEO meta, hero copy, the numbers block, the story, product breakdown, pull-quote and OG image brief. Honest commission numbers only. Output strict JSON.
---

# Public Case Study Generator

You are turning a closed Sideline NZ supporter drop into a public case study — the kind that lives at `sidelinenz.com/case-studies/<slug>` and earns SEO traffic from school ADs and club committees searching for "fundraising for sports clubs NZ" / "club supporter merch supplier".

## Audience

Three readers, ranked by importance:

1. **A school AD or club committee chair** considering Sideline. They want proof. Real numbers, real names, real context.
2. **Google's SEO crawler.** Needs clean H1, meta description, keyword-relevant body.
3. **The featured club's network.** They'll share it if it makes the club look good.

## Honest-numbers rule (non-negotiable)

- **Lead with commission to the club, then context supporter spend.**
- Never write "$X raised" when X is supporter spend. Pick one of:
  - "$X in supporter spend, generating $Y commission for the club at 8%"
  - "$Y commission to the club from $X of supporter activity"
- Cite *zero committee hours* as the operational win — that's where the magic actually is.

## Voice rules

- Plain English. No marketing-speak.
- 2nd-person ("your club") where you're addressing prospective readers; 3rd-person when narrating this club's story.
- No "exciting", "unlock", "supercharge", "leverage".
- Real numbers. Real product names. Real club name.
- Specific over general. *"They sold 19 hoodies"* > *"Hoodies were popular"*.

## SEO considerations

- URL slug: lowercase kebab-case, ≤6 words, includes club name + year + "supporter-drop"
- Meta description: ≤155 chars, includes the headline number + club name
- Title tag: ≤60 chars, includes the club name + the punchy outcome
- H1 different from title tag — punchier, human

## Output — strict JSON, no fences

```json
{
  "url_slug": "<lowercase-kebab-case>",
  "seo_title": "<≤60 chars>",
  "meta_description": "<≤155 chars>",
  "hero_h1": "<punchy, human, ≤12 words>",
  "hero_subhead": "<one line, sets the context>",
  "the_numbers_block": [
    { "label": "<e.g. Commission to club>", "value": "<e.g. $468>", "context": "<one short line>" }
  ],
  "the_story": "<3–4 short paragraphs. Plain English. Specific. How the drop ran, what the supporters bought, what the club received, what happened next.>",
  "the_breakdown": [
    { "product": "<title>", "units_sold": <int>, "spend_cents": <int>, "commission_cents": <int> }
  ],
  "pull_quote": "<1-line summary worth pulling out in a large font>",
  "cta_block": {
    "headline": "<≤8 words>",
    "body": "<2 lines>",
    "button_text": "<e.g. Start your free club store>"
  },
  "og_image_brief": {
    "size": "1200x630",
    "brief": "<concrete visual brief for the social share image — must include the headline number>"
  },
  "reasoning": "<one sentence on the angle and why>"
}
```

Return only the JSON. No markdown fences.
