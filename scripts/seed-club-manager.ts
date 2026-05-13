/**
 * Seed a club manager account.
 *
 * Usage:
 *   npx tsx scripts/seed-club-manager.ts \
 *     --email manager@onewhero.co.nz \
 *     --club "Onewhero RFC" \
 *     --tag club:onewhero-rfc \
 *     [--store https://onewhero-rfc.myshopify.com] \
 *     [--tier 800] \
 *     [--password optional]
 *
 * Returns the created account + the initial password (printed once).
 * Share the password with the manager via WhatsApp/Telegram.
 */
import "dotenv/config";
import { db } from "../server/db";
import { clubAccounts } from "../shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

interface Args {
  email?: string;
  club?: string;
  tag?: string;
  store?: string;
  tier?: string;
  password?: string;
}

function parseArgs(): Args {
  const out: Args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith("--")) continue;
    const key = k.slice(2) as keyof Args;
    const v = argv[i + 1];
    if (v && !v.startsWith("--")) {
      out[key] = v;
      i++;
    }
  }
  return out;
}

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function main() {
  const args = parseArgs();
  if (!args.email || !args.club || !args.tag) {
    console.error("Usage: --email <email> --club <name> --tag <club:slug> [--store url] [--tier bps] [--password ...]");
    process.exit(1);
  }
  if (!/^[a-zA-Z0-9:_-]+$/.test(args.tag)) {
    console.error(`Invalid tag "${args.tag}" — alphanumerics, colon, dash, underscore only`);
    process.exit(1);
  }

  const [existing] = await db.select().from(clubAccounts).where(eq(clubAccounts.email, args.email));
  if (existing) {
    console.error(`Club account already exists for ${args.email} (id: ${existing.id})`);
    process.exit(1);
  }

  const password = args.password || generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);
  const tierBps = args.tier ? parseInt(args.tier, 10) : 800;

  const [created] = await db.insert(clubAccounts).values({
    email: args.email,
    clubName: args.club,
    passwordHash,
    shopifyOrderTag: args.tag,
    shopifyStoreUrl: args.store,
    profitShareTierBps: tierBps,
  }).returning();

  console.log("\n✓ Club manager created");
  console.log("  id:           ", created.id);
  console.log("  email:        ", created.email);
  console.log("  club:         ", created.clubName);
  console.log("  shopify tag:  ", created.shopifyOrderTag);
  console.log("  profit share: ", `${(tierBps / 100).toFixed(tierBps % 100 === 0 ? 0 : 1)}%`);
  console.log("\n  --- INITIAL PASSWORD (share via WhatsApp, then forget) ---");
  console.log(`  ${password}`);
  console.log("  ----------------------------------------------------------\n");
  console.log(`  Login URL: ${process.env.BASE_URL || "https://sidelinenz.com"}/club-portal/login`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
