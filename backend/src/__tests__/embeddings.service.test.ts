import test from "node:test";
import assert from "node:assert/strict";

import {
  embeddingModelLabel,
  getEmbeddingConfig,
  toPgVectorLiteral,
} from "../services/embeddings.service";

test("embedding config exposes default model, dimensions, and label", () => {
  const config = getEmbeddingConfig();

  assert.equal(config.model, "text-embedding-3-small");
  assert.equal(config.dimensions, 1536);
  assert.equal(embeddingModelLabel(config), "text-embedding-3-small@1536");
});

test("toPgVectorLiteral rejects vectors with the wrong dimensions", () => {
  assert.throws(() => toPgVectorLiteral([0.1, 0.2]), /Embedding dim mismatch/);
});

test("toPgVectorLiteral formats configured-dimension vectors", () => {
  const config = getEmbeddingConfig();
  const vec = Array.from({ length: config.dimensions }, () => 0.01);

  const out = toPgVectorLiteral(vec);

  assert.equal(out.startsWith("[0.01,0.01"), true);
  assert.equal(out.endsWith("]"), true);
});
