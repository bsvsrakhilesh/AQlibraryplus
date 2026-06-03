import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";

import {
  chooseBestPublishedAtCandidate,
  extractPublishedAtCandidatesFromText,
  extractStoredFileMetadata,
  publishedAtMetaFromCandidates,
  type PublishedAtCandidate,
} from "../services/extract.service";

function isoDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

async function withTempTextFile(
  fileName: string,
  content: string,
  fn: (filePath: string) => Promise<void>,
) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "smartscrape-meta-"));
  const filePath = path.join(dir, fileName);
  try {
    await writeFile(filePath, content, "utf8");
    await fn(filePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("extractStoredFileMetadata finds explicit publication dates in text files", async () => {
  await withTempTextFile(
    "clean-air-note.txt",
    [
      "Clean Air Enforcement Note",
      "Meeting reference: 01/01/2024",
      "Published on: 16 April 2026",
      "The note records agency commitments.",
    ].join("\n"),
    async (filePath) => {
      const out = await extractStoredFileMetadata(filePath, "text/plain", {
        fileName: "clean-air-note.txt",
      });

      assert.equal(out.title, "Clean Air Enforcement Note");
      assert.equal(isoDate(out.sourcePublishedAt), "2026-04-16");
      assert.equal(out.publishedAtMeta.source, "text_explicit");
      assert.equal(
        out.publishedAtMeta.details?.winningCandidate?.raw,
        "16 April 2026",
      );
      assert.match(
        out.publishedAtMeta.details?.winningCandidate?.evidenceText,
        /Published on/,
      );
    },
  );
});

test("extractStoredFileMetadata falls back to valid filename dates", async () => {
  await withTempTextFile(
    "notice-2024-02-29.txt",
    "Notice without an embedded publication date.",
    async (filePath) => {
      const out = await extractStoredFileMetadata(filePath, "text/plain", {
        fileName: "notice-2024-02-29.txt",
      });

      assert.equal(isoDate(out.sourcePublishedAt), "2024-02-29");
      assert.equal(out.publishedAtMeta.source, "filename_pattern");
    },
  );
});

test("extractStoredFileMetadata rejects impossible filename dates", async () => {
  await withTempTextFile(
    "notice-2024-13-40.txt",
    "Notice without an embedded publication date.",
    async (filePath) => {
      const out = await extractStoredFileMetadata(filePath, "text/plain", {
        fileName: "notice-2024-13-40.txt",
      });

      assert.equal(out.sourcePublishedAt, null);
      assert.equal(out.publishedAtMeta.source, "unknown");
      assert.deepEqual(out.publishedAtMeta.details?.topCandidates, []);
    },
  );
});

test("text candidate extraction ranks explicit publication cues over generic dates", () => {
  const candidates = extractPublishedAtCandidatesFromText(
    [
      "Meeting held on 01/01/2024.",
      "Notification dated: 16.04.2026.",
    ].join("\n"),
  );

  const best = chooseBestPublishedAtCandidate(candidates);

  assert.equal(isoDate(best?.date ?? null), "2026-04-16");
  assert.equal(best?.source, "text_explicit");
  assert.match(best?.evidenceText ?? "", /Notification dated/);
});

test("candidate ranker lets explicit PDF page evidence beat PDF info dates", () => {
  const candidates: PublishedAtCandidate[] = [
    {
      date: new Date(Date.UTC(2026, 4, 20)),
      source: "pdf_info",
      confidence: 0.45,
      raw: "D:20260520000000Z",
      reason: "PDF internal metadata",
    },
    {
      date: new Date(Date.UTC(2026, 3, 16)),
      source: "pdf_pages",
      confidence: 0.88,
      raw: "16 April 2026",
      evidenceText: "Order dated 16 April 2026",
      locator: { pageNumber: 1 },
      reason: "Explicit publication cue in PDF text",
    },
  ];

  const best = chooseBestPublishedAtCandidate(candidates);
  const meta = publishedAtMetaFromCandidates(candidates);

  assert.equal(isoDate(best?.date ?? null), "2026-04-16");
  assert.equal(meta.source, "pdf_pages");
  assert.equal(
    meta.details?.winningCandidate?.evidenceText,
    "Order dated 16 April 2026",
  );
  assert.equal(meta.details?.topCandidates.length, 1);
  assert.equal(meta.details?.ignoredCandidates[0]?.source, "pdf_info");
});

test("candidate ranker ignores weak contextual dates when they are the only evidence", () => {
  const candidates: PublishedAtCandidate[] = [
    {
      date: new Date(Date.UTC(2026, 4, 20)),
      source: "pdf_info",
      confidence: 0.45,
      raw: "D:20260520000000Z",
      reason: "PDF internal metadata",
    },
    {
      date: new Date(Date.UTC(2025, 10, 15)),
      source: "pdf_text_heuristic",
      confidence: 0.5,
      raw: "15/11/2025",
      evidenceText: "The committee reviewed actions from 15/11/2025.",
      reason: "Date found without an explicit publication cue",
    },
  ];

  const best = chooseBestPublishedAtCandidate(candidates);
  const meta = publishedAtMetaFromCandidates(candidates);

  assert.equal(best, null);
  assert.equal(meta.source, "unknown");
  assert.equal(meta.confidence, 0.0);
  assert.equal(meta.details?.topCandidates.length, 2);
  assert.equal(meta.details?.ignoredCandidates.length, 2);
});

test("candidate ranker prefers filename fallback over generic body dates", () => {
  const candidates: PublishedAtCandidate[] = [
    {
      date: new Date(Date.UTC(2026, 4, 20)),
      source: "pdf_text_heuristic",
      confidence: 0.5,
      raw: "20/05/2026",
      evidenceText: "Earlier proceedings were considered on 20/05/2026.",
      reason: "Date found without an explicit publication cue",
    },
    {
      date: new Date(Date.UTC(2024, 10, 18)),
      source: "filename_pattern",
      confidence: 0.34,
      raw: "2024-11-18",
      locator: { fileName: "order-2024-11-18.pdf" },
      reason: "Date pattern found in filename",
    },
  ];

  const best = chooseBestPublishedAtCandidate(candidates);
  const meta = publishedAtMetaFromCandidates(candidates);

  assert.equal(isoDate(best?.date ?? null), "2024-11-18");
  assert.equal(best?.source, "filename_pattern");
  assert.equal(meta.source, "filename_pattern");
  assert.equal(meta.details?.ignoredCandidates[0]?.source, "pdf_text_heuristic");
});

test("candidate ranker uses source priority as a deterministic tie breaker", () => {
  const candidates: PublishedAtCandidate[] = [
    {
      date: new Date(Date.UTC(2026, 0, 1)),
      source: "url_pattern",
      confidence: 0.65,
      raw: "https://example.org/2026/01/01/story",
    },
    {
      date: new Date(Date.UTC(2025, 10, 7)),
      source: "html_meta",
      confidence: 0.65,
      raw: "2025-11-07",
    },
  ];

  const best = chooseBestPublishedAtCandidate(candidates);

  assert.equal(best?.source, "html_meta");
  assert.equal(isoDate(best?.date ?? null), "2025-11-07");
});
