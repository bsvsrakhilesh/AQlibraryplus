import type { Request, Response } from "express";

export function getAuthMeHandler(req: Request, res: Response) {
  const auth = req.auth ?? null;

  res.json({
    ok: true,
    auth,
  });
}
