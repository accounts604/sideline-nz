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

// POST /from-url — server-side fetch of a remote image → Vercel Blob. Used
// by the admin paste-from-clipboard flow when the clipboard contained a URL
// instead of a bitmap (Telegram on macOS often does this when the user hits
// "Copy" on a message instead of "Copy Image").
//
// Keeps the 50MB cap and the same image-only content-type allowlist as the
// client-upload path so we don't accidentally start accepting PDFs/zips by a
// different door.
router.post("/from-url", async (req, res) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url || typeof url !== "string") return res.status(400).json({ error: "url required" });

    let parsed: URL;
    try { parsed = new URL(url); } catch { return res.status(400).json({ error: "Not a valid URL" }); }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).json({ error: "Only http(s) URLs are supported" });
    }

    const fetchRes = await fetch(url, { redirect: "follow" });
    if (!fetchRes.ok) return res.status(400).json({ error: `Source fetch failed: ${fetchRes.status}` });

    const contentType = (fetchRes.headers.get("content-type") || "").split(";")[0].trim();
    const allowed = ["image/png", "image/jpeg", "image/svg+xml", "image/webp", "image/gif"];
    if (!allowed.includes(contentType)) {
      return res.status(400).json({ error: `Not a supported image type: ${contentType || "unknown"}` });
    }

    const arrayBuf = await fetchRes.arrayBuffer();
    if (arrayBuf.byteLength > 50 * 1024 * 1024) return res.status(400).json({ error: "Image > 50MB" });
    const buffer = Buffer.from(arrayBuf);

    const ext = contentType.split("/")[1] === "svg+xml" ? "svg" : contentType.split("/")[1];
    const filename = `pasted-url-${Date.now()}.${ext}`;

    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN missing" });

    const { put } = await import("@vercel/blob");
    const blob = await put(filename, buffer, {
      access: "public",
      contentType,
      token: blobToken,
      addRandomSuffix: true,
    });

    res.json({ url: blob.url });
  } catch (err: any) {
    console.error("Upload from URL error:", err);
    res.status(500).json({ error: err.message || "Upload from URL failed" });
  }
});

export default router;
