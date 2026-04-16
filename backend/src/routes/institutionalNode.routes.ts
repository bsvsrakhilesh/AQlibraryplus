import { Router } from "express";
import { z } from "zod";
import { validate } from "../middlewares/validate";
import {
  institutionalNodeHealthHandler,
  institutionalSessionStatusHandler,
  institutionalOpenLoginHandler,
  institutionalInspectArticleHandler,
  institutionalFallbackSearchHandler,
} from "../controllers/institutionalNode.controller";

const r = Router();

const inspectArticleBody = z.object({
  url: z.string().url(),
});

const fallbackSearchBody = z.object({
  url: z.string().url(),
  providerOrder: z
    .array(z.enum(["pressreader", "proquest", "nexis"]))
    .optional(),
  maxCandidates: z.coerce.number().int().min(1).max(15).optional(),
});

const openLoginBody = z.object({
  provider: z
    .enum(["openathens", "proquest", "nexis", "pressreader", "custom"])
    .optional(),
  url: z.string().url().nullable().optional(),
});

r.get("/icn/health", institutionalNodeHealthHandler);

r.get("/icn/session/status", institutionalSessionStatusHandler);

r.post(
  "/icn/session/open-login",
  validate({ body: openLoginBody }),
  institutionalOpenLoginHandler,
);

r.post(
  "/icn/inspect/article",
  validate({ body: inspectArticleBody }),
  institutionalInspectArticleHandler,
);

r.post(
  "/icn/search/fallback/article",
  validate({ body: fallbackSearchBody }),
  institutionalFallbackSearchHandler,
);

export default r;
