// Dominant-colour extraction from a design image via Gemini vision.
// Gemini 2.5 Flash is already wired up for mockup generation, so we reuse
// the same API key instead of introducing a new vision model dep.

export interface ExtractedColor {
  hex: string;   // "#RRGGBB"
  name: string;  // short human label, e.g. "Navy Blue"
}

const COLOR_EXTRACT_PROMPT = `You are a uniform designer assistant. Look at this design image and identify the main colours used in the garment itself (ignore the background, mannequin, shadows, and tags).

Return STRICT JSON only — no markdown, no commentary. Shape:
{
  "colors": [
    { "hex": "#RRGGBB", "name": "Short name (1-3 words)" }
  ]
}

Rules:
- 2 to 5 colours max, ordered by dominance (most-used first)
- Hex must be 6 digits uppercase with leading #
- Name must be human-friendly (e.g. "Navy Blue", "Off White", "Gold"), not generic ("dark colour 1")
- Skip neutrals under 5% of the garment
- If the garment is monochrome, return just that one colour`;

async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const mimeType = r.headers.get("content-type") || "image/png";
    const buf = Buffer.from(await r.arrayBuffer());
    return { data: buf.toString("base64"), mimeType };
  } catch (err) {
    console.error("[color-extract] fetch image failed:", err);
    return null;
  }
}

/** Extract dominant colours from an image URL. Returns null if Gemini isn't configured or the call fails. */
export async function extractColorsFromImage(imageUrl: string): Promise<ExtractedColor[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("[color-extract] GEMINI_API_KEY not set — skipping");
    return null;
  }

  const img = await fetchAsBase64(imageUrl);
  if (!img) return null;

  const model = process.env.GEMINI_COLOR_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: COLOR_EXTRACT_PROMPT },
              { inline_data: { mime_type: img.mimeType, data: img.data } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[color-extract] Gemini error:", res.status, text);
      return null;
    }

    const data = await res.json();
    const textOut: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!textOut) return null;

    let parsed: any;
    try {
      parsed = JSON.parse(textOut);
    } catch {
      // Strip any stray markdown fences and retry
      const cleaned = textOut.replace(/```json\s*|\s*```/g, "").trim();
      parsed = JSON.parse(cleaned);
    }

    const out: ExtractedColor[] = [];
    for (const c of parsed?.colors || []) {
      if (typeof c?.hex !== "string" || typeof c?.name !== "string") continue;
      const hex = c.hex.trim().toUpperCase();
      if (!/^#[0-9A-F]{6}$/.test(hex)) continue;
      out.push({ hex, name: c.name.trim().slice(0, 40) });
      if (out.length >= 5) break;
    }
    return out.length ? out : null;
  } catch (err) {
    console.error("[color-extract] request failed:", err);
    return null;
  }
}
