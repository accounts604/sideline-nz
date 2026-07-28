// Gemini provider for the in-app AI worker.
//
// Uses gemini-2.5-flash by default — free tier is 15 RPM / 1.5M tokens/day,
// vision-capable, and structured-output capable via responseSchema.
//
// The former server/mockup/gemini.ts (image generation) was retired 2026-07-28.
// That module uses gemini-2.0-flash-exp's IMAGE modality; this one is
// text + vision input → text output.

import type { AiProvider, CompleteRequest, CompleteResponse, ImageInput } from "./types";

const DEFAULT_MODEL = process.env.AI_GEMINI_MODEL || "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

async function imageToInlinePart(image: ImageInput): Promise<any> {
  if (image.base64) {
    return {
      inlineData: {
        mimeType: image.mimeType || "image/png",
        data: image.base64,
      },
    };
  }
  if (image.url) {
    // Gemini supports fileData with a URI, but inline fetch is simpler and
    // works for any public URL including Vercel Blob.
    const resp = await fetch(image.url);
    if (!resp.ok) {
      throw new Error(`Failed to fetch image ${image.url}: HTTP ${resp.status}`);
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const mimeType = image.mimeType || resp.headers.get("content-type") || "image/png";
    return {
      inlineData: {
        mimeType: mimeType.split(";")[0],
        data: buf.toString("base64"),
      },
    };
  }
  throw new Error("ImageInput requires either url or base64");
}

export const geminiProvider: AiProvider = {
  name: "gemini",

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const userParts: any[] = [{ text: req.user }];
    if (req.images?.length) {
      for (const img of req.images) {
        userParts.push(await imageToInlinePart(img));
      }
    }

    const generationConfig: any = {
      temperature: req.temperature ?? 0.2,
      maxOutputTokens: req.maxOutputTokens ?? 1024,
    };
    if (req.jsonSchema) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseSchema = req.jsonSchema;
    }

    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: userParts }],
      generationConfig,
    };

    const url = `${API_BASE}/models/${DEFAULT_MODEL}:generateContent?key=${apiKey}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Gemini API error (${resp.status}): ${errText.slice(0, 500)}`);
    }

    const data: any = await resp.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const rawText = parts
      .map((p: any) => p.text)
      .filter(Boolean)
      .join("");

    if (!rawText) {
      throw new Error(`Gemini returned no text. Finish reason: ${data?.candidates?.[0]?.finishReason || "unknown"}`);
    }

    // Gemini occasionally ignores responseMimeType=application/json and wraps
    // the payload in ```json …``` fences with a "Here is the JSON" preamble.
    // When the caller asked for structured output, pull just the JSON body.
    const text = req.jsonSchema ? extractJson(rawText) : rawText;

    return {
      text,
      usage: {
        inputTokens: data?.usageMetadata?.promptTokenCount,
        outputTokens: data?.usageMetadata?.candidatesTokenCount,
        totalTokens: data?.usageMetadata?.totalTokenCount,
      },
      model: DEFAULT_MODEL,
      provider: "gemini",
    };
  },
};

// Strip markdown fences and any pre/post text around the first balanced JSON
// object/array in the response. Returns the input unchanged if no obvious
// JSON wrapper is found (so a legitimately-bare JSON response passes through).
function extractJson(text: string): string {
  const trimmed = text.trim();
  // ```json … ``` or ``` … ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) return fenceMatch[1].trim();
  // First {...} or [...] block
  const firstBrace = trimmed.search(/[{[]/);
  if (firstBrace >= 0) {
    // Walk forward to find the matching closing brace by depth count.
    const opener = trimmed[firstBrace];
    const closer = opener === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = firstBrace; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === opener) depth++;
      else if (ch === closer) {
        depth--;
        if (depth === 0) return trimmed.slice(firstBrace, i + 1);
      }
    }
  }
  return trimmed;
}
