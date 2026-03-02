-- AlterTable
ALTER TABLE "StoredFile" ADD COLUMN     "sourceAuthors" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sourcePublishedAt" TIMESTAMP(3);
