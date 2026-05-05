CREATE TYPE "CaptureScope" AS ENUM ('SOURCE_PAGE', 'DISCOVERED_DOCUMENT');

ALTER TABLE "StoredFile"
  ADD COLUMN "captureScope" "CaptureScope" NOT NULL DEFAULT 'SOURCE_PAGE',
  ADD COLUMN "discoveredDocumentId" TEXT;

CREATE TABLE "UrlDiscoveryRun" (
  "id" TEXT NOT NULL,
  "sourceUrlId" INTEGER NOT NULL,
  "sourcePageUrl" TEXT NOT NULL,
  "query" TEXT,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "maxDepth" INTEGER NOT NULL DEFAULT 1,
  "candidateCount" INTEGER NOT NULL DEFAULT 0,
  "verifiedCount" INTEGER NOT NULL DEFAULT 0,
  "capturedCount" INTEGER NOT NULL DEFAULT 0,
  "methodSummary" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "UrlDiscoveryRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UrlDiscoveredDocument" (
  "id" TEXT NOT NULL,
  "sourceUrlId" INTEGER NOT NULL,
  "discoveryRunId" TEXT,
  "url" TEXT NOT NULL,
  "canonicalUrl" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "anchorText" TEXT,
  "contextText" TEXT,
  "dateHint" TIMESTAMP(3),
  "rawDateHint" TEXT,
  "fileNameHint" TEXT,
  "contentType" TEXT,
  "contentLength" INTEGER,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "confidence" TEXT NOT NULL DEFAULT 'low',
  "discoveryMethod" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DISCOVERED',
  "rawMeta" JSONB,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "capturedAt" TIMESTAMP(3),
  "captureError" TEXT,

  CONSTRAINT "UrlDiscoveredDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoredFile_discoveredDocumentId_idx" ON "StoredFile"("discoveredDocumentId");
CREATE INDEX "UrlDiscoveryRun_sourceUrlId_startedAt_idx" ON "UrlDiscoveryRun"("sourceUrlId", "startedAt");
CREATE INDEX "UrlDiscoveryRun_status_idx" ON "UrlDiscoveryRun"("status");
CREATE UNIQUE INDEX "UrlDiscoveredDocument_sourceUrlId_canonicalUrl_key" ON "UrlDiscoveredDocument"("sourceUrlId", "canonicalUrl");
CREATE INDEX "UrlDiscoveredDocument_sourceUrlId_score_idx" ON "UrlDiscoveredDocument"("sourceUrlId", "score");
CREATE INDEX "UrlDiscoveredDocument_discoveryRunId_idx" ON "UrlDiscoveredDocument"("discoveryRunId");
CREATE INDEX "UrlDiscoveredDocument_status_idx" ON "UrlDiscoveredDocument"("status");

ALTER TABLE "UrlDiscoveryRun"
  ADD CONSTRAINT "UrlDiscoveryRun_sourceUrlId_fkey"
  FOREIGN KEY ("sourceUrlId") REFERENCES "Url"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UrlDiscoveredDocument"
  ADD CONSTRAINT "UrlDiscoveredDocument_sourceUrlId_fkey"
  FOREIGN KEY ("sourceUrlId") REFERENCES "Url"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UrlDiscoveredDocument"
  ADD CONSTRAINT "UrlDiscoveredDocument_discoveryRunId_fkey"
  FOREIGN KEY ("discoveryRunId") REFERENCES "UrlDiscoveryRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StoredFile"
  ADD CONSTRAINT "StoredFile_discoveredDocumentId_fkey"
  FOREIGN KEY ("discoveredDocumentId") REFERENCES "UrlDiscoveredDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
