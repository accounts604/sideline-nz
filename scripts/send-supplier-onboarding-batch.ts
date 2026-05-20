/**
 * Send the supplier onboarding email to every active supplier.
 *
 * Usage:
 *   npx tsx scripts/send-supplier-onboarding-batch.ts           # dry-run (prints recipients)
 *   npx tsx scripts/send-supplier-onboarding-batch.ts --commit  # actually send
 *
 * Skips suppliers with no email on file. Prints a per-supplier result line so
 * you can spot anything that failed. No password is included in the email —
 * passwords go via WhatsApp/Telegram per the team's standing rule (see CLAUDE.md
 * and the admin "Reset password" modal on each supplier detail page).
 */
import "dotenv/config";
import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
import { sendSupplierOnboardingEmail } from "../server/email";

async function main() {
  const commit = process.argv.includes("--commit");
  const suppliers = await db.select().from(users).where(eq(users.role, "supplier"));
  const loginUrl = `${(process.env.SITE_URL || "https://sidelinenz.com").replace(/\/$/, "")}/supplier/login`;

  console.log(`Found ${suppliers.length} supplier user${suppliers.length === 1 ? "" : "s"}.`);
  console.log(`Login URL: ${loginUrl}`);
  console.log(`Mode: ${commit ? "LIVE — sending emails" : "DRY RUN — no emails sent"}`);
  console.log("");

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const s of suppliers) {
    const name = s.teamName || s.email || s.id;
    if (!s.email) {
      console.log(`  SKIP    ${name} — no email on file`);
      skipped++;
      continue;
    }
    if (!commit) {
      console.log(`  DRY     ${name} <${s.email}>${s.ccEmail ? ` (cc ${s.ccEmail})` : ""}`);
      continue;
    }
    try {
      const result = await sendSupplierOnboardingEmail({
        to: s.email,
        ccEmail: s.ccEmail || undefined,
        supplierName: s.teamName || s.email,
        loginUrl,
      });
      if (result.success) {
        console.log(`  OK      ${name} <${s.email}> [${result.messageId || "ok"}]`);
        sent++;
      } else {
        console.log(`  FAIL    ${name} <${s.email}> — see server logs`);
        failed++;
      }
    } catch (err: any) {
      console.log(`  ERROR   ${name} <${s.email}> — ${err?.message || err}`);
      failed++;
    }
  }

  console.log("");
  console.log(`Sent: ${sent} · Skipped: ${skipped} · Failed: ${failed}`);
  if (!commit) console.log("Re-run with --commit to actually send.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
