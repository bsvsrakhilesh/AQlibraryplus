import test from "node:test";
import assert from "node:assert/strict";

import {
  assertIngestibleText,
  splitTextWithOffsets,
} from "../services/chunking.service";

test("splitTextWithOffsets keeps paragraph boundaries and offsets", () => {
  const text = [
    "Order dated 01.01.2026 for implementation of actions under stage two.",
    "",
    "The commission directs agencies to submit compliance reports within seven days.",
    "",
    "Failure to comply may trigger review by the competent authority.",
  ].join("\n");

  const chunks = splitTextWithOffsets(text, 120, 20);

  assert.ok(chunks.length >= 2);
  assert.equal(text.slice(chunks[0].start, chunks[0].end), chunks[0].text);
  assert.ok(!chunks[0].text.includes("Failure to comply"));
});

test("splitTextWithOffsets avoids tiny chunks", () => {
  const chunks = splitTextWithOffsets("tiny\n\nalso tiny", 120, 20);

  assert.equal(chunks.length, 0);
});

test("assertIngestibleText rejects low-quality extracted text", () => {
  assert.throws(
    () => assertIngestibleText("short text", { mode: "ocr_pdf" }),
    /too short to index/,
  );
});
