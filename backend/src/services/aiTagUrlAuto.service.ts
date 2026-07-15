// backend/src/services/aiTagUrlAuto.service.ts
import { TaggingStatus } from "../generated/prisma/client";
import prisma from "../config/database";
import { createJobFromFile, createJobFromUrl } from "./pyTaggerClient";
import { startOrReuseAiTagJobForUrl } from "./aiTagJobStart.service";
import { finalizeAiTagJobForUrl } from "./aiTagJobFinalize.service";
import { persistAiTagFailureForUrl } from "./aiTagPersistence.service";
import { chooseUrlTaggingSource } from "./aiTagUrlSource.util";

const TOPK = Number(process.env.TAGS_TOPK || 20);
const USE_LLM = (process.env.TAGS_USE_LLM || "true").toLowerCase() === "true";

/**
 * Runs Python ai-tagger for an existing Url row and persists results when done.
 * This now uses the same finalization path as the manual route.
 */
export async function runAiTagForUrl(
  urlId: number,
  opts?: { force?: boolean; throwOnTerminalFailure?: boolean },
) {
  const force = Boolean(opts?.force);
  const throwOnTerminalFailure = opts?.throwOnTerminalFailure !== false;

  const rec = await prisma.url.findUnique({ where: { id: urlId } });
  if (!rec) throw new Error(`Url not found: ${urlId}`);

  if (
    !force &&
    rec.taggerVersion &&
    rec.contentHash &&
    (rec.tags?.length || 0) > 0
  ) {
    return {
      skipped: true as const,
      reason: "already_tagged" as const,
      tags: rec.tags || [],
    };
  }

  const snapshotSelect = {
    storagePath: true,
    mimeType: true,
    captureType: true,
    fileName: true,
  } as const;

  const pdfSnapshot = await prisma.storedFile.findFirst({
    where: {
      urlId,
      deletedAt: null,
      OR: [
        { captureType: "URL_PDF" },
        { mimeType: { contains: "pdf", mode: "insensitive" } },
        { fileName: { endsWith: ".pdf", mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: snapshotSelect,
  });

  const latestSnapshot = await prisma.storedFile.findFirst({
    where: { urlId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: snapshotSelect,
  });

  const taggingSource = chooseUrlTaggingSource({
    url: rec.url,
    pdfSnapshot,
    latestSnapshot,
  });

  const started = await startOrReuseAiTagJobForUrl({
    urlId,
    startJob: () =>
      taggingSource.kind === "file"
        ? createJobFromFile(taggingSource.path, TOPK, USE_LLM)
        : createJobFromUrl(taggingSource.url, TOPK, USE_LLM),
  });

  const jobId = started.jobId;

  try {
    const data = await finalizeAiTagJobForUrl(urlId, jobId);

    if (data?.state === "FAILURE") {
      const err = data?.error || data?.message || "Unknown ai-tagger failure";

      if (throwOnTerminalFailure) {
        throw new Error(
          `ai-tagger failed for urlId=${urlId} jobId=${jobId}: ${err}`,
        );
      }

      return {
        skipped: false as const,
        failed: true as const,
        jobId,
        tags: [] as string[],
      };
    }

    const latest = await prisma.url.findUnique({
      where: { id: urlId },
      select: { tags: true },
    });

    return {
      skipped: false as const,
      jobId,
      tags: latest?.tags ?? (Array.isArray(data?.tags) ? data.tags : []),
    };
  } catch (e: any) {
    const msg = String(e?.message || e || "Unknown ai-tagger error").slice(
      0,
      500,
    );

    await persistAiTagFailureForUrl(urlId, jobId, { error: msg });

    if (throwOnTerminalFailure) throw e;

    return {
      skipped: false as const,
      failed: true as const,
      jobId,
      tags: [] as string[],
    };
  }
}

/**
 * Queue URL auto-tagging instead of running it in-process.
 * The backend worker consumes this FIFO queue with concurrency=1 by default, so
 * saving many URLs is safe: rows become PENDING immediately, then one URL is
 * tagged, persisted, and only then does the next URL start.
 */
export function scheduleAiTagForUrl(urlId: number, opts?: { force?: boolean }) {
  if (
    String(process.env.AQLIBRARYPLUS_DISABLE_AUTO_TAG_QUEUE || "").toLowerCase() ===
    "true"
  ) {
    return;
  }

  void import("../queues/aiTagUrl.queue")
    .then(({ enqueueAiTagUrl }) => enqueueAiTagUrl(urlId, opts))
    .catch(async (e: any) => {
      const msg = String(e?.message || e || "Unknown queueing error").slice(
        0,
        500,
      );

      try {
        await prisma.url.update({
          where: { id: urlId },
          data: {
            taggingStatus: TaggingStatus.FAILED,
            taggingJobId: null,
            taggingError: msg,
          },
        });
      } catch {}

      console.error("[aiTagUrlAuto] enqueue failed", { urlId }, e);
    });
}
