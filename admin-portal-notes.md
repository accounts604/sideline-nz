# Sideline Admin Portal — Build Notes & Backlog

> Working notebook for the Admin Portal build. Romero dumps notes here; we turn one item at a time into a clean build prompt for the Claude Code build session.
> Started: 2026-06-30

---

## How this works
- **Backlog** = raw captured ideas/bugs/wants. Each gets an ID (`AP-01`...).
- **Now building** = the single item we've turned into a prompt and handed to the build session.
- **Done** = shipped, with a one-line note of what landed.
- One thing at a time. We prioritize before promoting anything to "Now building".
- **Consolidation policy (Romero, 2026-06-30):** if a new note overlaps an existing one, I MERGE it into that item (expanding its detail) instead of creating a near-duplicate ID. Related-but-distinct items stay separate but get grouped under a **cluster**. Backlog stays tight.
- **Prompt Log (Romero, 2026-06-30):** every time we hand a prompt to the Claude Code build session, I record it in the **Prompt Log** below with how effective it was — what built cleanly, what the session got wrong, what to phrase differently next time. This is how the prompts get sharper over time.
- **Feedback loop (Romero, 2026-06-30):** after the build session finishes an item, Romero **pastes its summary** back here. I log effectiveness in the Prompt Log + move the item to Done from that summary.

---

## Build order (prioritized 2026-06-30)
1. **AP-03** — Real Sideline logo _(S, quick win / warm-up)_
2. **AP-01** — Bulk select-all + bulk send POs _(M, biggest daily time-saver)_
3. **AP-02 (+ AP-10)** — Orders page overhaul, sliced: filters → editable status/fields **+ change lock** → bulk edits _(L, the spine; defines lifecycle model. Build the lock alongside editable fields — edit power needs the lock as its seatbelt.)_
4. **AP-09** — PO ↔ Xero sync (quotes/invoices/payment status) _(M/L; completes the "money" half of the order story; reuse existing Sideline quote tool's Xero code)_
5. **AP-05 + AP-06** — Fix Brand Identity by building the asset/logo library _(M/L, ship together; independent track)_
6. **AP-04 (+ AP-08)** — Shareable link + QR, supplier vs customer views; admin "view as" built on the same view components _(L; depends on AP-02 + AP-09 status)_
7. **AP-07** — DHL-style fulfilment tracking _(M/L; built as the late-stage extension of AP-04 + AP-02)_

> Dependency chain: AP-02 (lifecycle model) → AP-09 (payment status enriches lifecycle) → AP-04 (two-view links) + AP-08 ("view as" the same views) → AP-07 (tracking = late stage of that lifecycle). Build in that order. AP-05/06 (brand) is an independent track, slot it whenever.
> AP-08's hard requirement (Romero): properly stress-tested; isolation-under-impersonation is the #1 test (no margin/cost leakage into impersonated views).
> Override flags: bump AP-05 to #1 if the dead Brand Identity flow is actively blocking you; skip AP-03 and start at AP-01 if you want value over momentum.

## Now building
_(nothing yet — say "let's build AP-0X" and I'll write the paste-ready prompt)_

---

## Backlog (raw notes)

| ID | Note | Type | Priority | Status |
|----|------|------|----------|--------|
| AP-01 | **Bulk "select all" on the Orders list** — tick multiple (or all) orders, then trigger a bulk action to send POs out to suppliers and/or customers in one go, instead of one order at a time. | Feature | TBD | Backlog |
| AP-02 | **Orders page overhaul — fit for purpose** — editable fields inline, bulk edits, and filters reworked so the page is practical and "tells a story" (status/lifecycle of every order at a glance). | Epic | TBD | Backlog |
| AP-03 | **Real Sideline logo in the Admin Portal** — replace the current placeholder/text logo in the portal header (and login?) with the actual Sideline NZ logo. | Polish | Low (quick) | ✅ Done 2026-06-30 |
| AP-04 | **Shareable live link + QR code, with two distinct views (supplier vs customer)** — generate a shareable URL (and QR) you can hand to a supplier or a customer; each audience sees their own tailored live view of the order/PO. | Feature | TBD | Backlog |
| AP-05 | **BUG: Brand Identity function is a no-op** — trying to set up Brand Identity does nothing, and it doesn't link to the PO. Button/flow appears dead. | Bug | High (broken) | Backlog |
| AP-06 | **Brand / asset library** — all Sideline assets + brand-identity logos available by default in an easy-access library, so adding logos to a design is pick-from-library, NOT re-upload-and-rename every time. | Feature | TBD | Backlog |
| AP-07 | **DHL-style fulfilment tracking** — supplier assigns a tracking number to a PO; customer can then watch live shipment tracking. Tracking-number-on-PO drives a status timeline both audiences can see. | Feature | TBD | Backlog |
| AP-08 | **Admin "view as" supplier / customer** — from admin, switch into the supplier view and the customer view to QA their actual UI/UX and confirm it's fit for purpose. Must be a properly stress-tested build. | Feature (QA tool) | TBD | Backlog |
| AP-09 | **PO ↔ Xero sync (quotes + invoices)** — link each PO to its Xero quote/invoice so payments get timestamped and the order cross-references its Sideline line items. Reuse the same Xero integration as the existing Sideline quote/proposal tool. | Feature (integration) | TBD | Backlog |
| AP-10 | **Change lock on orders/POs** — lock a record from further edits once sent/confirmed, so editable-fields + bulk-edits can't accidentally alter an in-flight order. Guard for AP-01/AP-02. _(confirm exact meaning)_ | Feature (guardrail) | Pairs w/ AP-02 | Backlog |

### AP-01 detail
- **What:** Multi-select on the Orders table (checkbox per row + "select all" header checkbox), then a bulk action bar that fires PO dispatch for the selected set.
- **Open Qs:** Bulk send to **suppliers** (the supplier PO emails) and **customers** (order confirmation / target-client PO?) — are these two separate bulk buttons or one? Multi-supplier orders already split per supplier — does bulk respect that split? Any guard so you don't double-send an order whose PO already went?

### AP-02 detail
- **What:** Rework the Orders page so it's a working cockpit, not just a list. Three threads:
  - **Editable fields** — which fields do you need to edit inline without opening the order? (status, supplier, dates, costs, notes?)
  - **Bulk edits** — set a field across many orders at once (e.g. mark N orders "PO sent", change supplier, set ship date). Pairs with AP-01's select-all.
  - **Filters** — fit-for-purpose filtering so you can slice the list (by club, status, supplier, date range, paid/unpaid, PO-sent-or-not).
- **"Tell a story":** the page should make an order's lifecycle legible at a glance — where each order is in the pipeline (placed → PO raised → PO sent → in production → dispatched → delivered), what's stuck, what needs action today.
- **Note:** This is an **epic**, not a single prompt. When we promote it, we'll slice it (filters first? editable status first?) — each slice becomes its own build prompt. AP-01 is effectively the first concrete slice of this.
- **Open Qs (for prompt-time):** exact column/field list you want; the canonical order status/lifecycle stages; what "needs action today" means (a flag/queue?).

### AP-04 detail
- **What:** Each order (or PO) gets a **public, shareable live link** + a **QR code** for that link. Two audience-scoped views off the same order:
  - **Supplier view** — what the supplier needs: PO contents, qty/sizes, specs, ship-to, due dates, status to update. NOT customer pricing/margin.
  - **Customer view** — what the customer needs: their order summary, status/lifecycle, ETA, maybe approval/tracking. NOT supplier cost or internal margin.
- **Why it's powerful:** "live" = they see real status without you emailing updates; QR = drop it on a doc/whatsapp; two views = one source of truth, audience-safe.
- **Security/isolation (critical):** these are unauthenticated shareable links → must be **unguessable tokens** (not order ID), each scoped to ONE view so a supplier link can never reveal customer margin and vice-versa. Mirrors the existing `club:<slug>` isolation discipline. Decide: link expiry? revocable? read-only vs. supplier-can-update-status?
- **Open Qs (for prompt-time):** link per **order** or per **PO** (a multi-supplier order = multiple supplier links?); exactly which fields each view shows/hides; can supplier update status through their link or view-only; expiry/revocation.

### AP-05 detail (BUG)
- **Symptom:** Clicking/using "Brand Identity" setup does nothing — no save, no link to the PO. Dead flow.
- **Need to know (for repro/fix prompt):** where is it (which page/screen), what do you expect it to do when it works, and does it error in the console or silently no-op? The build session will need to repro first.
- **Related:** AP-06 — the fix probably wants Brand Identity to pull from a real asset library, not a per-time upload.

### AP-06 detail
- **What:** A persistent **brand/asset library** holding all Sideline logos + brand assets (and probably per-club logos too), available by default wherever you add a logo to a design / PO / mockup.
- **Pain today:** re-upload + rename the same logo every single time → slow, error-prone, inconsistent naming.
- **Shape:** central store (likely Shopify Files/CDN or your own assets table + R2/Drive) → a picker UI in the design/logo step → reusable, named once.
- **Open Qs (for prompt-time):** scope of the library (Sideline brand assets only, or also each club's crest/logo?); where assets physically live now; is this the same logo step that AP-05's Brand Identity is supposed to drive?

### AP-07 detail
- **What:** A fulfilment tracking experience like DHL's:
  - **Supplier** assigns a **tracking number** (+ carrier) to a PO — through their shareable link (AP-04) or the admin portal.
  - That tracking number drives a **live status timeline** (label created → picked up → in transit → out for delivery → delivered).
  - **Customer** can **watch** it from their view (AP-04 customer link) without contacting you.
- **Tightly coupled to AP-04 + AP-02:** the tracking timeline IS the late stage of the order lifecycle (AP-02 status model), and the supplier-assign / customer-watch split IS the two-view link (AP-04). Strong case to build AP-04 → AP-07 back-to-back, or AP-07 as the final stage of AP-04.
- **Build decision (for prompt-time):** live carrier tracking needs a data source. Options: (a) **link out** — store tracking number + carrier, deep-link to the carrier's own tracking page / DHL etc. (cheap, no integration); (b) **embed live status** via a tracking aggregator API (AfterShip / EasyPost / 17track) — real timeline in-app, but a paid integration + API key. Recommend starting with (a) link-out + a manual status timeline you/supplier update, upgrade to (b) later.
- **Open Qs:** which carriers does Puffin/your freight actually use (DHL, courier, sea freight?); one tracking number per PO or can a PO ship in multiple parcels; do you want true live carrier data (API) or is link-out + manual stages enough for v1.

### AP-08 detail
- **What:** An admin "**View as supplier**" / "**View as customer**" switch — impersonate each audience's view of an order/PO from inside the admin portal, so you can eyeball their real UI/UX and confirm it's fit for purpose before sending links out.
- **Why:** You're the QA. Without this you'd have to open a real shareable link to see what they see. This lets you sanity-check the two views live.
- **Tightly coupled to AP-04:** it renders the SAME supplier/customer views AP-04 exposes, just reachable from admin. Cleanest to build it as part of AP-04 (same view components, one extra entry point) rather than a separate screen.
- **"Properly stress-tested" (Romero's explicit requirement):** this build must be hardened, not a happy-path demo. Stress cases to cover:
  - Multi-supplier orders (multiple supplier views per order), multi-parcel, partial dispatch.
  - Empty / missing data (no tracking yet, no logo, no PO sent) — views must degrade gracefully, not crash.
  - **Isolation under impersonation:** "view as" must NOT leak admin-only data (margin/cost) into the customer/supplier render — the impersonated view has to be byte-for-byte what the real link shows. This is the #1 thing to test.
  - Large orders / long line-item lists, weird sizes/qty, special characters in club/customer names.
- **Open Qs (for prompt-time):** read-only impersonation, or can you act (send PO / assign tracking) while "viewed as"? a clear banner showing you're impersonating? does it pick a specific real order to view as, or a sandbox sample?

### AP-09 detail
- **What:** Tie each PO/order to Xero so the admin portal reflects the money side:
  - Link the order's **Xero quote** and **Xero invoice** to the PO.
  - **Timestamp payments** — when an invoice is paid in Xero, the order shows paid + when.
  - **Cross-reference line items** — the order's Sideline items map to the Xero quote/invoice lines, so you can see "this order = this quote = this invoice = paid".
- **Reuse, don't rebuild:** Romero says this is the SAME Xero integration as the **existing Sideline quote/proposal tool**. The build session must FIND and reuse that tool's Xero auth + quote/invoice code rather than writing a new integration. → first job in the prompt = locate the existing Sideline quote tool + its Xero client in the repo.
- **Known facts (from KIG memory):** Xero is connected via API with **full write scopes** — CAN create/update both Quotes and Invoices (not read-only). RTS branding theme for client-facing invoices. Invoice rule: raise in Xero only, CC Romero, he OKs the PDF before send.
- **Feeds the lifecycle:** "paid / unpaid / part-paid" becomes a status the orders page (AP-02) filters on and the customer view (AP-04) can reflect (carefully — customer sees their own invoice status, never margin).
- **Open Qs (for prompt-time):** where exactly the existing Sideline quote/proposal tool lives (repo path / is it the SL-#### intake quote tool?); match Xero records by what key (order ref / PO ref / club tag?); does the portal CREATE quotes/invoices in Xero or just LINK + read status; payment timestamp via Xero webhook or polling.

### AP-10 detail
- **What (best interpretation — confirm):** a **change lock** on an order/PO — once it's sent/confirmed, the record is locked so fields can't be edited (accidentally or in bulk) without an explicit unlock. Protects in-flight orders.
- **Why it pairs with AP-02:** we're adding inline-editable fields + bulk edits (AP-01/AP-02). Those are powerful and therefore dangerous on a PO that's already gone to the supplier/customer. The lock is the seatbelt for that power. Building edit + lock together is cleanest.
- **Likely shape:** records auto-lock at a lifecycle stage (e.g. once "PO sent"); a deliberate unlock action (with maybe a reason/audit entry) to edit a locked record; bulk-edit skips locked records.
- **Alt interpretations to rule out:** (a) a global "freeze the portal during a deploy/change window" mode; (b) a literal changelog/audit history of edits. If you meant one of these, tell me and I'll re-scope.
- **Open Qs (for prompt-time):** what triggers the lock (manual toggle vs auto at a status); who can unlock (admin only?); should it log who locked/unlocked + when (audit trail).

---

## Clusters / themes (to catch overlap)
- **Two-view system** → AP-04 (shareable links), AP-08 (admin view-as), AP-07 (tracking). Share the same supplier/customer view components. New "what suppliers/customers see" notes merge here.
- **Order cockpit / lifecycle** → AP-02 (orders page), AP-01 (bulk send is its first slice), AP-09 (payment status). New "orders page / status / bulk / filter" notes merge here.
- **Brand & assets** → AP-05 (Brand Identity bug), AP-06 (asset library). New "logo / brand asset" notes merge here. (AP-03 = the one-off portal logo swap.)

---

## Prompt Log
> One entry per prompt handed to the Claude Code build session. Effectiveness rated after Romero reports back, so we sharpen phrasing over time.

_Template:_
```
### [date] — AP-0X — <short title>
Prompt handed over: <link/paste or summary of the prompt we shipped>
Outcome: ✅ built clean | ⚠️ partial | ❌ went sideways
What worked: <phrasing/context that made it build well>
What to change next time: <what confused the build session / what to add or cut>
```

_(no prompts shipped yet)_

---

## Done
- **AP-11 — BUG: logos/mockups not syncing to Drive** _(2026-07-01)_ — Uploads (`POST /orders/:id/designs`, plus the `/mockup` + `/attach-logo` API paths) only mirrored to Drive `if (order.driveFolderId)` — so any order **without a Drive folder yet** (e.g. the proof orders) silently never synced. Fix: added `ensureOrderDriveFolder()` which creates the PO's Drive folder on demand, then mirrors. All three upload paths now create-folder-if-missing → mirror to the correct `mockups`/`logos`/`artwork` subfolder. Typecheck clean.
- **AP-03 — Real Sideline logo** _(2026-06-30)_ — Replaced the placeholder SVG "S" mark + "Sideline" wordmark with the real white horizontal logo (`attached_assets/Sideline_NZ_logo_Horizontal_Wite_…png`) in two places: the **admin sidebar header** (`admin-layout.tsx`, keeps the "Admin Portal" subtitle under it) and the **login page** (`login.tsx`, black bg). Both are dark-themed so the white logo fits. Typecheck clean.

---

## Open questions / decisions to make
_(empty)_
