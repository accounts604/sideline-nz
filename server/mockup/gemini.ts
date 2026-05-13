/**
 * Gemini image generation service for sport-specific mockup designs.
 * Generates 4 unique uniform mockup designs per request.
 */

interface GeminiGenerateOptions {
  sport: string;
  teamName: string;
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
  designNumber: number; // 1-4
}

interface GeminiResult {
  imageBase64: string;
  mimeType: string;
  prompt: string;
  generationTimeMs: number;
}

// Sport-specific design templates for better prompt engineering
const SPORT_TEMPLATES: Record<string, { garments: string; style: string; details: string }> = {
  rugby: {
    garments: "rugby jersey, rugby shorts, and rugby socks",
    style: "tough, athletic, professional rugby union",
    details: "reinforced collar, sublimated print, ventilation panels on sides",
  },
  netball: {
    garments: "netball dress with integrated shorts",
    style: "modern, sleek, feminine athletic",
    details: "fitted bodice, A-line skirt with built-in shorts, breathable mesh panels",
  },
  cricket: {
    garments: "cricket polo shirt and cricket trousers",
    style: "classic cricket, clean and professional",
    details: "buttoned collar, moisture-wicking fabric, side piping detail",
  },
  basketball: {
    garments: "basketball singlet and basketball shorts",
    style: "bold, modern, NBA-inspired",
    details: "wide shoulder straps, side panels, elastic waistband shorts",
  },
  hockey: {
    garments: "hockey jersey and hockey skort or shorts",
    style: "athletic, sleek field hockey",
    details: "v-neck, sublimated design, breathable panels",
  },
  football: {
    garments: "football/soccer jersey and shorts with socks",
    style: "modern football kit, professional",
    details: "crew neck, raglan sleeves, side vents, contrast trim",
  },
  league: {
    garments: "rugby league jersey and shorts",
    style: "bold, powerful, rugby league",
    details: "v-neck or crew, sublimated print, reinforced stitching",
  },
  touch: {
    garments: "touch rugby singlet or tee and shorts",
    style: "lightweight, fast, touch rugby",
    details: "lightweight fabric, fitted cut, breathable mesh",
  },
  volleyball: {
    garments: "volleyball jersey and shorts",
    style: "dynamic, athletic volleyball",
    details: "sleeveless or short sleeve, breathable panels, elastic waistband",
  },
};

// 4 unique design direction prompts per request
const DESIGN_DIRECTIONS = [
  {
    name: "Classic Bold",
    style: "classic bold design with strong horizontal or diagonal stripes, clean typography, dominant primary color with secondary accents",
  },
  {
    name: "Modern Gradient",
    style: "modern design with subtle gradient fade between the team colors, geometric patterns, contemporary athletic look",
  },
  {
    name: "Heritage Split",
    style: "heritage-inspired design with vertical halves or quarters in team colors, traditional sport feel with modern touches",
  },
  {
    name: "Dynamic Slash",
    style: "dynamic design with angular slash patterns, asymmetric color blocking, energetic and aggressive athletic aesthetic",
  },
];

// Flat-lay tech-pack prompt. Romero's canonical 2026-05-12 template — zero
// branding on the render (logos are composited in post via elementUrls), strict
// flat-lay framing, and explicit hex callouts so the model honours the exact
// colourway.
function buildPrompt(opts: GeminiGenerateOptions): string {
  const sport = opts.sport.toLowerCase();
  const template = SPORT_TEMPLATES[sport] || SPORT_TEMPLATES.rugby;
  const direction = DESIGN_DIRECTIONS[opts.designNumber - 1] || DESIGN_DIRECTIONS[0];

  const colorBody = opts.primaryColor;
  const colorPanels = opts.secondaryColor || opts.primaryColor;
  const colorTrim = opts.accentColor || opts.secondaryColor || opts.primaryColor;

  // Fabric finish varies by sport — netball/basketball use sheen performance
  // spandex; cricket runs micro-pique; rugby/league/football default to matte
  // performance interlock.
  const fabricFinish =
    sport === "netball" || sport === "basketball" || sport === "volleyball"
      ? "performance gloss with subtle sheen"
      : sport === "cricket"
      ? "matte micro-pique"
      : "matte performance interlock";

  return `Generate a high-resolution photorealistic 3D product mockup of a ${template.garments} rendered as a flat lay photorealistic render on a pure white background.

The garment should be:
- Laid horizontally on a flat surface (flat lay photography)
- Studio photography quality with real fabric texture and material weight visible
- Fully unfolded and symmetrical, showing the complete front panel
- All seams, panels, and construction lines clearly visible
- Zero logos, zero text, zero branding
- Zero wrinkles or distortion — clean and press-ready

Colourway: ${colorBody} body / ${colorPanels} panels / ${colorTrim} trim only

Panel layout: ${direction.style}

Fabric finish: ${fabricFinish}
Style: ${template.style} — ${template.details}
Fit: athletic

Lighting: even studio lighting, minimal shadow, no gradients
Render quality: ultra high resolution, tech pack ready`;
}

export async function generateMockupImage(opts: GeminiGenerateOptions): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const prompt = buildPrompt(opts);
  const startTime = Date.now();

  // Use Gemini 2.0 Flash for image generation (Imagen 3 via Gemini API)
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          temperature: 1.0,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const generationTimeMs = Date.now() - startTime;

  // Extract image from response
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts) {
    throw new Error("No content in Gemini response");
  }

  const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));
  if (!imagePart) {
    throw new Error("No image generated in Gemini response");
  }

  return {
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType,
    prompt,
    generationTimeMs,
  };
}

export { buildPrompt, SPORT_TEMPLATES, DESIGN_DIRECTIONS };
export type { GeminiGenerateOptions, GeminiResult };
