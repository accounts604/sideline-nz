// Admin "view as", extended to customers and club managers.
//
// Impersonation ALREADY existed for suppliers (/admin/suppliers/:id/impersonate)
// using a two-cookie model: snz_token becomes the target, snz_original_session
// parks the admin's JWT, and /api/auth/end-impersonation swaps back. This reuses
// that exact machinery rather than building a parallel one — it only adds the
// audiences it was missing.
//
// It also closes the gap the supplier route's own comment admits: previously the
// "Viewing as X" banner was the only safeguard, so an impersonated session could
// still WRITE as that account. Sessions now carry an `imp` claim and
// blockImpersonatedWrites refuses every non-GET server-side.
import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, clubAccounts, impersonationLog } from "@shared/schema";
import { requireAdmin, signToken, setAuthCookie, setImpersonateCookie, type JwtPayload } from "../auth";

const router = Router();

const startSchema = z.object({
  kind: z.enum(["user", "club_account"]),
  id: z.string().min(1),
});

router.post("/start", requireAdmin, async (req, res) => {
  try {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "pass { kind, id }" });
    const { kind, id } = parsed.data;

    const admin = (req as any).user as JwtPayload;
    // A service token has no real admin row to restore afterwards.
    if (!admin?.userId || admin.userId.startsWith("service:")) {
      return res.status(403).json({ error: "view-as needs a real admin login, not a service token" });
    }

    let label = "";
    let targetId = "";
    let role: JwtPayload["role"] = "customer";
    let redirectTo = "/portal";

    if (kind === "user") {
      const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!u) return res.status(404).json({ error: "account not found" });
      // Viewing as another admin would defeat the read-only guard entirely.
      if (u.role === "admin") return res.status(403).json({ error: "cannot view as another admin" });
      label = u.teamName || u.email || u.username;
      targetId = u.id;
      role = u.role as JwtPayload["role"];
      redirectTo = u.role === "supplier" ? "/supplier" : "/portal";
    } else {
      const [c] = await db.select().from(clubAccounts).where(eq(clubAccounts.id, id)).limit(1);
      if (!c) return res.status(404).json({ error: "club account not found" });
      // Shell accounts have a deliberately unusable password hash; there is no
      // session to inhabit, so say that rather than producing a broken view.
      if (/@brand\.sideline\.local$/i.test(c.email || "")) {
        return res.status(409).json({ error: `${c.clubName} has never been invited — there is no account to view yet.` });
      }
      label = c.clubName;
      targetId = c.id;
      redirectTo = "/club-portal/supporter-dashboard";
    }

    const [log] = await db.insert(impersonationLog).values({
      adminUserId: admin.userId,
      targetKind: kind,
      targetId,
      targetLabel: label,
      ip: (req.headers["x-forwarded-for"] as string) || req.ip || null,
      userAgent: (req.headers["user-agent"] as string) || null,
    }).returning();

    // Same two-cookie model the supplier route already uses.
    setImpersonateCookie(res, signToken({ userId: admin.userId, role: "admin" }));
    setAuthCookie(res, signToken({ userId: targetId, role, imp: { by: admin.userId, logId: log.id, label } }));

    console.warn(`[view-as] admin ${admin.userId} began viewing as ${kind} ${targetId} (${label})`);
    res.json({ ok: true, impersonating: { id: targetId, name: label }, readOnly: true, redirectTo });
  } catch (e: any) {
    console.error("[view-as] start failed:", e?.message);
    res.status(500).json({ error: "could not start view-as" });
  }
});

export default router;
