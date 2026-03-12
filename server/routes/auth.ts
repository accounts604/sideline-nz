import { Router } from "express";
import { storage } from "../storage";
import { signToken, setAuthCookie, clearAuthCookie, hashPassword, verifyPassword, requireAuth } from "../auth";
import type { JwtPayload } from "../auth";
import { z } from "zod";

const router = Router();

// ====== AUTH ENDPOINTS ======

const registerSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  teamName: z.string().optional(),
  contactPhone: z.string().optional(),
});

router.post("/register", async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message || "Invalid data";
      return res.status(400).json({ error: firstError });
    }

    const { email, password, teamName, contactPhone } = parsed.data;

    // Check if email already exists
    const existing = await storage.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const hashed = await hashPassword(password);
    const user = await storage.createUser({
      username: email, // Use email as username
      email,
      password: hashed,
      role: "customer",
      teamName,
      contactPhone,
    });

    const token = signToken({ userId: user.id, role: "customer" });
    setAuthCookie(res, token);

    // Auto-link any guest orders with matching email
    await storage.linkOrdersByEmail(email, user.id);

    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      teamName: user.teamName,
      contactPhone: user.contactPhone,
    });
  } catch (e: any) {
    console.error("Register error:", e);
    res.status(500).json({ error: "Registration failed" });
  }
});

const loginSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message || "Invalid data";
      return res.status(400).json({ error: firstError });
    }

    const { email, password } = parsed.data;

    const user = await storage.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const role = (user.role === "admin" ? "admin" : "customer") as "admin" | "customer";
    const token = signToken({ userId: user.id, role });
    setAuthCookie(res, token);

    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      teamName: user.teamName,
      contactPhone: user.contactPhone,
    });
  } catch (e: any) {
    console.error("Login error:", e);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const { userId } = (req as any).user as JwtPayload;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      teamName: user.teamName,
      contactPhone: user.contactPhone,
    });
  } catch (e: any) {
    console.error("Me error:", e);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

const acceptInviteSchema = z.object({
  token: z.string().min(1, "Invite token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

router.post("/accept-invite", async (req, res) => {
  try {
    const parsed = acceptInviteSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message || "Invalid data";
      return res.status(400).json({ error: firstError });
    }

    const { token, password } = parsed.data;

    const user = await storage.getUserByInviteToken(token);
    if (!user) {
      return res.status(400).json({ error: "Invalid or expired invite link" });
    }

    if (user.inviteExpiresAt && new Date(user.inviteExpiresAt) < new Date()) {
      return res.status(400).json({ error: "Invite link has expired" });
    }

    const hashed = await hashPassword(password);
    await storage.acceptInvite(user.id, hashed);

    const role = (user.role === "admin" ? "admin" : "customer") as "admin" | "customer";
    const authToken = signToken({ userId: user.id, role });
    setAuthCookie(res, authToken);

    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      teamName: user.teamName,
      contactPhone: user.contactPhone,
    });
  } catch (e: any) {
    console.error("Accept invite error:", e);
    res.status(500).json({ error: "Failed to accept invite" });
  }
});

export default router;
