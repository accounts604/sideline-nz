// accounts.ts — one place to see everyone with a way into Sideline, what each
// of them can see, and when they last looked.
//
// Four audiences on three different access models, which is exactly why this
// was hard to hold in your head before:
//   customers  — users(role=customer) login at /portal, club_accounts at /club-portal
//   designers  — NO login; a personal board token at /designers/<token>
//   suppliers  — users(role=supplier) login at /supplier, plus a no-login sheet
//   affiliates — do not exist yet
//
// Admin-only. Every row carries a `viewUrl`: the real surface that account
// sees, so it can be opened and checked rather than trusted.
import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { users, clubAccounts, designers, designerJobs, orders } from "@shared/schema";
import { requireAdmin } from "../auth";

const router = Router();
router.use(requireAdmin);

/** What each audience can and cannot see, and where that boundary is enforced. */
const SCOPES = {
  customer: {
    can: [
      "Their own orders only, with the prices they were quoted",
      "Design proofs, and approve or request changes",
      "Production stage, delivery date and the full tracking timeline",
      "Club managers: live supporter orders carrying their own club:<slug> tag",
    ],
    cannot: [
      "Any other customer or club — enforced in the server query, not the UI",
      "What Sideline pays the factory, or any margin",
      "Supplier identity, POs or supplier messages",
      "Designer briefs, pay or the board",
    ],
    where: "/portal for bulk orders, /club-portal for supporter campaigns. Isolation is shopify_order_tag, applied server-side and never taken from client input.",
  },
  designer: {
    can: [
      "The open board, and jobs they have claimed",
      "The brief, club colours, crest and reference photos",
      "The Sideline brand kit and the prompt pack",
      "Their own caps, on-time record and earnings",
    ],
    cannot: [
      "Any pricing, quotes, invoices or margin",
      "The customer's contact details",
      "Another designer's pay, or the total owed",
      "Orders, suppliers, or the admin portal",
    ],
    where: "/designers/<token> and /job/<token>. No login: the token is the credential, same model as the supplier sheet. Revoke by rotating it.",
  },
  supplier: {
    can: [
      "Only orders assigned to them, by assignedSupplierId",
      "Specs, size grids, artwork and logos",
      "Ship dates and the tracking fields they fill in",
    ],
    cannot: [
      "What the customer paid, or Sideline's margin — stripped in the query",
      "Another supplier's orders or prices",
      "Customer contact details",
      "Designer briefs or the board",
    ],
    where: "/supplier with a login, or /s/<token> with no login. Both strip pricing at the query, not in the page.",
  },
} as const;

router.get("/", async (_req, res) => {
  try {
    const [allUsers, clubs, designerRows, jobRows] = await Promise.all([
      db.select().from(users).orderBy(desc(users.createdAt)),
      db.select().from(clubAccounts).orderBy(desc(clubAccounts.createdAt)),
      db.select().from(designers).orderBy(desc(designers.createdAt)),
      db.select().from(designerJobs),
    ]);

    const bulk = allUsers.filter((u) => u.role === "customer").map((u) => ({
      id: u.id,
      name: u.teamName || u.email || u.username,
      email: u.email,
      kind: "Bulk order",
      scope: ["own orders only"],
      lastSeenAt: u.lastSeenAt,
      viewUrl: "/portal",
      flags: /(^|@)(test|example)\./i.test(u.email || "") || /forge-test/i.test(u.email || "") ? ["test row"] : [],
    }));

    const managers = clubs.map((c) => {
      // A shell account is created by the QC brand handoff with a deliberately
      // non-bcrypt hash, so login is impossible until a real invite is sent.
      const shell = /@brand\.sideline\.local$/i.test(c.email || "");
      return {
        id: c.id,
        name: c.clubName,
        email: c.email,
        kind: shell ? "Shell (cannot log in)" : "Club manager",
        scope: [c.shopifyOrderTag || "no store tag", `${((c.profitShareTierBps ?? 0) / 100).toFixed(0)}% share`],
        lastSeenAt: c.lastSeenAt,
        viewUrl: "/club-portal/supporter-dashboard",
        flags: shell ? ["never invited"] : [],
      };
    });

    const designerList = designerRows.map((d) => {
      const mine = jobRows.filter((j) => j.designerName === d.name);
      const approved = mine.filter((j) => j.status === "approved");
      return {
        id: d.id,
        name: d.displayName,
        email: d.email,
        kind: d.active ? `Designer · ${d.tier}` : "Designer (inactive)",
        scope: [`${d.timezone}`, `${mine.filter((j) => j.status === "in_progress" || j.status === "revision").length}/${d.wipCap} jobs`, `${approved.length} approved`],
        lastSeenAt: d.lastSeenAt,
        viewUrl: `/designers/${d.token}`,
        flags: d.active ? [] : ["inactive"],
      };
    });

    const suppliers = allUsers.filter((u) => u.role === "supplier").map((u) => ({
      id: u.id,
      name: u.teamName || u.email,
      email: u.email,
      kind: "Supplier",
      scope: (u.supplierCategories as string[] | null)?.length ? [`${(u.supplierCategories as string[]).length} categories`] : ["no categories set"],
      lastSeenAt: u.lastSeenAt,
      viewUrl: "/supplier",
      flags: [],
    }));

    res.json({
      ok: true,
      scopes: SCOPES,
      audiences: {
        customers: { rows: [...managers, ...bulk], scope: SCOPES.customer },
        designers: { rows: designerList, scope: SCOPES.designer },
        suppliers: { rows: suppliers, scope: SCOPES.supplier },
        affiliates: {
          rows: [],
          scope: null,
          note: "Affiliates do not exist yet: no table, no route, no code. It needs a product decision first — people who REFER a club and earn on its first order, or supporters who share a store link and earn on what it sells. Those are different builds, and the second belongs in a Shopify plugin because it has to hook checkout attribution.",
        },
      },
    });
  } catch (e: any) {
    console.error("[accounts] failed:", e?.message);
    res.status(500).json({ error: "Failed to load accounts" });
  }
});

export default router;
