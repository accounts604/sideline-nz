// Dominant-colour extraction from a design image via Gemini vision.
// Gemini 2.5 Flash is already wired up for mockup generation, so we reuse
// the same API key instead of introducing a new vision model dep.

export interface ExtractedColor {
  hex: string;   // "#RRGGBB"
  name: string;  // short human label, e.g. "Navy Blue"
  pms?: string;  // closest Pantone Solid Coated code, e.g. "PMS 282 C"
}

const COLOR_EXTRACT_PROMPT = `You are a uniform designer assistant. Look at this design image and identify EVERY distinct colour used in the garment itself (ignore the studio background, mannequin, shadows, and tags).

Return STRICT JSON only — no markdown, no commentary. Shape:
{
  "colors": [
    { "hex": "#RRGGBB", "name": "Short name (1-3 words)", "pms": "PMS <code> C" }
  ]
}

Rules:
- Return 2 to 8 colours, ordered by dominance (most-used first).
- INCLUDE accent and trim colours even if they only cover a small area — e.g. collar piping, side panels, sleeve cuffs, hem stripes, logo fills, number outlines, dot/spot details. A blue strip on the sleeve still counts as a colour.
- Inspect the WHOLE garment carefully: top to bottom, sleeves, collar, hem, side panels, back, logo, numbers, name placement panel. Multiple passes if needed.
- Only skip a colour if it is clearly anti-aliasing noise (a single fuzzy pixel band) OR it is the studio backdrop (not part of the garment fabric).
- Hex must be 6 digits uppercase with leading #.
- Name must be human-friendly (e.g. "Navy Blue", "Off White", "Royal Blue", "Gold"), not generic ("dark colour 1").
- pms = the closest Pantone Solid Coated swatch (the "C" series — what Sideline's supplier matches against). Format: "PMS <number> C" for numbered swatches (e.g. "PMS 186 C", "PMS 282 C"), or for the named-only swatches use exactly "PMS Black C", "PMS White", "PMS Cool Gray 7 C", "PMS Warm Gray 4 C", "PMS Process Black C", "PMS Reflex Blue C", "PMS Rhodamine Red C", "PMS Rubine Red C", "PMS Process Cyan C", "PMS Process Magenta C", "PMS Process Yellow C". Always pick from the Solid Coated set — never Solid Uncoated or TPX/TCX. If unsure, pick the closest numbered swatch by RGB distance.
- If the garment is genuinely monochrome (one colour from edge to edge with NO logos, trims, or accents), return just that one colour.`;

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
      const entry: ExtractedColor = { hex, name: c.name.trim().slice(0, 40) };
      if (typeof c?.pms === "string") {
        const pms = c.pms.trim();
        // Loose sanity check: starts with "PMS " and isn't suspiciously long.
        if (/^PMS\b/i.test(pms) && pms.length <= 40) entry.pms = pms;
      }
      out.push(entry);
      if (out.length >= 8) break;
    }
    return out.length ? out : null;
  } catch (err) {
    console.error("[color-extract] request failed:", err);
    return null;
  }
}
