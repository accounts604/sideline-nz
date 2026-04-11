/**
 * Sync GHL Sideline pipeline opportunities into local orders.
 *
 * Pulls every opportunity in the "Sideline - Merch Orders" pipeline
 * (bne386ArJCVV5iuUs86h), upserts each one into the orders table keyed by
 * ghlOpportunityId, and populates:
 *   - poReference        ← opportunity.name
 *   - customerName       ← contact.name or contact.companyName
 *   - customerEmail      ← contact.email
 *   - accountName        ← contact.companyName
 *   - pipelineStage      ← stage name (mirrored from GHL; portal never writes directly)
 *   - ghlOpportunityId   ← opportunity.id
 *   - orderNumber        ← generated SL-YYYY-[CLIENT]-[SEQ] if new row
 *   - storeSlug          ← "sideline-bulk" (placeholder; every order row needs one)
 *   - status             ← "processing" (GHL status.open maps here; closed deals get "delivered")
 *   - createdAt          ← opportunity.createdAt (preserved from GHL)
 *
 * Idempotent — safe to re-run. Existing rows get their stage/name/contact
 * info refreshed; new rows get a fresh PO number. Nothing is ever deleted.
 *
 * Usage:
 *   npx tsx scripts/sync-ghl-sideline.ts
 *
 * Env (required):
 *   SIDELINE_GHL_API_KEY     — bearer token for GHL
 *   SIDELINE_GHL_LOCATION_ID — location id
 *   DATABASE_URL             — prod DB
 *
 * Env (optional):
 *   GHL_SYNC_DRY_RUN=1       — print what would change without writing
 *   GHL_SYNC_OPEN_ONLY=1     — only import opportunities with status=open
 */
import "dotenv/config";
import { db } from "../server/db";
import { orders } from "../shared/schema";
import { eq } from "drizzle-orm";
import { SIDELINE_PIPELINE_ID, SIDELINE_STAGE_NAMES } from "../server/ghl-config";
import { buildPoNumber } from "../server/po-number";
import type { SidelinePipelineStage } from "../shared/pipeline";

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const API_KEY = process.env.SIDELINE_GHL_API_KEY;
const LOCATION_ID = process.env.SIDELINE_GHL_LOCATION_ID;
const DRY_RUN = process.env.GHL_SYNC_DRY_RUN === "1";
const OPEN_ONLY = process.env.GHL_SYNC_OPEN_ONLY === "1";

if (!API_KEY || !LOCATION_ID) {
  console.error("Missing SIDELINE_GHL_API_KEY or SIDELINE_GHL_LOCATION_ID");
  process.exit(1);
}

type GhlContact = {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
};

type GhlOpportunity = {
  id: string;
  name: string;
  monetaryValue?: number;
  pipelineId: string;
  pipelineStageId: string;
  status: "open" | "won" | "lost" | "abandoned";
  contactId?: string;
  contact?: GhlContact;
  createdAt?: string;
  updatedAt?: string;
};

type GhlSearchResponse = {
  opportunities: GhlOpportunity[];
  meta?: {
    total?: number;
    nextPageUrl?: string | null;
    startAfter?: number | null;
    startAfterId?: string | null;
  };
};

async function fetchAllOpportunities(): Promise<GhlOpportunity[]> {
  const all: GhlOpportunity[] = [];
  let startAfter: number | null = null;
  let startAfterId: string | null = null;
  let pageNum = 0;

  while (true) {
    pageNum++;
    const params = new URLSearchParams({
      location_id: LOCATION_ID!,
      pipeline_id: SIDELINE_PIPELINE_ID,
      limit: "100",
    });
    if (startAfter) params.set("startAfter", String(startAfter));
    if (startAfterId) params.set("startAfterId", startAfterId);

    const url = `${GHL_API_BASE}/opportunities/search?${params.toString()}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Version: "2021-07-28",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GHL API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as GhlSearchResponse;
    const batch = data.opportunities ?? [];
    console.log(`  page ${pageNum}: ${batch.length} opportunities`);
    all.push(...batch);

    // Pagination: GHL returns meta.startAfterId + meta.startAfter for the next page
    const next = data.meta ?? {};
    if (!next.startAfterId || batch.length === 0) break;
    startAfter = next.startAfter ?? null;
    startAfterId = next.startAfterId ?? null;

    // Safety valve
    if (pageNum >= 50) {
      console.warn("  hit 50-page safety cap — stopping");
      break;
    }
  }

  return all;
}

function resolveCustomerName(opp: GhlOpportunity): string | null {
  const c = opp.contact ?? {};
  if (c.name) return c.name;
  const first = c.firstName ?? "";
  const last = c.lastName ?? "";
  const full = `${first} ${last}`.trim();
  return full || c.companyName || null;
}

function resolveStage(stageId: string): SidelinePipelineStage | null {
  return SIDELINE_STAGE_NAMES[stageId] ?? null;
}

function mapGhlStatusToOrderStatus(s: GhlOpportunity["status"]): string {
  switch (s) {
    case "open":
      return "processing";
    case "won":
      return "delivered";
    case "lost":
    case "abandoned":
      return "cancelled";
    default:
      return "processing";
  }
}

async function upsertOpportunity(opp: GhlOpportunity): Promise<"created" | "updated" | "skipped"> {
  if (OPEN_ONLY && opp.status !== "open") return "skipped";

  const stageName = resolveStage(opp.pipelineStageId);
  if (!stageName) {
    console.warn(`  ⚠ Skipping ${opp.id} — unknown stage ${opp.pipelineStageId}`);
    return "skipped";
  }

  const customerName = resolveCustomerName(opp);
  const customerEmail = opp.contact?.email ?? null;
  const accountName = opp.contact?.companyName ?? null;
  const poReference = opp.name;
  const orderStatus = mapGhlStatusToOrderStatus(opp.status);
  const createdAt = opp.createdAt ? new Date(opp.createdAt) : new Date();
  const updatedAt = opp.updatedAt ? new Date(opp.updatedAt) : new Date();

  // Look up existing order keyed by ghlOpportunityId
  const [existing] = await db
    .select()
    .from(orders)
    .where(eq(orders.ghlOpportunityId, opp.id));

  if (existing) {
    if (DRY_RUN) {
      console.log(`  [dry] UPDATE ${existing.orderNumber} ← ${opp.name} (${stageName})`);
      return "updated";
    }
    await db
      .update(orders)
      .set({
        poReference,
        customerName: customerName ?? existing.customerName,
        customerEmail: customerEmail ?? existing.customerEmail,
        accountName: accountName ?? existing.accountName,
        pipelineStage: stageName,
        status: orderStatus,
        updatedAt,
      })
      .where(eq(orders.id, existing.id));
    return "updated";
  }

  // New row — generate a fresh PO number
  const clientForSlug = accountName || customerName || poReference;
  const orderNumber = await buildPoNumber(clientForSlug, createdAt);

  if (DRY_RUN) {
    console.log(`  [dry] INSERT ${orderNumber} ← ${opp.name} (${stageName}) [${clientForSlug}]`);
    return "created";
  }

  await db.insert(orders).values({
    orderNumber,
    storeSlug: "sideline-bulk",
    status: orderStatus,
    subtotal: 0,
    total: 0,
    currency: "nzd",
    customerName,
    customerEmail,
    poReference,
    accountName,
    ghlOpportunityId: opp.id,
    pipelineStage: stageName,
    createdAt,
    updatedAt,
  } as any);

  return "created";
}

async function main() {
  console.log(`\n== GHL → Sideline portal sync ==`);
  console.log(`   Pipeline: ${SIDELINE_PIPELINE_ID}`);
  console.log(`   DRY_RUN: ${DRY_RUN}`);
  console.log(`   OPEN_ONLY: ${OPEN_ONLY}\n`);

  console.log("Fetching opportunities from GHL...");
  const opps = await fetchAllOpportunities();
  console.log(`\nTotal opportunities fetched: ${opps.length}\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const byStage = new Map<string, number>();

  for (const opp of opps) {
    try {
      const stageName = resolveStage(opp.pipelineStageId) ?? "unknown";
      byStage.set(stageName, (byStage.get(stageName) ?? 0) + 1);
      const result = await upsertOpportunity(opp);
      if (result === "created") created++;
      else if (result === "updated") updated++;
      else skipped++;
    } catch (err: any) {
      failed++;
      console.error(`  ✗ ${opp.id} (${opp.name}):`, err.message || err);
    }
  }

  console.log(`\n== Stage breakdown ==`);
  const sorted = Array.from(byStage.entries()).sort((a, b) => b[1] - a[1]);
  for (const [stage, count] of sorted) {
    console.log(`  ${stage.padEnd(22)} ${count}`);
  }

  console.log(`\n== Sync summary ==`);
  console.log(`  Created:  ${created}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Total:    ${opps.length}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
