import { Router } from "express";
import { requireAuth } from "../auth";

const router = Router();

// All customer portal routes require authentication
router.use(requireAuth);

// Placeholder — Phase 3 will add:
// GET    /orders
// GET    /orders/:id
// POST   /orders/:id/designs
// POST   /orders/:id/designs/:did/reupload
// GET    /orders/:id/invoice
// GET    /notifications
// PATCH  /notifications/:id/read
// GET    /profile
// PATCH  /profile

export default router;
