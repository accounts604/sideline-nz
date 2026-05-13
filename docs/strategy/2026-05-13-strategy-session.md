# Sideline NZ — Strategy Session
**Date:** 13 May 2026
**Participants:** Romero Tagi, Claude
**Topic:** Drop store business model, scaling outbound, AI automation, email marketing

---

## 1. Business Model Validation — Last 30 Days

### Headline Numbers
- **Total revenue:** $20,832 gross
- **Total orders:** 139
- **Average order value:** $149.87
- **Active teams (stores):** 9

Already hitting $20k/month in aggregate. The question is whether it's repeatable.

### Per-Team Breakdown

| Team | Revenue | Est. Orders | Notes |
|---|---|---|---|
| KBHS Rugby | $5,856 | ~40 | Top performer — hoodie + tee combo carrying it |
| NWS | $4,639 | ~40 | Strongest mix breadth — 8 different SKUs selling |
| Onewhero Rugby | $4,266 | ~30 | Solid spread across hoodie, jacket, headwear |
| St Peter's 1st XV | $3,021 | ~25 | Jersey + hoodie anchoring it |
| Wesley College | $656 | ~5 | Underperforming — likely launch lag |
| Weymouth Rugby | $639 | ~5 | Same — early-stage drop |
| ORFC Heritage | $764 | ~4 | Just opened |
| Avondale Rugby | $100 | ~2 | Just opened |
| Richmond Rovers | $70 | ~1 | Just opened |

### Key Validation
- Top 4 stores average **$4,446 per store and ~34 orders per store**
- Top 4 stores = 85% of revenue ($17,782)
- Real benchmark isn't $2-3k/store — it's $4-5k/established store
- Bottom 5 stores ($2,229 combined) just need correct product mix

---

## 2. The Ideal Store Template (6 SKUs)

Based on what's actually converting in top stores:

| Tier | Item | Price band | Role |
|---|---|---|---|
| **Entry** | Dri Fit Tee / Supporters Tee | $35–$66 | Volume driver |
| **Headwear #1** | 5 Panel Cap | $30–$40 | Add-on / impulse |
| **Headwear #2** | Pompom Beanie | $35–$40 | Add-on / different demo |
| **Hero** | Hoodie | $90–$110 | Margin driver |
| **Premium** | Windbreaker or Retro Jacket | $100–$135 | High AOV |
| **Niche** | Long Sleeve Polo / Scarf / Bucket Hat | $50–$100 | Differentiator |

### Why Underperformers Are Stuck
- Wesley College — only headwear and a tee. Missing hoodie anchor
- Weymouth — has hoodie but only 1 tee, no jackets
- ORFC, Avondale, Richmond — almost entirely headwear, no anchor product

**Low-price headwear without a hero hoodie = no AOV lift.**

---

## 3. Take-Home Income Math

### Margin Stack (NZD)
Using pricing formula: Supplier USD × 1.15 × 1.80 × FX rate

- Gross margin on each item: ~44%
- Less Shopify fees (~2.9%), free shipping (~1.5%), fixed costs ($1.5-2.5k/month), GST (~6-8%), income tax (~28-33%)

### Two Versions of "Take Home"

**Version A — Operating profit in the business:** ~35% of revenue
**Version B — Personal take-home after tax:** ~22–25% of revenue

### Path to $20k Personal Take-Home

| Target | Revenue needed | Active stores needed |
|---|---|---|
| $20k operating profit | ~$57k/month | ~13-19 stores |
| $20k personal take-home | ~$87k/month | ~19-29 stores |

Currently 9 stores generating ~$3k/month personal take-home. Need 3-4x current volume.

### Three Levers
1. **Volume play** — scale to 20+ stores with automation
2. **AOV play** — push AOV from $150 to $200+ via mandatory 6-SKU template (+33%)
3. **Margin play** — push markup from 1.80 to 2.00 on supporter ranges (+6% net margin)

---

## 4. Reframing — 29 Stores/Month Is the Wrong Target

### Stores Have a Lifecycle
- Drop 1 (launch): Strong
- Drop 2 (6-8 weeks later): 50-70% of Drop 1
- Drop 3+: Declines unless range refreshed

### Real Target
Not "29 new stores per month" — instead **40 active stores at any given moment**.

If average store life = 4 drops (~6 months):
- Need to acquire ~7 new stores/month to maintain steady state at 40
- **8-10 new stores/month is the realistic scale point**

---

## 5. The Outbound Machine (5 Layers)

### Layer 1: Database — 3,000+ Club Universe

| Region | Source | Approx universe |
|---|---|---|
| NZ Rugby | NZ Rugby club directory | ~520 clubs |
| NZ Football | NZ Football | ~390 clubs |
| NZ Netball | Netball NZ regional | ~280 clubs |
| NZ Schools | School Sport NZ | ~2,500 schools |
| AU Rugby | Rugby Australia | ~400 clubs |
| AU AFL | AFL community clubs | ~2,000+ clubs |
| AU Soccer | Football Australia | ~1,800 clubs |

**Total addressable universe: 7,000+ organisations.**

### Layer 2: Enrichment & Segmentation
- **Tier A** (member count 100+, active social, sponsor logos): hit hardest
- **Tier B** (50-100 members, basic presence): standard sequence
- **Tier C** (small, dormant): low-priority or skip

### Layer 3: Multi-Channel Outreach (GHL-Powered)

| Day | Channel | Message |
|---|---|---|
| 0 | Email | Cold intro + 90-sec explainer video |
| 2 | FB DM to club page | Same hook, casual tone |
| 5 | Email | Case study (Onewhero or KBHS — real numbers) |
| 8 | SMS (if available) | "Hey, sent you something about a free store last week — worth 15 min?" |
| 12 | Email | Direct ask + Calendly link |
| 20 | Email | Breakup email |

Multi-channel: email alone gets 2-3%. Email + FB DM + SMS gets 12-18%.

### Layer 4: Qualification Gate
GHL intake form captures:
1. Sport + competition level
2. Member count (must be 80+ for viability)
3. Active sponsor relationships
4. Decision-maker confirmed
5. Drop timeline
6. Any current supplier contract

### Layer 5: Store Build Automation (Jarvesi pipeline)
- Order portal live
- R2 template library
- Gemini API integration for mockups
- Shopify template store cloning
- Goal: launch a store in ~4 hours total work

### Volume Math
| Stage | Rate | Required for 10 stores |
|---|---|---|
| Outreach → reply | 15% (multi-channel) | 333 clubs touched |
| Reply → qualified | 50% | 50 replies needed |
| Qualified → store launched | 40% | 25 qualified needed |

~333 touches/month = ~80/week = ~16/day.

### Cost Structure
| Layer | Monthly cost |
|---|---|
| GHL | $0 incremental |
| VA — database + FB DMs | $400-600 |
| Cold email infrastructure | $100 |
| **Total** | **~$500-700/month** |

---

## 6. AI Agents vs VAs

### What AI Can Replace Well
- Scraping club directories (Apify, Bardeen, Browse AI)
- Email enrichment (Apollo, Clay, Instantly)
- Cold email writing + personalisation
- Email sequencing + follow-ups (GHL, Instantly, Smartlead)
- Reply classification
- Booking calls (Calendly + GHL)
- CRM data entry

### What AI Cannot Replace
- Facebook DMs to club pages (Meta blocks automation)
- Instagram DMs at scale (same issue)
- Phone calls to club presidents (trust kills here)
- Nuanced replies ("interested but committee meets next month")
- Cultural / Pacific community messaging
- Negotiation when a club hesitates
- Discovery calls

### Recommendation: Hybrid Stack
- AI handles funnel top + middle (scraping, email, classification, CRM)
- Human handles relationship layer (FB/IG DMs, cultural check, discovery calls)
- Romero handles the close

Cost: ~$250-400/month total

---

## 7. Why You Can't Compliantly Cold DM

### The Technical Reality
- Meta actively detects and blocks automation
- Personal account bots: banned within 50-100 messages
- Unofficial APIs: detected via fingerprinting
- Third-party tools: same risk, ~60 day account lifespan

### Meta's Official Messenger API
- 24-hour rule: can only message people who messaged you first within 24 hours
- This is **reactive only** — no cold initiation allowed
- Tools like ManyChat, Wati, Chatfuel work within these rules (useless for cold outbound)

### Compliant Workarounds

**Option 1: Click-to-Messenger Ads (Best)**
- Run $5-10/day FB ad offering free resource
- Click → opens Messenger → they message you first → 24-hour open window
- Cost: $150-300/month ad spend
- Volume: 30-60 qualified opt-ins/month
- Conversion: ~40%+ (they raised their hand)

**Option 2: Public Page Comments + Organic Outreach**
- VA leaves genuine comments on club FB posts over 2-3 weeks
- Build recognition first, then DM
- Cost: ~$200/month VA time
- Volume: 15-25 clubs/month
- Conversion: ~30%+

**Option 3: LinkedIn + Email (Allowed Platforms)**
- LinkedIn: 80-100 connection requests/week (compliant)
- Email: B2B cold email is legal in NZ + AU with proper opt-out
- Tools: Heyreach, Expandi, Smartlead

### Recommended Compliant Stack
| Channel | Compliance | Automation level | Expected reply rate |
|---|---|---|---|
| Email | Fully legal B2B | 100% AI | 3-5% |
| LinkedIn | ToS-compliant | 90% AI | 8-12% |
| Click-to-Messenger ads | 100% compliant | 95% AI | 40%+ on opt-ins |
| Organic FB engagement | Compliant | 0% AI (VA does it) | 30%+ |

---

## 8. Meta Ad Targeting Strategy

### Three Targeting Strategies (Ranked)

**Strategy 1: Interest-Stacked Lookalike (Start here)**
| Layer | Targeting |
|---|---|
| Geography | NZ + AU, exclude major CBDs |
| Age | 30-60 |
| Interests | "Rugby union" + "Amateur sports" + "Sports management" + "Community organizing" |
| Behaviour | "Small business owners" OR "Page admins" |

Expected cost: $8-15 per qualified lead

**Strategy 2: Engagement-Based Lookalike (After 30 days)**
- Build custom audience from messengers, site visitors, engaged
- Create 1% Lookalike Audience
- Layer NZ + AU geography

**Strategy 3: Page-Specific Targeting (Most surgical)**
- Target engagers of competitor pages (ISC, Classic Sportswear, Canterbury, BLK, XBlades)
- Target followers of governing body pages (NZ Rugby, NRL, AFL)

### Recommended Ad Set Mix ($15/day = $450/month)
| Ad Set | Audience | Daily Budget |
|---|---|---|
| A: Broad NZ | NZ + interests + page admins | $5/day |
| B: Broad AU | AU + interests + page admins | $5/day |
| C: Sport-specific | NZ Rugby + NRL followers, 35-55 | $5/day |

### Special Targeting for Sideline
1. **Pacific community targeting** — Samoan, Tongan, Māori speakers stacked with sports interests
2. **Geo-targeting school catchments** — pin schools, run 5km radius ads, capture parents

---

## 9. Ad Creative Storyboard — 45-Second Vertical Ad

**Concept: "The Club That Funded Itself"**

| Scene | Time | Visual | Voiceover |
|---|---|---|---|
| **Hook** | 0-3s | Tight shot of club hoodie being pulled on. Quick cut to player in matching kit | "Last season, this club funded their entire year — without raising subs once." |
| **Problem** | 3-10s | Quick montage: empty club rooms, stressed treasurer, raffle ticket signs | "Every club committee knows the drill. Fundraising. Begging sponsors. Telling parents fees are going up again." |
| **Reveal** | 10-18s | Phone screen showing Sideline supporter store. Pop-up: "Order placed — $189." | "We built something different. A free supporter store. Your members buy gear they actually want — and the club takes a cut of every sale." |
| **Proof** | 18-28s | Real club photos. Text overlay: "$5,800 raised in 14 days. Zero upfront cost." | "One club, four weeks, nearly six grand back to the club. No upfront cost. No risk." |
| **How it works** | 28-38s | Three text cards over b-roll: 1. We design 2. Supporters order 3. Club takes profit | "We design the kit. Your supporters order. The club keeps the profit. That simple." |
| **CTA** | 38-45s | Romero on camera, club kit visible. Text overlay: "Message us — see if your club qualifies." | "Forty grassroots clubs across NZ and Australia are doing this right now. Want to be next? Send us a message." |

### AI Tools by Need

| Need | Tool | Cost |
|---|---|---|
| Script writing | Claude | Included |
| Voiceover | ElevenLabs | $22/month |
| B-roll generation | Runway Gen-3, Sora, Veo 3 | $15-95/month |
| Photo-to-video animation | Runway, Kling | $15-95/month |
| Text overlays / motion graphics | CapCut, Canva | Free / $15/month |
| Editing | CapCut, Descript | Free / $24/month |
| Music | Epidemic Sound, Artlist | $15/month |

### Hybrid Approach (Recommended)
- 30 min real footage at top club (Onewhero or KBHS)
- 15 min Romero on camera (4-5 CTA variations)
- 10 min product b-roll
- AI fills the gaps (problem montage, text cards, photo animation)
- Total: ~6 hours to finished ad, ~$100 in AI subs

### Four Hook Variants for A/B Testing
| Variant | Opening hook | Best for |
|---|---|---|
| A: Outcome | "Last season this club funded their entire year — without raising subs" | Treasurers, presidents |
| B: Pain | "Every committee meeting starts the same way: 'How do we raise more money?'" | Frustrated committees |
| C: Cultural pride | "When your club looks elite, sponsors take you seriously" | Pacific market |
| D: Specific number | "$5,800 raised in 14 days. Zero upfront cost. One club." | Skeptical decision-makers |

---

## 10. Market Research — Validation of Drop Store Model

### Market Size
- US decorated team apparel market: $8 billion (per SquadLocker)
- SquadLocker has raised $41.2M (ABS Capital, Causeway Media, Slater Tech)
- Platform has been used to create 250,000+ sites, 40,000 leagues

### NZ/AU Competitors (Fragmented)
- **Knockout Sportswear** (Tauranga) — 30 years, full-service custom
- **Champion Teamwear** (AU/NZ) — has TeamStore product
- **Dynasty Sport** — kits Warriors, Moana Pasifika, Tasman Mako
- **Paladin Sports** — Australia, NZ, UK, USA
- **AKU** (Melbourne) — 1000+ teams kitted globally
- **Canterbury Teamwear** — heritage giant
- **Game Clothing** (Brisbane) — Australian-made custom

### The Gap
**Nobody in NZ/AU is running the drop-store-as-primary-engine play with the 8/10/12% profit-share model and the cultural authenticity Sideline has.**

Most competitors:
- Sell bulk team kit (transactional)
- Treat team stores as fundraising kickback (5-15% to club), not primary revenue engine
- Lack Pacific cultural positioning

---

## 11. The Strategic Reframe — Drop Store = MRR Engine

### Why Drop Stores Beat Bulk Orders on MRR

| Factor | Bulk Order | Drop Store |
|---|---|---|
| **Customer base** | The club (1 buyer) | All members + parents + extended whānau + sponsors (100-500 buyers) |
| **Purchase frequency** | Annual | Bi-monthly |
| **Decision friction** | Committee vote required | Individual impulse |
| **Cash flow** | Lumpy, often delayed | Continuous |
| **Renewal dependency** | Re-pitch every year | Set-and-forget cadence |
| **Price ceiling** | Capped by club budget | Capped by supporter affection (much higher) |
| **Margin** | Tight on bulk | Full retail markup per item |
| **Churn signal** | Silent until lost | Visible drop-by-drop |

### LTV Comparison
- Bulk order LTV: $5-15k per year, lumpy
- Drop store LTV: $50k+ per year, predictable
- **Drop store = 5-10x more revenue per club than bulk**

---

## 12. The Three-Stage Hierarchy (Strategic Spine)

| Stage | What Club Gets | What You Get | Commitment | Revenue Per Club |
|---|---|---|---|---|
| **1: Free Store** | Zero-risk supporter revenue stream | Foot in door + recurring drop revenue | Low — handshake | ~$30-50k/year |
| **2: Bulk Orders** | Match jerseys, training kit | High-margin one-shot orders | Medium — single PO | ~$5-20k/year on top |
| **3: Exclusive Supplier** | Sole apparel partner — all uniforms, merch, gear | Locked-in multi-year recurring + impossible to displace | High — annual or multi-year contract | ~$60-150k+/year total |

### Why This Works
1. **Solves cold outreach problem** — pitch is "free store earns your club money" not "buy jerseys"
2. **Creates natural trust ladder** — each stage proves the next
3. **Land-and-expand model** — same play as Salesforce, HubSpot, Atlassian

### Revenue Maths with 40 Clubs Across Escalator

If 20 stay at Stage 1, 10 reach Stage 2, 10 reach Stage 3:
- 10 × $100k (Stage 3) = $1.0M
- 10 × $47k (Stage 2: drop + bulk) = $470k
- 20 × $35k (Stage 1 only) = $700k
- **Total: $2.17M revenue/year**
- At 23% net: **~$500k/year personal income = $40k/month**

Only 40 clubs needed — not 200.

### Operationalizing the Escalator

**Stage tags in GHL:**
- `stage:1-active`
- `stage:1-dormant`
- `stage:2-bulk`
- `stage:3-exclusive`

**Automated promotion triggers:**
- After 3 successful drops → trigger Stage 2 outreach
- After Stage 2 delivery → trigger Stage 3 conversation (90 days post-delivery)
- After 12 months at Stage 2 → trigger Stage 3 contract offer

**Stage-specific assets to build:**
| Asset | Stage |
|---|---|
| Free store explainer video | 1 |
| Stage 1 case study (Onewhero, KBHS) | 1 → 2 |
| Bulk team kit pricing sheet | 2 |
| Exclusive Partnership proposal template | 2 → 3 |
| Multi-year partnership agreement | 3 |

### Real KPIs to Track
1. Stage 1 → Stage 2 conversion rate (target: 50%+ within 6 months)
2. Stage 2 → Stage 3 conversion rate (target: 40%+ within 12 months)
3. Stage 3 retention (target: 90%+ annually)
4. Average Revenue Per Club (across all stages)
5. Stage 1 drop frequency (drops/quarter per active club)

### Pressure Tests on Hierarchy
1. **Stage 3 may not exist culturally yet** — grassroots clubs suspicious of multi-year contracts. Pilot with Onewhero or KBHS first.
2. **Stage 2 cannibalisation risk** — keep clear separation: drop store = supporter/fan gear, bulk = on-field/team-only
3. **Operational complexity** — three stages need dedicated client success around 25 active clubs

---

## 13. Email Marketing Strategy — 2,500-Person Database

### Strategic Question
"Promote all my businesses with personal brand being about AI" is too broad. Multi-business newsletters fail because readers can't figure out why they're being emailed.

**The move:** Personal brand newsletter is the front door. Businesses become case studies, not pitches.

### Newsletter Concept
**Working names:** "AI in the Wild" / "Romero's Build Log" / "The Operator"

**Premise:** "I run multiple businesses. I'm using AI to make them work better. Every week I show you what I'm building, what's working, what's not."

**Format:**
- 1 main story (something built/learned that week)
- 1 quick win (tool, prompt, workflow)
- 1 business update (real numbers from Sideline, KIG, etc.)
- 1 ask or referral hook

**Cadence:** Weekly or fortnightly (don't overcommit)

### Referral Mechanic
- Refer 3 → private AI prompt library
- Refer 10 → 30-min strategy call with Romero
- Refer 25 → free Sideline supporter store setup

### Compliance Check (NZ/AU)
- NZ Unsolicited Electronic Messages Act 2007
- AU Spam Act 2003
- Need: consent, sender ID, functional unsubscribe

### List Audit by Source
| Source | Consent | Action |
|---|---|---|
| Past customers | Inferred | Safe to email |
| Newsletter opt-ins | Express | Safe to email |
| Scraped/bought | None | Re-permission campaign first |

### Tool Stack
| Tool | Purpose | Cost |
|---|---|---|
| **Beehiiv** | Newsletter + referral system | Free up to 2,500 then $42/month |
| **ConvertKit/Kit** | Alternative | $25-50/month |
| **GHL** | Sales automation (NOT for newsletter) | Existing |

**Recommended: Beehiiv** — built for operator-led newsletters with referral mechanics.

### Launch Sequence
- **Week 1:** Setup Beehiiv, import list, define premise/name, build referral tiers
- **Week 2:** Re-permission campaign (expect 30-50% opt-in)
- **Week 3:** Issue #1 — lead with one strong story
- **Weeks 4+:** Weekly/fortnightly cadence

### What Each Business Gets
| Business | Newsletter Role | Conversion Path |
|---|---|---|
| Sideline NZ | Featured case studies, referral reward (free store) | Stage 1 onboarding |
| RTS Consulting | Implied authority | Inbound consulting inquiries |
| KIG | Sponsorship/funding case studies | Higher-trust intros |
| Jersey Wall | Tested with subscribers | Pilot adoption |
| Pop Up Play | Event announcements | Event attendance |
| Personal AI brand | The whole vehicle | Long-term audience, speaking, courses |

### Pressure Tests
1. **Can you write weekly?** Be realistic — fortnightly might be better
2. **Multi-channel amplification?** LinkedIn + short-form video needed to grow
3. **AI brand angle too generic?** Niche down to "Romero on AI for sport business" or "AI applied to grassroots sport and Pacific business"

---

## 14. Action Priority — This Week

### Immediate (Week 1)
1. **Pick Stage 3 pilot** — Onewhero or KBHS, pitch 12-month exclusive partnership in next 30 days
2. **Map existing 9 clubs by stage** — where are they now? Where in 6 months?
3. **Build Stage 2 transition script** — email/call after 2-3 successful drops (missing today)
4. **Reframe outbound positioning** — "three-stage club growth partner" not "we make jerseys"

### Short-term (Weeks 2-4)
1. Brief VA to build NZ rugby + AU rugby database
2. Record 90-second Loom explainer (single asset reused forever)
3. Set up GHL outbound sequence (email + SMS + qualification form)
4. Run pilot batch of 50 clubs through new sequence
5. Set up Beehiiv newsletter + re-permission campaign for 2,500 list

### Medium-term (Months 2-3)
1. Push Phase 2 Jarvesi automation (Gemini API mockup pipeline)
2. Launch Click-to-Messenger ad campaigns ($450/month, 3 ad sets)
3. Produce hero video (real footage + AI augmentation) — 4 hook variants
4. Build stage-specific sales assets (case studies, pricing sheets, partnership template)

---

## 15. Key Strategic Insights

1. **Drop store, not bulk order, is the actual business** — 5-10x more revenue per club
2. **40 clubs across the escalator = $500k/year personal income** — not 200 clubs needed
3. **Cold FB DMs cannot be compliantly automated** — use Click-to-Messenger ads instead
4. **Hybrid AI + human stack** beats fully-automated for grassroots (relationships matter)
5. **The newsletter is the front door**, businesses are case studies
6. **Sideline isn't a custom apparel company that runs drop stores** — Sideline is a club revenue platform that happens to fulfil through apparel
7. **Stage progression is the real KPI**, not new logos acquired

---

*End of session export.*
