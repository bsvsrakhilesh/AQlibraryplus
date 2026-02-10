import { Router } from "express";
import { z } from "zod";
import prisma from "../config/database";
import { validate } from "../middlewares/validate";

// Keep canonicalization aligned with frontend utils/saved.ts
function canonicalize(raw: string): string {
  try {
    const u = new URL(raw);
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
    ].forEach((p) => u.searchParams.delete(p));
    u.hash = "";
    return u.toString();
  } catch {
    return raw;
  }
}

const r = Router();

/* ------------------------ schemas ------------------------ */

const createCollectionBody = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  ownerId: z.string().optional().nullable(),
  visibility: z.string().optional(),
});

const renameCollectionBody = z.object({
  name: z.string().min(1),
});

const assignUrlCollectionsBody = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  snippet: z.string().optional().nullable(),
  collectionIds: z.array(z.string().min(1)),
});

const addUrlToCollectionBody = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  snippet: z.string().optional().nullable(),
});

const urlMapBody = z.object({
  urls: z.array(z.string().url()).min(1).optional(),
});

/* ------------------------ routes ------------------------ */

// GET /api/collections
r.get("/collections", async (_req, res, next) => {
  try {
    const rows = await prisma.collection.findMany({
      orderBy: { createdAt: "asc" },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// POST /api/collections
r.post(
  "/collections",
  validate({ body: createCollectionBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createCollectionBody>;
      const created = await prisma.collection.create({
        data: {
          id: body.id,
          name: body.name.trim(),
          description: body.description ?? undefined,
          ownerId: body.ownerId ?? undefined,
          visibility: body.visibility ?? "private",
        },
      });
      res.status(201).json(created);
    } catch (e) {
      next(e);
    }
  },
);

// PATCH /api/collections/:id
r.patch(
  "/collections/:id",
  validate({ body: renameCollectionBody }),
  async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const body = req.body as z.infer<typeof renameCollectionBody>;
      const updated = await prisma.collection.update({
        where: { id },
        data: { name: body.name.trim() },
      });
      res.json(updated);
    } catch (e) {
      next(e);
    }
  },
);

// DELETE /api/collections/:id
r.delete("/collections/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    await prisma.collection.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// PUT /api/collections/assign
// Replace memberships for a URL
r.put(
  "/collections/assign",
  validate({ body: assignUrlCollectionsBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof assignUrlCollectionsBody>;
      const canon = canonicalize(body.url);

      // Ensure collections exist
      const existing = await prisma.collection.findMany({
        where: { id: { in: body.collectionIds } },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((c) => c.id));
      const missing = body.collectionIds.filter((id) => !existingIds.has(id));
      if (missing.length) {
        return res.status(400).json({
          code: "UNKNOWN_COLLECTION",
          message: "One or more collectionIds do not exist",
          missing,
        });
      }

      // Ensure URL exists (minimal fields if needed)
      const urlRow = await prisma.url.upsert({
        where: { url: canon },
        create: {
          url: canon,
          title: (body.title || canon).slice(0, 500),
          snippet: body.snippet ?? null,
        },
        update: {
          ...(body.title ? { title: body.title.slice(0, 500) } : {}),
          ...(body.snippet !== undefined ? { snippet: body.snippet } : {}),
        },
        select: { id: true, url: true },
      });

      // Replace joins in a transaction
      await prisma.$transaction(async (tx) => {
        await tx.collectionUrl.deleteMany({
          where: { urlId: urlRow.id },
        });
        if (body.collectionIds.length) {
          await tx.collectionUrl.createMany({
            data: body.collectionIds.map((cid) => ({
              collectionId: cid,
              urlId: urlRow.id,
            })),
            skipDuplicates: true,
          });
        }
      });

      res.json({ ok: true, url: urlRow.url, collectionIds: body.collectionIds });
    } catch (e) {
      next(e);
    }
  },
);

// POST /api/collections/:id/urls
r.post(
  "/collections/:id/urls",
  validate({ body: addUrlToCollectionBody }),
  async (req, res, next) => {
    try {
      const collectionId = String(req.params.id);
      const body = req.body as z.infer<typeof addUrlToCollectionBody>;
      const canon = canonicalize(body.url);

      const urlRow = await prisma.url.upsert({
        where: { url: canon },
        create: {
          url: canon,
          title: (body.title || canon).slice(0, 500),
          snippet: body.snippet ?? null,
        },
        update: {
          ...(body.title ? { title: body.title.slice(0, 500) } : {}),
          ...(body.snippet !== undefined ? { snippet: body.snippet } : {}),
        },
        select: { id: true, url: true },
      });

      await prisma.collectionUrl.create({
        data: { collectionId, urlId: urlRow.id },
      });

      res.status(201).json({ ok: true });
    } catch (e: any) {
      // duplicate join => ok
      if (String(e?.code) === "P2002") return res.status(201).json({ ok: true });
      next(e);
    }
  },
);

// DELETE /api/collections/:id/urls?url=...
r.delete("/collections/:id/urls", async (req, res, next) => {
  try {
    const collectionId = String(req.params.id);
    const url = String(req.query.url || "");
    if (!url) return res.status(400).json({ message: "Missing url query param" });
    const canon = canonicalize(url);

    const urlRow = await prisma.url.findUnique({
      where: { url: canon },
      select: { id: true },
    });
    if (!urlRow) return res.status(204).end();

    await prisma.collectionUrl.deleteMany({
      where: { collectionId, urlId: urlRow.id },
    });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// GET /api/collections/url-map  (all) OR POST /api/collections/url-map with { urls }
r.get("/collections/url-map", async (_req, res, next) => {
  try {
    const joins = await prisma.collectionUrl.findMany({
      include: { url: { select: { url: true } } },
    });

    const map: Record<string, string[]> = {};
    for (const j of joins) {
      const key = canonicalize(j.url.url);
      if (!map[key]) map[key] = [];
      map[key].push(j.collectionId);
    }
    for (const k of Object.keys(map)) map[k] = Array.from(new Set(map[k]));
    res.json({ map });
  } catch (e) {
    next(e);
  }
});

r.post(
  "/collections/url-map",
  validate({ body: urlMapBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof urlMapBody>;
      const urls = (body.urls || []).map(canonicalize);
      if (!urls.length) return res.json({ map: {} });

      const urlRows = await prisma.url.findMany({
        where: { url: { in: urls } },
        select: { id: true, url: true },
      });
      const idByUrl = new Map(urlRows.map((u) => [canonicalize(u.url), u.id] as const));

      const joins = await prisma.collectionUrl.findMany({
        where: { urlId: { in: Array.from(idByUrl.values()) } },
      });

      const map: Record<string, string[]> = {};
      for (const [u, id] of idByUrl.entries()) {
        map[u] = [];
        for (const j of joins) {
          if (j.urlId === id) map[u].push(j.collectionId);
        }
        map[u] = Array.from(new Set(map[u]));
      }
      res.json({ map });
    } catch (e) {
      next(e);
    }
  },
);

export default r;
