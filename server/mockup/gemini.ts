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

function buildPrompt(opts: GeminiGenerateOptions): string {
  const sport = opts.sport.toLowerCase();
  const template = SPORT_TEMPLATES[sport] || SPORT_TEMPLATES.rugby;
  const direction = DESIGN_DIRECTIONS[opts.designNumber - 1] || DESIGN_DIRECTIONS[0];

  const colorDesc = [
    `primary color ${opts.primaryColor}`,
    opts.secondaryColor ? `secondary color ${opts.secondaryColor}` : null,
    opts.accentColor ? `accent color ${opts.accentColor}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return `Create a professional product mockup photograph of a custom ${template.garments} for "${opts.teamName}".

Design style: ${direction.style}.
Sport aesthetic: ${template.style}.
Design details: ${template.details}.
Team colors: ${colorDesc}.
${opts.logoUrl ? "Include a placeholder area on the chest for the team logo/crest." : ""}

The mockup should be:
- Photographed on a clean white/light grey studio background
- Laid flat or on an invisible mannequin, showing front view
- Professional product photography quality, sharp focus
- The uniform should look like a real manufactured garment, not a drawing
- High contrast, vivid colors matching the exact hex values provided
- No human models, no faces, just the garment mockup

Style: ${direction.name} — ${direction.style}`;
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
