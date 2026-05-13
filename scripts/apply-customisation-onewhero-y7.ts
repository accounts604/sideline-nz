/**
 * Apply per-player customisations to the Onewhero Year 7s order
 * (SL-2026-OU7-001, id be19c8db-442c-44de-8fb1-e7ca4a21b075).
 *
 * Splits the existing aggregated size_breakdowns rows into per-unit rows so
 * each player has their own row with name + placement. Idempotent against
 * itself: re-running deletes the current breakdowns for the two items and
 * recreates them from the constants below.
 *
 * Default is dry-run. Pass --apply to actually mutate the DB.
 *
 *   npx tsx scripts/apply-customisation-onewhero-y7.ts           # dry-run
 *   npx tsx scripts/apply-customisation-onewhero-y7.ts --apply   # write
 */
import "dotenv/config";
import { db } from "../server/db";
import { orderSizeBreakdowns } from "../shared/schema";
import { eq } from "drizzle-orm";

const ORDER_ID = "be19c8db-442c-44de-8fb1-e7ca4a21b075";
const ZIP_HOODIE_ITEM_ID = "a5352a7f-4d4c-4e52-bb51-67cae056ef2a";
const SOFTSHELL_ITEM_ID = "245d6d90-a4b5-4d50-91d9-c4dea63c3932";
const PLACEMENT = "Back Below Number";

// 18 zip hoodie units: 15 named + 3 blank. Source = Romero's brief 2026-05-12.
const ZIP_HOODIE_ROWS: Array<{ size: string; playerName: string | null }> = [
  { size: "Y16", playerName: "Markham" },
  { size: "Y14", playerName: "Ross" },
  { size: "Y14", playerName: "Pips" },
  { size: "Y14", playerName: "Pillow" },
  { size: "Y14", playerName: "Muir" },
  { size: "Y14", playerName: "Dwen" },
  { size: "Y14", playerName: "Coulter" },
  { size: "Y14", playerName: "Jack Havord" },
  { size: "Y14", playerName: "Addenbrooke" },
  { size: "Y14", playerName: "Addenbrooke" },
  { size: "Y14", playerName: "Kiwa" },
  { size: "Y14", playerName: "Bagshaw" },
  { size: "Y14", playerName: "Baldwin" },
  { size: "Y12", playerName: "Muir" },
  { size: "Y8",  playerName: "Muir" },
  { size: "S",   playerName: "Gunny" },
  { size: "S",   playerName: "Verrall" },
  { size: "L",   playerName: "Jacob" },
  // Blanks
  { size: "M",   playerName: null },
  { size: "L",   playerName: null },
  { size: "XL",  playerName: null },
];

const SOFTSHELL_ROWS: Array<{ size: string; playerName: string | null }> = [
  { size: "XL",  playerName: "Manager" },
  { size: "3XL", playerName: "Coach" },
  { size: "2XL", playerName: "Coach" },
];

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`Mode: ${apply ? "APPLY (write)" : "DRY-RUN (read-only)"}`);
  console.log(`Order: ${ORDER_ID}`);
  console.log();

  // Show what we'd do
  const summary = [
    { item: "Zip Hoodie", id: ZIP_HOODIE_ITEM_ID, rows: ZIP_HOODIE_ROWS },
    { item: "Softshell Jacket", id: SOFTSHELL_ITEM_ID, rows: SOFTSHELL_ROWS },
  ];
  for (const s of summary) {
    console.log(`${s.item} (item id ${s.id.slice(0, 8)}):`);
    const existing = await db.select().from(orderSizeBreakdowns).where(eq(orderSizeBreakdowns.orderItemId, s.id));
    const existingTotal = existing.reduce((sum, r) => sum + r.quantity, 0);
    console.log(`  Existing breakdowns: ${existing.length} rows / ${existingTotal} units`);
    const named = s.rows.filter((r) => r.playerName).length;
    const blank = s.rows.filter((r) => !r.playerName).length;
    console.log(`  Will create: ${s.rows.length} rows (${named} named + ${blank} blank), placement="${PLACEMENT}"`);
  }
  console.log();

  if (!apply) {
    console.log("Dry-run complete. Re-run with --apply to write.");
    process.exit(0);
  }

  // APPLY MODE — delete existing breakdowns for the two items, then insert new
  for (const s of summary) {
    console.log(`Rewriting ${s.item}…`);
    await db.delete(orderSizeBreakdowns).where(eq(orderSizeBreakdowns.orderItemId, s.id));
    for (const r of s.rows) {
      await db.insert(orderSizeBreakdowns).values({
        orderId: ORDER_ID,
        orderItemId: s.id,
        size: r.size,
        quantity: 1,
        playerName: r.playerName,
        playerNumber: null,
        namePlacement: r.playerName ? PLACEMENT : null,
        notes: null,
      });
    }
    console.log(`  ${s.rows.length} rows inserted.`);
  }

  console.log();
  console.log("Done. Refresh the order detail page to see the per-player rows.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
