ALTER TABLE import_events
  ALTER COLUMN "candidateId" DROP NOT NULL;

-- se "cvFileId" è NOT NULL nel tuo schema, rendilo nullable (idempotente: ignora errore se già nullable)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='import_events'
      AND column_name='cvFileId'
      AND is_nullable='NO'
  ) THEN
    EXECUTE 'ALTER TABLE import_events ALTER COLUMN "cvFileId" DROP NOT NULL;';
  END IF;
END$$;
