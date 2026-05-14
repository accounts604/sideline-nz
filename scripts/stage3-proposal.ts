// Stage 3 multi-year exclusive supplier proposal generator.
//
// Builds a DRAFT proposal for a Sideline NZ club that's earned the right
// to consider Stage 3. Outputs exec summary, relationship recap, 3-year
// projection, commercial offer (tier upgrade), RTS partner option, terms,
// next-steps, design brief, and review flags.
//
// This document is a DRAFT. Romero reviews every word before any version
// is sent. Script logs the review flags loudly.
//
// Safe: read-only.
//
// Usage:
//   npx tsx scripts/stage3-proposal.ts --tag club:kbhs-rugby
//   npx tsx scripts/stage3-proposal.ts --club-id <uuid> --years 3 --tier-upgrade 1000
//   npx tsx scripts/stage3-proposal.ts --tag club:onewhero-rfc --no-rts --save ~/Desktop/onewhero-stage3.json

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../server/db";
import { clubAccounts, type ClubAccount } from "../shared/schema";
import { eq } from "drizzle-orm";
import {
  fetchSupporterOrdersByTag,
  isShopifyAdminConfigured,
  type SupporterOrder,
} from "../server/shopify-admin";
import { getProvider } from "../server/ai/providers/select";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const argv = process.argv.slice(2);
  let tag: string | undefined; let clubId: string | undefined; let savePath: string | undefined;
  let years = 3; let tierUpgradeBps = 200; // default: 8% → 10%
  let includeRts = true;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tag") tag = argv[++i];
    else if (a === "--club-id") clubId = argv[++i];
    else if (a === "--save") savePath = argv[++i];
    else if (a === "--years") years = parseInt(argv[++i], 10) || 3;
    else if (a === "--tier-upgrade") tierUpgradeBps = parseInt(argv[++i], 10) || 200;
    else if (a === "--no-rts") includeRts = false;
  }
  if (!tag && !clubId) {
    console.error("Usage: stage3-proposal.ts (--tag <slug> | --club-id <uuid>) [--years 3] [--tier-upgrade 200] [--no-rts] [--save <path>]");
    process.exit(1);
  }
  return { tag, clubId, savePath, years, tierUpgradeBps, includeRts };
}

function loadSkill(name: string): string {
  const skillsDir = path.join(__dirname, "..", "server", "ai", "skills");
  const body = fs.readFileSync(path.join(skillsDir, `${name}.md`), "utf8");
  return body.replace(/^---\n[\s\S]*?\n---\n/, "");
}

function fmtMoney(cents: number, currency = "NZD"): string {
  const symbol = currency === "NZD" ? "$" : currency + " ";
  return symbol + (cents / 100).toLocaleString("en-NZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function countDropMonths(orders: SupporterOrder[]): number {
  const months = new Set<string>();
  for (const o of orders) {
    const d = new Date(o.createdAt);
    if (Number.isFinite(d.getTime())) months.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months.size;
}

async function loadClub(args: ReturnType<typeof parseArgs>): Promise<ClubAccount> {
  if (args.clubId) {
    const rows = await db.select().from(clubAccounts).where(eq(clubAccounts.id, args.clubId)).limit(1);
    if (!rows[0]) throw new Error(`No club_account for id=${args.clubId}`);
    return rows[0];
  }
  const rows = await db.select().from(clubAccounts).where(eq(clubAccounts.shopifyOrderTag, args.tag!)).limit(1);
  if (!rows[0]) throw new Error(`No club_account for tag=${args.tag}`);
  return rows[0];
}

const SCHEMA = {
  type: "object",
  properties: {
    exec_summary: { type: "string" },
    relationship_recap: { type: "array", items: { type: "string" } },
    year_1_projection: {
      type: "object",
      properties: {
        supporter_spend_estimate_nzd: { type: "number" },
        club_commission_estimate_nzd: { type: "number" },
        bulk_order_estimate_nzd: { type: "number" },
        narrative: { type: "string" },
      },
      required: ["supporter_spend_estimate_nzd", "club_commission_estimate_nzd", "bulk_order_estimate_nzd", "narrative"],
    },
    year_2_projection: {
      type: "object",
      properties: {
        supporter_spend_estimate_nzd: { type: "number" },
        club_commission_estimate_nzd: { type: "number" },
        bulk_order_estimate_nzd: { type: "number" },
        narrative: { type: "string" },
      },
      required: ["supporter_spend_estimate_nzd", "club_commission_estimate_nzd", "bulk_order_estimate_nzd", "narrative"],
    },
    year_3_projection: {
      type: "object",
      properties: {
        supporter_spend_estimate_nzd: { type: "number" },
        club_commission_estimate_nzd: { type: "number" },
        bulk_order_estimate_nzd: { type: "number" },
        narrative: { type: "string" },
      },
      required: ["supporter_spend_estimate_nzd", "club_commission_estimate_nzd", "bulk_order_estimate_nzd", "narrative"],
    },
    commercial_offer: {
      type: "object",
      properties: {
        preferred_supplier_rights: { type: "string" },
        commission_tier_upgrade_bps: { type: "number" },
        tier_upgrade_value_paragraph: { type: "string" },
        co_marketing_rights: { type: "string" },
        priority_production: { type: "string" },
        exclusivity_scope: { type: "string" },
      },
      required: ["preferred_supplier_rights", "commission_tier_upgrade_bps", "tier_upgrade_value_paragraph", "co_marketing_rights", "priority_production", "exclusivity_scope"],
    },
    rts_partner_option: { type: ["string", "null"] },
    terms_outline: {
      type: "object",
      properties: {
        duration_years: { type: "number" },
        review_cadence: { type: "string" },
        exit_clause: { type: "string" },
        material_breach_examples: { type: "array", items: { type: "string" } },
      },
      required: ["duration_years", "review_cadence", "exit_clause", "material_breach_examples"],
    },
    next_steps_30_60_90: {
      type: "object",
      properties: { day_30: { type: "string" }, day_60: { type: "string" }, day_90: { type: "string" } },
      required: ["day_30", "day_60", "day_90"],
    },
    proposal_pdf_design_brief: { type: "string" },
    draft_review_flags: { type: "array", items: { type: "string" } },
    reasoning: { type: "string" },
  },
  required: ["exec_summary", "relationship_recap", "year_1_projection", "year_2_projection", "year_3_projection", "commercial_offer", "terms_outline", "next_steps_30_60_90", "proposal_pdf_design_brief", "draft_review_flags", "reasoning"],
} as const;

async function main() {
  const args = parseArgs();
  if (!isShopifyAdminConfigured()) { console.error("[stage3-proposal] ✕ Shopify Admin not configured."); process.exit(1); }
  const club = await loadClub(args);
  if (!club.shopifyOrderTag) throw new Error(`${club.clubName} has no shopifyOrderTag.`);

  const orders = await fetchSupporterOrdersByTag(club.shopifyOrderTag);
  let spendCents = 0; let units = 0;
  for (const o of orders) { spendCents += o.totalCents; for (const l of o.lines) units += l.quantity; }
  const commissionCents = Math.round((spendCents * club.profitShareTierBps) / 10000);
  const currency = orders[0]?.currency || "NZD";
  const tierPct = (club.profitShareTierBps / 100).toFixed(0);
  const newTierBps = club.profitShareTierBps + args.tierUpgradeBps;
  const newTierPct = (newTierBps / 100).toFixed(0);
  const dropMonths = countDropMonths(orders);

  const userPrompt = [
    `Club name: ${club.clubName}`,
    `Current profit-share tier: ${tierPct}% (${club.profitShareTierBps} bps)`,
    `Proposed new tier at Stage 3: ${newTierPct}% (${newTierBps} bps) — uplift of ${args.tierUpgradeBps} bps`,
    `Proposal duration: ${args.years} years`,
    "",
    "Stage 1 performance to date — the receipts:",
    `- Distinct drop months: ${dropMonths}`,
    `- Total supporter orders: ${orders.length}`,
    `- Total units sold: ${units}`,
    `- Total supporter spend: ${fmtMoney(spendCents, currency)}`,
    `- Total commission to ${club.clubName} at ${tierPct}%: ${fmtMoney(commissionCents, currency)}`,
    `- Committee hours spent: 0`,
    "",
    `Include RTS partner option: ${args.includeRts ? "yes" : "no"}`,
    "",
    "Build the Stage 3 proposal per the system rules. Conservative growth (10–20% YoY). Show tier-upgrade value explicitly. Include exit clause. Mark anything for Romero's review in draft_review_flags. Return strict JSON only.",
  ].join("\n");

  const provider = getProvider();
  console.log(`[stage3-proposal] ${club.clubName} · ${orders.length} orders · ${fmtMoney(commissionCents, currency)} commission earned. Calling ${provider.name}...\n`);
  const res = await provider.complete({
    system: loadSkill("stage3-proposal"),
    user: userPrompt,
    jsonSchema: SCHEMA as any,
    temperature: 0.3,
    maxOutputTokens: 3500,
  });

  let pack: any;
  try { pack = JSON.parse(res.text); } catch { console.error("[stage3-proposal] ✕ Non-JSON:\n"); console.error(res.text); process.exit(1); }

  const hr = "━".repeat(72); const sub = "─".repeat(72);
  console.log("\n" + hr);
  console.log(`STAGE 3 EXCLUSIVE PROPOSAL — DRAFT — ${club.clubName}`);
  console.log(`Duration: ${args.years} years · Tier: ${tierPct}% → ${newTierPct}%`);
  console.log(hr);

  console.log("\n[ EXEC SUMMARY ]");
  console.log(sub); console.log(pack.exec_summary); console.log(sub);

  console.log("\n[ RELATIONSHIP RECAP ]");
  for (const r of pack.relationship_recap) console.log(`  • ${r}`);

  console.log("\n[ YEAR-BY-YEAR PROJECTION ]");
  for (const [label, y] of [["Year 1", pack.year_1_projection], ["Year 2", pack.year_2_projection], ["Year 3", pack.year_3_projection]] as const) {
    console.log(`\n  ${label}:`);
    console.log(`    Supporter spend est: $${y.supporter_spend_estimate_nzd.toLocaleString()}`);
    console.log(`    Club commission est: $${y.club_commission_estimate_nzd.toLocaleString()}`);
    console.log(`    Bulk order est:      $${y.bulk_order_estimate_nzd.toLocaleString()}`);
    console.log(`    Narrative: ${y.narrative}`);
  }

  console.log("\n[ COMMERCIAL OFFER ]");
  console.log(sub);
  console.log(`Preferred supplier rights: ${pack.commercial_offer.preferred_supplier_rights}`);
  console.log(`Commission tier upgrade:    +${pack.commercial_offer.commission_tier_upgrade_bps} bps`);
  console.log(`Tier-upgrade value:         ${pack.commercial_offer.tier_upgrade_value_paragraph}`);
  console.log(`Co-marketing:               ${pack.commercial_offer.co_marketing_rights}`);
  console.log(`Priority production:        ${pack.commercial_offer.priority_production}`);
  console.log(`Exclusivity scope:          ${pack.commercial_offer.exclusivity_scope}`);
  console.log(sub);

  if (pack.rts_partner_option) {
    console.log("\n[ RTS PARTNER OPTION — separate engagement ]");
    console.log(sub); console.log(pack.rts_partner_option); console.log(sub);
  }

  console.log("\n[ TERMS OUTLINE ]");
  console.log(`  Duration: ${pack.terms_outline.duration_years} years`);
  console.log(`  Review cadence: ${pack.terms_outline.review_cadence}`);
  console.log(`  Exit clause: ${pack.terms_outline.exit_clause}`);
  console.log(`  Material breach examples:`);
  for (const e of pack.terms_outline.material_breach_examples) console.log(`    • ${e}`);

  console.log("\n[ NEXT STEPS — 30 / 60 / 90 ]");
  console.log(`  Day 30: ${pack.next_steps_30_60_90.day_30}`);
  console.log(`  Day 60: ${pack.next_steps_30_60_90.day_60}`);
  console.log(`  Day 90: ${pack.next_steps_30_60_90.day_90}`);

  console.log("\n[ PROPOSAL PDF DESIGN BRIEF ]");
  console.log(sub); console.log(pack.proposal_pdf_design_brief); console.log(sub);

  console.log("\n⚠ DRAFT REVIEW FLAGS — Romero MUST review before sending:");
  for (const f of pack.draft_review_flags) console.log(`  ⚠ ${f}`);

  console.log("\nAI reasoning: " + pack.reasoning);
  console.log(hr + "\n");

  if (args.savePath) {
    const expanded = args.savePath.replace(/^~/, process.env.HOME || "~");
    fs.writeFileSync(expanded, JSON.stringify(pack, null, 2));
    console.log(`[stage3-proposal] Saved JSON to ${expanded}`);
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error("[stage3-proposal] fatal:", err?.message || err); process.exit(1); });
