import { Router } from "express";
import { z } from "zod";
import prisma from "../config/database";
import { validate } from "../middlewares/validate";
import { canonicalizeUrl } from "../utils/urlCanonical";

function canonicalize(raw: string): string {
  return canonicalizeUrl(raw);
}

async function findUrlByCanonicalOrRaw(rawUrl: string) {
  const canon = canonicalize(rawUrl);

  return prisma.url.findFirst({
    where: {
      OR: [
        ...(canon ? [{ canonical_url: canon }, { url: canon }] : []),
        { url: rawUrl },
      ],
    },
    select: {
      id: true,
      url: true,
      canonical_url: true,
    },
  });
}

async function ensureUrlRow(params: {
  rawUrl: string;
  title?: string;
  snippet?: string | null;
}) {
  const canon = canonicalize(params.rawUrl);
  const existing = await findUrlByCanonicalOrRaw(params.rawUrl);

  if (existing) {
    const updateData: {
      title?: string;
      snippet?: string | null;
      canonical_url?: string;
    } = {
      ...(params.title ? { title: params.title.slice(0, 500) } : {}),
      ...(params.snippet !== undefined ? { snippet: params.snippet } : {}),
      ...(canon && !existing.canonical_url ? { canonical_url: canon } : {}),
    };

    if (Object.keys(updateData).length) {
      try {
        return await prisma.url.update({
          where: { id: existing.id },
          data: updateData,
          select: { id: true, url: true, canonical_url: true },
        });
      } catch (e: any) {
        if (e?.code !== "P2002" || !updateData.canonical_url) throw e;

        return await prisma.url.update({
          where: { id: existing.id },
          data: {
            ...(params.title ? { title: params.title.slice(0, 500) } : {}),
            ...(params.snippet !== undefined
              ? { snippet: params.snippet }
              : {}),
          },
          select: { id: true, url: true, canonical_url: true },
        });
      }
    }

    return existing;
  }

  return prisma.url.create({
    data: {
      url: params.rawUrl,
      canonical_url: canon || null,
      title: (params.title || canon || params.rawUrl).slice(0, 500),
      snippet: params.snippet ?? null,
    },
    select: { id: true, url: true, canonical_url: true },
  });
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
      include: {
        _count: {
          select: { urls: true },
        },
      },
    });

    res.json(
      rows.map(({ _count, ...row }) => ({
        ...row,
        urlCount: _count.urls,
      })),
    );
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

      // Ensure URL exists (minimal fields if needed)
      const urlRow = await ensureUrlRow({
        rawUrl: body.url,
        title: body.title,
        snippet: body.snippet,
      });

      res.json({
        ok: true,
        url: urlRow.canonical_url || canonicalize(urlRow.url),
        collectionIds: body.collectionIds,
      });
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

      const urlRow = await ensureUrlRow({
        rawUrl: body.url,
        title: body.title,
        snippet: body.snippet,
      });

      await prisma.collectionUrl.create({
        data: { collectionId, urlId: urlRow.id },
      });

      res.status(201).json({ ok: true });
    } catch (e: any) {
      // duplicate join => ok
      if (String(e?.code) === "P2002")
        return res.status(201).json({ ok: true });
      next(e);
    }
  },
);

// DELETE /api/collections/:id/urls?url=...
r.delete("/collections/:id/urls", async (req, res, next) => {
  try {
    const collectionId = String(req.params.id);
    const url = String(req.query.url || "");
    if (!url)
      return res.status(400).json({ message: "Missing url query param" });

    const urlRow = await findUrlByCanonicalOrRaw(url);
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
      const rawUrls = body.urls || [];
      const canonicalUrls = rawUrls.map(canonicalize);
      if (!canonicalUrls.length) return res.json({ map: {} });

      const urlRows = await prisma.url.findMany({
        where: {
          OR: [
            { canonical_url: { in: canonicalUrls } },
            { url: { in: rawUrls } },
            { url: { in: canonicalUrls } },
          ],
        },
        select: { id: true, url: true, canonical_url: true },
      });
      const idByUrl = new Map(
        urlRows.map(
          (u) => [u.canonical_url || canonicalize(u.url), u.id] as const,
        ),
      );

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
