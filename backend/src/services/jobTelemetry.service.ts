import type { PrismaClient, Prisma } from "../generated/prisma/client";

type DbLike = PrismaClient | Prisma.TransactionClient;
type JobKind = "ingestion" | "embedding";

type JobTelemetryUpdate = {
  status?: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
  queueJobId?: string | null;
  stage?: string | null;
  progressPct?: number | null;
  statusMessage?: string | null;
  error?: string | null;
  meta?: any;
  attemptIncrement?: boolean;
  started?: boolean;
  finished?: boolean;
  failed?: boolean;
};

function clampProgress(value: number | null | undefined) {
  if (!Number.isFinite(value as number)) return undefined;
  return Math.max(0, Math.min(100, Math.round(Number(value))));
}

function buildData(update: JobTelemetryUpdate) {
  const now = new Date();
  const data: Record<string, any> = {
    lastHeartbeatAt: now,
  };

  if (update.status) data.status = update.status;
  if (update.queueJobId !== undefined) data.queueJobId = update.queueJobId;
  if (update.stage !== undefined) data.stage = update.stage;

  const progressPct = clampProgress(update.progressPct);
  if (progressPct !== undefined) data.progressPct = progressPct;

  if (update.statusMessage !== undefined)
    data.statusMessage = update.statusMessage;
  if (update.error !== undefined) data.error = update.error;
  if (update.meta !== undefined) data.meta = update.meta;
  if (update.attemptIncrement) data.attemptCount = { increment: 1 };
  if (update.started) data.startedAt = now;
  if (update.finished) data.finishedAt = now;
  if (update.failed) data.lastErrorAt = now;

  if (update.status === "SUCCESS") {
    data.error = null;
    data.finishedAt = now;
    data.progressPct = progressPct ?? 100;
  }

  if (update.status === "FAILED") {
    data.finishedAt = now;
    data.lastErrorAt = now;
  }

  return data;
}

function isMissingTelemetryTarget(error: any) {
  return error?.code === "P2025" || error?.code === "P2003";
}

async function upsertJob(
  db: DbLike,
  kind: JobKind,
  sourceId: string,
  create: Record<string, any>,
  update: Record<string, any>,
) {
  try {
    if (kind === "ingestion") {
      return db.ingestionJob.upsert({
        where: { sourceId },
        create: { sourceId, ...create },
        update,
      });
    }

    return db.embeddingJob.upsert({
      where: { sourceId },
      create: { sourceId, ...create },
      update,
    });
  } catch (error: any) {
    if (isMissingTelemetryTarget(error)) return null;
    throw error;
  }
}

async function updateJob(
  db: DbLike,
  kind: JobKind,
  sourceId: string,
  data: Record<string, any>,
) {
  if (kind === "ingestion") {
    return db.ingestionJob.updateMany({ where: { sourceId }, data });
  }

  return db.embeddingJob.updateMany({ where: { sourceId }, data });
}

export async function markJobQueued(
  db: DbLike,
  kind: JobKind,
  sourceId: string,
  args?: {
    queueJobId?: string | null;
    stage?: string;
    statusMessage?: string;
    meta?: any;
  },
) {
  const create = buildData({
    status: "PENDING",
    queueJobId: args?.queueJobId ?? null,
    stage: args?.stage ?? "queued",
    progressPct: 0,
    statusMessage: args?.statusMessage ?? "Queued",
    error: null,
    meta: args?.meta,
  });

  const update = buildData({
    status: "PENDING",
    queueJobId: args?.queueJobId ?? null,
    stage: args?.stage ?? "queued",
    progressPct: 0,
    statusMessage: args?.statusMessage ?? "Queued",
    error: null,
    meta: args?.meta,
  });

  return upsertJob(db, kind, sourceId, create, update);
}

export async function markJobRunning(
  db: DbLike,
  kind: JobKind,
  sourceId: string,
  args?: {
    queueJobId?: string | null;
    stage?: string;
    progressPct?: number;
    statusMessage?: string;
    meta?: any;
  },
) {
  const create = buildData({
    status: "RUNNING",
    queueJobId: args?.queueJobId ?? null,
    stage: args?.stage ?? "starting",
    progressPct: args?.progressPct ?? 2,
    statusMessage: args?.statusMessage ?? "Starting",
    error: null,
    meta: args?.meta,
    started: true,
  });
  create.attemptCount = 1;

  const update = buildData({
    status: "RUNNING",
    queueJobId: args?.queueJobId ?? null,
    stage: args?.stage ?? "starting",
    progressPct: args?.progressPct ?? 2,
    statusMessage: args?.statusMessage ?? "Starting",
    error: null,
    meta: args?.meta,
    attemptIncrement: true,
    started: true,
  });

  return upsertJob(db, kind, sourceId, create, update);
}

export async function markJobProgress(
  db: DbLike,
  kind: JobKind,
  sourceId: string,
  args: {
    stage: string;
    progressPct?: number;
    statusMessage?: string;
    meta?: any;
  },
) {
  const data = buildData({
    stage: args.stage,
    progressPct: args.progressPct,
    statusMessage: args.statusMessage,
    meta: args.meta,
  });

  return updateJob(db, kind, sourceId, data);
}

export async function markJobSucceeded(
  db: DbLike,
  kind: JobKind,
  sourceId: string,
  args?: { stage?: string; statusMessage?: string; meta?: any },
) {
  const data = buildData({
    status: "SUCCESS",
    stage: args?.stage ?? "completed",
    progressPct: 100,
    statusMessage: args?.statusMessage ?? "Completed",
    meta: args?.meta,
    error: null,
    finished: true,
  });

  return updateJob(db, kind, sourceId, data);
}

export async function markJobFailed(
  db: DbLike,
  kind: JobKind,
  sourceId: string,
  args: { stage?: string; statusMessage?: string; error: string; meta?: any },
) {
  const data = buildData({
    status: "FAILED",
    stage: args.stage ?? "failed",
    statusMessage: args.statusMessage ?? "Failed",
    error: args.error,
    meta: args.meta,
    failed: true,
  });

  return updateJob(db, kind, sourceId, data);
}

export async function markStaleRunningJobsFailed(
  db: DbLike,
  staleBefore: Date,
) {
  const data = buildData({
    status: "FAILED",
    stage: "stale",
    statusMessage: "Job heartbeat expired",
    error:
      "Worker heartbeat expired while the job was RUNNING. The job can be retried safely.",
    failed: true,
  });

  const [ingestion, embedding] = await Promise.all([
    db.ingestionJob.updateMany({
      where: {
        status: "RUNNING",
        OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: staleBefore } }],
      },
      data,
    }),
    db.embeddingJob.updateMany({
      where: {
        status: "RUNNING",
        OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: staleBefore } }],
      },
      data,
    }),
  ]);

  return {
    ingestionRecoveredCount: ingestion.count,
    embeddingRecoveredCount: embedding.count,
  };
}
