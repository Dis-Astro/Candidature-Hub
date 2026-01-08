-- Baseline for existing column/index found in DB (drift fix)
ALTER TABLE "candidates"
  ADD COLUMN IF NOT EXISTS "discarded" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "candidates_discarded_idx" ON "candidates" ("discarded");
