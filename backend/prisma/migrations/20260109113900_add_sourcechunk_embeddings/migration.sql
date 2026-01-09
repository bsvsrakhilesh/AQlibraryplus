-- Enable pgvector (needed for both main DB and Prisma shadow DB)
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "SourceChunk" ADD COLUMN     "embeddedAt" TIMESTAMP(3),
ADD COLUMN     "embedding" vector(1536),
ADD COLUMN     "embeddingModel" TEXT;
