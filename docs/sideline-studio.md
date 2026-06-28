# Sideline Studio — Design Doc

**Status:** design / iterative build. Owner: Romero. Last updated 2026-06-28.

**What it is:** the end-to-end automated pipeline that takes a club from *lead* to *finished kit*, anchored on a **Brand Identity** record that stores a club's logos + designs **once** and feeds every downstream stage, so the workflow stops re-hunting logos, colours and designs at every step.

```
Lead → Brand Identity (seed) → 🎨 AI Design Generation → Customer Approve + Size → PO QC Gate → Production
         └────────────────── one record, read by every stage ──────────────────┘
```

The core insight (Romero, 2026-06-27): **a lead/PO must have a Brand Identity to go with it.** Today brand identity is re-acquired at ~4 disconnected points because no record is created at lead time — that's the bottleneck Studio removes.

---

## 1. Brand Identity entity

### Principle: extend, don't reinvent
`club_logo_assets` already stores per-club logos (`kind = primary|secondary|sponsor`, Canva ID + cached `previewUrl`, one-primary partial-unique). Keep it as the **logo image layer**. What's missing is the **non-logo brand layer** (colours, fonts, placement defaults, artwork files, sponsor metadata, design/template refs) and a **lifecycle anchor** that exists from lead time. Add ONE new 1:1 table + a few columns on the logo table — not a parallel asset system.

### 1a. `club_brand_identity` (NEW — 1:1 with `club_accounts`)
Keyed by `clubAccountId UNIQUE`. Lives next to `clubAccounts` in `shared/schema.ts`.

| Column | Type | Purpose |
|---|---|---|
| `clubAccountId` | varchar UNIQUE FK | 1:1 enforcement; the brand "header" |
| `colors` | jsonb | `[{role:primary/secondary/accent/neutral, hex, name, pms?, thread?}]` — the #1 re-hunted field |
| `fonts` | jsonb | `[{role:heading/body/number, family, source?, fileUrl?}]` |
| `placementDefaults` | jsonb | `{clubLogo:{position,application,sizeMm}, sideline:{sizeMm}}` — replaces canva-logos.ts hardcodes |
| `artworkFiles` | jsonb | `[{label, fileUrl, kind:ai/eps/pdf/svg/png, forLogoAssetId?}]` — production vectors |
| `designTemplates` | jsonb | `[{label, canvaDesignId, previewUrl, productType?}]` — canonical kit refs |
| `sponsors` | jsonb | `[{logoAssetId, sponsorName, placement?, contractNote?, activeUntil?}]` |
| `designBrief` | text | carried from intake / mockup form / Gemini brief (see §2) |
| `referenceImages` | jsonb | `[{url, label, role:kit/collar/pattern/logo}]` — the client's reference images that feed AI generation |
| `renderSpec` | jsonb | the AI render standard for this club (see §2) — defaults to the house spec |
| `enrichmentStage` | text | `lead → mockup → design_approved → production_ready` |
| `sourceChannel` | text | `lead_intake / free_mockup_form / mockup_request / manual` |

JSONB (not child tables) deliberately: read-as-a-blob at dispatch/generation, mirrors how `orderItems.elementUrls`/`productColors` already model the same shape.

### 1b. `club_logo_assets` — small column adds (keep the table)
`defaultPosition`, `defaultApplication`, `defaultSizeMm`, `artworkFileUrl`, `threadColours` (jsonb) — so a *specific* variant carries its own placement + production spec instead of the `canva-logos.ts` hardcodes.

### 1c. Lifecycle
- **Key:** `club_brand_identity.club_account_id` UNIQUE → 1:1. `club_logo_assets` stays 1:many (the rows under the header).
- **Created at LEAD intake** (`enrichmentStage="lead"`): minted in the same transaction as the `club_accounts` row, even if empty. This is the carrier that ends the re-acquisition problem.
- **Enriched at mockup/design**: the intake/mockup brief (colours, crest, references) and AI-generation outputs write *into* this record.
- **Referenced by every order/PO + every render**: read the one record. No Canva hunt.

---

## 2. AI Design Generation 🎨 (the "Mary Masoe" stage)

> Built and battle-tested in session `e931a5fd` (2026-06-28, Aorere College / Mary Masoe — the first real run). This is where a client's reference design becomes approval-ready garment mockups.

### Engine
- **Skill:** `sideline-mockup-render` (the front half of the pipeline, before Canva/Shopify).
- **Primary model:** Gemini 2.5 ("nano banana") for garment renders.
- **Fallbacks for hard details:** Imagen 4 and an OpenAI image model were wired in when the inner-collar lining wouldn't render correctly. Model is swappable per attempt.

### Inputs — all pulled from the Brand Identity (§1)
`designBrief` + `referenceImages` + primary logo + `colors`. The brand record means the engine **never re-asks** for the logo/colours/brief — it generates straight from stored identity.

### House render spec (Romero's standard, from the Aorere run) — stored in `brandIdentity.renderSpec`
- **No logos** baked into the render (logos layer on later, at approval/Canva).
- **Sideline inner-collar lining** must show on **every top garment**.
- **4K resolution, 4:5 aspect ratio (1080 × 1350 px).**
- **Plain garments** — so the automation/Canva layers the actual design on approval. Default garment set used: 3/4-zip anthem jacket, long-sleeve tees, plain track pants.
- One file per garment / per view (front + back).

### Outputs
Generated mockups flow **back into the Brand Identity** (`designTemplates`) **and** onto the order as `design_files` (`folder="mockups"`) → shown to the customer on the **Approve + Size** form (`/approve/:token`).

### ⚠️ Open problem — render accuracy (not yet fully cracked)
The unsolved hard part from the Aorere run: getting the render to match the client's reference *exactly*. Specifically:
- **Inner-collar Sideline lining** + **pattern overlay** drift from the reference.
- **Front/back pattern** inconsistency between views.
- **Colour fidelity** (e.g. navy drifting) and **blur** introduced by the client's reference image.

Mitigations explored: model-switching (Gemini → Imagen 4 → OpenAI), supplying a **pattern overlay** instead of relying on the reference, `/workflows` + `/loop` to iterate, and capturing Romero's **manual process via Loom** to encode the steps that work. **This accuracy work is the priority for hardening this stage** — storing `renderSpec` + `referenceImages` on the brand record is step one (consistency); reliable inner-collar/pattern reproduction is step two.

---

## 3. How Studio kills the bottleneck

### 3a. Lead creation auto-creates the Brand Identity
Add `storage.ensureClubBrandIdentity(clubAccountId, seed?)` (upsert on the unique key), called wherever a club becomes a DB entity: `seed-club-manager.ts` / `POST /api/admin/club-managers`, the lead→DB bridge (`sideline-accept.js` `handleAccept()` POSTing its captured brief), and `mockup_requests` completion. By PO time the colours/logo/brief/references already live in one place.

### 3b. AI generation + dispatch both auto-pull from it
- **Generation** reads `designBrief`/`referenceImages`/`colors`/logo from the record (§2).
- **Dispatch** (extend the existing auto-attach, `admin.ts` Steps 2.6/2.7) swaps `getPrimaryClubLogo` → `listClubLogoAssets`, attaches every primary + sponsor logo with its own placement/thread/vector, and sizes the Sideline mark from `placementDefaults`. Operators never open Canva at PO time.

---

## 4. PO QC Gate

`assertProductionReady(order)` at the top of `dispatchOrderToSuppliers` (`admin.ts:2967`), **before any side effect**, run in two passes:
- **Pass A (pre-side-effect, hard):** material present + *correct for product type*, branding method, quantity > 0, size breakdown exists + reconciles to quantity.
- **Pass B (post-attach, hard-or-override):** club logo attached, Sideline mark attached (equipment/socks/bags exempt), supplier cost stamped (override-able), artwork approved (warn), delivery + due (warn).

Hard failures abort dispatch and return a per-line `failures[]` list (same 400 shape the admin UI already renders for unresolved suppliers). Override path for cost/warns logged via `qc_override`. Also added to `/dispatch-preview` (dry-run) and as an **Ezra `create_order` read-back** (re-read after insert before reporting success — kills the fabricated-PO class).

**Closes the exact gaps we hit:** dispatched-with-no-logos, wrong fabric (Otāhuhu Interlock vs football mesh), missing/mismatched sizes, NULL supplier cost, fabricated PO.

---

## 5. Phased build plan (smallest-first)

| Phase | What | Size | Notes |
|---|---|---|---|
| **0 — ship next** | QC gate on existing data (fabric/branding/qty/sizes/cost + Ezra read-back). **No schema change.** | small | Closes the costliest gaps immediately; would have caught every QC failure to date |
| 1 | Logo-presence + fabric-correctness as hard blocks (Pass B + allowed-fabric map) | small | thin follow-on to Phase 0 |
| 2 | `club_brand_identity` table + 1b columns + `ensureClubBrandIdentity` + backfill existing clubs | bigger | the structural anchor |
| 3 | Enrichment wiring (lead intake + mockup form → brand record) + admin edit panel | bigger | brand data starts accumulating |
| 4 | Dispatch reads the full brand record (`logoElementFromAsset(asset, brand)`, all logos, thread/vector) — Canva hunt gone | mixed | |
| 5 | **AI generation reads `renderSpec` + `referenceImages` from the brand record**; harden inner-collar/pattern accuracy (the Aorere open problem) | bigger | the Mary stage; depends on 2/3 |

**Recommended order:** Phase 0 first (pure guardrail, no migration), then 2 → 3 → 4 as brand data accumulates, with 1 as a quick follow-on. Phase 5 (AI-generation accuracy) runs in parallel as its own track since it's a model/quality problem, not a schema one.

---

## Already shipped (foundations Studio builds on)
- **Sideline maker's mark auto-attach** on PO dispatch (PR #48) — per-garment placement, application per item's branding. See `docs`/memory `reference_sideline_makers_mark`.
- **Approve + Size form** (`/approve/:token`, PR #47) — the single customer touch (approve design + submit sizes + comments).
- **Ezra `create_order`** with verify-after-write (PR #44).
- **`sideline-mockup-render` skill** + the Gemini/Imagen/OpenAI render path (session `e931a5fd`).

## Key files
`shared/schema.ts` (new table + columns) · `server/storage.ts` (`ensureClubBrandIdentity`, `listClubLogoAssets`) · `server/canva-logos.ts` (`logoElementFromAsset` signature) · `server/routes/admin.ts` (`assertProductionReady` + Steps 2.6/2.7 + `/dispatch-preview`) · `server/ezra/tools.ts` (create_order read-back) · `migrations/club-brand-identity.sql` (new) · workspace `core/sideline-accept.js` (Phase 3 bridge) · `sideline-mockup-render` skill (Phase 5).
