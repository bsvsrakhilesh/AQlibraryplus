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
    { complete: true, totalWindows: 25, succeededWindows: 25, failedWindows: 0 },
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
    { complete: false, totalWindows: 3, succeededWindows: 2, failedWindows: 1 },
  );

  assert.equal(view.complete, false);
  assert.equal(view.statusLabel, "Partial document analysis");
  assert.equal(view.succeededWindows, 2);
});
