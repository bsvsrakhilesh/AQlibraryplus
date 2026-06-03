import test from "node:test";
import assert from "node:assert/strict";

import {
  chooseUrlTaggingSource,
  looksLikePdfSnapshotForTagging,
  looksLikePdfUrlForTagging,
} from "../services/aiTagUrlSource.util";

test("URL tagger recognizes PDF-like URLs and snapshots", () => {
  assert.equal(
    looksLikePdfUrlForTagging("https://caqm.nic.in/WriteReadData/order.pdf"),
    true,
  );
  assert.equal(
    looksLikePdfUrlForTagging(
      "https://example.gov/download?filename=direction.pdf",
    ),
    true,
  );
  assert.equal(looksLikePdfUrlForTagging("https://example.gov/news"), false);

  assert.equal(
    looksLikePdfSnapshotForTagging({
      storagePath: "/data/order.bin",
      mimeType: "application/pdf",
      captureType: "URL_TEXT",
      fileName: "order.bin",
    }),
    true,
  );
});

test("URL tagger does not tag PDF URLs from non-PDF snapshots", () => {
  const source = chooseUrlTaggingSource({
    url: "https://caqm.nic.in/WriteReadData/order.pdf",
    latestSnapshot: {
      storagePath: "/data/snapshot.html",
      mimeType: "text/html",
      captureType: "URL_TEXT",
      fileName: "snapshot.html",
    },
  });

  assert.deepEqual(source, {
    kind: "url",
    url: "https://caqm.nic.in/WriteReadData/order.pdf",
  });
});

test("URL tagger prefers PDF snapshots over live URL fetching", () => {
  const source = chooseUrlTaggingSource({
    url: "https://caqm.nic.in/WriteReadData/order.pdf",
    pdfSnapshot: {
      storagePath: "/data/order.pdf",
      mimeType: "application/pdf",
      captureType: "URL_PDF",
      fileName: "order.pdf",
    },
    latestSnapshot: {
      storagePath: "/data/snapshot.html",
      mimeType: "text/html",
      captureType: "URL_TEXT",
      fileName: "snapshot.html",
    },
  });

  assert.deepEqual(source, { kind: "file", path: "/data/order.pdf" });
});

test("URL tagger still uses latest snapshots for non-PDF URLs", () => {
  const source = chooseUrlTaggingSource({
    url: "https://example.gov/press-release",
    latestSnapshot: {
      storagePath: "/data/page.html",
      mimeType: "text/html",
      captureType: "URL_TEXT",
      fileName: "page.html",
    },
  });

  assert.deepEqual(source, { kind: "file", path: "/data/page.html" });
});
