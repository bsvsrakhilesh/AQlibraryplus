import test from "node:test";
import assert from "node:assert/strict";

import { canonicalizeUrl } from "../utils/urlCanonical";

test("canonicalizeUrl collapses duplicate collector URLs to a stable evidence key", () => {
  const expected = "https://example.com/reports/air-quality?a=1&b=2";

  const variants = [
    " HTTPS://Example.COM:443/reports//air-quality///?utm_source=newsletter&b=2&a=1#section ",
    "https://example.com/reports/air-quality?b=2&a=1&utm_medium=social",
    "example.com/reports/air-quality/?a=1&b=2&gclid=abc",
    "https://example.com./reports/air-quality?fbclid=abc&b=2&a=1#duplicate",
  ];

  assert.deepEqual(
    variants.map((url) => canonicalizeUrl(url)),
    variants.map(() => expected),
  );
});

test("canonicalizeUrl keeps meaningful collector URL state distinct", () => {
  assert.equal(
    canonicalizeUrl(
      "https://example.com/report?utm_campaign=noise&page=2&year=2024",
    ),
    "https://example.com/report?page=2&year=2024",
  );

  assert.notEqual(
    canonicalizeUrl("https://example.com/report?page=2&year=2024"),
    canonicalizeUrl("https://example.com/report?page=2&year=2023"),
  );

  assert.notEqual(
    canonicalizeUrl("https://example.com/report?page=2&year=2024"),
    canonicalizeUrl("http://example.com/report?page=2&year=2024"),
  );
});
