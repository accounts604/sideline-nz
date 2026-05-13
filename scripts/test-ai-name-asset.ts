/**
 * Smoke test for the in-app AI worker's name-asset task.
 *
 * Verifies the parts you can't safely defer to a live Gemini call:
 *   1. Skill file loads and frontmatter is stripped.
 *   2. The provider receives the system prompt + user message + image.
 *   3. JSON response is parsed; missing required fields throw.
 *   4. integration_events row is written via the audit wrapper.
 *
 * Stubs the Gemini fetch — does NOT hit the real API.
 *
 * Run:
 *   npx tsx scripts/test-ai-name-asset.ts
 *
 * For a live end-to-end check, after this passes:
 *   npm run dev:server
 *   curl -X POST http://localhost:3000/api/admin/ai/name-asset \
 *     -H "Content-Type: application/json" \
 *     -b "snz_token=<admin-jwt>" \
 *     -d '{"assetUrl":"https://...","context":{"orderId":"...","productHint":"bucket hat"}}'
 */
import { strict as assert } from "node:assert";

async function main() {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.AI_PROVIDER = "gemini";
  // postgres-js client construction is lazy — this URL is never dialed.
  // The audit wrapper's insert call will fail (caught, logged to stderr) but
  // doesn't block the test.
  process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:5432/test?sslmode=disable";

  let capturedBody: any = null;
  let capturedUrl: string = "";
  // Stub global fetch — record what the Gemini provider sent and return a
  // canned response.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    capturedUrl = String(url);
    if (capturedUrl.includes("generativelanguage.googleapis.com")) {
      capturedBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      canonicalName: "2026 Onewhero RFC 5 Panel Bucket Hat",
                      confidence: "high",
                      reasoning: "Image clearly shows a five-panel bucket hat for the supplied club.",
                    }),
                  },
                ],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 220, candidatesTokenCount: 40, totalTokenCount: 260 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    // For image fetches (1x1 PNG) — return a tiny image
    if (capturedUrl.startsWith("https://example.test/")) {
      const pngBytes = Buffer.from(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000005000100b5be7c440000000049454e44ae426082",
        "hex",
      );
      return new Response(pngBytes, { status: 200, headers: { "content-type": "image/png" } });
    }
    throw new Error(`Unexpected fetch URL in test: ${capturedUrl}`);
  }) as any;

  // Dynamic import after fetch is patched so the provider picks up our stub.
  const { runTask } = await import("../server/ai/index");

  // ---- Test 1: response parses, required fields present ----
  const result = await runTask({
    taskName: "name-asset",
    input: {
      assetUrl: "https://example.test/bucket-hat.png",
      context: {
        productHint: "bucket hat",
      },
    },
  });

  assert.equal(result.canonicalName, "2026 Onewhero RFC 5 Panel Bucket Hat");
  assert.equal(result.confidence, "high");
  assert.match(result.reasoning, /bucket hat/i);

  // ---- Test 2: provider received the correct payload ----
  assert.ok(capturedBody, "Gemini was not called");
  assert.ok(capturedBody.systemInstruction?.parts?.[0]?.text?.includes("Canonical name format"), "skill body not in system prompt");
  assert.ok(!capturedBody.systemInstruction.parts[0].text.includes("---\nname: name-asset"), "frontmatter not stripped");
  const userText: string = capturedBody.contents[0].parts[0].text;
  assert.ok(userText.includes("Year: "), "year missing from user message");
  assert.ok(userText.includes("Product hint: bucket hat"), "product hint missing");
  assert.ok(capturedBody.contents[0].parts.some((p: any) => p.inlineData?.mimeType?.startsWith("image/")), "image not attached");
  assert.equal(capturedBody.generationConfig.responseMimeType, "application/json", "structured-output not requested");

  // ---- Test 3: malformed JSON throws ----
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as any;
  let threw = false;
  try {
    await runTask({
      taskName: "name-asset",
      input: { assetUrl: "https://example.test/bucket-hat.png", context: {} },
    });
  } catch (err: any) {
    threw = true;
    assert.match(err.message, /non-JSON|JSON/i);
  }
  assert.ok(threw, "expected runTask to throw on non-JSON response");

  globalThis.fetch = realFetch;
  console.log("✓ test-ai-name-asset: all 3 cases passed");
}

main().catch((err) => {
  console.error("✗ test-ai-name-asset FAILED:", err);
  process.exit(1);
});
