import test from "node:test";
import assert from "node:assert/strict";

import {
  assertOcrPageLimit,
  buildOcrmypdfArgs,
  parseOcrPageSelection,
} from "../services/ocr.service";

test("parseOcrPageSelection accepts singles, ranges, and lists", () => {
  assert.deepEqual(parseOcrPageSelection("1"), [1]);
  assert.deepEqual(parseOcrPageSelection("1-3"), [1, 2, 3]);
  assert.deepEqual(parseOcrPageSelection("1,3,8-10"), [1, 3, 8, 9, 10]);
});

test("parseOcrPageSelection rejects invalid and out-of-bound ranges", () => {
  assert.throws(() => parseOcrPageSelection("4-2"), /Invalid OCR page range/);
  assert.throws(
    () => parseOcrPageSelection("1,abc"),
    /Invalid OCR page range/,
  );
  assert.throws(
    () => parseOcrPageSelection("1-4", 3),
    /this PDF has 3 page/,
  );
});

test("assertOcrPageLimit requires page ranges for oversized PDFs", () => {
  assert.throws(
    () =>
      assertOcrPageLimit({
        pageCount: 100,
        pageNumbers: null,
        maxPages: 50,
      }),
    /Choose a page range/,
  );
  assert.doesNotThrow(() =>
    assertOcrPageLimit({
      pageCount: 100,
      pageNumbers: [1, 2, 3],
      maxPages: 50,
    }),
  );
});

test("buildOcrmypdfArgs maps safe OCR options to CLI args", () => {
  const args = buildOcrmypdfArgs({
    inputPath: "in.pdf",
    outputPath: "out.pdf",
    sidecarPath: "sidecar.txt",
    langs: "eng+hin",
    pages: "1-3",
    deskew: true,
    rotatePages: true,
    clean: false,
    forceOcr: true,
  });

  assert.ok(args.includes("--sidecar"));
  assert.ok(args.includes("--deskew"));
  assert.ok(args.includes("--rotate-pages"));
  assert.ok(args.includes("--pages"));
  assert.ok(args.includes("1-3"));
  assert.ok(args.includes("--force-ocr"));
  assert.equal(args.includes("--clean"), false);
});
