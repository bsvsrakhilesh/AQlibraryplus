import test from "node:test";
import assert from "node:assert/strict";

async function loadAnswerScopeHelpers() {
  process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
  return import("../services/governanceWorkspaceAnswer.service");
}

test("purpose evidence hides relation endpoint claim text from documents outside scope", async () => {
  const { claimTextWithinEvidenceScope } = await loadAnswerScopeHelpers();
  const allowed = new Set(["doc-in-scope"]);

  assert.equal(
    claimTextWithinEvidenceScope(
      { claimText: "Permitted evidence", trace: { sourceDocumentId: "doc-in-scope" } },
      allowed,
    ),
    "Permitted evidence",
  );
  assert.equal(
    claimTextWithinEvidenceScope(
      { claimText: "External claim", trace: { sourceDocumentId: "doc-outside" } },
      allowed,
    ),
    null,
  );
  assert.equal(
    claimTextWithinEvidenceScope(
      { claimText: "Normal cross-library evidence", trace: { sourceDocumentId: "doc-outside" } },
      null,
    ),
    "Normal cross-library evidence",
  );
});

test("purpose evidence generation fails when any final card escapes the allowlist", async () => {
  const { assertEvidenceCardsWithinPurposeScope } = await loadAnswerScopeHelpers();

  assert.doesNotThrow(() =>
    assertEvidenceCardsWithinPurposeScope(
      [{ evidenceId: "chunk:1", documentId: "doc-in-scope" }],
      ["doc-in-scope"],
    ),
  );
  assert.throws(
    () =>
      assertEvidenceCardsWithinPurposeScope(
        [{ evidenceId: "relation:2", documentId: "doc-outside" }],
        ["doc-in-scope"],
      ),
    /Purpose evidence boundary violation/,
  );
  assert.doesNotThrow(() =>
    assertEvidenceCardsWithinPurposeScope(
      [{ evidenceId: "relation:2", documentId: "doc-outside" }],
      null,
    ),
  );
});
