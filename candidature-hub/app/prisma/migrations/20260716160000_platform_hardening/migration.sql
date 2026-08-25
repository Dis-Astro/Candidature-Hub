DO $$ BEGIN
  CREATE TYPE "CandidateStatus" AS ENUM ('DA_VALUTARE', 'SCARTATO', 'SHORTLIST', 'ASSUMERE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "candidates"
  ADD COLUMN IF NOT EXISTS "status" "CandidateStatus" NOT NULL DEFAULT 'DA_VALUTARE';

UPDATE "candidates" c
SET "status" = CASE
  WHEN c."discarded" THEN 'SCARTATO'::"CandidateStatus"
  WHEN EXISTS (SELECT 1 FROM "interviews" i WHERE i."candidateId" = c.id AND i."decision" = 'ASSUME')
    THEN 'ASSUMERE'::"CandidateStatus"
  WHEN c."rating" >= 5 THEN 'SHORTLIST'::"CandidateStatus"
  ELSE 'DA_VALUTARE'::"CandidateStatus"
END;

ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "profileVerified" BOOLEAN NOT NULL DEFAULT false;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interviews' AND column_name = 'scemoCertified') THEN
    EXECUTE 'UPDATE "interviews" SET "profileVerified" = "scemoCertified"';
    EXECUTE 'ALTER TABLE "interviews" DROP COLUMN "scemoCertified"';
  END IF;
END $$;

ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "details" TEXT;

ALTER TABLE "system_config"
  ADD COLUMN IF NOT EXISTS "storageRoot" TEXT NOT NULL DEFAULT '/data',
  ADD COLUMN IF NOT EXISTS "mailInboxPath" TEXT NOT NULL DEFAULT '/data/inbox/mail',
  ADD COLUMN IF NOT EXISTS "manualInboxPath" TEXT NOT NULL DEFAULT '/data/inbox/manual',
  ADD COLUMN IF NOT EXISTS "attachmentsPath" TEXT NOT NULL DEFAULT '/data/attachments',
  ADD COLUMN IF NOT EXISTS "backupPath" TEXT NOT NULL DEFAULT '/data/backups',
  ADD COLUMN IF NOT EXISTS "errorPath" TEXT NOT NULL DEFAULT '/data/error',
  ADD COLUMN IF NOT EXISTS "mailEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "parserPollSeconds" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "useExternalDb" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "extDbHost" TEXT NOT NULL DEFAULT 'localhost',
  ADD COLUMN IF NOT EXISTS "extDbPort" INTEGER NOT NULL DEFAULT 5432,
  ADD COLUMN IF NOT EXISTS "extDbName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "extDbUser" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "extDbPass" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "extDbSsl" BOOLEAN NOT NULL DEFAULT false;

-- Containers always see the host/NAS bind mount as /data.
UPDATE "system_config"
SET "storageRoot" = '/data',
    "mailInboxPath" = '/data/inbox/mail',
    "manualInboxPath" = '/data/inbox/manual',
    "processedPath" = '/data/processed',
    "attachmentsPath" = '/data/attachments',
    "backupPath" = '/data/backups'
    , "errorPath" = '/data/error'
WHERE id = 'main';

-- Rewrite paths produced by the legacy systemd installation. Mount the old
-- /mnt/nas_curriculum/mail2pdf directory as STORAGE_HOST_PATH.
UPDATE "cv_files" SET path = regexp_replace(path, '^/mnt/nas_curriculum/mail2pdf', '/data')
WHERE path LIKE '/mnt/nas_curriculum/mail2pdf/%';
UPDATE "attachments" SET path = regexp_replace(path, '^/mnt/nas_curriculum/mail2pdf', '/data')
WHERE path LIKE '/mnt/nas_curriculum/mail2pdf/%';

ALTER TABLE "system_config" DROP COLUMN IF EXISTS "nasPath", DROP COLUMN IF EXISTS "parserTimerSec";

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_tokenHash_key" ON "sessions"("tokenHash");
CREATE INDEX IF NOT EXISTS "sessions_userId_expiresAt_idx" ON "sessions"("userId", "expiresAt");
CREATE INDEX IF NOT EXISTS "candidates_status_updatedAt_idx" ON "candidates"("status", "updatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "candidates_firstName_lastName_submissionIndex_key"
  ON "candidates"("firstName", "lastName", "submissionIndex");
ALTER TABLE "cv_files" ADD COLUMN IF NOT EXISTS "sourceKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "cv_files_sourceKey_key" ON "cv_files"("sourceKey");
ALTER TABLE "system_config" ALTER COLUMN "retentionDays" SET DEFAULT 365;
