# GoHighLevel Custom Fields for Sideline NZ Website

This document lists all custom fields needed in GoHighLevel for the Sideline NZ website forms to work correctly.

---

## Integration Method

The website uses **direct GHL Contacts API** (not webhooks) with a private integration key.
Environment variables required:

| Variable | Purpose |
|----------|---------|
| `SIDELINE_GHL_API_KEY` | Private integration API key |
| `SIDELINE_GHL_LOCATION_ID` | GHL Location ID |

---

## Start a Project Form (6-Step Wizard)

### Standard Contact Fields
These map to GHL's built-in contact fields:

| Field Key | GHL Field | Type |
|-----------|-----------|------|
| `name` | First Name / Last Name (auto-split) | Text |
| `email` | Email | Email |
| `phone` | Phone | Phone |

### Custom Fields to Create (30 fields)

| Field Key | Display Name | Field Type | Options/Notes |
|-----------|--------------|------------|---------------|
| `user_type` | User Type | Dropdown | `club`, `school`, `other` |
| `role` | Role | Text | Free text (varies by user type) |
| `organization` | Organization Name | Text | Club or school name |
| `member_count` | Member Count | Dropdown | Under 20, 20-50, 51-100, 100-200, 200+ |
| `current_supplier` | Current Supplier | Text | Competitive intel - who they currently order from |
| `sports` | Sports | Text (Multi) | Comma-separated: Rugby, League, Football, Netball, Basketball, Hockey, Cricket, Touch, Other |
| `mockup_interest` | Free Mockup Interest | Text | "Yes please" or "No thanks" |
| `needs` | Project Needs | Text (Multi) | Comma-separated: Full Playing Kit, Training Gear, Supporter Gear, Off-Field Apparel, Not Sure Yet |
| `estimated_quantity` | Estimated Quantity | Dropdown | Under 20, 20-50, 50-100, 100+ |
| `teams_involved` | Teams Involved | Text (Multi) | Comma-separated: Premier, Reserve, Juniors, Women, Academy, Multiple teams |
| `kit_items` | Kit Items | Text (Multi) | Comma-separated: Jersey, Shorts, Socks |
| `personalisation` | Personalisation | Text (Multi) | Comma-separated: Numbers, Names, Sponsor logos, Player initials |
| `supporter_audience` | Supporter Audience | Text (Multi) | Comma-separated: Players, Parents, Alumni, Wider community |
| `style_preference` | Style Preference | Dropdown | Clean / Classic, Bold / Modern, Cultural / Heritage |
| `fundraising_interest` | Fundraising Interest | Text | "Yes please", "Maybe", "No thanks" |
| `sponsorship_interest` | Sponsorship Interest | Text | "Yes, we have sponsors", "Looking for sponsors", "No sponsors" |
| `timing` | Timing | Dropdown | ASAP (Rush), 1-2 Months, 3-4 Months, Next Season, Just Exploring |
| `season_start` | Season Start Month | Dropdown | January-December, Not sure |
| `design_stage` | Design Stage | Dropdown | No design yet, Have ideas, Updating existing kit, Design ready |
| `budget_range` | Budget Range | Dropdown | Still exploring, Budget-conscious, Mid-range, Premium |
| `approval_process` | Approval Process | Dropdown | Just me, Committee approval, SLT/Finance approval, Not sure yet |
| `main_concern` | Main Concerns | Text (Multi) | Comma-separated: Late delivery, Wrong sizing, Complicated ordering, Committee approval, Communication, Budget pressure |
| `notes` | Additional Notes | Large Text | Free text area |
| `school_event_date` | School Event Date | Text | Date or event description |
| `slt_friendly` | SLT Friendly | Text | Yes/No preference |
| `team_store_interest` | Team Store Interest | Dropdown | Yes we need an online team store, Maybe / not sure, No |
| `team_store_audience` | Team Store Audience | Text (Multi) | Comma-separated: Players, Parents, Supporters, Alumni, Community |
| `team_store_goal` | Team Store Goal | Dropdown | Fundraising, Convenience, Supporter merch, Pre-orders for season, Fund our kit through supporter sales |
| `source` | Lead Source | Text | Auto-filled: "sidelinenz.com start-a-project" |
| `submitted_at` | Submitted At | Text | ISO timestamp (auto-generated) |

---

## Contact Form

### Standard Contact Fields

| Field Key | GHL Field | Type |
|-----------|-----------|------|
| `name` | First Name / Last Name (auto-split) | Text |
| `email` | Email | Email |
| `phone` | Phone | Phone |

### Custom Fields to Create

| Field Key | Display Name | Field Type | Options/Notes |
|-----------|--------------|------------|---------------|
| `enquiry_type` | Enquiry Type | Dropdown | General enquiry, Quote follow-up, Order status, Sizing help, Design question, Other |
| `message` | Message | Large Text | Free text enquiry |
| `source` | Lead Source | Text | Auto-filled: "sidelinenz.com contact-form" |
| `submitted_at` | Submitted At | Text | ISO timestamp (auto-generated) |

---

## New Fields Added (Hub Update)

The following 6 fields were added to support the Hub features:

| Field Key | Step | Purpose |
|-----------|------|---------|
| `member_count` | Step 1 | Club/team size for lead qualification |
| `current_supplier` | Step 1 | Competitive intel |
| `mockup_interest` | Step 1 | Free mockup opt-in (conversion driver) |
| `fundraising_interest` | Step 2 | Supporter fundraiser qualification |
| `sponsorship_interest` | Step 2 | Sponsor placement qualification |
| `season_start` | Step 3 | Production batching by season |

---

## Tags Applied

| Form | Tags |
|------|------|
| Start a Project | "Website Lead", "Start a Project" |
| Contact Form | "Website Lead", "Contact Form" |
| Hub Mockup Request | "Website Lead", "Free Mockup Request" |

---

## URL Parameter Auto-Fill

The quote form supports these URL parameters:

| Parameter | Effect |
|-----------|--------|
| `?teamStore=yes` | Auto-selects "Yes" for team store interest |
| `?fundraise=yes` | Auto-selects "Yes please" for fundraising interest |
| `?mockup=yes` | Auto-selects "Yes please" for free mockup interest |

---

## Quick Reference: All Custom Fields

### Project Form (30 fields)
```
user_type, role, organization, member_count, current_supplier,
sports, mockup_interest, needs, estimated_quantity, teams_involved,
kit_items, personalisation, supporter_audience, style_preference,
fundraising_interest, sponsorship_interest, timing, season_start,
design_stage, budget_range, approval_process, main_concern,
notes, school_event_date, slt_friendly, team_store_interest,
team_store_audience, team_store_goal, source, submitted_at
```

### Contact Form (4 fields)
```
enquiry_type, message, source, submitted_at
```

### Hub Mockup Request (5 fields)
```
organization (from club_name), sports, email,
mockup_interest ("Yes please"), source, submitted_at
```

---

## Testing

After creating custom fields in GHL, test by:
1. Submitting a test project request on the website
2. Submitting a test contact form
3. Verify the data appears correctly in GHL contacts with all custom fields populated
