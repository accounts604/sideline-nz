/**
 * Mockup Engine Orchestrator
 *
 * Pipeline: Lead form → 4 Gemini mockups → ElevenLabs voiceover → ffmpeg video → email + GHL + ClickUp
 *
 * Target: <5 minutes end-to-end from form submission to customer email.
 */
import { db } from "../db";
import { mockupRequests, mockupDesigns } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { generateMockupImage, type GeminiGenerateOptions } from "./gemini";
import { generateVoiceover } from "./elevenlabs";
import { createVideoMontage } from "./video";
import { createClickUpTask } from "./clickup";
import { syncGhlTag } from "../ghl-sync";
import { emailService } from "../email";

// Upload helper — uses Vercel Blob if available, otherwise local stub
async function uploadToBlob(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  if (blobToken) {
    // Vercel Blob upload
    const { put } = await import("@vercel/blob");
    const blob = await put(filename, buffer, {
      access: "public",
      contentType,
      token: blobToken,
    });
    return blob.url;
  }

  // Fallback: log and return a placeholder
  console.log(`[Blob] Would upload ${filename} (${buffer.length} bytes)`);
  return `https://placeholder.sidelinenz.com/mockups/${filename}`;
}

interface MockupPipelineResult {
  requestId: string;
  designUrls: string[];
  videoUrl: string | null;
  emailSent: boolean;
  totalTimeMs: number;
}

/**
 * Run the full mockup generation pipeline for a request.
 * This is the main entry point called after a lead form submission.
 */
export async function runMockupPipeline(requestId: string): Promise<MockupPipelineResult> {
  const startTime = Date.now();

  // Get the request
  const [request] = await db
    .select()
    .from(mockupRequests)
    .where(eq(mockupRequests.id, requestId));

  if (!request) throw new Error(`Mockup request ${requestId} not found`);

  // Mark as generating
  await db
    .update(mockupRequests)
    .set({ status: "generating", generationStartedAt: new Date() })
    .where(eq(mockupRequests.id, requestId));

  const designUrls: string[] = [];
  const imageBuffers: Buffer[] = [];

  try {
    // ======= STEP 1: Generate 4 mockup designs with Gemini =======
    console.log(`[Mockup] Generating 4 designs for ${request.teamName}...`);

    // Create 4 design records
    for (let i = 1; i <= 4; i++) {
      await db.insert(mockupDesigns).values({
        requestId,
        designNumber: i,
        prompt: "", // Will be updated
        status: "pending",
      });
    }

    // Generate all 4 in parallel for speed
    const designPromises = [1, 2, 3, 4].map(async (designNumber) => {
      const opts: GeminiGenerateOptions = {
        sport: request.sport,
        teamName: request.teamName,
        primaryColor: request.primaryColor,
        secondaryColor: request.secondaryColor || undefined,
        accentColor: request.accentColor || undefined,
        logoUrl: request.logoUrl || undefined,
        designNumber,
      };

      try {
        // Update status to generating
        await db
          .update(mockupDesigns)
          .set({ status: "generating" })
          .where(eq(mockupDesigns.requestId, requestId));

        const result = await generateMockupImage(opts);
        const imageBuffer = Buffer.from(result.imageBase64, "base64");

        // Upload to Vercel Blob
        const ext = result.mimeType.includes("png") ? "png" : "jpg";
        const filename = `mockups/${requestId}/design_${designNumber}.${ext}`;
        const imageUrl = await uploadToBlob(imageBuffer, filename, result.mimeType);

        // Update design record
        const allDesigns = await db
          .select()
          .from(mockupDesigns)
          .where(eq(mockupDesigns.requestId, requestId));
        const design = allDesigns.find((d) => d.designNumber === designNumber);

        if (design) {
          await db
            .update(mockupDesigns)
            .set({
              prompt: result.prompt,
              imageUrl,
              status: "completed",
              generationTimeMs: result.generationTimeMs,
            })
            .where(eq(mockupDesigns.id, design.id));
        }

        return { designNumber, imageUrl, imageBuffer };
      } catch (err: any) {
        console.error(`[Mockup] Design ${designNumber} failed:`, err.message);
        const allDesigns = await db
          .select()
          .from(mockupDesigns)
          .where(eq(mockupDesigns.requestId, requestId));
        const design = allDesigns.find((d) => d.designNumber === designNumber);
        if (design) {
          await db
            .update(mockupDesigns)
            .set({ status: "failed", errorMessage: err.message })
            .where(eq(mockupDesigns.id, design.id));
        }
        return null;
      }
    });

    const designResults = (await Promise.all(designPromises)).filter(Boolean) as {
      designNumber: number;
      imageUrl: string;
      imageBuffer: Buffer;
    }[];

    if (designResults.length === 0) {
      throw new Error("All 4 design generations failed");
    }

    // Sort by design number
    designResults.sort((a, b) => a.designNumber - b.designNumber);

    for (const d of designResults) {
      designUrls.push(d.imageUrl);
      imageBuffers.push(d.imageBuffer);
    }

    // Update request status
    await db
      .update(mockupRequests)
      .set({ status: "designs_ready" })
      .where(eq(mockupRequests.id, requestId));

    console.log(`[Mockup] ${designResults.length} designs generated for ${request.teamName}`);

    // ======= STEP 2: Generate voiceover =======
    let audioBuffer: Buffer | null = null;
    let voiceoverUrl: string | null = null;

    try {
      if (process.env.ELEVENLABS_API_KEY) {
        console.log(`[Mockup] Generating voiceover...`);
        const voResult = await generateVoiceover({
          teamName: request.teamName,
          sport: request.sport,
          designCount: designResults.length,
        });
        audioBuffer = voResult.audioBuffer;
        voiceoverUrl = await uploadToBlob(
          audioBuffer,
          `mockups/${requestId}/voiceover.mp3`,
          "audio/mpeg"
        );
        await db
          .update(mockupRequests)
          .set({ voiceoverUrl })
          .where(eq(mockupRequests.id, requestId));
        console.log(`[Mockup] Voiceover generated`);
      }
    } catch (err: any) {
      console.error("[Mockup] Voiceover failed (continuing without):", err.message);
    }

    // ======= STEP 3: Create video montage =======
    let videoUrl: string | null = null;

    try {
      if (audioBuffer && imageBuffers.length >= 2) {
        console.log(`[Mockup] Creating video montage...`);
        const videoResult = await createVideoMontage({
          images: imageBuffers,
          audio: audioBuffer,
          teamName: request.teamName,
        });
        videoUrl = await uploadToBlob(
          videoResult.videoBuffer,
          `mockups/${requestId}/presentation.mp4`,
          "video/mp4"
        );
        await db
          .update(mockupRequests)
          .set({ videoUrl, status: "video_ready" })
          .where(eq(mockupRequests.id, requestId));
        console.log(`[Mockup] Video created (${videoResult.durationSeconds}s)`);
      }
    } catch (err: any) {
      console.error("[Mockup] Video creation failed (continuing without):", err.message);
    }

    // ======= STEP 4: Send email to customer =======
    let emailSent = false;
    try {
      const baseUrl = process.env.BASE_URL || "https://sidelinenz.com";
      const designLinks = designUrls
        .map((url, i) => `  Design ${i + 1}: ${url}`)
        .join("\n");

      const htmlDesigns = designUrls
        .map(
          (url, i) =>
            `<div style="margin-bottom:16px"><p style="font-weight:600">Design ${i + 1}</p><img src="${url}" alt="Design ${i + 1}" style="max-width:100%;border-radius:8px;border:1px solid #eee" /></div>`
        )
        .join("");

      const videoLine = videoUrl
        ? `\n\nWatch your presentation video: ${videoUrl}`
        : "";
      const videoHtml = videoUrl
        ? `<p style="margin-top:24px"><a href="${videoUrl}" style="display:inline-block;padding:12px 24px;background:#f97316;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Watch Your Presentation Video</a></p>`
        : "";

      await emailService.send({
        to: request.contactEmail,
        subject: `Your Custom ${request.sport.charAt(0).toUpperCase() + request.sport.slice(1)} Mockups — ${request.teamName} | Sideline NZ`,
        text: `Hey ${request.contactName}!\n\nWe've designed ${designResults.length} custom ${request.sport} uniform concepts for ${request.teamName}.\n\n${designLinks}${videoLine}\n\nLet us know which design direction you love, or if you'd like to mix and match elements. Reply to this email or call us on 022 412 7205.\n\nCheers,\nThe Sideline Team\nwww.sidelinenz.com`,
        html: `
          <div style="font-family:'Inter',sans-serif;max-width:600px;margin:0 auto;color:#333">
            <div style="text-align:center;padding:32px 0;border-bottom:2px solid #f97316">
              <h1 style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:3px;margin:0"><span style="color:#f97316">S</span>IDELINE</h1>
              <p style="color:#888;font-size:12px;margin-top:4px">Custom Sportswear NZ</p>
            </div>
            <div style="padding:32px 0">
              <p>Hey ${request.contactName}!</p>
              <p>We've designed <strong>${designResults.length} custom ${request.sport} uniform concepts</strong> for <strong>${request.teamName}</strong>.</p>
              ${htmlDesigns}
              ${videoHtml}
              <p style="margin-top:24px">Let us know which design direction you love, or if you'd like to mix and match elements.</p>
              <p>Reply to this email or call us on <strong>022 412 7205</strong>.</p>
              <p style="margin-top:32px">Cheers,<br/><strong>The Sideline Team</strong><br/>www.sidelinenz.com</p>
            </div>
          </div>`,
      });

      emailSent = true;
      await db
        .update(mockupRequests)
        .set({ status: "sent", emailSentAt: new Date() })
        .where(eq(mockupRequests.id, requestId));
      console.log(`[Mockup] Email sent to ${request.contactEmail}`);
    } catch (err: any) {
      console.error("[Mockup] Email send failed:", err.message);
    }

    // ======= STEP 5: GHL tag sync =======
    try {
      await syncGhlTag(request.contactEmail, "Mockup Generated");
      await syncGhlTag(request.contactEmail, `Sport: ${request.sport}`);
      await db
        .update(mockupRequests)
        .set({ ghlTagsSynced: true })
        .where(eq(mockupRequests.id, requestId));
    } catch (err: any) {
      console.error("[Mockup] GHL sync failed:", err.message);
    }

    // ======= STEP 6: ClickUp task =======
    try {
      const taskId = await createClickUpTask({
        teamName: request.teamName,
        contactName: request.contactName,
        contactEmail: request.contactEmail,
        contactPhone: request.contactPhone || undefined,
        sport: request.sport,
        mockupRequestId: requestId,
        designCount: designResults.length,
      });
      if (taskId) {
        await db
          .update(mockupRequests)
          .set({ clickupTaskId: taskId })
          .where(eq(mockupRequests.id, requestId));
      }
    } catch (err: any) {
      console.error("[Mockup] ClickUp task failed:", err.message);
    }

    // Mark complete
    const totalTimeMs = Date.now() - startTime;
    await db
      .update(mockupRequests)
      .set({ generationCompletedAt: new Date() })
      .where(eq(mockupRequests.id, requestId));

    console.log(`[Mockup] Pipeline complete for ${request.teamName} in ${(totalTimeMs / 1000).toFixed(1)}s`);

    return {
      requestId,
      designUrls,
      videoUrl,
      emailSent,
      totalTimeMs,
    };
  } catch (err: any) {
    // Mark as failed
    await db
      .update(mockupRequests)
      .set({
        status: "failed",
        errorMessage: err.message,
        generationCompletedAt: new Date(),
      })
      .where(eq(mockupRequests.id, requestId));

    console.error(`[Mockup] Pipeline failed for ${request.teamName}:`, err.message);
    throw err;
  }
}
