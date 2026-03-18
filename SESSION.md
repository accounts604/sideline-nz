# Claude Code Build Prompt — Sideline NZ Free Mockup Intake Form

## What you are building

A new page at `/free-mockup` and a new API endpoint at `/api/ghl/intake`.

This is NOT a modification of the existing contact form. Build everything as new files.

---

## Step 1 — Read first, build second

Before writing any code:

1. Read `client/src/pages/contact.tsx` — match the exact design system (black background, white text, border styles, button styles, font classes)
2. Read `server/routes/ghl.ts` or wherever `/api/ghl/contact` is defined — copy the same pattern for the new endpoint
3. Read `client/src/components/layout.tsx` — wrap the new page in the same Layout component
4. Check `client/src/App.tsx` or the router file — you will need to add a route for `/free-mockup`

Do not guess. Read the files first.

---

## Step 2 — Build the new page

**File to create:** `client/src/pages/free-mockup.tsx`

### Page structure

The page has two sections:

**Left column — Value proposition**
- Headline: "Get your free custom mockup"
- Subheading: "Tell us about your club. We'll build a custom design concept — free, no obligation."
- Three short bullet points:
  - "1 free design concept based on your brief"
  - "1 free revision included"
  - "Quote delivered within 48 hours"
- Below bullets, a terms summary box (styled like a dark info card) containing:
  - "By submitting this form you agree to the following:"
  - "• 1 free mockup per club"
  - "• 1 free revision maximum"
  - "• Quotes valid for 14 days"
  - "• Mockup designs remain property of Sideline NZ until a production order is placed"
  - "• Additional revisions charged separately"

**Right column — The form**

Build a multi-step form with 3 steps. Show a step indicator at the top (Step 1 of 3, Step 2 of 3, Step 3 of 3).

Use the same dark card style as contact.tsx: `bg-[#111] rounded-[6px] border border-white/[0.08]`

---

### Step 1 — Your club

Fields:

```
club_type: pill selector — "Club" | "School" | "Organisation"
  (toggle pill style matching enquiry_type in contact.tsx)

organization: text input
  label: changes based on club_type
    - Club → "Club name"
    - School → "School name"  
    - Organisation → "Organisation name"
  placeholder: "e.g. Otahuhu RFC"
  required: true

sport: multi-select pills (user can select multiple)
  options: ["Rugby union", "Rugby league", "Netball", "Football", "Basketball", "Cricket", "Athletics", "Other"]
  required: true (at least one)

contact_name: text input
  label: "Your name"
  required: true

role: select dropdown
  label: changes based on club_type
    - Club → "Your role at the club"
    - School → "Your role at the school"
    - Organisation → "Your role"
  options: ["President", "Treasurer", "Committee member", "Coach", "Manager", "Sports coordinator", "Teacher", "Other"]
  required: true

email: email input
  label: "Email"
  required: true

phone: tel input
  label: "Phone"
  placeholder: "02X XXX XXXX"
  required: false
```

Next button: disabled until club_type, organization, sport, contact_name, role, email are filled.

---

### Step 2 — Your kit

Fields:

```
kit_items: multi-select pills (user can select multiple)
  label: "What do you need?"
  options: ["Match jerseys", "Training tees", "Shorts", "Hoodies", "Jackets", "Socks", "Supporter gear", "Bags", "Full kit package"]
  required: true (at least one)

quantity_range: pill selector (single select)
  label: "Estimated quantity"
  options: ["Under 25", "25–50", "50–100", "100–200", "200+"]
  required: true

primary_colour: text input
  label: "Primary colour"
  placeholder: "e.g. Navy blue"
  required: true

secondary_colour: text input
  label: "Secondary colour"
  placeholder: "e.g. White"
  required: false

timeline: pill selector (single select)
  label: "When do you need this by?"
  options: ["ASAP", "Within 4 weeks", "Within 8 weeks", "Next season", "Just exploring"]
  required: true

current_supplier: text input
  label: "Current supplier (optional)"
  placeholder: "Who do you use now?"
  required: false
```

Next button: disabled until kit_items, quantity_range, primary_colour, timeline are filled.

---

### Step 3 — Design brief

Fields:

```
design_direction: pill selector (single select)
  label: "Design direction"
  options: ["Modern and clean", "Bold and aggressive", "Heritage and traditional", "Minimalist", "Open to suggestions"]
  required: true

logo_status: pill selector (single select)
  label: "Do you have a club logo?"
  options: ["Yes — high quality file", "Yes — but low quality", "No logo yet"]
  required: true

logo_notes: text input (shown only if logo_status is NOT "No logo yet")
  label: "Logo notes"
  placeholder: "Any notes about your logo file"
  required: false

design_notes: textarea
  label: "Any other notes? (optional)"
  placeholder: "Colours to avoid, style references, specific requests..."
  rows: 4
  required: false

terms_agreed: checkbox
  label: "I have read and agree to the terms listed on this page."
  required: true — submit button disabled until checked
```

Submit button:
- Text: "Submit — get my free mockup"
- Disabled until terms_agreed is checked
- Style: same as contact.tsx submit button (bg-white text-black when active, bg-white/10 text-white/30 when disabled)
- Show "Submitting..." while loading

---

### Success screen

After successful submission show a full-page success state (same pattern as contact.tsx success screen) with:

- Large check icon
- Heading: "We've got your brief"
- Body: "Your free mockup is in the queue. We'll have a concept ready within 3–5 business days and send it straight to [email]. Keep an eye on your inbox."
- Subtext: "Questions in the meantime? Email info@sidelinenz.com"
- Button: "Back to home" — navigates to "/"

### Error handling

If the API call fails show an error message below the submit button (same red error style as contact.tsx):
- "Something went wrong. Please try again or email info@sidelinenz.com"

---

## Step 3 — Build the API endpoint

**File to create:** Add a new route to the existing GHL routes file.

Read the existing `/api/ghl/contact` handler first. Copy the exact same pattern.

New endpoint: `POST /api/ghl/intake`

### Field mapping to GHL

Map these form fields to GHL contact fields:

```javascript
{
  // Standard GHL fields
  firstName: contact_name.split(" ")[0],
  lastName: contact_name.split(" ").slice(1).join(" ") || "",
  email: email,
  phone: phone || "",
  
  // Custom fields — use GHL custom field keys
  // Add these as customField entries in the GHL payload
  "club_type": club_type,
  "organization": organization,
  "sport": sport.join(", "),           // array → comma separated string
  "role": role,
  "kit_items": kit_items.join(", "),   // array → comma separated string
  "quantity_range": quantity_range,
  "primary_colour": primary_colour,
  "secondary_colour": secondary_colour || "",
  "timeline": timeline,
  "current_supplier": current_supplier || "",
  "design_direction": design_direction,
  "logo_status": logo_status,
  "logo_notes": logo_notes || "",
  "design_notes": design_notes || "",
  
  // Tags for GHL pipeline automation
  tags: ["free-mockup-request", sport[0]?.toLowerCase().replace(/\s+/g, "-") || "sport", quantity_range]
}
```

### Tags logic

Always add these tags to the GHL contact:
- `"free-mockup-request"` — always
- First sport selected, lowercased, hyphenated (e.g. `"rugby-union"`)
- Quantity range (e.g. `"25-50"`)

Tags allow GHL to route this lead into the correct automation sequence automatically.

### Error handling

If the GHL API call fails:
- Log the error server-side
- Return `{ error: "Submission failed" }` with status 500
- Do NOT expose GHL API details in the error response

---

## Step 4 — Add the route

Find the router file (likely `client/src/App.tsx` or a dedicated routes file).

Add:
```tsx
import FreeMockup from "@/pages/free-mockup";
// ...
<Route path="/free-mockup" element={<FreeMockup />} />
```

---

## Step 5 — Add navigation link

Find the main nav component. Add a link to `/free-mockup`.

Style it as a CTA button (white button, black text) — not a plain nav link. It should stand out.

Text: "Get free mockup"

---

## Step 6 — TypeScript types

Create a type for the form data. Add it at the top of `free-mockup.tsx`:

```typescript
type IntakeForm = {
  club_type: "Club" | "School" | "Organisation" | "";
  organization: string;
  sport: string[];
  contact_name: string;
  role: string;
  email: string;
  phone: string;
  kit_items: string[];
  quantity_range: string;
  primary_colour: string;
  secondary_colour: string;
  timeline: string;
  current_supplier: string;
  design_direction: string;
  logo_status: string;
  logo_notes: string;
  design_notes: string;
  terms_agreed: boolean;
};
```

---

## Step 7 — Test checklist

Before you finish, check each of these manually:

- [ ] Page loads at `/free-mockup` without errors
- [ ] Step 1 Next button stays disabled until required fields filled
- [ ] Step 2 Next button stays disabled until required fields filled  
- [ ] Step 3 Submit button stays disabled until terms_agreed checked
- [ ] Back button on steps 2 and 3 returns to previous step without losing data
- [ ] Form submits to `/api/ghl/intake` on step 3
- [ ] Success screen shows after submission
- [ ] Error message shows if API fails
- [ ] Page matches Sideline NZ design system (black bg, white text, same border/button styles as contact.tsx)
- [ ] Nav link to `/free-mockup` appears in header

---

## Design rules — do not break these

- Background: `bg-black`
- Cards: `bg-[#111] rounded-[6px] border border-white/[0.08]`
- Input fields: `bg-black border border-white/[0.12] rounded-[6px] text-white placeholder:text-white/30`
- Active pill: `bg-white text-black border-white`
- Inactive pill: `bg-transparent text-white/70 border-white/[0.12]`
- Primary button active: `bg-white hover:bg-white/90 text-black font-heading uppercase rounded-[4px]`
- Primary button disabled: `bg-white/10 text-white/30`
- Headings: `font-heading uppercase tracking-wider`
- Secondary text: `text-white/60`
- Muted text: `text-white/40`

Do not introduce new colours, fonts, or styles. Match what already exists exactly.

---

## When you are done

Report back with:

1. Files created
2. Files modified
3. Any environment variables needed
4. Anything Romero needs to configure in GHL (custom field names)
5. Any decisions you made that Romero should review
