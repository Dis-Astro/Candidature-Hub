-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('CV', 'AUDIO_COLLOQUIO', 'DOCUMENTO', 'IMMAGINE', 'NOTE', 'ALTRO');

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "type" "AttachmentType" NOT NULL DEFAULT 'ALTRO',
    "path" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL DEFAULT 'system',
    "candidateId" TEXT NOT NULL,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachments_candidateId_createdAt_idx" ON "attachments"("candidateId", "createdAt");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
