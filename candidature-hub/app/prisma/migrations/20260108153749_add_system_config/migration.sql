/*
  Warnings:

  - You are about to drop the column `diff` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `entityId` on the `audit_logs` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."audit_logs_entity_entityId_createdAt_idx";

-- DropIndex
DROP INDEX "public"."candidates_emailNormalized_key";

-- DropIndex
DROP INDEX "public"."candidates_phoneNormalized_key";

-- AlterTable
ALTER TABLE "audit_logs" DROP COLUMN "diff",
DROP COLUMN "entityId";

-- AlterTable
ALTER TABLE "import_events" ALTER COLUMN "candidateId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "system_config" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nasPath" TEXT NOT NULL DEFAULT '/mnt/nas_curriculum/mail2pdf',
    "processedPath" TEXT NOT NULL DEFAULT '/mnt/nas_curriculum/mail2pdf/processed',
    "imapHost" TEXT NOT NULL DEFAULT '',
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "imapUser" TEXT NOT NULL DEFAULT '',
    "imapPass" TEXT NOT NULL DEFAULT '',
    "imapMailbox" TEXT NOT NULL DEFAULT 'INBOX',
    "pollSeconds" INTEGER NOT NULL DEFAULT 60,
    "postAction" TEXT NOT NULL DEFAULT 'move',
    "moveFolder" TEXT NOT NULL DEFAULT 'Processed',
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "alertTo" TEXT NOT NULL DEFAULT '',
    "smtpHost" TEXT NOT NULL DEFAULT '',
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpUser" TEXT NOT NULL DEFAULT '',
    "smtpPass" TEXT NOT NULL DEFAULT '',
    "parserTimerSec" INTEGER NOT NULL DEFAULT 60,
    "ocrEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);
