-- DropIndex
DROP INDEX "public"."cv_files_sha1_key";

-- AlterTable
ALTER TABLE "interviews" ADD COLUMN     "scemoCertified" BOOLEAN NOT NULL DEFAULT false;
