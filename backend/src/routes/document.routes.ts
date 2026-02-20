import { Router } from "express";
import { z } from "zod";
import { validate } from "../middlewares/validate";
import { getDocumentRevisionsHandler } from "../controllers/document.controller";

const r = Router();

const revisionsQuery = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
});

// Mounted at /api
r.get(
  "/documents/:id/revisions",
  validate({ query: revisionsQuery }),
  getDocumentRevisionsHandler,
);

export default r;