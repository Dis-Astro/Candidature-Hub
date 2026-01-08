-- Indici FTS (richiede estensione unaccent)
CREATE INDEX IF NOT EXISTS idx_candidates_notes_fts
ON candidates USING GIN (to_tsvector('simple', unaccent(coalesce(notes, ''))));

CREATE INDEX IF NOT EXISTS idx_cv_files_text_fts
ON cv_files USING GIN (to_tsvector('simple', unaccent(coalesce(extractedtext, ''))));
