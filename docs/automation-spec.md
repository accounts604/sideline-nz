# Sideline NZ — Self-Automating Operations System

**Spec v1.2 · 2026-05-13 · KIG / Romero Tagi**
**Repo:** `~/Projects/sideline-nz` · **Production:** sidelinenz.com
**Status:** Validated against codebase at commit `0360266` on `fix/ghl-form-data-capture`. 42/44 audit citations confirmed; 4 validation gaps folded in.

---

## Goal

Automate the flow Canva-finished design → Shopify products → live drop → club-supporter orders → POs → supplier dispatch → invoice/cost reconciliation, with a tracking layer that surfaces leads, costs, margins, and risks proactively.

---

## 1. Current state audit

Cited file:line. Verified against repo at audit time (2026-05-13).

### 1a. Shopify ↔ internal data flow — partial

- **Shopify Admin reads — live.** `server/shopify-admin.ts:148-199` paginates orders by tag with a 5-min in-memory cache; `:266-293` reads collection publish state; `:309-339` lists products in a collection.
- **Shopify Admin writes — gap.** No `productCreate`, no collection mutations, no metafield writes, no server-side `club:<slug>` tag writes. `order_items.shopifyVariantId / shopifyInventoryItemId / shopifySyncedAt` exist (`migrations/add-shopify-link-fields.sql:5-8`). One-off `scripts/backfill-shopify-costs.mjs` pushes `inventoryItem.cost`.
- **Shopify webhooks inbound — missing.** `server/webhookHandlers.ts` only handles Stripe `checkout.session.completed` / `payment_intent.succeeded`. No `orders/*`, `collections/update`, `products/*` webhook. Only Shopify-side trigger flowing in is the 10-min poll at `server/routes/admin.ts:3024-3047`.
- **Tag isolation — solid.** `clubAccounts.shopifyOrderTag` (`shared/schema.ts:420`) + re-verification in `fetchSupporterOrdersByTag` (`shopify-admin.ts:168-169`).
- **Tag mechanism — external.** The `club:<slug>` tag is written onto each Shopify order by a **Shopify Flow automation rule**, not by code in this repo. If that Flow is disabled or edited, tagging breaks silently. See §1j below.

### 1b. PO pipeline — substantially built

- Legacy single-step: `POST /api/admin/orders/:id/raise-po` (`admin.ts:2040-2054`) → `dispatchPoToSupplier` (`admin.ts:1857-2038`) — composes supplier assignment, GHL stage push, Drive Instructions doc, folder share, Gmail dispatch, PO PDF gen, Drive upload, orderActivity row, sets `poDispatchedAt`.
- Sample/Bulk split: `raise-sample-po` (`admin.ts:2239-2291`) → Telegram approval card (`server/telegram.ts:100-137`) → `po-decision` callback (`admin.ts:2334-2378`). Bulk auto-fires when **both** gates land: `sampleApprovedByClientAt` AND `depositPaidAt` (`admin.ts:2404-2412`, via `ensureBulkPoFromSample`).
- **Closed-drop builder — built, manual-trigger only.** `buildPoFromClosedDrop` (`admin.ts:2756-2947`); idempotence via `supporterDropClosedAt` check (`admin.ts:2773-2796`). Routes: admin-auth `POST /clubs/:id/build-po-from-closed-drop`, service-token `POST /clubs/:id/build-po-from-closed-drop-service` (`admin.ts:3007-3020`). **Not wired to any in-repo cron** — currently fired by an external mission-control crontab.
- Supplier acknowledgment tracking: `scripts/po-supplier-followups.ts` is a daily cron classifying Gmail replies (`ack | samples_ready | shipped | issue | unknown`); creates Gmail **drafts**, never sends. Runs from BSD cron on Romero's machine, not Railway.
- Deposit reconciliation: `POST /orders/:id/mark-deposit-paid` (`admin.ts:2425`) is a one-line setter. **No Xero integration code** in repo. `scripts/integration-health.ts:53` probes `quotes.updatedAt` as a Xero proxy.

### 1c. Cost tracking — partial scaffolding

- Supplier cost table: `shared/product-catalog.ts:36+` defines `PUFFIN_COSTS_USD_TIER1`. Conversion `PUFFIN_USD_TO_NZD = 1.72` + `OVERHEAD_PER_UNIT_NZD = 2.00`. `getShopifyCost` (`:96`), `getAlibabaCost` (`:104`) exported.
- Cost write-back to Shopify: `scripts/backfill-shopify-costs.mjs` (one-shot, not a daemon).
- Revenue side: `summarizeSupporterOrders` (`shopify-admin.ts:210-244`) computes revenue + `profitShareCents = revenueCents * tierBps / 10000`. Per-club only, no per-drop persistence, no ledger.
- **No ledger table.** Margin computed on-demand from Shopify + product-catalog constants.

### 1d. Pipeline & lead tracking

- GHL is source of truth. `SIDELINE_PIPELINE_STAGES` (`shared/pipeline.ts:9-19`), 9 stages: Lead Received → Brief Sent → Mockup In Progress → Mockup Sent → Deposit Paid → PO Raised → Delivered → Invoice Sent → Paid.
- Inbound: `POST /api/ghl/webhook/opportunity-stage` (`server/routes/ghl.ts:820-908`) mirrors stage changes into `orders.pipelineStage`. Optional `GHL_WEBHOOK_SECRET` header check.
- Outbound: `updateGhlOpportunityStage` (`ghl.ts:186-219`).
- Stage-change rows written to `orderActivity` (`ghl.ts:887-897`).
- **Gap:** no stage-aging / drop-off detection.

### 1e. Risk-detection layer — fragmented

One-shot scripts run manually:
- `scripts/po-health-check.ts` — buckets active POs (dispatched, held, awaiting-deposit, etc.). Prints to stdout.
- `scripts/integration-health.ts` — last-touched age per external system.
- `scripts/po-supplier-followups.ts` — daily Gmail-draft chases (BSD cron).
- `scripts/po-followups-digest.ts` (28 Apr 2026) — daily digest summary.

**No in-app rule engine. No daemon. No alert routing beyond Telegram PO approval cards.** `integrationEvents` (`shared/schema.ts:393-408`) exists as audit substrate; read manually via `GET /api/admin/integration-events` (`admin.ts:72-94`).

### 1f. AI / Ezra layer — Phase A built

- `server/ai/index.ts` exposes `runTask({ taskName: 'name-asset' })` only.
- `server/ai/providers/select.ts:12-13` — Gemini default, Claude alternative. **No OpenAI provider yet** in this repo.
- Ezra copilot: non-streaming, Gemini-only function calling. **8 read-only tools** (`server/ezra/tools.ts:227-236`): name_asset, get_order, get_club, list_orders, search_products, get_drop_status, list_recent_designs, extract_colours. Audit trail = `ezra_messages` table.
- Mockup generation: `server/mockup/orchestrator.ts` — Gemini + ElevenLabs + ffmpeg. Used by public lead form (`/api/mockups`), separate from Ezra and `runTask`.

### 1g. Canva integration — none

Zero Canva code in repo. The `sideline-canva-rename` skill operates on Safari + local Canva session; does not call the server. Canva→Shopify trigger is manual today.

### 1h. Self-automating infra — external

Mission-control + Hermes + 9 Telegram bots live outside this repo. Repo's only cross-process integration:
- Service-token endpoints (`SIDELINE_SERVICE_TOKEN` env, `X-Service-Token` header) — exactly one endpoint: `clubs/:id/build-po-from-closed-drop-service`.
- Telegram bot callbacks → `/po-decision`.

No in-server scheduler, no BullMQ, no node-cron, no internal queue.

### 1i. Schema fields already present (don't re-add)

- `orders.designStatus` (`schema.ts:89`): `not_started | pending_review | approved | needs_revision`.
- `orders.clubPortalStatus` (`schema.ts:96`): 8 values (brief_received, mockup_in_progress, mockup_ready, revision_in_progress, design_approved, in_production, shipped, delivered).
- `orders.pipelineStage` — GHL mirror.
- `orders.poKind / parentOrderId / poDispatchedAt / poHeldAt / sampleApprovedByClientAt / depositPaidAt`.
- `orders.driveFolderId / driveFolderUrl / driveFolderName`.
- `orders.bulkSizeBreakdown / sourceCollectionHandle`.
- `orderItems.shopifyVariantId / shopifyInventoryItemId / shopifySyncedAt`.
- `clubAccounts.supporterCollectionHandle / supporterCollectionPublished / supporterDropClosedAt / profitShareTierBps`.
- `integrationEvents` — full external-API audit log.
- `orderActivity` — per-order audit log.
- `ezraConversations / ezraMessages` — conversation-as-audit.
- `approvalTokens` (`schema.ts:597-608`) — 30-day token pattern, reusable for supplier ack JWT.

### 1j. The Shopify Flow tag dependency (v1.2 addition)

**Critical external dependency.** The `club:<slug>` tag — the entire isolation boundary — is set on each supporter order by a **Shopify Flow automation rule**, not by code. Failure modes:

- Flow rule disabled or paused by store admin → new orders untagged → `fetchSupporterOrdersByTag` returns empty for the club → club portal shows zero orders → PO build sees zero supporters.
- Flow rule's trigger condition changes (e.g. someone edits the source collection match) → partial tag coverage.
- Shopify Flow service incident → tags missing for the duration.

Required: a tag-presence risk rule (see §5 row 17, R-TAG-MISSING-ON-NEW-ORDER) plus documented baseline of the Flow rule's configuration in this doc (TODO: capture screenshot/JSON export when Phase 1 lands).

---

## 2. Target architecture

```
   ┌─────────────────────── EXTERNAL WORLD ─────────────────────────┐
   │  Canva    Shopify     GHL CRM    Gmail     Drive    Xero       │
   │   │         │  ▲        │  ▲       │         │       │         │
   └───┼─────────┼──┼────────┼──┼───────┼─────────┼───────┼─────────┘
       │         │  │        │  │       │         │       │
       ▼         ▼  │        ▼  │       ▼         ▼       ▼
   ┌──────────────────────── INBOUND BOUNDARY ──────────────────────┐
   │  /api/canva/webhook   (Phase 3)                                 │
   │  /api/shopify/webhook (Phase 2) ─► event_inbox (idempotent buf) │
   │  /api/ghl/webhook/*   (✓ live)                                  │
   │  /api/xero/webhook    (Phase 2)                                 │
   │  /api/po-decision     (✓ Telegram bridge)                       │
   └────────────────────────────────────────────────────────────────┘
                              │
                              ▼
   ┌──────────────────── ORCHESTRATION CORE ────────────────────────┐
   │                                                                 │
   │   ┌─── lifecycle FSM ───┐    ┌─── risk engine ──────┐          │
   │   │  drop_lifecycle     │    │  rule catalogue (17) │          │
   │   │  per-drop row       │    │  cron-evaluated      │          │
   │   │  11 stages:         │    │  writes risk_signal  │          │
   │   │  design_in_progress │    │  routes to channel   │          │
   │   │  → design_ready     │    └──────────┬───────────┘          │
   │   │  → products_staged  │               │                       │
   │   │  → drop_live        │               ▼                       │
   │   │  → drop_closed      │    ┌─── alert router ────┐           │
   │   │  → sample_dispatched│    │  Telegram / email / │           │
   │   │  → sample_approved  │    │  dashboard card     │           │
   │   │  → bulk_dispatched  │    │  + quiet hours (NZT)│           │
   │   │  ── (Phase 2 below) │    └─────────────────────┘           │
   │   │  → delivered        │                                       │
   │   │  → invoiced         │                                       │
   │   │  → paid             │                                       │
   │   └─────────────────────┘                                       │
   │                                                                 │
   └─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
   ┌──────────────────── INTERNAL SCHEDULER ────────────────────────┐
   │  node-cron INSIDE the Express app, NOT external mission-control │
   │  Each job idempotent + logs to integration_events               │
   │                                                                 │
   │  cron: */10 *     → check-collection-cutoffs (Phase 1)          │
   │  cron: 0 8 * * *  → po-supplier-followups    (Phase 1)          │
   │  cron: 0 9 * * *  → risk-engine.evaluate-all (Phase 1)          │
   │  cron: 0 7 * * *  → xero-reconcile           (Phase 2)          │
   │  cron: 0 18 * * 5 → weekly-summary-digest    (Phase 3, < 7pm NZT)│
   └─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
   ┌────────────────────── DATA LAYER ──────────────────────────────┐
   │  Postgres (Neon, Drizzle ORM) — additive deltas in §3:          │
   │   • event_inbox                 (Phase 1)                       │
   │   • drop_lifecycle              (Phase 1)                       │
   │   • risk_signal                 (Phase 1)                       │
   │   • cost_ledger                 (Phase 1)                       │
   │   • supplier_acknowledgment     (Phase 1)                       │
   │   • design_handoff              (Phase 2)                       │
   │   • xero_invoice                (Phase 2)                       │
   │                                                                 │
   │  Existing: orders, order_items, clubs, integrationEvents,       │
   │            orderActivity, ezraConversations/Messages,           │
   │            approvalTokens.                                      │
   └─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
   ┌─────────────────────── UI SURFACES ────────────────────────────┐
   │  Existing admin shell → new tabs:                               │
   │    /admin/drops        — lifecycle FSM per club drop            │
   │    /admin/risks        — risk_signal feed, ack/snooze/resolve   │
   │    /admin/margins      — per-drop / per-club / per-product P&L  │
   │  Ezra copilot — new tools to query the above (Phase 3).         │
   └─────────────────────────────────────────────────────────────────┘
```

### Trigger boundary discipline

- **Canva → Shopify** is a *push* trigger — Romero presses "Publish Drop" after Canva work, NOT a Drive file-watch. Reason: Canva exports are noisy (revs, mistakes). Single explicit action is deterministic. Phase 3 upgrade: Drive `_READY` subfolder webhook.
- **Drop close → PO build** is *cutoff-date driven*, not unpublish-driven. Parse cutoff from collection `descriptionHtml`; orders after cutoff excluded from rollup. See Δ1 below.
- **PO dispatch → supplier ack** is *Gmail-thread parsing* today. Phase 3 upgrade: magic-link `?ack=` URL in dispatch email so supplier hits HTTP endpoint instead of free-text reply.
- **Deposit → bulk PO** is *Xero webhook* on `Invoice.PAID`. The manual `mark-deposit-paid` path is the fallback for the first 30 days; webhook lands in Phase 2.

---

## 3. Data model deltas

All additive. None break existing flows. Drizzle migrations applied via `npm run db:push` after SQL review.

### 3.1 `event_inbox` — idempotent inbound buffer

| col | type | rationale |
|---|---|---|
| `id` | varchar PK uuid | |
| `source` | text | `canva | shopify | ghl | xero | telegram` |
| `external_id` | text | source's event id. UNIQUE per (source, external_id). |
| `topic` | text | e.g. `orders/create`, `collections/update`, `invoice.paid` |
| `payload` | jsonb | full webhook body |
| `received_at` | timestamp default now() | |
| `processed_at` | timestamp null | null = pending |
| `process_error` | text null | last failure |
| `attempts` | integer default 0 | |

Why: Shopify and GHL retry webhooks on 5xx; without an idempotency key in the DB, every redelivery double-fires. `integrationEvents` is fire-and-forget audit, not idempotency.

### 3.2 `drop_lifecycle` — per-club-drop FSM row

| col | type | rationale |
|---|---|---|
| `id` | varchar PK uuid | |
| `club_account_id` | varchar FK clubAccounts.id | |
| `collection_handle` | text | distinct per drop generation |
| `stage` | text | enum: `design_in_progress | design_ready | products_staged | drop_live | drop_closed | sample_dispatched | sample_approved | bulk_dispatched | delivered | invoiced | paid | abandoned` |
| `stage_entered_at` | timestamp | drives "stalled > N days" rules |
| `sample_order_id` | varchar FK orders.id null | |
| `bulk_order_id` | varchar FK orders.id null | |
| `cutoff_at` | timestamp null | parsed from collection `descriptionHtml` OR manually set fallback |
| `cutoff_source` | text | `parsed | manual_override` — for audit |
| `expected_close_at` | timestamp null | sanity bound on cutoff_at |
| `notes` | text null | |
| `created_at` / `updated_at` | timestamp | |

Existing `clubAccounts.supporterDropClosedAt` is a boolean debounce; this is the multi-stage timeline.

**Phase 1 closing trigger:** Phase 1 advances lifecycle through `bulk_dispatched` only. `delivered | invoiced | paid` advancement waits on Xero webhook (Phase 2). Manual override available via `POST /api/admin/drops/:id/close`.

### 3.3 `risk_signal` — output of the rule engine

| col | type | rationale |
|---|---|---|
| `id` | varchar PK uuid | |
| `rule_id` | text | matches §5 catalogue (e.g. `R-PO-NO-ACK-2D`) |
| `severity` | text | `info | warn | high | urgent` (urgent bypasses quiet hours) |
| `subject_kind` | text | `order | club | drop | po | lead | integration` |
| `subject_id` | varchar | loose FK |
| `summary` | text | one-line for cards |
| `detail` | jsonb | rule-specific context |
| `auto_action` | text null | `gmail_draft_created | hold_set | ghl_tag_added | none` |
| `notified_channels` | jsonb | `["telegram:sideline", "email:romero@…"]` |
| `state` | text | `open | acked | snoozed | resolved` |
| `acked_by` | varchar null | |
| `snoozed_until` | timestamp null | |
| `first_seen_at / last_seen_at` | timestamp | |
| `resolved_at` | timestamp null | auto-set when condition no longer matches |
| `resolved_reason` | text null | e.g. `negotiation_hold_engaged`, `auto_resolved` |

UNIQUE partial index on (rule_id, subject_id) WHERE state='open' — re-runs bump `last_seen_at`, no dupes.

### 3.4 `cost_ledger` — single source of truth for $ flows

| col | type | rationale |
|---|---|---|
| `id` | varchar PK uuid | |
| `entry_type` | text | `revenue | supplier_cost | shipping_in | shipping_out | shopify_fee | stripe_fee | refund | adjustment | profit_share_payout` |
| `amount_cents` | integer | signed: revenue +, costs - |
| `currency` | text default `nzd` | |
| `occurred_at` | timestamp | event date |
| `order_id` | varchar null | |
| `club_account_id` | varchar null | |
| `collection_handle` | text null | drop identifier |
| `product_id` | text null | canonical from product-catalog |
| `source_system` | text | `shopify | xero | manual | po-pipeline` |
| `source_ref` | text | external id |
| `meta` | jsonb | unit cost, qty, fx snapshot |
| `created_at` | timestamp | |

Why a ledger, not denormalised columns? Refunds, adjustments, split shipments mean N positive + M negative rows per order. View `v_drop_margin` SUMs per (collection_handle, club_account_id).

### 3.5 `supplier_acknowledgment` — first-class supplier signals

| col | type | rationale |
|---|---|---|
| `id` | varchar PK uuid | |
| `order_id` | varchar FK orders | |
| `kind` | text | `ack | sample_ready | shipped | delay | issue | delivered` |
| `source` | text | `gmail_reply | magic_link | telegram | manual` |
| `gmail_message_id` | text null | provenance |
| `eta_date` | text null | YYYY-MM-DD |
| `tracking_number` | text null | |
| `tracking_carrier` | text null | |
| `notes` | text null | |
| `created_at` | timestamp | |

Promotes today's ad-hoc `orderActivity.details` JSON to a typed table → risk rules become trivial joins.

### 3.6 `design_handoff` (Phase 2) — Canva → Shopify trigger record

| col | type | rationale |
|---|---|---|
| `id` | varchar PK uuid | |
| `club_account_id` | varchar FK | |
| `canva_design_id` | text null | |
| `canva_url` | text null | |
| `drive_folder_id` | text null | export landing folder |
| `target_collection_handle` | text | |
| `target_products` | jsonb | `[{ catalogId, title, variants: [{size, sku, costCents, retailCents }], imageUrls }]` |
| `tag_to_apply` | text | `club:<slug>` — server validates against clubAccounts row |
| `status` | text | `proposed | approved | shopify_created | published | failed` |
| `shopify_collection_gid` | text null | populated post-create |
| `created_by` | varchar FK users | |
| `created_at / updated_at` | timestamp | |

### 3.7 `xero_invoice` (Phase 2)

| col | type | rationale |
|---|---|---|
| `id` | varchar PK uuid | |
| `xero_invoice_id` | text UNIQUE | |
| `order_id` | varchar null FK | |
| `club_account_id` | varchar null FK | |
| `invoice_number` | text | |
| `type` | text | `deposit | balance | supplier_bill | profit_share` |
| `status` | text | `DRAFT | AUTHORISED | PAID | VOIDED` |
| `total_cents` | integer | |
| `due_date` | date | drives overdue rule |
| `paid_at` | timestamp null | webhook-set; mirrored into `orders.depositPaidAt` |
| `xero_url` | text | deep link |
| `synced_at` | timestamp | |

### 3.8 `orders` table extensions (Phase 1, v1.2 additions)

| col | type | default | rationale |
|---|---|---|---|
| `po_negotiation_hold` | boolean | false | when true, suppresses rules 5, 6, 7, 9 (negotiation hold = intentional, not stuck) |
| `po_negotiation_hold_reason` | text | null | free text |
| `po_negotiation_hold_set_at` | timestamp | null | drives Phase 2 "stale hold" rule |
| `po_negotiation_hold_set_by` | varchar | null | userId |

Existing `poHeldAt` / `poHoldReason` are operational holds — different intent. Do not conflate.

### 3.9 `suppliers` table extensions (Phase 1)

Check `shared/schema.ts` for current shape. If `suppliers` exists with a single email column, extend:

| col | type | rationale |
|---|---|---|
| `pricing_contact_email` | text | quote/cost chases — Ali at Puffin (`info@`) |
| `ops_contact_email` | text | ack/shipping chases — Usman at Puffin (`usman@`) |
| `cc_emails` | jsonb | always-CC list (Abdullah for visibility at Puffin) |

If a `supplier_contacts` table already exists, add `role` enum (`pricing | ops | signer`) instead.

---

## 4. Service contracts

### 4.1 Canva → Shopify (Phase 2 unless noted)

| route | NEW/EXTEND | trigger | idempotency | failure mode |
|---|---|---|---|---|
| `POST /api/admin/design-handoffs` | NEW | UI form (Romero "Publish Drop") | UNIQUE (club_account_id, target_collection_handle) | 4xx if club tag missing |
| `POST /api/admin/design-handoffs/:id/approve` | NEW | UI confirm or Telegram callback | sets status `approved`; 409 on repeat | fires async creates |
| `POST /api/admin/design-handoffs/:id/create-shopify` | NEW | enqueued by `approve` | per-product dedupe on (handle, sku) before `productCreate`. Writes `shopify_collection_gid` on success. | partial → status `failed`, row readable. Manual retry from UI. |
| `POST /api/admin/design-handoffs/:id/publish` | NEW | UI | Shopify GraphQL `publishablePublish` — idempotent | 5xx surfaced |
| `POST /api/canva/webhook` | NEW (Phase 3) | future Canva Connect push | event_inbox UNIQUE | 200 sync, async process |

### 4.2 Drop lifecycle / closed-drop

| route | NEW/EXTEND | trigger | idempotency |
|---|---|---|---|
| `POST /api/admin/clubs/:id/build-po-from-closed-drop` | EXTEND (`admin.ts:2994`) — wire to in-app cron | called by in-app cron when `cutoff_at <= now()` AND `stage='drop_live'` AND no sample yet | existing `supporterDropClosedAt` debounce |
| in-app cron `check-collection-cutoffs` | NEW (Phase 1) | every 10 min | per-club; reads `drop_lifecycle.cutoff_at` and parses fallback from `descriptionHtml` |
| `POST /api/admin/drops/:id/close` | NEW (Phase 1) | manual override when parser fails or cutoff needs forcing | sets `cutoff_at = now()`, `cutoff_source = manual_override` |
| `POST /api/admin/drops/:lifecycleId/advance` | NEW (Phase 1) | manual + automated FSM | requires (from-state, to-state) param; rejects illegal transitions |

### 4.3 PO pipeline — extensions only

**Load-bearing existing code — extend, do not replace:**
- `dispatchPoToSupplier` (`admin.ts:1857-2038`) — adds Drive folder, Gmail, PDF, activity row.
- `ensureBulkPoFromSample` (`admin.ts` near 2136) — the gate logic firing bulk on both `sampleApprovedByClientAt` AND `depositPaidAt`.
- `buildPoFromClosedDrop` (`admin.ts:2756-2947`) — supporter order rollup, sizes via `matchSupporterProduct` + `extractSizeFromVariant`.

| route | NEW/EXTEND | notes |
|---|---|---|
| `POST /api/admin/orders/:id/raise-po` | EXTEND `admin.ts:2040` — on success, write `cost_ledger` `supplier_cost` rows from items × `getShopifyCost`. Wrap in `tracked()` so it doesn't block dispatch. |
| `POST /api/admin/orders/:id/po-decision` | EXTEND `admin.ts:2334` — on `action=hold` with null reason, auto-open `R-PO-HELD-NO-REASON` risk_signal. |
| `POST /api/supplier/ack` | NEW (Phase 2) | magic-link supplier endpoint, signed `?t=<jwt>` URL embedded in dispatch email. Writes `supplier_acknowledgment`. Auto-resolves matching `R-PO-NO-ACK-*` signals. |
| `POST /api/supplier/orders/:id/eta` | EXTEND `server/routes/supplier.ts` — add `etaDate`, `trackingNumber`. |
| `POST /api/admin/orders/:id/negotiation-hold` | NEW (Phase 1) | toggle `po_negotiation_hold`; auto-resolves any open R-PO-* signals for the order. |
| `POST /api/admin/orders/:id/extract-cutoff` | NEW (Phase 1) | runs `parseCutoffFromDescriptionHtml` on the linked collection; writes `drop_lifecycle.cutoff_at`. Used as fallback when the cron parser fails. |

### 4.4 Cost / Xero reconciliation

| route | NEW/EXTEND | notes |
|---|---|---|
| `POST /api/xero/webhook` | NEW (Phase 2) | Xero "Invoice" event subscription; event_inbox dedupe |
| internal `reconcileXeroInvoice(invoiceId)` | NEW (Phase 2) | upserts `xero_invoice`; on PAID + deposit type + linked order, calls existing `mark-deposit-paid` (preserves gate semantics) |
| `GET /api/admin/margins/drop/:lifecycleId` | NEW (Phase 2) | summed view from `cost_ledger`, 60s cache |
| `GET /api/admin/margins/club/:id` | NEW (Phase 1) | sum cost_ledger by club_account_id; reconciles ±$1 with existing `summarizeSupporterOrders` |

### 4.5 Risk engine

| route | NEW/EXTEND | trigger | idempotency | failure |
|---|---|---|---|---|
| internal `evaluateAllRules()` | NEW (Phase 1) | cron `0 9 * * *` (09:00 NZT, post-quiet-hours) + manual `POST /api/admin/risks/evaluate` | per-rule + subject UNIQUE partial idx where state='open'; bumps `last_seen_at` | each rule wrapped in `tracked()`; engine continues past per-rule failures |
| `GET /api/admin/risks` | NEW (Phase 1) | dashboard | query: state, severity, since |
| `POST /api/admin/risks/:id/ack` | NEW (Phase 1) | UI / Telegram callback | sets state=acked |
| `POST /api/admin/risks/:id/snooze` | NEW (Phase 1) | UI / Telegram callback (`?d=3`) | sets snoozed_until |

### 4.6 GHL — additive

| route | NEW/EXTEND | notes |
|---|---|---|
| internal `evaluateLeadAging()` | NEW (Phase 1) | walks GHL opportunities in OPEN_STAGES, computes time-in-stage from existing `orderActivity.action='pipeline_stage_changed'` rows. Emits R-LEAD-STAGE-AGE. |
| `POST /api/ghl/webhook/contact-tag` | NEW (Phase 3) | lead conversion telemetry | event_inbox |

### 4.7 Shopify — additive

| route | NEW/EXTEND | notes |
|---|---|---|
| `POST /api/shopify/webhook` | NEW (Phase 2) | subscribe: `orders/create`, `orders/paid`, `orders/fulfilled`, `collections/update`, `products/create`. Verifies `X-Shopify-Hmac-Sha256` against `SHOPIFY_WEBHOOK_SECRET`. Writes event_inbox. Invalidates `shopify-admin.ts:136-139` cache. |
| `orders/create` handler | NEW (Phase 2) | check tags include `club:<slug>` matching a known club; if missing, emit R-TAG-MISSING-ON-NEW-ORDER (severity high). |
| internal `pollCollectionCutoffs()` | NEW (Phase 1) | for-each club, reads `descriptionHtml`, runs parser, updates `drop_lifecycle.cutoff_at`. On cutoff passed + no sample, fires `buildPoFromClosedDrop`. |

---

## 5. Risk-detection rule catalogue

17 rules. Each row: signal, query basis, threshold, severity, channel, auto-mitigation.

Quiet hours: 19:00–07:00 NZT + weekends. Only `urgent` severity bypasses.

| # | rule_id | signal | query basis | threshold | severity | channel | auto-mitigation |
|---|---|---|---|---|---|---|---|
| 1 | R-DROP-STALLED-NO-ORDERS | Live drop with no new Shopify orders | `fetchSupporterOrdersByTag` + createdAt filter | 4 days since `drop_live` AND zero orders in 48h | warn | dashboard + Friday digest | none |
| 2 | R-DROP-CUTOFF-PASSED-NO-PO | Cutoff passed but PO build hasn't fired | `drop_lifecycle.cutoff_at < now() - 6h` AND stage=`drop_live` AND no sample_order_id | n/a | **high** | Telegram (cron failure indicator) | invoke `buildPoFromClosedDrop` directly |
| 3 | R-DROP-NEVER-PUBLISHED | club has `supporterCollectionHandle` but never went published | poll state | 3 days after handoff status=`shopify_created` | warn | dashboard | none |
| 4 | R-PO-HELD-NO-REASON | `poHeldAt IS NOT NULL` AND `poHoldReason IS NULL` | orders | immediate | info | dashboard | none — already auto-prompted |
| 5 | R-PO-NO-ACK-2D | PO dispatched, no supplier ack | join supplier_acknowledgment on order_id | `now() - poDispatchedAt > 2 BD` AND no ack/sample_ready/shipped row AND `po_negotiation_hold=false` | high | Telegram + Gmail draft | invoke supplier-followups to create ack-chase draft (Usman at Puffin) |
| 6 | R-PO-DUE-SOON-NO-SHIP | PO due ≤ 7 days, no `shipped` ack | supplier_acknowledgment + `dueDate` | 7 days AND `po_negotiation_hold=false` | high | Telegram + email | create status-chase draft |
| 7 | R-PO-OVERDUE | PO past `dueDate`, not delivered | as above | 0 days AND `po_negotiation_hold=false` | **urgent** | Telegram (bypasses quiet hours) | create escalation draft + flag drop_lifecycle |
| 8 | R-SAMPLE-NOT-APPROVED-7D | Sample PO dispatched > 7d, no `sampleApprovedByClientAt` | orders | 7 days | warn | dashboard + Friday digest | none |
| 9 | R-DEPOSIT-OVERDUE | Sample approved, `depositPaidAt` null > 5d | orders + xero_invoice (Phase 2) | 5 days post sample approval AND `po_negotiation_hold=false` | high | email Romero | optional Phase 2: Resend reminder |
| 10 | R-DESIGN-AWAIT-APPROVAL | `designStatus=pending_review` > 3d | `orderActivity` for transition timestamp | 3 days | warn | dashboard | re-send mockup link via existing `/send-for-approval` (`admin.ts:2567`) |
| 11 | R-INTEGRATION-ERRORS-SPIKE | `integration_events.status='failed'` clustering | rolling 1h count by system | ≥5 failures/system/1h | high | Telegram | none — diagnostic |
| 12 | R-SHOPIFY-NO-INVENTORY | Published supporter product with `tracked=true` and qty=0 | Shopify GraphQL nightly poll | 0 | high | Telegram | none |
| 13 | R-XERO-INVOICE-OVERDUE | xero_invoice AUTHORISED + due_date<today, not paid | xero_invoice | 0 days | high | email Romero | none |
| 14 | R-GHL-LEAD-STALE | `Lead Received` > 5 BD | orderActivity stage history | 5 BD | warn | Friday digest | none |
| 15 | R-GHL-MOCKUP-STALE | `Mockup Sent` > 7d, no advance | as above | 7 days | warn | Friday digest | optional Phase 3: re-engagement draft |
| 16 | R-CLUB-NO-UPCOMING-DROP | Active club > 30d, no handoff/lifecycle in 60d | clubs ↔ drop_lifecycle | 60 days | info | monthly summary | none |
| 17 | **R-TAG-MISSING-ON-NEW-ORDER** | Shopify order arrives without expected `club:<slug>` tag (Shopify Flow rule failure) | `/api/shopify/webhook` `orders/create` handler (Phase 2) OR nightly diff of recent orders vs. tagged orders (Phase 1) | any unmatched order with supporter SKU | **urgent** | Telegram immediate | none — manual Flow rule re-enable required |

### Severity routing

- `urgent` → Telegram immediate, any time.
- `high` → Telegram during 07:00–19:00 NZT, else email queue for 09:00.
- `warn` → daily 09:00 digest + dashboard card.
- `info` → dashboard card only.

---

## 6. Phased roadmap

### Phase 1 — MVP foundation (1–2 weeks, in-budget)

**Deliverables:**

1. **Schema** — migrations for `event_inbox`, `risk_signal`, `cost_ledger`, `supplier_acknowledgment`, `drop_lifecycle`. Plus `orders` extensions (negotiation hold) and `suppliers` extensions (pricing/ops contact split).
2. **In-app scheduler + cutoff parser** — `node-cron` in `server/index.ts` running two jobs: `check-collection-cutoffs` (every 10 min) and `evaluate-all-rules` (daily 09:00 NZT). Includes `parseCutoffFromDescriptionHtml(html)` with fallback to `drop_lifecycle.cutoff_at` manual value. Manual override at `POST /api/admin/drops/:id/close`.
3. **Risk engine** — skeleton + 7 rules: R-DROP-CUTOFF-PASSED-NO-PO, R-PO-HELD-NO-REASON, R-PO-NO-ACK-2D, R-PO-OVERDUE, R-DESIGN-AWAIT-APPROVAL, R-INTEGRATION-ERRORS-SPIKE, R-TAG-MISSING-ON-NEW-ORDER (Phase 1 variant using nightly diff against tagged set).
4. **Supplier follow-ups → in-app** — move `scripts/po-supplier-followups.ts` to `server/jobs/supplier-followups.ts`. Writes `supplier_acknowledgment` rows (typed) instead of ad-hoc `orderActivity`. Routes Gmail drafts by ack-kind: pricing → Ali (`info@`), ops → Usman (`usman@`), CC Abdullah.
5. **Telegram alert dispatch** — reuse `sendTelegramCard`. Cards include Ack/Snooze buttons → new `/api/admin/risks/:id/ack` + `/snooze` callbacks. Same pattern as existing `/po-decision`.
6. **Cost ledger write hook** — `dispatchPoToSupplier` (`admin.ts:1857-2038`) gains a `tracked()` write of `cost_ledger` `supplier_cost` rows on successful dispatch. Source: items × `getShopifyCost(product)`.
7. **Margins read endpoint** — `GET /api/admin/margins/club/:id` sums `cost_ledger` by `club_account_id`. Reconciles within ±$1 of `summarizeSupporterOrders`.

**Acceptance criteria:**
- A held PO with null reason surfaces a risk_signal within 24h.
- A live drop with zero orders 4+ days fires a warn-level signal at next 9am digest.
- Cutoff parser correctly extracts dates for 3 historical Onewhero drops (golden set).
- A PO with `po_negotiation_hold=true` produces ZERO risk_signal rows for suppressed rules over a 7-day eval window.
- Closed-drop builder fires from in-app cron (not external mission-control); Telegram approval card lands as before.
- Per-club margin reconciles ±$1 with existing `summarizeSupporterOrders`.
- A Gmail draft from R-PO-NO-ACK-2D on a Puffin PO is addressed to Usman, not Ali.

### Phase 2 — closing loops (2–3 weeks)

**Deliverables:**

1. `design_handoff` table + UI at `/admin/drops/new`. New `server/shopify-products.ts` adds `productCreate`, `productVariantsBulkCreate`, `collectionAddProducts`, `publishablePublish`.
2. Shopify inbound webhooks (`POST /api/shopify/webhook`) with HMAC verification. Subscribe `collections/update` → triggers `buildPoFromClosedDrop` on cutoff intersect. `orders/paid` → `cost_ledger` revenue rows. `orders/create` → live R-TAG-MISSING enforcement.
3. `xero_invoice` table + `POST /api/xero/webhook` (OAuth setup required — see Open Q #4). On `Invoice.PAID` for deposit, sets `orders.depositPaidAt` (preserves existing gate).
4. Remaining 10 risk rules from §5.
5. `/admin/risks` and `/admin/margins` dashboard tabs (React, in existing admin shell).
6. Magic-link supplier ack endpoint + dispatch-email template change.
7. Lifecycle advancement to `delivered | invoiced | paid` via Xero webhook.

**Acceptance criteria:**
- Romero presses "Publish Drop" once → Shopify products appear tagged `club:<slug>`.
- Xero invoice marked PAID flips `depositPaidAt` within 60s and auto-fires bulk PO.
- Per-drop margin shows revenue − supplier cost − fees.
- Closed-drop trigger is event-driven; poll is fallback.

### Phase 3 — predictive / AI layer (cost-contingent, may exceed $25K — pause for individual scoping)

1. Gemini lead scoring on mockup_request + GHL opportunities.
2. Ezra tool additions: `get_drop_lifecycle`, `get_open_risks`, `get_margin_for_drop`, `acknowledge_risk`.
3. Canva Connect API integration (replaces "Publish Drop" button) — subject to Canva dev account approval.
4. Predictive risk: time-series on stage-entered_at → "lead's conversion ETA past expected."
5. OpenAI provider added to `server/ai/providers/`; Hermes-style fallback Gemini → OpenAI → Claude.
6. Weekly summary digest Friday 17:00 (pre-19:00 NZT family time).

**Phase 3 callout — $25K threshold:** Canva Connect + OpenAI fallback + predictive model risk crossing $25K. Pause and scope each item individually before commencing.

---

## 7. Open questions

1. **Canva trigger model.** Manual "Publish Drop" button (Phase 2) vs. Canva Connect webhook (Phase 3) vs. Drive folder watcher. Pick one before Phase 3.
2. **Cost-of-goods source of truth.** Hardcoded `PUFFIN_COSTS_USD_TIER1` (`product-catalog.ts:36+`) — keep code-resident or move to `supplier_price_list` table editable from UI?
3. **Dashboard placement.** New `/admin/risks` + `/admin/margins` tabs in existing admin shell (recommended) vs. separate Mission Control surface.
4. **Xero credentials at runtime.** Need OAuth client + redirect URI on `sidelinenz.com` before Phase 2.
5. **Quiet hours boundary.** 19:00 NZT + weekends. Is `urgent` the only exception or per-rule override?
6. **Risk-signal retention.** Resolved rows forever, or prune after 90 days?
7. **Profit-share payout flow.** `profitShareTierBps` exists per club. Auto-create Xero bill on drop close, or stay informational?
8. **Supplier ack magic-link auth.** JWT in URL (recommended, matches `approvalTokens` pattern at `schema.ts:597-608`) vs. one-time tokens in a new `supplier_ack_tokens` table.
9. **Cutoff date format.** Canonical regex for cutoff in `descriptionHtml`. Mission-control likely already has a parser — can the regex be shared via a constants module?
10. **Negotiation hold vs. operational hold.** Keep distinct (recommended) or unify under `poHeldAt` + `reason_kind` enum?

---

## 8. Validation appendix

### Audit verification (2026-05-13)
44 file:line claims checked: **42 confirmed, 2 partial (low-severity line drift), 0 refuted, 0 unfindable.** Audit is sound foundation for build.

### Drop walkthrough (2026-05-13)
33-stage canonical drop traced. Key findings:
- **True gaps fixed in v1.2:** Shopify Flow tag dependency now documented (§1j) + risk rule R-TAG-MISSING-ON-NEW-ORDER added (#17).
- **Cutoff parser:** No existing parser in repo — Phase 1 must write it from scratch, not extend.
- **Drop lifecycle closure:** Phase 1 stops at `bulk_dispatched`; Xero webhook (Phase 2) advances to `paid`. Manual override at `POST /api/admin/drops/:id/close`.
- **Existing load-bearing code:** `matchSupporterProduct`, `extractSizeFromVariant`, `ensureBulkPoFromSample`, `dispatchPoToSupplier`, `buildPoFromClosedDrop`. Extend; do not replace.
- **Bottleneck clusters (correctly left manual):** Brief → design approval (stages 3-6), supplier production/shipping (17-19, 25-28), Xero invoicing/payout (29-32). Risk engine *tracks* these; automation is out of scope.

### Critical files (entry points for implementation)

- `server/routes/admin.ts` — every new admin endpoint and cron hook attaches here.
- `shared/schema.ts` — all 5 Phase 1 tables + `orders`/`suppliers` extensions land here.
- `server/shopify-admin.ts` — Phase 2 extends with productCreate, productVariantsBulkCreate, collectionAddProducts, publishablePublish, Shopify webhook HMAC verifier.
- `server/index.ts` — adds `node-cron` scheduler and registers Shopify/Xero webhook routers (raw body required for HMAC).
- `server/integration-events.ts` — `tracked()` is the audit substrate the risk engine reads from.
