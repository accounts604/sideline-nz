// AI Design Brief — uses Gemini vision to describe the design layout,
// logo positions, colour zones, pattern details, and branding placement
// from front + back mockup images. The output is a short, structured
// natural-language description stored on orderItem.designBrief and
// rendered in the PO PDF and order-detail view.
//
// Reuses GEMINI_API_KEY already set on Railway for mockup generation.

const BRIEF_PROMPT = `You are a sportswear production spec writer for Sideline NZ, a custom teamwear company. Look at these garment design mockup image(s) and write a structured design brief for the factory.

Output a SHORT, STRUCTURED brief covering (skip any section that doesn't apply):

**GARMENT OVERVIEW**: One sentence — garment type, style, silhouette.

**FRONT PANEL**: Describe what's on the front — main pattern, colour blocks, fade/gradient direction, stripe placement, panel boundaries.

**BACK PANEL**: Describe what's on the back — number position, name bar, pattern continuation.

**LOGOS & BRANDING**: For EACH logo/badge/sponsor mark visible, state: name (if readable), position (left chest, right chest, centre back collar, etc.), approximate size (small/medium/large).

**COLLAR & CUFFS**: Style (v-neck, round, traditional), colours, ribbing.

**COLOUR ZONES**: Map which colour goes where (e.g. "Navy dominates body panels; white on side inserts; gold on collar and cuff trim").

**SPECIAL DETAILS**: Sublimation patterns, texture overlays, tonal prints, reflective elements, anything unusual.

Rules:
- Be CONCISE — max 250 words total
- Use plain English the factory can follow
- Don't describe the image quality or background — only the garment
- If there are two images (front + back), integrate both into one brief`;

async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const mimeType = r.headers.get("content-type") || "image/png";
    const buf = Buffer.from(await r.arrayBuffer());
    return { data: buf.toString("base64"), mimeType };
  } catch {
    return null;
  }
}

export async function generateDesignBrief(imageUrls: string[]): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("[design-brief] GEMINI_API_KEY not set — skipping");
    return null;
  }

  const parts: any[] = [{ text: BRIEF_PROMPT }];
  for (const url of imageUrls) {
    const img = await fetchAsBase64(url);
    if (img) parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
  }

  if (parts.length === 1) return null; // no images loaded

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
      }),
    });

    if (!res.ok) {
      console.error("[design-brief] Gemini error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return text.trim() || null;
  } catch (err) {
    console.error("[design-brief] request failed:", err);
    return null;
  }
}
