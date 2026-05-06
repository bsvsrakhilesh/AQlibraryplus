import prisma from "../config/database";
import { env } from "../config/env";
import { getEmbeddingConfig } from "./embeddings.service";
import { markStaleRunningJobsFailed } from "./jobTelemetry.service";
import IORedis from "ioredis";

type JobRow = {
  status: string;
  lastHeartbeatAt: Date | null;
};

function summarizeJobRows(rows: JobRow[]) {
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000);

  const summary = {
    pendingCount: 0,
    runningCount: 0,
    successCount: 0,
    failedCount: 0,
    staleRunningCount: 0,
  };

  for (const row of rows) {
    switch (String(row.status)) {
      case "PENDING":
        summary.pendingCount += 1;
        break;
      case "RUNNING":
        summary.runningCount += 1;
        if (!row.lastHeartbeatAt || row.lastHeartbeatAt < staleBefore) {
          summary.staleRunningCount += 1;
        }
        break;
      case "SUCCESS":
        summary.successCount += 1;
        break;
      case "FAILED":
        summary.failedCount += 1;
        break;
      default:
        break;
    }
  }

  return summary;
}

async function checkRedis() {
  const client = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  try {
    await client.connect();
    const pong = await client.ping();
    return { ok: pong === "PONG", message: pong };
  } catch (error: any) {
    return { ok: false, message: error?.message ?? String(error) };
  } finally {
    client.disconnect();
  }
}

async function getRetrievalHealth() {
  const embeddingConfig = getEmbeddingConfig();

  try {
    const [extensionRows, indexRows, columnRows] = await Promise.all([
      prisma.$queryRaw<{ installed: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM pg_extension WHERE extname = 'vector'
        ) AS installed
      `,
      prisma.$queryRaw<{ indexname: string }[]>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'SourceChunk'
          AND indexname IN ('SourceChunk_embedding_hnsw', 'SourceChunk_fts_gin')
      `,
      prisma.$queryRaw<{ type: string }[]>`
        SELECT format_type(a.atttypid, a.atttypmod) AS type
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        WHERE c.relname = 'SourceChunk'
          AND a.attname = 'embedding'
          AND NOT a.attisdropped
      `,
    ]);

    const indexes = new Set(indexRows.map((row) => row.indexname));
    const embeddingColumnType = columnRows[0]?.type ?? "unknown";

    return {
      ok:
        Boolean(extensionRows[0]?.installed) &&
        indexes.has("SourceChunk_embedding_hnsw") &&
        indexes.has("SourceChunk_fts_gin"),
      pgvectorInstalled: Boolean(extensionRows[0]?.installed),
      hnswIndexPresent: indexes.has("SourceChunk_embedding_hnsw"),
      ftsIndexPresent: indexes.has("SourceChunk_fts_gin"),
      embeddingColumnType,
      embeddingConfig,
    };
  } catch (error: any) {
    return {
      ok: false,
      error: error?.message ?? String(error),
      embeddingConfig,
    };
  }
}

export async function getSystemStatus() {
  const staleBefore = new Date(Date.now() - 30 * 60 * 1000);
  const staleRecovery = await markStaleRunningJobsFailed(prisma, staleBefore);

  const [
    ingestionJobs,
    embeddingJobs,
    notebookCount,
    notebookSourceCount,
    noteCount,
    chatRunCount,
    auditLogCount,
    retrieval,
    redis,
  ] = await Promise.all([
    prisma.ingestionJob.findMany({
      select: {
        status: true,
        lastHeartbeatAt: true,
      },
    }),
    prisma.embeddingJob.findMany({
      select: {
        status: true,
        lastHeartbeatAt: true,
      },
    }),
    prisma.notebook.count(),
    prisma.notebookSource.count(),
    prisma.note.count(),
    prisma.notebookChatRun.count(),
    prisma.auditLog.count(),
    getRetrievalHealth(),
    checkRedis(),
  ]);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    auth: {
      devAuthEnabled: env.DEV_AUTH_ENABLED,
      headerAuthSupported: true,
    },
    services: {
      redisConfigured: Boolean(env.REDIS_URL),
      redisReachable: redis.ok,
      redisMessage: redis.message,
      openaiEnabled: env.OPENAI_ENABLED,
      icnEnabled: env.ICN_ENABLED,
    },
    retrieval,
    queues: {
      ingestionConcurrency: env.INGESTION_QUEUE_CONCURRENCY,
      embeddingConcurrency: env.EMBEDDING_QUEUE_CONCURRENCY,
      ingestion: summarizeJobRows(ingestionJobs),
      embedding: summarizeJobRows(embeddingJobs),
      staleRecovery,
    },
    data: {
      notebookCount,
      notebookSourceCount,
      noteCount,
      chatRunCount,
      auditLogCount,
    },
  };
}
