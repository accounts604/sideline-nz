-- Design references on the intake (2026-07-30).
--
-- Romero's rule, adopted 2026-07-30: a Sideline design is only ever built from a
-- reference the club supplied or he approved. Never invented. The reason is not
-- tidiness, it is risk: most Sideline clubs are Pacific and Maori, and an AI or a new
-- designer inventing a "plausible" tatau, siapo or kowhaiwhai pattern produces
-- something culturally wrong that nobody in the loop notices until the club does.
-- Working only from a supplied reference moves that authority to the club, where it
-- belongs, and it turns the biggest judgement risk into a structural constraint.
--
-- It also happens to be the higher-quality path. Romero's own prompts say
-- "reinterpret", never "copy", because copying a reference directly renders BLURRY.
-- Reinterpreting a real reference beats generating from a text description, which is
-- the mode Gemini hallucinates in most.
--
-- The problem this fixes: mockup_requests carried contact details, team, sport, three
-- colour hexes, an optional logo and free-text notes. There was NO field for a design
-- reference at all. So the one input the entire design depends on could not be
-- captured, and every job reaching the designer board was missing it.
--
-- logo_url already exists and is the club CREST. This is deliberately separate: a
-- crest is placed (in Canva, afterwards), a reference is interpreted (at render time).
-- Conflating them is how a crest ends up rendered into a garment, which is a reject.

ALTER TABLE mockup_requests
  ADD COLUMN IF NOT EXISTS reference_urls text[];

COMMENT ON COLUMN mockup_requests.reference_urls IS
  'Design references supplied by the club: pattern, old kit, concept board, colourway. Interpreted at render time, never copied. Distinct from logo_url, which is the crest and is placed in Canva afterwards.';
