import { Router } from "express";
import { z } from "zod";
import { validate } from "../middlewares/validate";
import { searchHandler } from "../controllers/search.controller";

const router = Router();

const querySchema = z
  .object({
    q: z.string().min(2, "q must be at least 2 chars"),
    page: z.coerce.number().int().min(1).optional(),

    // Optional structured filters (URL Collector)
    site: z.string().trim().min(2).optional(),
    yearFrom: z.coerce.number().int().min(1900).max(2100).optional(),
    yearTo: z.coerce.number().int().min(1900).max(2100).optional(),
    jurisdiction: z.string().trim().max(120).optional(),
    region: z.string().trim().max(120).optional(),
    fileType: z.enum(["pdf", "html"]).optional(),

    // Google CSE knobs (advanced; still safe to expose)
    lr: z.string().trim().max(40).optional(), // e.g. lang_en
    cr: z.string().trim().max(40).optional(), // e.g. countryIN
    gl: z.string().trim().max(10).optional(), // e.g. IN
  })
  .superRefine((v, ctx) => {
    if (
      typeof v.yearFrom === "number" &&
      typeof v.yearTo === "number" &&
      v.yearFrom > v.yearTo
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "yearFrom must be <= yearTo",
        path: ["yearFrom"],
      });
    }
  });

router.get("/", validate({ query: querySchema }), searchHandler);

export default router;
