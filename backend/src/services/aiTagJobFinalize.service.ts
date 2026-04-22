import prisma from "../config/database";
import { TaggingStatus } from "../generated/prisma/client";
import { getJob } from "./pyTaggerClient";

const TOPK = Number(process.env.TAGS_TOPK || 10);
const USE_LLM = (process.env.TAGS_USE_LLM || "false").toLowerCase() === "true";

const MAX_WAIT_MS = Number(process.env.TAGS_JOB_MAX_WAIT_MS || 4 * 60 * 1000);
const INITIAL_DELAY_MS = Number(process.env.TAGS_JOB_POLL_INITIAL_MS || 1000);
const MAX_DELAY_MS = Number(process.env.TAGS_JOB_POLL_MAX_MS || 8000);

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function buildNextTagsMeta(
  prev: any,
  args: {
    jobId: string;
    phrases: string[];
    unigrams: string[];
    structured: any;
    extraction: any;
    hash: string | null;
  },
) {
  const p = prev && typeof prev === "object" ? prev : {};
  const prevTagger = p.tagger && typeof p.tagger === "object" ? p.tagger : {};

  return {
    ...p,
    tagger: {
      ...prevTagger,
      phrases: args.phrases || [],
      unigrams: args.unigrams || [],
      topk: TOPK,
      use_llm: USE_LLM,
      jobId: args.jobId,
      updatedAt: new Date().toISOString(),
      normalizedTextSha256: args.hash ?? null,
      normalizedTextHashAlgorithm: args.hash ? "sha256" : null,
      structured: args.structured || null,
      extraction: args.extraction || null,
    },
  };
}

async function awaitTerminalJobState(jobId: string) {
  const startedAt = Date.now();
  let delay = INITIAL_DELAY_MS;

  while (true) {
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      throw new Error(`ai-tagger job timed out for jobId=${jobId}`);
    }

    let data: any;
    try {
      data = await getJob(jobId);
    } catch {
      await sleep(delay);
      delay = Math.min(MAX_DELAY_MS, Math.round(delay * 1.3));
      continue;
    }

    if (data?.state === "SUCCESS" || data?.state === "FAILURE") {
      return data;
    }

    await sleep(delay);
    delay = Math.min(MAX_DELAY_MS, Math.round(delay * 1.3));
  }
}

async function persistFileFailure(fileId: string, jobId: string, data: any) {
  const msg = String(
    data?.error || data?.message || "Unknown ai-tagger failure",
  ).slice(0, 500);

  await prisma.storedFile.updateMany({
    where: {
      id: fileId,
      taggingJobId: jobId,
    },
    data: {
      taggingStatus: TaggingStatus.FAILED,
      taggingJobId: null,
      taggingError: msg,
    },
  });
}

async function persistUrlFailure(urlId: number, jobId: string, data: any) {
  const msg = String(
    data?.error || data?.message || "Unknown ai-tagger failure",
  ).slice(0, 500);

  await prisma.url.updateMany({
    where: {
      id: urlId,
      taggingJobId: jobId,
    },
    data: {
      taggingStatus: TaggingStatus.FAILED,
      taggingJobId: null,
      taggingError: msg,
    },
  });
}

async function persistFileSuccess(fileId: string, jobId: string, data: any) {
  const tags = Array.isArray(data?.tags) ? data.tags : [];
  const phrases = Array.isArray(data?.phrases) ? data.phrases : [];
  const unigrams = Array.isArray(data?.unigrams) ? data.unigrams : [];
  const structured = data?.structured ?? null;
  const extraction = data?.extraction ?? null;
  const hash = data?.hash ?? null;
  const taggerVersion = data?.tagger_version ?? null;

  const rec = await prisma.storedFile.findFirst({
    where: {
      id: fileId,
      taggingJobId: jobId,
    },
  });

  if (!rec) return;

  const merged = Array.from(new Set([...(rec.tags || []), ...(tags || [])]));

  await prisma.$transaction([
    prisma.storedFile.update({
      where: { id: fileId },
      data: {
        tags: { set: merged },
        contentHash: hash,
        taggerVersion,
        tagsMeta: buildNextTagsMeta(rec.tagsMeta, {
          jobId,
          phrases,
          unigrams,
          structured,
          extraction,
          hash,
        }),
        taggingStatus: TaggingStatus.SUCCESS,
        taggingJobId: null,
        taggingError: null,
      },
    }),
    prisma.documentRevision.updateMany({
      where: { storedFileId: fileId },
      data: {
        contentHash: hash,
      },
    }),
  ]);
}

async function persistUrlSuccess(urlId: number, jobId: string, data: any) {
  const tags = Array.isArray(data?.tags) ? data.tags : [];
  const phrases = Array.isArray(data?.phrases) ? data.phrases : [];
  const unigrams = Array.isArray(data?.unigrams) ? data.unigrams : [];
  const structured = data?.structured ?? null;
  const extraction = data?.extraction ?? null;
  const hash = data?.hash ?? null;
  const taggerVersion = data?.tagger_version ?? null;

  const row = await prisma.url.findFirst({
    where: {
      id: urlId,
      taggingJobId: jobId,
    },
  });

  if (!row) return;

  const merged = Array.from(new Set([...(row.tags || []), ...(tags || [])]));

  await prisma.url.update({
    where: { id: urlId },
    data: {
      tags: { set: merged },
      contentHash: hash,
      taggerVersion,
      tagsMeta: buildNextTagsMeta(row.tagsMeta, {
        jobId,
        phrases,
        unigrams,
        structured,
        extraction,
        hash,
      }),
      taggingStatus: TaggingStatus.SUCCESS,
      taggingJobId: null,
      taggingError: null,
    },
  });
}

export async function finalizeAiTagJobForFile(fileId: string, jobId: string) {
  const data = await awaitTerminalJobState(jobId);

  if (data?.state === "FAILURE") {
    await persistFileFailure(fileId, jobId, data);
    return data;
  }

  await persistFileSuccess(fileId, jobId, data);
  return data;
}

export async function finalizeAiTagJobForUrl(urlId: number, jobId: string) {
  const data = await awaitTerminalJobState(jobId);

  if (data?.state === "FAILURE") {
    await persistUrlFailure(urlId, jobId, data);
    return data;
  }

  await persistUrlSuccess(urlId, jobId, data);
  return data;
}

export function scheduleAiTagJobFinalizationForFile(
  fileId: string,
  jobId: string,
) {
  setImmediate(async () => {
    try {
      await finalizeAiTagJobForFile(fileId, jobId);
    } catch (e: any) {
      const msg = String(e?.message || e || "Unknown ai-tagger error").slice(
        0,
        500,
      );

      try {
        await prisma.storedFile.updateMany({
          where: {
            id: fileId,
            taggingJobId: jobId,
          },
          data: {
            taggingStatus: TaggingStatus.FAILED,
            taggingJobId: null,
            taggingError: msg,
          },
        });
      } catch {}

      console.error("[aiTagJobFinalize] file finalization failed", {
        fileId,
        jobId,
        error: msg,
      });
    }
  });
}

export function scheduleAiTagJobFinalizationForUrl(
  urlId: number,
  jobId: string,
) {
  setImmediate(async () => {
    try {
      await finalizeAiTagJobForUrl(urlId, jobId);
    } catch (e: any) {
      const msg = String(e?.message || e || "Unknown ai-tagger error").slice(
        0,
        500,
      );

      try {
        await prisma.url.updateMany({
          where: {
            id: urlId,
            taggingJobId: jobId,
          },
          data: {
            taggingStatus: TaggingStatus.FAILED,
            taggingJobId: null,
            taggingError: msg,
          },
        });
      } catch {}

      console.error("[aiTagJobFinalize] url finalization failed", {
        urlId,
        jobId,
        error: msg,
      });
    }
  });
}
