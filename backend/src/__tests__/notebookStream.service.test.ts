import test from "node:test";
import assert from "node:assert/strict";

import {
  formatNotebookSseEvent,
  userSafeNotebookStreamError,
} from "../services/notebookStream.service";

test("formatNotebookSseEvent emits parseable SSE blocks", () => {
  const out = formatNotebookSseEvent("delta", { text: "hello" });

  assert.equal(out, 'event: delta\ndata: {"text":"hello"}\n\n');
});

test("userSafeNotebookStreamError normalizes aborts and server errors", () => {
  assert.equal(
    userSafeNotebookStreamError(new DOMException("canceled", "AbortError")),
    "Chat stopped.",
  );
  assert.equal(userSafeNotebookStreamError(new Error("secret")), "Chat failed. Please try again.");
});
