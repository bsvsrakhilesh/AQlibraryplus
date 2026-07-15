import test from "node:test";
import assert from "node:assert/strict";
import { deriveAiTagCoverageView } from "../lib/aiTagCoverage";

test("PDF coverage is complete only when pages and model map are complete", () => {
  const view = deriveAiTagCoverageView(
    {
      kind: "pdf",
      coverage: {
        complete: true,
        totalPages: 100,
        analyzedPages: 100,
        nativePages: 78,
        ocrPages: 20,
        blankPages: 2,
        weakPages: 0,
        failedPages: 0,
      },
    },
    {
      mode: "llm_map_merge",
      required: true,
      attempted: true,
      complete: true,
      totalWindows: 25,
      succeededWindows: 25,
      failedWindows: 0,
      validationFailedBatches: 0,
    },
  );

  assert.equal(view.complete, true);
  assert.equal(view.statusLabel, "Complete document analysis");
  assert.equal(view.totalPages, 100);
});

test("a failed model map keeps otherwise complete PDF coverage partial", () => {
  const view = deriveAiTagCoverageView(
    {
      kind: "pdf",
      coverage: {
        complete: true,
        totalPages: 10,
        analyzedPages: 10,
      },
    },
    {
      mode: "llm_map_merge",
      required: true,
      attempted: true,
      complete: false,
      totalWindows: 3,
      succeededWindows: 2,
      failedWindows: 1,
    },
  );

  assert.equal(view.complete, false);
  assert.equal(view.statusLabel, "Partial document analysis");
  assert.equal(view.succeededWindows, 2);
});

test("missing map coverage fails closed even when every PDF page was extracted", () => {
  const view = deriveAiTagCoverageView({
    kind: "pdf",
    coverage: { complete: true, totalPages: 4, analyzedPages: 4 },
  });

  assert.equal(view.complete, false);
  assert.equal(view.status, "unavailable");
  assert.equal(view.statusLabel, "AI mapping unavailable");
});

test("deterministic fallback is useful but never presented as complete AI mapping", () => {
  const view = deriveAiTagCoverageView(
    {
      kind: "pdf",
      coverage: { complete: true, totalPages: 4, analyzedPages: 4 },
    },
    {
      mode: "deterministic_only",
      required: false,
      attempted: false,
      complete: false,
      totalWindows: 0,
      succeededWindows: 0,
      failedWindows: 0,
    },
  );

  assert.equal(view.complete, false);
  assert.equal(view.status, "deterministic_only");
});

test("HTML can report complete whole-source mapping without PDF page counters", () => {
  const view = deriveAiTagCoverageView(
    { kind: "html", unitCount: 7 },
    {
      mode: "llm_map_merge",
      required: true,
      attempted: true,
      complete: true,
      totalWindows: 8,
      succeededWindows: 8,
      failedWindows: 0,
      validationFailedBatches: 0,
    },
  );

  assert.equal(view.complete, true);
  assert.equal(view.hasCoverage, true);
});
