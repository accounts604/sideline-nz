-- Add canonical_name column to design_files for the in-app AI worker
-- (2026-05-11). Phase 1 ships a "Suggest name" button on the order detail
-- page; this column stores the accepted canonical name so the rest of the
-- pipeline (Drive folders, PO PDFs, supplier emails) can use a consistent
-- filename without renaming the immutable Vercel Blob URL.

ALTER TABLE design_files
  ADD COLUMN IF NOT EXISTS canonical_name TEXT;
