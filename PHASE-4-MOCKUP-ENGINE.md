# Phase 4 — Mockup Automation Engine (Priority)

**Status:** Specification for Claude Code
**Owner:** Romero (via Jarvesi)
**Date:** March 13, 2026

---

## EXECUTIVE SUMMARY

**Goal:** Lead → Custom mockup video in <5 minutes (automated)

**Why:** Competitive advantage. Competitors take 24-48h. We deliver in 5 min.

**Impact:** Higher conversion rate, faster sales cycles, WOW factor for prospects.

---

## THE FLOW

```
Customer fills SMART QUOTE FORM (guided, not autonomous):
  1. Team name? (customer types)
  2. Sport? (customer selects from dropdown)
  3. AI shows reference teams in similar sports (gallery)
  4. Colors? (pick from color library + see examples of teams in those colors)
  5. Logo? (upload or paste club website link for reference)
  6. Products? (jersey/shorts/tracksuit/t-shirt - select from gallery)
  7. Design style? (classic/modern/aggressive/minimalist - show reference examples)
  8. Inspiration gallery? (clickable reference images of similar teams)
    ↓
Form submitted with complete customer input (customer-guided, AI-assisted)
  ↓
Webhook triggers Sideline sub-agent:
  1. Fetch customer data + logo
  2. Fetch past orders (if repeat customer)
  3. Build Gemini image generation prompts
  4. Generate 4 mockup design variations
  5. Create video montage (ffmpeg)
  6. Add AI voiceover (Eleven Labs)
  7. Upload video to Vercel Blob
  8. Send customer email with video link
  9. Update GHL: tag customer, store mockup URL
  10. Create ClickUp task: "Follow up in 3 days"
    ↓
Customer receives:
  - Email with subject: "Your Custom Sideline Mockups Are Ready!"
  - Video (1-2 min): Shows 4 design options with logo placement
  - Button: "Customize Further" → links to Sideline team store
  - Call to action: "Reply to discuss or order now"
    ↓
Romero gets:
  - GHL update: customer tagged "mockup_sent", moved to "design_review" stage
  - ClickUp task: "Waiting on customer feedback"
  - 3-day follow-up reminder (automatic)
```

---

## TECHNICAL ARCHITECTURE

### 1. TRIGGER (Quote Form Webhook)

**Endpoint:** `POST /api/mockup/generate`

**Payload:**
```json
{
  "customerId": "uuid",
  "teamName": "Otahuhu RFC",
  "sport": "rugby",
  "colors": {
    "primary": "#000000",
    "secondary": "#FFFFFF",
    "accent": "#FF0000"
  },
  "logoUrl": "https://blob.vercel.sh/...",
  "pastOrderIds": ["order-123", "order-456"],
  "customRequests": "Bold design, aggressive style"
}
```

### 2. SUB-AGENT ORCHESTRATION

**Spawn sub-agent with task:**
```
Generate 4 custom rugby mockups for Otahuhu RFC.

Customer details:
- Team: Otahuhu RFC
- Sport: rugby
- Colors: black primary, white secondary, red accent
- Logo: [image attached]
- Style preference: bold, aggressive, modern
- Past order references: [links to 2 previous designs]

Instructions:
1. Use provided logo in jersey designs
2. Apply color scheme to jersey, shorts, socks
3. Generate 4 variations (different placements/styles)
4. Create video showing all 4 designs with team mockup (players wearing jerseys)
5. Add voiceover: "Here are 4 custom mockups for Otahuhu RFC..."
6. Upload video to Vercel Blob
7. Send customer email with video link + customizer link
8. Update GHL customer record
9. Create follow-up task in ClickUp
```

### 3. IMAGE GENERATION (Gemini)

**Prompt Engineering (Sport-Specific):**

```
For RUGBY:
"Create a premium rugby jersey design mockup for [Team Name].
- Primary color: [hex]
- Secondary color: [hex]
- Accent color: [hex]
- Logo placement: [chest/shoulder/sleeve]
- Style: [bold/classic/modern]
- Include player mockup (full body, realistic)
- Show jersey front, back, and on-field view
- Reference design #[id] from attached past orders (maintain brand consistency)"

For NETBALL:
"Create a netball singlet design mockup for [Team Name].
- Primary color: [hex]
- Secondary color: [hex]
- Accent color: [hex]
- Logo placement: chest
- Style: clean, athletic, modern
- Include female netball player mockup
- Show front, back, and in-action view"

For FOOTBALL:
"Create a football jersey design mockup for [Team Name].
- Primary color: [hex]
- Secondary color: [hex]
- Accent color: [hex]
- Stripe pattern: [options]
- Logo placement: chest
- Style: [classic/aggressive/sleek]
- Include male football player mockup
- Show front, back, and field view"

For BASKETBALL:
"Create a basketball jersey design mockup for [Team Name].
- Primary color: [hex]
- Secondary color: [hex]
- Accent color: [hex]
- Trim style: [modern/classic/streetwear]
- Logo placement: chest
- Style: [bold/minimalist/athletic]
- Include male basketball player mockup
- Show front, back, and in-action view"
```

**Generate 4 variations:**
1. Design A: Conservative (classic colors, standard placement)
2. Design B: Bold (aggressive design, unique stripe pattern)
3. Design C: Modern (trendy, sleek lines)
4. Design D: Custom (based on customer request)

### 4. VIDEO GENERATION (ffmpeg + Eleven Labs)

**Video Structure (1.5 min total):**

```
[0:00-0:05] Title Slide
- "Your Custom Sideline Mockups"
- Team logo in background

[0:05-0:30] Design A
- Jersey front view (5s)
- Jersey back view (3s)
- Team mockup with players (7s)

[0:30-1:00] Design B, C, D (20s each, same structure)

[1:00-1:15] Summary Slide
- "4 designs ready for you"
- Call to action: "Click below to customize or order"

[1:15-1:30] Brand slide
- Sideline NZ logo
- Contact info
- Link to customizer
```

**Voiceover (Eleven Labs, warm/professional tone):**
```
"Hi [Customer Name]! Here are 4 custom mockup designs for Otahuhu RFC.

Design 1: Our classic approach — bold, traditional, instantly recognizable.

Design 2: A modern twist — sleek lines, aggressive color blocking, perfect for a competitive edge.

Design 3: Trendy and fresh — contemporary design language, premium feel.

Design 4: Your custom request — [based on what they asked for].

Each design maintains your team colors: [colors listed]. Your logo is featured prominently on the chest.

Click the link below to customize these further, see more options, or place your order. Questions? Reply to this email and we'll get back to you within 2 hours.

Thanks for choosing Sideline NZ!"
```

**ffmpeg command:**
```bash
ffmpeg -i design_a_montage.mp4 -i design_b_montage.mp4 -i design_c_montage.mp4 -i design_d_montage.mp4 \
  -filter_complex "concat=n=4:v=1:a=0" \
  -i voiceover.mp3 -c:v libx264 -c:a aac \
  final_mockup_video.mp4
```

### 5. EMAIL DELIVERY

**Template:** `emails/mockup-ready.html`

```html
Subject: Your Custom Sideline Mockups Are Ready! 🎬

Hi [Team Name],

Your custom rugby mockups are ready to see! Watch the video below to view 4 design options tailored to your colors and logo.

[Video Embed/Thumbnail with Play Button]
[Or: Video link if email doesn't support embedding]

Ready to customize further or place your order?
→ Click here to design your team store

Questions about the designs?
Reply to this email — we respond within 2 hours.

Thanks,
Sideline NZ Team
```

### 6. GHL SYNC

**Update customer record:**
- Tag: `mockup_sent`
- Custom field: `mockup_video_url` = [Blob URL]
- Custom field: `mockup_generated_at` = [timestamp]
- Pipeline stage: Move to "Design Review" (if not already there)

**Create follow-up:**
- Task: "Follow up with [Customer Name] on mockup feedback"
- Due: +3 days from mockup send
- Assignee: Romero
- Context: Link to mockup video

### 7. CLICKUP TASK CREATION

**Task:** "Awaiting mockup feedback from [Team Name]"
- Due: +3 days
- Priority: Normal
- Tags: `#mockup`, `#sideline`, `#[sport]`
- Attachments: Link to mockup video
- Status: Open
- Assignee: Romero

**Auto-close if:** Customer orders within 7 days

---

## SMART QUOTE FORM (Customer-Guided, AI-Assisted)

**Form Flow (customer leads, AI guides):**

1. **Team Name** (customer types)
2. **Sport Selection** (dropdown: Rugby, Netball, Football, Basketball)
   - On select → show reference gallery of teams in that sport
3. **Colors Picker** (guided, not autonomous)
   - Pre-loaded color library (navy, gold, red, green, white, black, etc.)
   - Each color shows "example teams" wearing that color
   - Customer selects primary, secondary, accent
4. **Logo Input** (customer provides)
   - Option A: Upload logo file
   - Option B: Paste club website/Instagram link (for reference only, customer confirms colors)
5. **Products Selection** (gallery-based)
   - Show options: Jersey, Shorts, Socks, Tracksuit, T-shirt, Hoodie
   - Customer checks boxes (what they want designed)
6. **Design Style** (reference examples)
   - Classic (traditional, timeless)
   - Modern (sleek, contemporary)
   - Aggressive (bold, competitive)
   - Minimalist (clean, simple)
   - Show 2-3 reference team examples for each style
7. **Inspiration Gallery** (optional)
   - "Teams that inspire you?" (clickable reference images)
   - Customer can select similar teams as design reference

**Form Validation:**
- All fields required before submission
- Preview: "We'll create 4 mockups like [reference teams] with your [colors] and [products]"

**Result:** Complete customer input → no guessing, no autonomous scraping

---

## STOCK MOCKUP TEMPLATE LIBRARY

**Core Templates (by Sport + Product):**

### RUGBY
- **Jersey Template** (standard fit, professional proportions)
  - Front chest placement for logo
  - Shoulder stripe patterns
  - Sleeve trim options
- **Shorts Template** (standard rugby fit)
  - Side stripe, centered logo placement
- **Socks Template** (crew height)
  - Calf stripe, toe placement options
- **Tracksuit Template** (jacket + pants)
  - Jacket chest logo, pants side stripe
  - Collar/trim customization

### NETBALL
- **Singlet Template** (athletic cut)
  - Chest logo centered
  - Shoulder trim
- **Skirt Template** (A-line, sports cut)
  - Side stripe, waistband trim
- **Warmup Top Template** (fitted)
  - Chest/back logo options

### FOOTBALL
- **Jersey Template** (football-specific fit)
  - Chest centered logo
  - Sleeve stripe, collar trim
- **Shorts Template** (football cut)
  - Side stripe, centered logo

### BASKETBALL
- **Jersey Template** (sleeveless, athletic)
  - Chest + back logo options
  - Arm hole trim
- **Shorts Template** (basketball cut)
  - Side stripe, longer inseam

**Template Consistency:**
- All use same design language (proportions, trim placement, logo sizing)
- Swap colors + logo, keep design structure
- Ensures professional, consistent output

**Mockup Generation Process:**
1. Customer submits form (colors, products, style)
2. Claude Code selects matching templates (sport + products)
3. Generate 4 variations by:
   - Variation A: Template + customer colors + logo (default)
   - Variation B: Template + customer colors + alternative logo placement
   - Variation C: Template + accent color swap (secondary becomes primary)
   - Variation D: Template + customer colors + customer style preference
4. All 4 use same template base (consistent quality)
5. Generate video montage showing all variations

---

## IMPLEMENTATION CHECKLIST

**Smart Form Builder:**
- [ ] Create enhanced quote form component (React)
  - [ ] Team name input
  - [ ] Sport dropdown + reference gallery
  - [ ] Color picker with example teams gallery
  - [ ] Logo upload or website reference field
  - [ ] Products multi-select (jersey/shorts/tracksuit/etc)
  - [ ] Design style selector + reference examples
  - [ ] Inspiration gallery (optional)
  - [ ] Form validation (all fields required)
  - [ ] Preview message before submit
- [ ] Store form submission data (PostgreSQL)

**Template Library:**
- [ ] Create mockup template assets (by sport)
  - [ ] Rugby: jersey, shorts, socks, tracksuit
  - [ ] Netball: singlet, skirt, warmup top
  - [ ] Football: jersey, shorts
  - [ ] Basketball: jersey, shorts
- [ ] Store templates as base images (Vercel Blob or local)
- [ ] Document logo placement coordinates (per template)
- [ ] Document color application zones (primary, secondary, accent)

**Mockup Generation Engine:**
- [ ] Create `/api/mockup/generate` endpoint (express route)
- [ ] Build mockup sub-agent trigger (sessions_spawn)
- [ ] Template selection logic (match sport + products)
- [ ] Color + logo injection into templates (image manipulation)
- [ ] Engineer Gemini prompts (sport-specific library, template-based)
- [ ] Implement image generation (Gemini API call)
- [ ] Generate 4 variations (A/B/C/D based on template + color swaps)
- [ ] Build video montage logic (ffmpeg, show all 4 variations)
- [ ] Integrate Eleven Labs TTS (voiceover generation)
- [ ] Upload video to Vercel Blob (storage)

**Integration & Delivery:**
- [ ] Email template + sending (nodemailer or similar)
- [ ] GHL API sync (tag + custom fields + task creation)
- [ ] ClickUp API integration (task creation)
- [ ] Quote form webhook (trigger mockup generation on submit)
- [ ] Admin dashboard button (manual mockup generation for existing customers)
- [ ] Error handling (failed image gen, blob upload, template missing, etc.)
- [ ] Logging (track mockup creation, send success/failure, timing)
- [ ] Testing (test with Top Bulldogs sample data)

---

## DECISIONS NEEDED

**Q1: Voiceover**
- Option A: Eleven Labs TTS (fast, consistent, free tier available)
- Option B: Pre-recorded voice (higher quality, manual process)
- **Recommendation:** Start with Eleven Labs, upgrade to pre-recorded later

**Q2: Image Generation**
- Option A: Gemini API (included with Google Cloud credits)
- Option B: DALL-E (higher quality, costs)
- Option C: Midjourney (best quality, slower, pricey)
- **Recommendation:** Gemini for MVP, upgrade if quality issues

**Q3: Customizer Link**
- Option A: Link to existing Sideline team store (quickest)
- Option B: New dedicated design tool (more features, slower build)
- **Recommendation:** Use existing team store for Phase 4, build design tool in Phase 5

**Q4: Manual Regeneration**
- Should admin be able to regenerate mockups with different parameters?
- **Recommendation:** Yes, add dashboard button "Regenerate Mockup" for existing customers

---

## SUCCESS METRICS

- [ ] Mockup generated within 5 minutes of form submission
- [ ] Video quality acceptable (1080p minimum)
- [ ] Customer email delivery success rate >99%
- [ ] GHL sync success rate >99%
- [ ] Click-through rate on "Customize Further" button >30%
- [ ] Conversion rate (mockup view → order) >15%

---

## NOTES FOR CLAUDE CODE

- This is **Phase 4 Priority #1** (ahead of general GHL sync)
- Mockup engine = revenue multiplier
- Focus on speed + quality
- Start MVP (single sport/simple designs), iterate based on results
- Reference past Sideline quotes for design style inspiration
- Test with Otahuhu RFC as first customer (they have repeat orders, good test case)

---

**Romero wants this built. Let's ship it.**
