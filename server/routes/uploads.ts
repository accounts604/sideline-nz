import { Router } from "express";
import { requireAuth } from "../auth";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

const router = Router();

// All upload routes require authentication
router.use(requireAuth);

// POST /token — generates Vercel Blob client upload token
router.post("/token", async (req, res) => {
  try {
    const body = req.body as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        // Validate that the user is authenticated (already done by middleware)
        const user = (req as any).user;
        if (!user) throw new Error("Not authenticated");

        return {
          allowedContentTypes: [
            "image/png",
            "image/jpeg",
            "image/svg+xml",
            "image/webp",
            "application/pdf",
            "application/zip",
            "application/x-zip-compressed",
          ],
          maximumSizeInBytes: 50 * 1024 * 1024, // 50MB
          tokenPayload: JSON.stringify({ userId: user.userId }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Optional: could log or create a record here
        // The client will handle creating the designFile record via the portal API
      },
    });

    res.json(jsonResponse);
  } catch (err: any) {
    console.error("Upload token error:", err);
    res.status(400).json({ error: err.message || "Upload failed" });
  }
});

export default router;
