import crypto from "crypto";
import prisma from "../config/database";
import { TaggingStatus } from "../generated/prisma/client";
import { getJob } from "./pyTaggerClient";

const CLAIM_PREFIX = "claim:";
const CLAIM_WAIT_MS = Number(process.env.TAGS_JOB_CLAIM_WAIT_MS || 8000);
const CLAIM_POLL_MS = Number(process.env.TAGS_JOB_CLAIM_POLL_MS || 200);
const MAX_START_ATTEMPTS = Number(process.env.TAGS_JOB_START_ATTEMPTS || 6);

type StartJobFn = () => Promise<{ jobId: string }>;

export type AiTagJobStartResult = {
  jobId: string;
  mode: "started_new" | "reused_live" | "reused_terminal";
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isClaimToken(value: string | null | undefined) {
  return !!value && value.startsWith(CLAIM_PREFIX);
}

function makeClaimToken() {
  return `${CLAIM_PREFIX}${crypto.randomUUID()}`;
}

function errorMessage(e: unknown) {
  return String((e as any)?.message || e || "Unknown ai-tagger error").slice(
    0,
    500,
  );
}

function classifyRemoteJobState(data: any): "live" | "terminal" {
  const state = String(data?.state || "")
    .trim()
    .toUpperCase();

  if (!state) return "live";
  if (state === "SUCCESS" || state === "FAILURE" || state === "REVOKED") {
    return "terminal";
  }

  return "live";
}

async function inspectRemoteJob(
  jobId: string,
): Promise<"live" | "terminal" | "missing"> {
  try {
    const data = await getJob(jobId);
    return classifyRemoteJobState(data);
  } catch {
    return "missing";
  }
}

async function waitForResolvedFileClaim(
  fileId: string,
): Promise<string | null> {
  const deadline = Date.now() + CLAIM_WAIT_MS;

  while (Date.now() < deadline) {
    const row = await prisma.storedFile.findUnique({
      where: { id: fileId },
      select: { taggingJobId: true },
    });

    const jobId = row?.taggingJobId ?? null;
    if (!jobId) return null;
    if (!isClaimToken(jobId)) return jobId;

    await sleep(CLAIM_POLL_MS);
  }

  return null;
}

async function waitForResolvedUrlClaim(urlId: number): Promise<string | null> {
  const deadline = Date.now() + CLAIM_WAIT_MS;

  while (Date.now() < deadline) {
    const row = await prisma.url.findUnique({
      where: { id: urlId },
      select: { taggingJobId: true },
    });

    const jobId = row?.taggingJobId ?? null;
    if (!jobId) return null;
    if (!isClaimToken(jobId)) return jobId;

    await sleep(CLAIM_POLL_MS);
  }

  return null;
}

export async function startOrReuseAiTagJobForFile(args: {
  fileId: string;
  startJob: StartJobFn;
}): Promise<AiTagJobStartResult> {
  const { fileId, startJob } = args;

  for (let attempt = 0; attempt < MAX_START_ATTEMPTS; attempt++) {
    const current = await prisma.storedFile.findUnique({
      where: { id: fileId },
      select: { taggingJobId: true },
    });

    if (!current) {
      throw new Error(`StoredFile not found: ${fileId}`);
    }

    const currentJobId = current.taggingJobId ?? null;

    if (currentJobId) {
      if (isClaimToken(currentJobId)) {
        const resolved = await waitForResolvedFileClaim(fileId);
        if (resolved) {
          return { jobId: resolved, mode: "reused_live" };
        }

        await prisma.storedFile.updateMany({
          where: {
            id: fileId,
            taggingJobId: currentJobId,
          },
          data: {
            taggingJobId: null,
            taggingStatus: TaggingStatus.PENDING,
          },
        });

        continue;
      }

      const remote = await inspectRemoteJob(currentJobId);

      if (remote === "live") {
        return { jobId: currentJobId, mode: "reused_live" };
      }

      if (remote === "terminal") {
        return { jobId: currentJobId, mode: "reused_terminal" };
      }

      await prisma.storedFile.updateMany({
        where: {
          id: fileId,
          taggingJobId: currentJobId,
        },
        data: {
          taggingJobId: null,
          taggingStatus: TaggingStatus.PENDING,
        },
      });

      continue;
    }

    const claimToken = makeClaimToken();

    const claimed = await prisma.storedFile.updateMany({
      where: {
        id: fileId,
        taggingJobId: null,
      },
      data: {
        taggingStatus: TaggingStatus.PENDING,
        taggingJobId: claimToken,
        taggingError: null,
      },
    });

    if (!claimed.count) {
      continue;
    }

    try {
      const created = await startJob();
      const jobId = created.jobId;

      const swapped = await prisma.storedFile.updateMany({
        where: {
          id: fileId,
          taggingJobId: claimToken,
        },
        data: {
          taggingStatus: TaggingStatus.RUNNING,
          taggingJobId: jobId,
          taggingError: null,
        },
      });

      if (!swapped.count) {
        throw new Error(
          `Lost ai-tagger claim before storing real job id for fileId=${fileId}`,
        );
      }

      return { jobId, mode: "started_new" };
    } catch (e) {
      await prisma.storedFile.updateMany({
        where: {
          id: fileId,
          taggingJobId: claimToken,
        },
        data: {
          taggingStatus: TaggingStatus.FAILED,
          taggingJobId: null,
          taggingError: errorMessage(e),
        },
      });
      throw e;
    }
  }

  throw new Error(
    `Could not start or reuse ai-tagger job for fileId=${fileId}`,
  );
}

export async function startOrReuseAiTagJobForUrl(args: {
  urlId: number;
  startJob: StartJobFn;
}): Promise<AiTagJobStartResult> {
  const { urlId, startJob } = args;

  for (let attempt = 0; attempt < MAX_START_ATTEMPTS; attempt++) {
    const current = await prisma.url.findUnique({
      where: { id: urlId },
      select: { taggingJobId: true },
    });

    if (!current) {
      throw new Error(`Url not found: ${urlId}`);
    }

    const currentJobId = current.taggingJobId ?? null;

    if (currentJobId) {
      if (isClaimToken(currentJobId)) {
        const resolved = await waitForResolvedUrlClaim(urlId);
        if (resolved) {
          return { jobId: resolved, mode: "reused_live" };
        }

        await prisma.url.updateMany({
          where: {
            id: urlId,
            taggingJobId: currentJobId,
          },
          data: {
            taggingJobId: null,
            taggingStatus: TaggingStatus.PENDING,
          },
        });

        continue;
      }

      const remote = await inspectRemoteJob(currentJobId);

      if (remote === "live") {
        return { jobId: currentJobId, mode: "reused_live" };
      }

      if (remote === "terminal") {
        return { jobId: currentJobId, mode: "reused_terminal" };
      }

      await prisma.url.updateMany({
        where: {
          id: urlId,
          taggingJobId: currentJobId,
        },
        data: {
          taggingJobId: null,
          taggingStatus: TaggingStatus.PENDING,
        },
      });

      continue;
    }

    const claimToken = makeClaimToken();

    const claimed = await prisma.url.updateMany({
      where: {
        id: urlId,
        taggingJobId: null,
      },
      data: {
        taggingStatus: TaggingStatus.PENDING,
        taggingJobId: claimToken,
        taggingError: null,
      },
    });

    if (!claimed.count) {
      continue;
    }

    try {
      const created = await startJob();
      const jobId = created.jobId;

      const swapped = await prisma.url.updateMany({
        where: {
          id: urlId,
          taggingJobId: claimToken,
        },
        data: {
          taggingStatus: TaggingStatus.RUNNING,
          taggingJobId: jobId,
          taggingError: null,
        },
      });

      if (!swapped.count) {
        throw new Error(
          `Lost ai-tagger claim before storing real job id for urlId=${urlId}`,
        );
      }

      return { jobId, mode: "started_new" };
    } catch (e) {
      await prisma.url.updateMany({
        where: {
          id: urlId,
          taggingJobId: claimToken,
        },
        data: {
          taggingStatus: TaggingStatus.FAILED,
          taggingJobId: null,
          taggingError: errorMessage(e),
        },
      });
      throw e;
    }
  }

  throw new Error(`Could not start or reuse ai-tagger job for urlId=${urlId}`);
}
