import { Router } from "express";
import prisma from "../config/database";
import {
  createJobFromFile,
  createJobFromUrl,
  getJob,
  healthCheck,
} from "../services/pyTaggerClient";
import {
  getAiTaggingUnavailableMessage,
  getFileCapability,
} from "../utils/fileCapabilities";
import {
  scheduleAiTagJobFinalizationForFile,
  scheduleAiTagJobFinalizationForUrl,
} from "../services/aiTagJobFinalize.service";

const r = Router();

const TOPK = Number(process.env.TAGS_TOPK || 10);
const USE_LLM = (process.env.TAGS_USE_LLM || "false").toLowerCase() === "true";

/** Quick health proxy (optional) */
r.get("/tagger/health", async (_req, res, next) => {
  try {
    res.json(await healthCheck());
  } catch (e) {
    next(e);
  }
});

/** FILES: start auto-tag job */
r.post("/files/:id/auto-tags", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const rec = await prisma.storedFile.findUnique({ where: { id } });
    if (!rec) return res.status(404).json({ message: "File not found" });
    if (!rec.storagePath)
      return res.status(400).json({ message: "Missing storagePath" });

    const capability = getFileCapability(rec.fileName, rec.mimeType);
    if (!capability.aiTagSupported) {
      const msg = getAiTaggingUnavailableMessage(rec.fileName, rec.mimeType);

      await prisma.storedFile.update({
        where: { id },
        data: {
          taggingStatus: "NONE",
          taggingJobId: null,
          taggingError: msg,
        },
      });

      return res.status(409).json({
        code: "AI_TAGGING_UNSUPPORTED",
        message: msg,
      });
    }

    const { jobId } = await createJobFromFile(rec.storagePath, TOPK, USE_LLM);

    await prisma.storedFile.update({
      where: { id },
      data: {
        taggingStatus: "RUNNING",
        taggingJobId: jobId,
        taggingError: null,
      },
    });

    scheduleAiTagJobFinalizationForFile(id, jobId);

    return res.status(202).json({ jobId });
  } catch (e) {
    next(e);
  }
});

r.post("/urls/:id/auto-tags", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await prisma.url.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ message: "Url not found" });

    const latestSnap = await prisma.storedFile.findFirst({
      where: { urlId: id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { storagePath: true },
    });

    const { jobId } = latestSnap?.storagePath
      ? await createJobFromFile(latestSnap.storagePath, TOPK, USE_LLM)
      : await createJobFromUrl(row.url, TOPK, USE_LLM);

    await prisma.url.update({
      where: { id },
      data: {
        taggingStatus: "RUNNING",
        taggingJobId: jobId,
        taggingError: null,
      },
    });

    scheduleAiTagJobFinalizationForUrl(id, jobId);

    return res.status(202).json({
      jobId,
      source: latestSnap?.storagePath ? "snapshot" : "live-url",
    });
  } catch (e) {
    next(e);
  }
});

/** JOB STATUS: read-only proxy for UI polling */
r.get("/tag-jobs/:jobId", async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const data = await getJob(jobId);
    return res.json(data);
  } catch (e) {
    next(e);
  }
});

export default r;
