// Weekly content sprint orchestrator.
//
// One command, full Monday-AM production sprint. For every active club:
//   1. Pulls live order data to classify week-type (A/B/C/D).
//   2. Runs the right downstream pipelines for that week-type.
//   3. Saves all outputs (JSON) into a dated folder.
//   4. Writes a README.md summary index across all clubs.
//
// Week-type detection (heuristic, based on Shopify order activity):
//   A — Drop launching      First order in last 7 days. Orders are landing right now.
//   B — Drop mid-flight     Has orders, first order 7–21 days ago.
//   C — Drop closing/closed First order >21 days ago, OR supporterDropClosedAt in last 14 days.
//   D — No live drop        No orders in last 30 days.
//
// Pipelines triggered per week-type:
//   A → drop-launch-pack.ts
//   B → mid-drop-push.ts
//   C → public-case-study.ts
//   D → (skip — VA generates evergreen / outbound content from copy packs)
//
// Always:
//   • stage-tagger.ts runs once at the start (captured to _stage-snapshot.txt)
//   • stage-transition-email.ts runs for every club at stage:2-eligible
//
// Safe: read-only. Calls existing scripts (which are also read-only).
//
// Usage:
//   npx tsx scripts/weekly-content-sprint.ts
//   npx tsx scripts/weekly-content-sprint.ts --output ~/Drive/sideline-content
//   npx tsx scripts/weekly-content-sprint.ts --only-tag club:kbhs-rugby
//   npx tsx scripts/weekly-content-sprint.ts --transcript ~/Drive/sideline-content-raw/W20/transcript.txt

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { db } from "../server/db";
import { clubAccounts, type ClubAccount } from "../shared/schema";
import { isNotNull } from "drizzle-orm";
import {
  fetchSupporterOrdersByTag,
  isShopifyAdminConfigured,
  type SupporterOrder,
} from "../server/shopify-admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPTS_DIR = __dirname;
const REPO_ROOT = path.join(__dirname, "..");

type WeekType = "A-launching" | "B-mid" | "C-closing" | "D-quiet";

interface ClubPlan {
  club: ClubAccount;
  weekType: WeekType;
  orderCount30d: number;
  daysSinceFirstOrder: number | null;
  daysSinceLastOrder: number | null;
  dropClosedRecently: boolean;
  stageTransitionEligible: boolean;
}

interface SprintArgs {
  outputDir: string;
  onlyTag?: string;
  transcriptPath?: string;
}

function parseArgs(): SprintArgs {
  const argv = process.argv.slice(2);
  let outputDir: string | undefined;
  let onlyTag: string | undefined;
  let transcriptPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--output") outputDir = argv[++i];
    else if (argv[i] === "--only-tag") onlyTag = argv[++i];
    else if (argv[i] === "--transcript") transcriptPath = argv[++i];
  }

  // Default output: ~/Desktop/sideline-content-sprint-YYYY-W<NN>/
  const { isoYear, isoWeek } = isoWeekParts(new Date());
  const defaultDir = path.join(
    process.env.HOME || "~",
    "Desktop",
    `sideline-content-sprint-${isoYear}-W${String(isoWeek).padStart(2, "0")}`,
  );

  return {
    outputDir: outputDir ? outputDir.replace(/^~/, process.env.HOME || "~") : defaultDir,
    onlyTag,
    transcriptPath: transcriptPath?.replace(/^~/, process.env.HOME || "~"),
  };
}

// ISO 8601 week number (Mon-start). Returns { isoYear, isoWeek }.
function isoWeekParts(d: Date): { isoYear: number; isoWeek: number } {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const isoWeek = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return { isoYear: target.getUTCFullYear(), isoWeek };
}

function daysAgo(iso: string): number {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function countDropMonths(orders: SupporterOrder[]): number {
  const months = new Set<string>();
  for (const o of orders) {
    const d = new Date(o.createdAt);
    if (Number.isFinite(d.getTime())) months.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months.size;
}

function classify(club: ClubAccount, all: SupporterOrder[]): ClubPlan {
  const last30 = all.filter((o) => daysAgo(o.createdAt) <= 30);
  const last7 = all.filter((o) => daysAgo(o.createdAt) <= 7);
  const last21 = all.filter((o) => daysAgo(o.createdAt) <= 21);

  // Order direction: fetched DESC by createdAt
  const daysSinceLastOrder = last30.length ? daysAgo(last30[0].createdAt) : null;
  const daysSinceFirstOrder = last30.length ? daysAgo(last30[last30.length - 1].createdAt) : null;

  const dropClosedRecently =
    !!club.supporterDropClosedAt && daysAgo(club.supporterDropClosedAt.toISOString()) <= 14;

  let weekType: WeekType;
  if (dropClosedRecently) {
    weekType = "C-closing";
  } else if (last30.length === 0) {
    weekType = "D-quiet";
  } else if (last7.length > 0 && (daysSinceFirstOrder ?? 0) <= 7) {
    weekType = "A-launching";
  } else if (last21.length > 0 && (daysSinceFirstOrder ?? 0) > 7) {
    weekType = "B-mid";
  } else {
    weekType = "C-closing";
  }

  const stageTransitionEligible = countDropMonths(all) >= 3;

  return {
    club,
    weekType,
    orderCount30d: last30.length,
    daysSinceFirstOrder,
    daysSinceLastOrder,
    dropClosedRecently,
    stageTransitionEligible,
  };
}

function slugFromTag(tag: string): string {
  return tag.replace(/^club:/, "").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

function runScript(name: string, args: string[]): { ok: boolean; output: string } {
  const cmd = `npx tsx scripts/${name} ${args.join(" ")}`;
  try {
    const output = execSync(cmd, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { ok: true, output };
  } catch (err: any) {
    const stdout = err?.stdout?.toString?.() || "";
    const stderr = err?.stderr?.toString?.() || err?.message || String(err);
    return { ok: false, output: stdout + "\n--- STDERR ---\n" + stderr };
  }
}

function mkdirp(p: string) { fs.mkdirSync(p, { recursive: true }); }

async function main() {
  if (!isShopifyAdminConfigured()) {
    console.error("[weekly-content-sprint] ✕ Shopify Admin not configured."); process.exit(1);
  }
  const args = parseArgs();
  mkdirp(args.outputDir);

  const { isoYear, isoWeek } = isoWeekParts(new Date());
  const weekLabel = `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;

  console.log(`\n┌─────────────────────────────────────────────────────────────────────┐`);
  console.log(`│  SIDELINE NZ — WEEKLY CONTENT SPRINT — ${weekLabel.padEnd(28)} │`);
  console.log(`│  Output: ${args.outputDir.padEnd(57)} │`);
  console.log(`└─────────────────────────────────────────────────────────────────────┘\n`);

  // 1. Stage tagger snapshot
  console.log("[1/4] Running stage-tagger (snapshot)...");
  const stage = runScript("stage-tagger.ts", ["--verbose"]);
  fs.writeFileSync(path.join(args.outputDir, "_stage-snapshot.txt"), stage.output);
  if (!stage.ok) console.warn(`  ⚠ Stage tagger errored (output captured anyway).`);
  console.log(`  ✓ Snapshot saved to ${path.join(args.outputDir, "_stage-snapshot.txt")}\n`);

  // 1b. Voice-note amplifier (R1 input)
  let voiceNoteFile: string | undefined;
  if (args.transcriptPath) {
    console.log("[1b/4] Running voice-note-amplifier (R1 → LinkedIn + Beehiiv + IG + quote cards)...");
    if (!fs.existsSync(args.transcriptPath)) {
      console.warn(`  ⚠ Transcript not found: ${args.transcriptPath}. Skipping.`);
    } else {
      voiceNoteFile = path.join(args.outputDir, "_voice-note-amplified.json");
      const vn = runScript("voice-note-amplifier.ts", [
        "--transcript", args.transcriptPath,
        "--all-clubs",
        "--save", voiceNoteFile,
      ]);
      if (!vn.ok) {
        console.warn(`  ⚠ Voice-note amplifier failed (log inline).`);
        fs.writeFileSync(path.join(args.outputDir, "_voice-note-error.txt"), vn.output);
        voiceNoteFile = undefined;
      } else {
        console.log(`  ✓ Amplified output: ${voiceNoteFile}\n`);
      }
    }
  } else {
    console.log("[1b/4] No --transcript provided. Skipping voice-note amplifier.\n");
  }

  // 2. Classify every club
  console.log("[2/4] Classifying clubs by week-type...");
  const clubs = await db.select().from(clubAccounts).where(isNotNull(clubAccounts.shopifyOrderTag));
  const plans: ClubPlan[] = [];
  for (const club of clubs) {
    if (args.onlyTag && club.shopifyOrderTag !== args.onlyTag) continue;
    if (!club.shopifyOrderTag) continue;
    try {
      const orders = await fetchSupporterOrdersByTag(club.shopifyOrderTag);
      plans.push(classify(club, orders));
    } catch (err: any) {
      console.warn(`  ⚠ ${club.clubName}: Shopify fetch failed (${err?.message || err})`);
    }
  }

  const groupedByType: Record<WeekType, ClubPlan[]> = {
    "A-launching": [], "B-mid": [], "C-closing": [], "D-quiet": [],
  };
  for (const p of plans) groupedByType[p.weekType].push(p);

  console.log(`  ${plans.length} clubs classified:`);
  console.log(`    A-launching: ${groupedByType["A-launching"].length}`);
  console.log(`    B-mid:       ${groupedByType["B-mid"].length}`);
  console.log(`    C-closing:   ${groupedByType["C-closing"].length}`);
  console.log(`    D-quiet:     ${groupedByType["D-quiet"].length}`);
  const eligibleCount = plans.filter((p) => p.stageTransitionEligible).length;
  console.log(`    stage:2-eligible (transition email): ${eligibleCount}\n`);

  // 3. Run pipelines per club
  console.log("[3/4] Running per-club pipelines...\n");
  type PipelineRun = { club: string; tag: string; pipeline: string; ok: boolean; outputFile?: string };
  const runs: PipelineRun[] = [];

  for (const plan of plans) {
    const tag = plan.club.shopifyOrderTag!;
    const slug = slugFromTag(tag);
    const clubDir = path.join(args.outputDir, slug);
    mkdirp(clubDir);

    let pipelineScript: string | null = null;
    let pipelineLabel = "";
    switch (plan.weekType) {
      case "A-launching":
        pipelineScript = "drop-launch-pack.ts";
        pipelineLabel = "drop launch pack";
        break;
      case "B-mid":
        pipelineScript = "mid-drop-push.ts";
        pipelineLabel = "mid-drop push";
        break;
      case "C-closing":
        pipelineScript = "public-case-study.ts";
        pipelineLabel = "public case study";
        break;
      case "D-quiet":
        console.log(`  ⊘ ${plan.club.clubName} (D-quiet) — skipped (use evergreen content)`);
        runs.push({ club: plan.club.clubName, tag, pipeline: "(skipped, D-quiet)", ok: true });
        continue;
    }

    const outFile = path.join(clubDir, pipelineScript!.replace(".ts", ".json"));
    console.log(`  → ${plan.club.clubName} (${plan.weekType}) — ${pipelineLabel}`);
    const r = runScript(pipelineScript!, ["--tag", tag, "--save", outFile]);
    runs.push({ club: plan.club.clubName, tag, pipeline: pipelineLabel, ok: r.ok, outputFile: r.ok ? outFile : undefined });
    if (!r.ok) {
      fs.writeFileSync(path.join(clubDir, "_error.txt"), r.output);
      console.warn(`    ⚠ failed — log at ${path.join(clubDir, "_error.txt")}`);
    } else {
      console.log(`    ✓ saved`);
    }

    // Stage transition email for eligible clubs
    if (plan.stageTransitionEligible) {
      const teFile = path.join(clubDir, "stage-transition-email.json");
      console.log(`    → also: stage 1→2 transition email`);
      const te = runScript("stage-transition-email.ts", ["--tag", tag, "--save", teFile]);
      runs.push({ club: plan.club.clubName, tag, pipeline: "stage 1→2 email", ok: te.ok, outputFile: te.ok ? teFile : undefined });
      if (!te.ok) {
        fs.writeFileSync(path.join(clubDir, "_transition-error.txt"), te.output);
      }
    }
  }

  // 4. Summary README
  console.log("\n[4/4] Building summary README...");
  const readme = buildReadme(weekLabel, args.outputDir, plans, runs, voiceNoteFile);
  fs.writeFileSync(path.join(args.outputDir, "README.md"), readme);

  console.log(`\n┌─────────────────────────────────────────────────────────────────────┐`);
  console.log(`│  SPRINT COMPLETE                                                    │`);
  console.log(`└─────────────────────────────────────────────────────────────────────┘`);
  console.log(`\nIndex:   ${path.join(args.outputDir, "README.md")}`);
  console.log(`Outputs: ${args.outputDir}/`);
  console.log(`\n${runs.filter((r) => r.ok).length} pipelines succeeded, ${runs.filter((r) => !r.ok).length} failed.\n`);
}

function buildReadme(weekLabel: string, outputDir: string, plans: ClubPlan[], runs: any[], voiceNoteFile?: string): string {
  const lines: string[] = [];
  lines.push(`# Sideline NZ — Weekly Content Sprint — ${weekLabel}`);
  lines.push(``);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(``);
  if (voiceNoteFile) {
    lines.push(`## R1 — Founder voice-note amplified`);
    lines.push(``);
    lines.push(`Output: \`${path.relative(outputDir, voiceNoteFile)}\``);
    lines.push(``);
    lines.push(`Contains: LinkedIn post · Beehiiv newsletter (subject + preview + body) · Instagram caption · 3 quote-card briefs · extracted themes.`);
    lines.push(``);
  }
  lines.push(`## Week-type classification`);
  lines.push(``);
  lines.push(`| Club | Tag | Week-type | Orders (30d) | Last order | Stage 1→2 eligible |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const p of plans) {
    const lastOrder = p.daysSinceLastOrder === null ? "—" : `${p.daysSinceLastOrder}d ago`;
    lines.push(
      `| ${p.club.clubName} | ${p.club.shopifyOrderTag} | **${p.weekType}** | ${p.orderCount30d} | ${lastOrder} | ${p.stageTransitionEligible ? "✓" : "—"} |`,
    );
  }
  lines.push(``);
  lines.push(`## Pipeline runs`);
  lines.push(``);
  lines.push(`| Club | Pipeline | Result | Output |`);
  lines.push(`|---|---|---|---|`);
  for (const r of runs) {
    const result = r.ok ? "✓" : "✕";
    const file = r.outputFile ? `\`${path.relative(outputDir, r.outputFile)}\`` : "—";
    lines.push(`| ${r.club} | ${r.pipeline} | ${result} | ${file} |`);
  }
  lines.push(``);
  lines.push(`## How to use this folder`);
  lines.push(``);
  lines.push(`1. Open each per-club JSON to see all generated copy + image briefs.`);
  lines.push(`2. Paste the IG/FB/LinkedIn captions into your scheduling tool (Buffer/Metricool).`);
  lines.push(`3. Brief the Canva templates from the image briefs.`);
  lines.push(`4. Send the WhatsApp blurbs to club managers.`);
  lines.push(`5. For Stage 1→2 emails: review the draft, paste into GHL/Gmail, edit, send.`);
  lines.push(`6. \`_stage-snapshot.txt\` — full per-club funnel-stage classification at the start of the sprint.`);
  lines.push(``);
  lines.push(`Re-run any individual pipeline by:`);
  lines.push(`\`\`\``);
  lines.push(`cd ~/Projects/sideline-nz`);
  lines.push(`npx tsx scripts/<pipeline-name>.ts --tag <club:slug>`);
  lines.push(`\`\`\``);
  return lines.join("\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[weekly-content-sprint] fatal:", err?.message || err);
    process.exit(1);
  });
