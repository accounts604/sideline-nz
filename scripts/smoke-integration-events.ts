// Smoke: tracked() wraps a function that throws, tracked() wraps one that
// succeeds. Confirm both write rows. Clean up.

import "dotenv/config";
import { db } from "../server/db";
import { integrationEvents } from "../shared/schema";
import { tracked, logIntegrationEvent } from "../server/integration-events";
import { eq, like, and } from "drizzle-orm";

async function main() {
  const marker = `smoke-${Date.now()}`;

  // 1. tracked() success
  const okResult = await tracked(
    { system: "ghl", action: `${marker}:ok`, orderId: null },
    async () => { await new Promise(r => setTimeout(r, 40)); return 42; },
  );
  if (okResult !== 42) throw new Error("tracked success path lost the return value");
  console.log(`[smoke] success path returned ${okResult}`);

  // 2. tracked() failure
  const failResult = await tracked(
    { system: "drive", action: `${marker}:boom` },
    async () => { throw new Error("intentional boom"); },
  );
  if (failResult !== null) throw new Error("tracked failure path should return null");
  console.log(`[smoke] failure path returned ${failResult} (null = fire-and-forget preserved)`);

  // 3. logIntegrationEvent direct
  await logIntegrationEvent({
    system: "apiease",
    action: `${marker}:direct`,
    status: "failed",
    error: "direct-log-test",
    meta: { marker },
  });

  // Small wait for the async writes to land
  await new Promise(r => setTimeout(r, 200));

  // Verify rows
  const rows = await db.select().from(integrationEvents)
    .where(like(integrationEvents.action, `${marker}%`));
  console.log(`[smoke] found ${rows.length} rows for marker (expected 3)`);
  for (const r of rows) {
    console.log(`  ${r.system}.${r.action} → ${r.status}${r.durationMs != null ? ` (${r.durationMs}ms)` : ""}${r.error ? ` error="${r.error}"` : ""}`);
  }
  if (rows.length !== 3) throw new Error(`expected 3 rows, got ${rows.length}`);

  // Clean up
  await db.delete(integrationEvents).where(like(integrationEvents.action, `${marker}%`));
  console.log("[smoke] cleaned up test rows");

  console.log("[smoke] ✅ integration_events logging works end-to-end");
}

main().then(() => process.exit(0)).catch(e => { console.error("[smoke] ❌", e); process.exit(1); });
