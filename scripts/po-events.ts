import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  // Recent integration_events for supplier dispatch / follow-ups
  const events = await db.execute<any>(sql`
    SELECT system, action, status, created_at, order_id, error, meta
    FROM integration_events
    WHERE created_at > NOW() - INTERVAL '14 days'
      AND (system ILIKE '%gmail%' OR system ILIKE '%supplier%' OR action ILIKE '%po%' OR action ILIKE '%dispatch%' OR action ILIKE '%supplier%')
    ORDER BY created_at DESC
    LIMIT 30`);
  console.log(`Recent supplier/PO events (14d): ${(events as any).length}`);
  for (const e of events as any) {
    const meta = e.meta ? JSON.stringify(e.meta).slice(0, 120) : "—";
    console.log(`  ${new Date(e.created_at).toISOString().slice(0,16)} ${(e.system||"").padEnd(14)} ${(e.action||"").padEnd(28)} ${(e.status||"").padEnd(8)} ${e.order_id ?? "—"} :: ${meta}`);
  }

  // Per-order: most recent activity for each of the 4 processing orders
  const POs = ["PO-2026-0011","PO-2026-0006","PO-2026-0005","PO-2026-0004"];
  console.log(`\nLast event per order:`);
  for (const ref of POs) {
    const row = await db.execute<any>(sql`
      SELECT system, action, status, created_at FROM integration_events
      WHERE order_id IN (SELECT id FROM orders WHERE po_reference = ${ref})
      ORDER BY created_at DESC LIMIT 1`);
    const r = (row as any)[0];
    console.log(`  ${ref}: ${r ? `${new Date(r.created_at).toISOString().slice(0,16)} ${r.system}/${r.action}/${r.status}` : "(no events)"}`);
  }

  // Last order activity per processing PO
  console.log(`\nLast order_activity per order:`);
  for (const ref of POs) {
    const row = await db.execute<any>(sql`
      SELECT action, details, created_at FROM order_activity
      WHERE order_id = (SELECT id FROM orders WHERE po_reference = ${ref})
      ORDER BY created_at DESC LIMIT 1`);
    const r = (row as any)[0];
    console.log(`  ${ref}: ${r ? `${new Date(r.created_at).toISOString().slice(0,16)} ${r.action} — ${JSON.stringify(r.details || {}).slice(0,100)}` : "(no activity)"}`);
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
