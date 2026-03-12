import { Router } from "express";
import { requireAuth } from "../auth";

const router = Router();

// All upload routes require authentication
router.use(requireAuth);

// Placeholder — Phase 3 will add:
// POST /token — generates Vercel Blob upload token

export default router;
