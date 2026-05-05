// backend/src/routes/crawl.routes.ts
import { Router } from "express";
import {
  crawlTextHandler,
  crawlPdfHandler,
} from "../controllers/crawl.controller";
import { z } from "zod";
import { validate } from "../middlewares/validate";

const r = Router();

const accessModeSchema = z.enum(["public", "institutional"]).optional();

const crawlTextBody = z.object({
  url: z.string().url(),
  folderId: z.string().optional().nullable(),
  fileName: z.string().optional().nullable(),
  urlId: z.number().int().optional().nullable(),
  accessMode: accessModeSchema,
});

r.post("/crawl/text", validate({ body: crawlTextBody }), crawlTextHandler);

const crawlPdfBody = z.object({
  url: z.string().url(),
  folderId: z.string().optional().nullable(),
  fileName: z.string().optional().nullable(),
  fullPage: z.boolean().optional(),
  reader: z.boolean().optional(),
  urlId: z.number().int().optional().nullable(),
  accessMode: accessModeSchema,
  discoveredDocumentId: z.string().optional().nullable(),
  captureScope: z
    .enum(["SOURCE_PAGE", "DISCOVERED_DOCUMENT"])
    .optional()
    .nullable(),
  sourcePageUrl: z.string().url().optional().nullable(),
  originalSearchQuery: z.string().max(1000).optional().nullable(),
});

r.post("/crawl/pdf", validate({ body: crawlPdfBody }), crawlPdfHandler);

export default r;
