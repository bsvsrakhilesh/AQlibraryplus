import test from "node:test";
import assert from "node:assert/strict";

import { normalizeNoteProvenance } from "../services/notebookProvenance.service";

test("normalizeNoteProvenance accepts and bounds valid notebook provenance", () => {
  const out = normalizeNoteProvenance({
    version: "note-provenance-v1",
    artifacts: [
      {
        kind: "chat-answer",
        createdAt: "2026-05-06T00:00:00.000Z",
        answer: "A cited answer",
        citations: [{ chunkId: "chunk-1", quote: "quoted evidence text" }],
        evidence: [{ claim: "claim", citations: [] }],
        claimLinks: [{ claim: "claim", citations: [] }],
      },
    ],
  });

  assert.equal(out?.version, "note-provenance-v1");
  assert.equal(out?.artifacts.length, 1);
  assert.equal(out?.artifacts[0].kind, "chat-answer");
  assert.equal(out?.artifacts[0].citations.length, 1);
});

test("normalizeNoteProvenance rejects arbitrary JSON", () => {
  assert.throws(
    () => normalizeNoteProvenance({ version: "other", artifacts: [] }),
    /Invalid note provenance payload/,
  );
});

test("normalizeNoteProvenance caps oversized artifact lists", () => {
  assert.throws(
    () =>
      normalizeNoteProvenance({
        version: "note-provenance-v1",
        artifacts: Array.from({ length: 31 }, () => ({
          kind: "chat-answer",
          answer: "x",
          citations: [],
        })),
      }),
    /too many artifacts/,
  );
});
