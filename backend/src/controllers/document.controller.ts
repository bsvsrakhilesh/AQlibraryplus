import { Request, Response, NextFunction } from "express";
import { listDocumentRevisions } from "../services/document.service";

function ensureStringId(req: Request): string {
  const id = String(req.params.id || "").trim();
  if (!id) {
    const err = Object.assign(new Error("Invalid id"), { status: 400 });
    throw err;
  }
  return id;
}

export async function getDocumentRevisionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = ensureStringId(req);
    const limitRaw = req.query.limit;
    const limit = typeof limitRaw === "string" ? Number(limitRaw) : undefined;

    const out = await listDocumentRevisions(id, {
      limit: Number.isFinite(limit) ? (limit as number) : undefined,
    });

    res.json(out);
  } catch (err) {
    next(err);
  }
}