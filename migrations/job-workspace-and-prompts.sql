-- Give a designer job the two things a freelancer actually needs to do the work
-- (2026-07-28). Romero's decision: designers use their OWN free Gemini account,
-- and he shares a Canva doc per drop. They never receive a key and never need
-- access to his private "Sideline Mockup Prompt Builder" Gem.
--
--   canva_url   — the shared Canva design workspace for this drop
--   prompt_pack — {design, donotExtra, garments:[{name,prompt}]}, the per-club
--                 half of the mockup prompt. BASE/BRAND/DONOT live in
--                 shared/mockup-prompt.ts because they never change.
ALTER TABLE designer_jobs ADD COLUMN IF NOT EXISTS canva_url text;
ALTER TABLE designer_jobs ADD COLUMN IF NOT EXISTS prompt_pack jsonb;
