import { Request, Response, NextFunction } from "express";
import { googleSearch } from "../services/search.service";
import { log } from "../utils/logger";

export async function searchHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const q = String(req.query.q || "").trim();
  const page = Number(req.query.page ?? 1);

  if (!q) {
    log.warn("search.request.invalid", { reason: "missing q" });
    return res.status(400).json({ error: "Missing query parameter `q`" });
  }

  const startedAt = Date.now();
  try {
    const { results, nextPage, totalResults } = await googleSearch(q, page);

    if (typeof nextPage === "number")
      res.setHeader("x-next-page", String(nextPage));
    res.setHeader("x-has-more", typeof nextPage === "number" ? "1" : "0");

    if (typeof totalResults === "number" && !Number.isNaN(totalResults)) {
      res.setHeader("x-total-results", String(totalResults));
    }
    log.info("search.response.ok", {
      items_count: results.length,
      ms: Date.now() - startedAt,
    });
    return res.json(results);
  } catch (err: any) {
    log.error("search.response.error", {
      ms: Date.now() - startedAt,
      reason: err?.message,
    });
    return next(err);
  }
}
