// Backfill: group existing club_accounts (teams) under clubs by deriving the
// club/school name from the team name (strip team-suffix). DRY-RUN by default;
// pass --apply to write. Run AFTER migrations/clubs-teams.sql is applied.
import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
const R = (r: any) => (r && r.rows) ? r.rows : (Array.isArray(r) ? r : []);
const APPLY = process.argv.includes("--apply");
// Strip a trailing team descriptor to get the club/school name.
function clubNameOf(team: string): string {
  let n = team.replace(/[—-].*$/, "").trim(); // drop "— Premier Netball" style suffixes
  n = n.replace(/\b(senior|premier|reserve|colts?|under[\s-]?\d+|u\d+|div(ision)?\s*\d+|men'?s|women'?s|boys?|girls?|\d+s|a'?s|b'?s)\b.*$/i, "").trim();
  return n || team;
}
(async () => {
  const teams = R(await db.execute(sql`SELECT id, club_name, club_id FROM club_accounts ORDER BY club_name`)) as any[];
  const groups: Record<string, any[]> = {};
  for (const t of teams) { const c = clubNameOf(t.club_name); (groups[c] = groups[c] || []).push(t); }
  console.log(`${APPLY ? "APPLYING" : "DRY-RUN"} — ${teams.length} teams -> ${Object.keys(groups).length} clubs:\n`);
  for (const [club, ts] of Object.entries(groups)) {
    const kind = /college|school|grammar|academy|intermediate|primary/i.test(club) ? "school" : "club";
    console.log(`  ${club}  [${kind}]`);
    for (const t of ts) console.log(`      <- ${t.club_name}${t.club_id ? " (already linked)" : ""}`);
    if (APPLY) {
      const { storage } = await import("../server/storage");
      const c = await storage.ensureClub(club, kind);
      for (const t of ts) if (!t.club_id) await storage.linkTeamToClub(t.id, c.id);
    }
  }
  console.log(APPLY ? "\n✓ applied" : "\n(dry-run — re-run with --apply to write)");
})().then(() => process.exit(0)).catch((e) => { console.error("ERR:", e.message || e); process.exit(1); });
