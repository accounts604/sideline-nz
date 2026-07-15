import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const JWT_EXPIRES_IN = "7d";
const COOKIE_NAME = "snz_token";
// Set during impersonation. Holds the original admin's JWT (signed, short-lived)
// so they can return without re-logging-in. End-impersonation reads this and
// swaps it back into snz_token. Never accept this cookie as the auth source.
export const IMPERSONATE_COOKIE = "snz_original_session";
const IMPERSONATE_EXPIRES_IN = "1h";

export interface JwtPayload {
  userId: string;
  role: "admin" | "customer" | "supplier";
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function setAuthCookie(res: Response, token: string) {
  const isProxied = process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProxied,
    sameSite: isProxied ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

// Middleware: attach user to request if valid token exists
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    try {
      (req as any).user = jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch {
      // Invalid token — proceed as unauthenticated
    }
  }
  next();
}

// Middleware: require authentication.
//
// Two paths:
//   1. snz_token cookie (browser sessions — admins, suppliers, customers)
//   2. X-Service-Token header matched against SERVICE_TOKEN env. Used by
//      back-of-house automation that doesn't carry a browser cookie —
//      e.g. the mission-control Telegram bridge POSTing /po-decision when
//      Romero taps Send/Hold on a sample/bulk approval card.
//
// Service token is rejected unless SERVICE_TOKEN is configured server-side
// (so dev/test deployments don't accidentally accept anything).
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const serviceToken = req.headers["x-service-token"];
  // Accept either env name: SERVICE_TOKEN (original) or SIDELINE_SERVICE_TOKEN (what the
  // mission-control bridge actually carries). The /po-decision route already accepted both;
  // this unifies it for ALL back-of-house automation (e.g. quote->PO create-po push).
  const expectedServiceToken = process.env.SERVICE_TOKEN || process.env.SIDELINE_SERVICE_TOKEN;
  if (serviceToken && expectedServiceToken && serviceToken === expectedServiceToken) {
    (req as any).user = { userId: "service:telegram-bridge", role: "admin" } as JwtPayload;
    return next();
  }

  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    (req as any).user = jwt.verify(token, JWT_SECRET) as JwtPayload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Middleware: require admin role
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if ((req as any).user?.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  });
}

// Middleware: require supplier role (used by /api/supplier/* routes)
export function requireSupplier(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if ((req as any).user?.role !== "supplier") {
      return res.status(403).json({ error: "Supplier access required" });
    }
    next();
  });
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── Impersonation ────────────────────────────────────────────────────
//
// Two-cookie model:
//   snz_token              = the JWT requireAuth/requireSupplier reads
//   snz_original_session   = the admin's JWT, parked here during impersonation
//
// Set both on /admin/suppliers/:id/impersonate; restore from the second on
// /auth/end-impersonation. Never accept snz_original_session as the auth
// source — it exists purely so the admin can swap back.

export function signShortLivedToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: IMPERSONATE_EXPIRES_IN });
}

export function setImpersonateCookie(res: Response, originalAdminToken: string) {
  const isProxied = process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
  res.cookie(IMPERSONATE_COOKIE, originalAdminToken, {
    httpOnly: true,
    secure: isProxied,
    sameSite: isProxied ? "none" : "lax",
    maxAge: 60 * 60 * 1000, // 1 hour — matches signed token lifetime
    path: "/",
  });
}

export function clearImpersonateCookie(res: Response) {
  res.clearCookie(IMPERSONATE_COOKIE, { path: "/" });
}

export function readImpersonateCookie(req: Request): JwtPayload | null {
  const token = req.cookies?.[IMPERSONATE_COOKIE];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}
