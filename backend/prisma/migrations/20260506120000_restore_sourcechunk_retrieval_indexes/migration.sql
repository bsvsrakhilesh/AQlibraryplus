-- Restore retrieval indexes dropped during the source revision migration.
-- These are intentionally additive/idempotent for existing environments.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX IF NOT EXISTS "SourceChunk_fts_gin"
ON "SourceChunk" USING GIN ("fts");

CREATE INDEX IF NOT EXISTS "SourceChunk_embedding_hnsw"
ON "SourceChunk" USING hnsw ("embedding" vector_cosine_ops)
WHERE "embedding" IS NOT NULL;
