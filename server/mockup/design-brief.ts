// AI Design Brief — uses Gemini vision to describe the design layout,
// logo positions, colour zones, pattern details, and branding placement
// from front + back mockup images. The output is a short, structured
// natural-language description stored on orderItem.designBrief and
// rendered in the PO PDF and order-detail view.
//
// Reuses GEMINI_API_KEY already set on Railway for mockup generation.

const BRIEF_PROMPT = `You are a sportswear production spec writer for Sideline NZ. Look at the garment mockup image(s) and write ONE short paragraph describing what the factory needs to know to produce it.

Cover (only what's relevant): garment type and silhouette; dominant colour zones (which colour goes where on body / panels / trim); logo positions (left chest, right chest, centre back, etc.); collar/cuff style; any unusual pattern, fade, gradient, or sublimation detail; key front and back distinctions.

Rules:
- ONE paragraph. 80–120 words. NO section headers, NO bullet lists, NO markdown.
- Plain factory English. Skip anything that's not visible. Don't describe image quality or background.
- If two images (front + back), integrate them into the one paragraph.`;

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
        generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
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
