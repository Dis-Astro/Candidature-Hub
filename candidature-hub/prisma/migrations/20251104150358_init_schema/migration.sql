-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RECRUITER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('SUCCESS', 'DUPLICATE', 'UPDATED', 'ERROR');

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" VARCHAR(320),
    "emailNormalized" TEXT,
    "phone" VARCHAR(64),
    "phoneNormalized" TEXT,
    "mansione" TEXT,
    "mansioneAltro" TEXT,
    "rating" INTEGER,
    "winningSkill" TEXT,
    "notes" TEXT,
    "interviewed" BOOLEAN NOT NULL DEFAULT false,
    "interviewedAt" TIMESTAMP(3),

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_files" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "path" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha1" TEXT NOT NULL,
    "extractedText" TEXT,
    "candidateId" TEXT NOT NULL,

    CONSTRAINT "cv_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date" TIMESTAMP(3) NOT NULL,
    "interviewer" TEXT,
    "notes" TEXT,
    "score" INTEGER,
    "age" TEXT,
    "residence" TEXT,
    "education" TEXT,
    "drivingLicense" TEXT,
    "trainingCourses" TEXT,
    "travelAvailability" TEXT,
    "currentJobStatus" TEXT,
    "possibleStartDate" TEXT,
    "requestedSalary" TEXT,
    "experiences" TEXT,
    "skills" TEXT,
    "knownSoftware" TEXT,
    "candidateId" TEXT NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_events" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ImportStatus" NOT NULL,
    "message" TEXT,
    "resend" BOOLEAN NOT NULL DEFAULT false,
    "candidateId" TEXT NOT NULL,
    "cvFileId" TEXT,

    CONSTRAINT "import_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_tags" (
    "candidateId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "candidate_tags_pkey" PRIMARY KEY ("candidateId","tagId")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'RECRUITER',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "diff" JSONB,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "candidates_emailNormalized_key" ON "candidates"("emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_phoneNormalized_key" ON "candidates"("phoneNormalized");

-- CreateIndex
CREATE INDEX "candidates_lastName_firstName_idx" ON "candidates"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "candidates_mansione_rating_idx" ON "candidates"("mansione", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "cv_files_sha1_key" ON "cv_files"("sha1");

-- CreateIndex
CREATE INDEX "cv_files_candidateId_idx" ON "cv_files"("candidateId");

-- CreateIndex
CREATE INDEX "interviews_candidateId_date_idx" ON "interviews"("candidateId", "date");

-- CreateIndex
CREATE INDEX "import_events_candidateId_createdAt_idx" ON "import_events"("candidateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_createdAt_idx" ON "audit_logs"("entity", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "cv_files" ADD CONSTRAINT "cv_files_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_events" ADD CONSTRAINT "import_events_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_events" ADD CONSTRAINT "import_events_cvFileId_fkey" FOREIGN KEY ("cvFileId") REFERENCES "cv_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_tags" ADD CONSTRAINT "candidate_tags_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_tags" ADD CONSTRAINT "candidate_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
