// The Sideline mockup prompt, as the designer receives it.
//
// Ported from the proven Gemini Gem ("Sideline Mockup Prompt Builder") and the
// canva-bridge configs. The Gem is Romero's private custom Gem, which a
// freelancer cannot open — so the whole thing is inlined here instead. A
// designer with any free Gemini account gets identical output without needing
// access to anything of his.
//
// BASE, BRAND and DONOT never change. Only DESIGN and the per-garment TASK line
// are per club, and those live on the job row.

export const BASE_BLOCK =
  "Premium 3D product render of a SINGLE custom team garment, ghost-mannequin (invisible body) form, floating, no hanger. " +
  "Studio catalogue quality, soft even lighting, sharp focus, photoreal 3D mockup. Background is a plain seamless mid-grey " +
  "studio sweep with a soft contact shadow, no brush strokes, no decorative shapes, no props, no text anywhere.";

export const BRAND_BLOCK =
  "SIDELINE INNER COLLAR: render the inside back of the neckline showing a plain WHITE woven neck-tape band (the Sideline " +
  "neck tape), clean and simple; the exact branded wordmark is added later. Add clean contrast piping along the collar edge. " +
  "This band is INSIDE the garment only.";

export const DONOT_BLOCK =
  "STRICT, DO NOT: the garment is completely PLAIN. The chest and body are completely BARE, NO crest, badge, shield, circular " +
  "emblem, monogram or logo anywhere. ABSOLUTELY NO text, letters, words, numbers or wordmarks anywhere on the garment. " +
  "NO sponsor logos, NO exterior Sideline S tag. Do NOT tile any letters or an S logo as the fabric pattern. No mannequin " +
  "body, face, hands, hanger or props. Render ONE garment from ONE single viewing angle only, never front and back together, " +
  "never two garments. Keep the background a plain seamless studio sweep. No watermarks.";

export interface PromptGarment { name: string; prompt: string }
export interface PromptPack {
  /** Per-club design language. The only creative block that varies. */
  design?: string;
  /** Extra per-job traps appended to the standing DO NOT block. */
  donotExtra?: string;
  garments?: PromptGarment[];
}

/** Expand a garment's TASK line into the full prompt a designer pastes. */
export function expandPrompt(g: PromptGarment, pack: PromptPack): string {
  return g.prompt
    .replace(/\{BASE\}/g, BASE_BLOCK)
    .replace(/\{DESIGN\}/g, pack.design || "")
    .replace(/\{BRAND\}/g, BRAND_BLOCK)
    .replace(/\{DONOT\}/g, DONOT_BLOCK + (pack.donotExtra ? " THIS JOB: " + pack.donotExtra : ""))
    .replace(/\s+/g, " ")
    .trim();
}
