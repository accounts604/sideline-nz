// One-shot — creates the two Gmail labels the customer-queue cron uses.
// Idempotent: getOrCreateGmailLabel returns the existing label id if found.
// Run: npx tsx scripts/setup-customer-queue-labels.ts
import "dotenv/config";
import { getOrCreateGmailLabel, isGmailConfigured } from "../server/gmail";

async function main() {
  if (!isGmailConfigured()) {
    console.error("Gmail not configured — set GOOGLE_REFRESH_TOKEN / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET");
    process.exit(1);
  }
  for (const name of ["sideline-auto-queue", "sideline-auto-handled"]) {
    const id = await getOrCreateGmailLabel(name);
    console.log(id ? `  ✓ ${name} → ${id}` : `  ✗ ${name} — failed`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
