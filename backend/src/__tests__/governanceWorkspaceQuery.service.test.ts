import test from "node:test";
import assert from "node:assert/strict";

async function loadHooks() {
  process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
  const mod = await import("../services/governanceWorkspaceQuery.service");
  return mod.governanceWorkspaceQueryTestHooks;
}

test("resolveWorkflowPlan routes factor and why questions to question review", async () => {
  const hooks = await loadHooks();
  const factors = hooks.resolveWorkflowPlan({
    requestedMode: "auto",
    question:
      "What factors did the authority consider before taking action in previous years?",
    tokens: ["factors", "authority", "action", "previous"],
    anchorDocumentIds: [],
    anchorUrlIds: [],
  });

  assert.equal(factors.resolvedMode, "question_review");

  const why = hooks.resolveWorkflowPlan({
    requestedMode: "auto",
    question: "Why does one record say restricted and another say permitted?",
    tokens: ["restricted", "permitted"],
    anchorDocumentIds: [],
    anchorUrlIds: [],
  });

  assert.equal(why.resolvedMode, "question_review");
});

test("resolveWorkflowPlan keeps broad governance scoping in landscape mode", async () => {
  const hooks = await loadHooks();
  const out = hooks.resolveWorkflowPlan({
    requestedMode: "auto",
    question: "Map the active agencies, directions, and compliance gaps",
    tokens: ["map", "agencies", "directions", "compliance"],
    anchorDocumentIds: [],
    anchorUrlIds: [],
  });

  assert.equal(out.resolvedMode, "landscape");
});

test("resolveQueryType identifies question review independent of domain terms", async () => {
  const hooks = await loadHooks();
  const out = hooks.resolveQueryType({
    workflowMode: "question_review",
    question: "What evidence supports this action and who was responsible?",
  });

  assert.equal(out, "question_review");
});

test("resolveWorkflowPlan routes GRAP reasons questions to question review", async () => {
  const hooks = await loadHooks();
  const out = hooks.resolveWorkflowPlan({
    requestedMode: "auto",
    question: "What were the reasons for each GRAP order?",
    tokens: hooks.tokenizeQuestion("What were the reasons for each GRAP order?"),
    anchorDocumentIds: [],
    anchorUrlIds: [],
  });

  assert.equal(out.resolvedMode, "question_review");
});

test("tokenizeQuestion expands GRAP reason questions toward trigger language", async () => {
  const hooks = await loadHooks();
  const out = hooks.tokenizeQuestion("What were the reasons for each GRAP order?");

  assert.ok(out.includes("grap"));
  assert.ok(out.includes("order"));
  assert.ok(out.includes("factors"));
  assert.ok(out.includes("considered"));
  assert.ok(out.includes("aqi"));
  assert.ok(out.includes("stage"));
});

function rankedCandidate(overrides: Record<string, any>): any {
  return {
    documentId: "doc-default",
    kind: "FILE",
    urlId: null,
    primaryFileId: "file-default",
    mimeType: "application/pdf",
    title: "Evidence.pdf",
    sourceLabel: "https://example.gov/evidence",
    summary: null,
    publishedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    anchor: false,
    anchorScore: 0,
    signalScore: 40,
    reasons: new Set(["test reason"]),
    matchedIssues: new Set(["Industrial emissions"]),
    matchedAgencies: new Set(["CAQM"]),
    matchedLanes: new Set(["metadata"]),
    authorityScore: 5,
    freshnessScore: 2,
    matchScore: 47,
    whyRanked: ["Relevant governance signal match"],
    duplicateCount: 0,
    clusterDocumentIds: ["doc-default"],
    clusterKinds: ["FILE"],
    clusterReason: null,
    retrievalLanes: ["metadata"],
    coverageFamilies: ["metadata"],
    diversityReason: null,
    temporalReason: null,
    ...overrides,
  };
}

test("clusterRankedCandidates prefers File Manager PDF over text duplicate", async () => {
  const hooks = await loadHooks();
  const clustered = hooks.clusterRankedCandidates([
    rankedCandidate({
      documentId: "doc-text",
      primaryFileId: "file-text",
      mimeType: "text/plain",
      title: "CAQM Order.txt",
      matchScore: 95,
    }),
    rankedCandidate({
      documentId: "doc-pdf",
      primaryFileId: "file-pdf",
      mimeType: "application/pdf",
      title: "CAQM Order.pdf",
      matchScore: 70,
    }),
  ]);

  assert.equal(clustered.length, 1);
  assert.equal(clustered[0].documentId, "doc-pdf");
  assert.deepEqual(
    new Set(clustered[0].clusterDocumentIds),
    new Set(["doc-text", "doc-pdf"]),
  );
});

test("clusterRankedCandidates prefers file artifact over saved URL duplicate", async () => {
  const hooks = await loadHooks();
  const clustered = hooks.clusterRankedCandidates([
    rankedCandidate({
      documentId: "doc-url",
      kind: "URL",
      urlId: 12,
      primaryFileId: null,
      mimeType: null,
      title: "CAQM Order",
      matchScore: 98,
    }),
    rankedCandidate({
      documentId: "doc-pdf",
      kind: "FILE",
      primaryFileId: "file-pdf",
      mimeType: "application/pdf",
      title: "CAQM Order.pdf",
      matchScore: 72,
    }),
  ]);

  assert.equal(clustered.length, 1);
  assert.equal(clustered[0].documentId, "doc-pdf");
  assert.equal(clustered[0].kind, "FILE");
});

test("documentAllowed keeps Saved URL records out of file-scoped retrieval", async () => {
  const hooks = await loadHooks();

  assert.equal(hooks.documentAllowed("FILE", "files"), true);
  assert.equal(hooks.documentAllowed("URL", "files"), false);
});

test("purpose fallback descriptor keeps scoped evidence when query wording is broad", async () => {
  const hooks = await loadHooks();
  const out = hooks.buildPurposeFallbackDescriptor({
    doc: {
      id: "doc-grap-1",
      kind: "FILE",
      urlId: null,
      primaryFileId: "file-grap-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      url: null,
      primaryFile: {
        fileName: "GRAP Stage I order.pdf",
        mimeType: "application/pdf",
        sourceUrl: "https://caqm.nic.in/orders/grap-stage-1-order.pdf",
        sourcePublishedAt: new Date("2025-11-18T00:00:00.000Z"),
      },
    },
    tokens: ["reasons", "grap", "orders"],
    hasQuery: true,
  });

  assert.match(out.reason, /Purpose-scoped fallback/i);
  assert.ok(out.signalScore >= 22);
});

test("purpose fallback descriptor still emits a usable reason without token hits", async () => {
  const hooks = await loadHooks();
  const out = hooks.buildPurposeFallbackDescriptor({
    doc: {
      id: "doc-1",
      kind: "FILE",
      urlId: null,
      primaryFileId: "file-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      url: null,
      primaryFile: {
        fileName: "Order 17.pdf",
        mimeType: "application/pdf",
        sourceUrl: "https://caqm.nic.in/orders/17.pdf",
        sourcePublishedAt: null,
      },
    },
    tokens: ["reasons", "implementation"],
    hasQuery: true,
  });

  assert.match(out.reason, /captured evidence kept in scope/i);
  assert.equal(out.signalScore, 10);
});
