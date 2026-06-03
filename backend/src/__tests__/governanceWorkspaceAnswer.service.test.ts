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

test("answer quality summary marks verified cited answers as strong", async () => {
  const { buildGovernanceAnswerQualitySummary } = await loadAnswerScopeHelpers();

  assert.deepEqual(
    buildGovernanceAnswerQualitySummary({
      status: "verified",
      validCitationCount: 3,
      invalidCitationCount: 0,
      repaired: false,
      droppedClaims: [],
      supportedClaimCount: 2,
      evidenceCardCount: 2,
    }),
    {
      supportedClaimCount: 2,
      citationCount: 3,
      evidenceCardCount: 2,
      droppedClaimCount: 0,
      invalidCitationCount: 0,
      repaired: false,
      qualityBand: "strong",
      recommendedAction: "use",
    },
  );
});

test("answer quality summary routes partial repaired answers to inspection", async () => {
  const { buildGovernanceAnswerQualitySummary } = await loadAnswerScopeHelpers();

  const summary = buildGovernanceAnswerQualitySummary({
    status: "partially_supported",
    validCitationCount: 3,
    invalidCitationCount: 1,
    repaired: true,
    droppedClaims: ["Unsupported claim"],
    supportedClaimCount: 2,
    evidenceCardCount: 1,
  });

  assert.equal(summary.qualityBand, "usable");
  assert.equal(summary.recommendedAction, "inspect");
  assert.equal(summary.droppedClaimCount, 1);
  assert.equal(summary.repaired, true);
});

test("answer quality summary marks unsupported answers as unsafe", async () => {
  const { buildGovernanceAnswerQualitySummary } = await loadAnswerScopeHelpers();

  const summary = buildGovernanceAnswerQualitySummary({
    status: "unsupported",
    validCitationCount: 0,
    invalidCitationCount: 0,
    repaired: false,
    droppedClaims: [],
    supportedClaimCount: 0,
    evidenceCardCount: 0,
  });

  assert.equal(summary.qualityBand, "unsafe");
  assert.equal(summary.recommendedAction, "broaden_evidence");
});
