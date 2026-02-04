-- AlterTable
ALTER TABLE "SourceRevision" ADD COLUMN     "pipelineConfigId" TEXT;

-- CreateTable
CREATE TABLE "PipelineConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "configHash" TEXT NOT NULL,
    "codeSha" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptureEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorName" TEXT,
    "requestId" TEXT,
    "pipelineConfigId" TEXT NOT NULL,
    "captureType" "CaptureType" NOT NULL,
    "sourceUrl" TEXT,
    "urlId" INTEGER,
    "storedFileId" TEXT NOT NULL,
    "documentRevisionId" TEXT NOT NULL,

    CONSTRAINT "CaptureEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineConfig_name_idx" ON "PipelineConfig"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineConfig_name_version_configHash_key" ON "PipelineConfig"("name", "version", "configHash");

-- CreateIndex
CREATE UNIQUE INDEX "CaptureEvent_storedFileId_key" ON "CaptureEvent"("storedFileId");

-- CreateIndex
CREATE UNIQUE INDEX "CaptureEvent_documentRevisionId_key" ON "CaptureEvent"("documentRevisionId");

-- CreateIndex
CREATE INDEX "CaptureEvent_urlId_idx" ON "CaptureEvent"("urlId");

-- CreateIndex
CREATE INDEX "CaptureEvent_createdAt_idx" ON "CaptureEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SourceRevision_pipelineConfigId_idx" ON "SourceRevision"("pipelineConfigId");

-- AddForeignKey
ALTER TABLE "SourceRevision" ADD CONSTRAINT "SourceRevision_pipelineConfigId_fkey" FOREIGN KEY ("pipelineConfigId") REFERENCES "PipelineConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureEvent" ADD CONSTRAINT "CaptureEvent_pipelineConfigId_fkey" FOREIGN KEY ("pipelineConfigId") REFERENCES "PipelineConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureEvent" ADD CONSTRAINT "CaptureEvent_urlId_fkey" FOREIGN KEY ("urlId") REFERENCES "Url"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureEvent" ADD CONSTRAINT "CaptureEvent_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureEvent" ADD CONSTRAINT "CaptureEvent_documentRevisionId_fkey" FOREIGN KEY ("documentRevisionId") REFERENCES "DocumentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
