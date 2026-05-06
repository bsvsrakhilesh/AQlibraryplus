import { Worker, type ConnectionOptions } from "bullmq";
import prisma from "../config/database";
import { env, requireOpenAI } from "../config/env";
import {
  embedTexts,
  embeddingModelLabel,
  getEmbeddingConfig,
  toPgVectorLiteral,
} from "../services/embeddings.service";
import {
  markJobFailed,
  markJobProgress,
  markJobRunning,
  markJobSucceeded,
} from "../services/jobTelemetry.service";
import { log } from "../utils/logger";

function bullConnection(): ConnectionOptions {
  const u = new URL(env.REDIS_URL);
  return {
    host: u.hostname,
    port: Number(u.port || "6379"),
    username: u.username || undefined,
    password: u.password || undefined,
    db: u.pathname ? Number(u.pathname.replace("/", "") || "0") : 0,
    maxRetriesPerRequest: null,
  };
}

export const embeddingWorker = new Worker(
  "embeddings",
  async (job) => {
    requireOpenAI();

    const { sourceId } = job.data as { sourceId: string };
    if (!sourceId) throw new Error("Missing sourceId");
    const embeddingConfig = getEmbeddingConfig();
    const embeddingLabel = embeddingModelLabel(embeddingConfig);

    const src = await prisma.notebookSource.findUnique({
      where: { id: sourceId },
      select: { activeRevisionId: true },
    });

    if (!src) {
      log.warn("embedding_job_orphaned_source_skipped", {
        sourceId,
        queueJobId: job.id,
      });
      return;
    }

    await markJobRunning(prisma, "embedding", sourceId, {
      queueJobId: job.id,
      stage: "starting",
      progressPct: 4,
      statusMessage: "Worker picked up embedding job",
      meta: {
        bullJobName: job.name,
        model: embeddingConfig.model,
        dimensions: embeddingConfig.dimensions,
        batchSize: embeddingConfig.batchSize,
      },
    });

    log.info("embedding_job_started", {
      sourceId,
      queueJobId: job.id,
      model: embeddingConfig.model,
      dimensions: embeddingConfig.dimensions,
    });

    await markJobProgress(prisma, "embedding", sourceId, {
      stage: "loading_chunks",
      progressPct: 16,
      statusMessage: "Loading chunks for active revision",
      meta: { activeRevisionId: src?.activeRevisionId ?? null },
    });

    const chunks = await prisma.sourceChunk.findMany({
      where: {
        sourceId,
        revisionId: src?.activeRevisionId ?? undefined,
        OR: [{ embeddedAt: null }, { embeddingModel: { not: embeddingLabel } }],
      },
      orderBy: { idx: "asc" },
      select: { id: true, text: true },
    });

    if (!chunks.length) {
      await markJobSucceeded(prisma, "embedding", sourceId, {
        stage: "completed",
        statusMessage: "All chunks are already indexed",
        meta: {
          indexedChunkCount: 0,
          model: embeddingConfig.model,
          dimensions: embeddingConfig.dimensions,
        },
      });
      return;
    }

    await markJobProgress(prisma, "embedding", sourceId, {
      stage: "embedding_model_call",
      progressPct: 48,
      statusMessage: `Embedding ${chunks.length} chunk(s)`,
      meta: {
        chunkCount: chunks.length,
        model: embeddingConfig.model,
        dimensions: embeddingConfig.dimensions,
        batchSize: embeddingConfig.batchSize,
      },
    });

    const texts = chunks.map((c) => c.text);
    const embeddings = await embedTexts(texts, embeddingConfig.model, {
      dimensions: embeddingConfig.dimensions,
      batchSize: embeddingConfig.batchSize,
      onBatchStart: async (progress) => {
        const pct = 18 + Math.round((progress.batchIndex / progress.batchCount) * 42);
        await markJobProgress(prisma, "embedding", sourceId, {
          stage: "embedding_model_call",
          progressPct: pct,
          statusMessage: `Embedding batch ${progress.batchIndex}/${progress.batchCount}`,
          meta: {
            ...progress,
            chunkCount: chunks.length,
          },
        });
      },
      onBatchComplete: async (progress) => {
        await markJobProgress(prisma, "embedding", sourceId, {
          stage: "embedding_model_call",
          progressPct: 60,
          statusMessage: `Embedded batch ${progress.batchIndex}/${progress.batchCount}`,
          meta: {
            ...progress,
            chunkCount: chunks.length,
          },
        });
      },
    });
    if (embeddings.length !== chunks.length) {
      throw new Error("Embedding count mismatch.");
    }

    await markJobProgress(prisma, "embedding", sourceId, {
      stage: "persisting_embeddings",
      progressPct: 82,
      statusMessage: "Persisting vector index rows",
      meta: {
        chunkCount: chunks.length,
        model: embeddingConfig.model,
        dimensions: embeddingConfig.dimensions,
        batchSize: embeddingConfig.batchSize,
      },
    });

    const now = new Date();
    for (let i = 0; i < chunks.length; i += embeddingConfig.batchSize) {
      const chunkBatch = chunks.slice(i, i + embeddingConfig.batchSize);
      await prisma.$transaction(
        chunkBatch.map((row, batchIndex) => {
          const absoluteIndex = i + batchIndex;
          const v = toPgVectorLiteral(embeddings[absoluteIndex]);
          return prisma.$executeRaw`
            UPDATE "SourceChunk"
            SET "embedding" = ${v}::vector,
                "embeddingModel" = ${embeddingLabel},
                "embeddedAt" = ${now}
            WHERE "id" = ${row.id}
          `;
        }),
      );

      await markJobProgress(prisma, "embedding", sourceId, {
        stage: "persisting_embeddings",
        progressPct: 82 + Math.round(((i + chunkBatch.length) / chunks.length) * 15),
        statusMessage: `Persisted ${i + chunkBatch.length}/${chunks.length} embeddings`,
        meta: {
          persistedChunkCount: i + chunkBatch.length,
          chunkCount: chunks.length,
          model: embeddingConfig.model,
          dimensions: embeddingConfig.dimensions,
        },
      });
    }

    await markJobSucceeded(prisma, "embedding", sourceId, {
      stage: "completed",
      statusMessage: "Semantic index is ready",
      meta: {
        chunkCount: chunks.length,
        model: embeddingConfig.model,
        dimensions: embeddingConfig.dimensions,
      },
    });

    log.info("embedding_job_succeeded", {
      sourceId,
      queueJobId: job.id,
      chunkCount: chunks.length,
      model: embeddingConfig.model,
      dimensions: embeddingConfig.dimensions,
    });
  },
  {
    connection: bullConnection(),
    concurrency: env.EMBEDDING_QUEUE_CONCURRENCY,
  },
);

embeddingWorker.on("failed", async (job, err) => {
  const sourceId = (job?.data as any)?.sourceId;
  if (!sourceId) return;

  try {
    const embeddingConfig = getEmbeddingConfig();
    await markJobFailed(prisma, "embedding", sourceId, {
      stage: "failed",
      statusMessage: "Embedding job failed",
      error: err?.message ?? String(err),
      meta: {
        queueJobId: job?.id ?? null,
        model: embeddingConfig.model,
        dimensions: embeddingConfig.dimensions,
      },
    });
  } catch (telemetryError: any) {
    log.warn("embedding_job_failed_telemetry_skipped", {
      sourceId,
      queueJobId: job?.id ?? null,
      error: telemetryError?.message ?? String(telemetryError),
    });
  }

  log.error("embedding_job_failed", {
    sourceId,
    queueJobId: job?.id ?? null,
    error: err?.message ?? String(err),
    model: getEmbeddingConfig().model,
  });
});
