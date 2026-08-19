// The Sideline mockup prompt, as the designer receives it.
//
// REWRITTEN 2026-07-30 on the Richmond Rovers pattern, after mining the local
// corpus (6 configs, 235 renders). The numbers were not kind to the old version:
//
//   config            avg expanded prompt   renders
//   aorere-college          1,794 chars        20
//   bob-tag                 2,658 chars         6   <- the one shipped to designers
//
// bob-tag had the LONGEST prompts in the corpus and the fewest renders of the
// working configs, and it was the template handed to freelancers. Nearly all the
// excess was the DO-NOT block (809 vs 604 chars) stacking prohibitions: don't
// copy the wordmark, don't copy letters, don't tile an S, no emblem, no badge,
// no shield, no monogram. Piling on negatives is a known way to make an image
// model fixate on the very thing being forbidden.
//
// richmond-rovers-u12.gemini-prompts.md is the only file in the workspace marked
// "proven, producing clean matching FRONT + BACK in one style". Its per-garment
// prompt is about four lines, positive and visual, with the negatives stated
// ONCE and briefly. That is the shape copied here.
//
// Rule of thumb this encodes: describe what you want to SEE. Say each "no" once.
//
// SECOND, BIGGER FINDING (2026-07-30). Reading the 173 Gemini renders Romero
// actually DOWNLOADED — the ones he chose to keep — the old blocks described the
// wrong picture entirely. His kept garment renders are FLAT TECHNICAL MOCKUPS on
// PURE WHITE: no mannequin, no body, no studio lighting, no contact shadow. A
// spec drawing that happens to carry real fabric texture. Every previous version
// of this file asked for "ghost mannequin / light-grey seamless background / soft
// even studio lighting / catalogue photography", which is a different product.
// Sample: 2 garment renders (a hoodie back and shorts front, 20-21 Jul, his most
// recent kit work) — small, but they agree with each other completely, and they
// are matching pieces of one set.

export const BASE_BLOCK =
  "Flat technical apparel mockup of a single garment, laid out front-on and filling the frame, on a pure white " +
  "background. No mannequin, no body, no hanger, no drop shadow, no studio lighting or background sweep. Photoreal fabric " +
  "detail — visible knit or mesh weave, stitched seams, ribbed cuffs and hem. Crisp high-resolution product " +
  "illustration. No people, no text, no watermarks.";

export const BRAND_BLOCK =
  "Sideline detailing: a plain white woven neck tape lining the inside of the back neckline, " +
  "and clean contrast piping along the collar edge.";

/**
 * One short line, said once. The old version repeated seven prohibitions per
 * garment; this states the single thing that actually matters — a bare chest —
 * because the crest is composited in Canva at the finishing step.
 */
export const DONOT_BLOCK =
  "The chest and body are completely bare: no crest, badge, emblem, monogram or lettering anywhere on the garment. " +
  "One garment, one viewing angle.";

export interface PromptGarment { name: string; prompt: string }
export interface PromptPack {
  /** Per-club design language. Positive and visual — what the kit LOOKS like. */
  design?: string;
  /** A per-job trap, if there genuinely is one. Keep it to a sentence. */
  donotExtra?: string;
  garments?: PromptGarment[];
}

/** Expand a garment's TASK line into the full prompt a designer pastes. */
export function expandPrompt(g: PromptGarment, pack: PromptPack): string {
  return g.prompt
    .replace(/\{BASE\}/g, BASE_BLOCK)
    .replace(/\{DESIGN\}/g, pack.design || "")
    .replace(/\{BRAND\}/g, BRAND_BLOCK)
    .replace(/\{DONOT\}/g, DONOT_BLOCK + (pack.donotExtra ? " " + pack.donotExtra : ""))
    .replace(/\s+/g, " ")
    .trim();
}

/** Guidance shown to whoever writes a brief, so new packs stay on the pattern. */
export const PROMPT_STYLE_NOTE =
  "Flat mockup on white, never a mannequin or a studio shot. Tonal all-over pattern (dark on dark) reads better " +
  "than high-contrast print. Keep the set consistent: same pattern language and accent shapes on every garment. " +
  "Write each garment line as what you want to SEE: garment type, cut, colour split, where the pattern sits. " +
  "Four lines is plenty. Resist adding prohibitions — every extra 'do not' makes the engine more likely to " +
  "produce the thing you are forbidding. The measured version of this advice: our longest prompt set produced " +
  "the fewest usable renders.";
