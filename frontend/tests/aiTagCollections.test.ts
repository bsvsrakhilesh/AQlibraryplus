import test from "node:test";
import assert from "node:assert/strict";
import { preserveUniqueByKey } from "../lib/aiTagCollections";

test("UI collection normalization preserves more than one hundred unique tags", () => {
  const tags = Array.from({ length: 150 }, (_, index) => ({
    value: `Location ${index}`,
  }));

  const normalized = preserveUniqueByKey(tags, (tag) => tag.value.toLowerCase());

  assert.equal(normalized.length, 150);
  assert.equal(normalized[149].value, "Location 149");
});

test("UI collection normalization deduplicates without truncating later unique tags", () => {
  const tags = [
    ...Array.from({ length: 125 }, (_, index) => ({ value: `Tag ${index}` })),
    { value: "Tag 0" },
    { value: "Late unique tag" },
  ];

  const normalized = preserveUniqueByKey(tags, (tag) => tag.value.toLowerCase());

  assert.equal(normalized.length, 126);
  assert.equal(normalized.at(-1)?.value, "Late unique tag");
});
