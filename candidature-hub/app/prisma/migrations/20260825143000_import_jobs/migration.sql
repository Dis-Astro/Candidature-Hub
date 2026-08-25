CREATE TABLE IF NOT EXISTS "import_jobs" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "filename" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "message" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "threat" TEXT,
  "candidateId" TEXT,
  CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "import_jobs_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "import_jobs_path_key" ON "import_jobs"("path");
CREATE INDEX IF NOT EXISTS "import_jobs_status_createdAt_idx" ON "import_jobs"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "import_jobs_source_createdAt_idx" ON "import_jobs"("source", "createdAt");
ALTER TABLE "system_config" ADD COLUMN IF NOT EXISTS "mailRetentionDays" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "system_config" ADD COLUMN IF NOT EXISTS "backupRetentionDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "system_config" ADD COLUMN IF NOT EXISTS "errorRetentionDays" INTEGER NOT NULL DEFAULT 30;
