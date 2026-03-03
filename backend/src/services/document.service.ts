// backend/src/services/document.service.ts
import prisma from "../config/database";
import { canonicalizeUrl } from "../utils/urlCanonical";

/**
 * Ensures a global canonical Document + DocumentRevision exist for a StoredFile.
 * Returns the documentRevisionId that represents THIS storedFile capture.
 *
 * Rules:
 * - URL_TEXT / URL_PDF snapshots map to Document(kind=URL, urlId=...)
 * - UPLOAD (and other non-URL captures) map to Document(kind=FILE, primaryFileId=<this file>)
 * - DocumentRevision is 1:1 with StoredFile (storedFileId is unique)
 */
export async function ensureDocumentRevisionForStoredFile(
  storedFileId: string,
) {
  const f = await prisma.storedFile.findUnique({
    where: { id: storedFileId },
    select: {
      id: true,
      urlId: true,
      captureType: true,
      contentHash: true,
      sha256: true,
      sourceUrl: true,
    },
  });

  if (!f) {
    const err: any = new Error(`StoredFile not found: ${storedFileId}`);
    err.status = 404;
    throw err;
  }

  // Already linked?
  const existing = await prisma.documentRevision.findUnique({
    where: { storedFileId },
    select: { id: true, documentId: true },
  });
  if (existing) return existing;

  let documentId: string;

  const isUrlSnapshot =
    f.captureType === "URL_TEXT" || f.captureType === "URL_PDF";

  if (isUrlSnapshot) {
    // Ensure we have a urlId. If crawl saved without urlId, repair using sourceUrl.
    let urlId = f.urlId ?? null;

    if (!urlId) {
      if (!f.sourceUrl) {
        throw new Error(
          `URL snapshot StoredFile(${storedFileId}) missing urlId and sourceUrl`,
        );
      }

      const canonical = canonicalizeUrl(f.sourceUrl);

      // Find by canonical_url when possible; otherwise fallback to raw url match.
      const existingUrl = await prisma.url.findFirst({
        where: {
          OR: [
            ...(canonical ? [{ canonical_url: canonical }] : []),
            { url: f.sourceUrl },
          ],
        },
        select: { id: true, canonical_url: true },
      });

      let u: { id: number };

      if (existingUrl) {
        u = { id: existingUrl.id };

        // World-class touch: backfill canonical_url if missing (best-effort, ignore conflicts).
        if (canonical && !existingUrl.canonical_url) {
          try {
            await prisma.url.update({
              where: { id: existingUrl.id },
              data: { canonical_url: canonical },
            });
          } catch {
            // ignore unique conflicts / race conditions
          }
        }
      } else {
        u = await prisma.url.create({
          data: {
            url: f.sourceUrl,
            canonical_url: canonical || null,
            title: f.sourceUrl,
            snippet: null,
            tags: [],
            isFavorited: false,
          },
          select: { id: true },
        });
      }

      urlId = u.id;

      // Repair storedFile.urlId so future queries work
      await prisma.storedFile.update({
        where: { id: storedFileId },
        data: { urlId },
      });
    }

    const doc = await prisma.document.upsert({
      where: { urlId },
      update: {},
      create: { kind: "URL", urlId },
      select: { id: true },
    });

    documentId = doc.id;
  } else {
    // Uploads: the file itself is the canonical document anchor (v1)
    const doc = await prisma.document.upsert({
      where: { primaryFileId: storedFileId },
      update: {},
      create: { kind: "FILE", primaryFileId: storedFileId },
      select: { id: true },
    });

    documentId = doc.id;
  }

  const maxOrd = await prisma.documentRevision.aggregate({
    where: { documentId },
    _max: { ordinal: true },
  });
  const nextOrdinal = (maxOrd._max.ordinal ?? 0) + 1;

  const contentHash = f.contentHash ?? f.sha256 ?? null;

  const rev = await prisma.documentRevision.create({
    data: {
      documentId,
      ordinal: nextOrdinal,
      storedFileId,
      captureType: f.captureType as any,
      contentHash,
    },
    select: { id: true, documentId: true },
  });

  return rev;
}

function clampTake(n: unknown, fallback = 50, max = 200) {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x) || x <= 0) return fallback;
  return Math.min(Math.floor(x), max);
}

export type DocumentRevisionListItem = {
  id: string;
  ordinal: number;
  createdAt: string;
  captureType: "UPLOAD" | "URL_TEXT" | "URL_PDF";
  contentHash: string | null;
  storedFile: {
    id: string;
    fileName: string;
    mimeType: string;
    size: number;
    sha256: string | null;
    createdAt: string;
    sourceUrl: string | null;
    urlId: number | null;
  };
  captureEvent: null | {
    id: string;
    createdAt: string;
    actorId: string | null;
    actorName: string | null;
    requestId: string | null;
    pipeline: {
      id: string;
      name: string;
      version: string;
      configHash: string;
      codeSha: string | null;
    };
  };
};

export async function listDocumentRevisions(
  documentId: string,
  opts?: { limit?: number },
): Promise<{
  document: {
    id: string;
    kind: "URL" | "FILE";
    urlId: number | null;
    primaryFileId: string | null;
  };
  revisions: DocumentRevisionListItem[];
}> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, kind: true, urlId: true, primaryFileId: true },
  });

  if (!doc) {
    const err = Object.assign(new Error("Document not found"), { status: 404 });
    throw err;
  }

  const take = clampTake(opts?.limit, 50, 200);

  const rows = await prisma.documentRevision.findMany({
    where: { documentId },
    orderBy: { ordinal: "desc" },
    take,
    include: {
      storedFile: {
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          size: true,
          sha256: true,
          createdAt: true,
          sourceUrl: true,
          urlId: true,
        },
      },
      captureEvent: {
        select: {
          id: true,
          createdAt: true,
          actorId: true,
          actorName: true,
          requestId: true,
          pipelineConfig: {
            select: {
              id: true,
              name: true,
              version: true,
              configHash: true,
              codeSha: true,
            },
          },
        },
      },
    },
  });

  const revisions: DocumentRevisionListItem[] = rows.map((r) => ({
    id: r.id,
    ordinal: r.ordinal,
    createdAt: r.createdAt.toISOString(),
    captureType: r.captureType as any,
    contentHash: r.contentHash ?? null,
    storedFile: {
      id: r.storedFile.id,
      fileName: r.storedFile.fileName,
      mimeType: r.storedFile.mimeType,
      size: r.storedFile.size,
      sha256: r.storedFile.sha256 ?? null,
      createdAt: r.storedFile.createdAt.toISOString(),
      sourceUrl: r.storedFile.sourceUrl ?? null,
      urlId: r.storedFile.urlId ?? null,
    },
    captureEvent: r.captureEvent
      ? {
          id: r.captureEvent.id,
          createdAt: r.captureEvent.createdAt.toISOString(),
          actorId: r.captureEvent.actorId ?? null,
          actorName: r.captureEvent.actorName ?? null,
          requestId: r.captureEvent.requestId ?? null,
          pipeline: {
            id: r.captureEvent.pipelineConfig.id,
            name: r.captureEvent.pipelineConfig.name,
            version: r.captureEvent.pipelineConfig.version,
            configHash: r.captureEvent.pipelineConfig.configHash,
            codeSha: r.captureEvent.pipelineConfig.codeSha ?? null,
          },
        }
      : null,
  }));

  return {
    document: {
      id: doc.id,
      kind: doc.kind as any,
      urlId: doc.urlId ?? null,
      primaryFileId: doc.primaryFileId ?? null,
    },
    revisions,
  };
}

export async function listRevisionsForUrl(
  urlId: number,
  opts?: { limit?: number },
): Promise<{
  documentId: string | null;
  revisions: DocumentRevisionListItem[];
}> {
  // URL may exist with 0 revisions (never crawled)
  const doc = await prisma.document.findUnique({
    where: { urlId },
    select: { id: true },
  });

  if (!doc) {
    return { documentId: null, revisions: [] };
  }

  const listed = await listDocumentRevisions(doc.id, opts);
  return { documentId: listed.document.id, revisions: listed.revisions };
}
