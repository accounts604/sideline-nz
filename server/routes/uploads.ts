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
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

    // Diagnostic: log whether the env var is actually reaching the function at runtime.
    // Previously the live API returned "No token found" even though Vercel listed the
    // var as set — this log pins down whether the var is present at call time.
    console.log(
      "[uploads/token] BLOB_READ_WRITE_TOKEN present:",
      !!blobToken,
      "length:",
      blobToken?.length ?? 0,
    );

    if (!blobToken) {
      return res.status(500).json({
        error: "Vercel Blob is not configured on this environment (BLOB_READ_WRITE_TOKEN missing)",
      });
    }

    const jsonResponse = await handleUpload({
      body,
      request: req,
      token: blobToken, // explicit — don't rely on @vercel/blob auto-env-read
      onBeforeGenerateToken: async (pathname) => {
        // Validate that the user is authenticated (already done by middleware)
        const user = (req as any).user;
        if (!user) throw new Error("Not authenticated");

        // addRandomSuffix must be set server-side — the @vercel/blob client
        // upload() no longer accepts it (since SDK v0.19+). Without this,
        // uploads with duplicate filenames silently overwrite each other.
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
          addRandomSuffix: true,
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
