import { expect, test, type Page, type Route } from "@playwright/test";

type Scenario = {
  name: string;
  searchSite: string;
  searchKeywords: string;
  savedUrlId: number;
  anchorDocumentId: string;
  question: string;
  questionType: string;
  timeHint: string;
  issueHint: string;
  locationHint: string;
  workflowMode: "question_review" | "case_trace";
  queryType: "question_review" | "case_review" | "chronology_review" | "contradiction_review" | "broad_scan";
  answerLead: string;
  evidenceTitle: string;
};

type PurposeState = {
  id: string;
  title: string;
  researchQuestion: string;
  jurisdiction: string;
  region: string;
  yearFrom: number | null;
  yearTo: number | null;
  sourcePreferences: string[];
  targetActors: string[];
  outputGoal: string | null;
  status: string;
  summary: {
    savedUrlCount: number;
    capturedEvidenceCount: number;
    governanceReadyDocumentCount: number;
  };
  authoritySources: Array<{
    key: string;
    label: string;
    domain: string;
    evidenceRole: string;
    reason: string;
    confidence: number;
    queryHints: string[];
    documentTerms: string[];
  }>;
};

const scenarios: Scenario[] = [
  {
    name: "faridabad-industrial-emissions",
    searchSite: "hspcb.gov.in",
    searchKeywords: "industrial emissions faridabad",
    savedUrlId: 101,
    anchorDocumentId: "doc-faridabad-industrial",
    question: "What has been done about industrial emissions in Faridabad since 1990?",
    questionType: "Actions taken",
    timeHint: "Since 1990",
    issueHint: "Industrial emissions",
    locationHint: "Faridabad",
    workflowMode: "question_review",
    queryType: "question_review",
    answerLead: "Inspection drives, notices, and recurring compliance follow-up are visible in the record.",
    evidenceTitle: "Faridabad industrial emissions record",
  },
  {
    name: "grap-iv-factors",
    searchSite: "caqm.nic.in",
    searchKeywords: "grap iv factors activation",
    savedUrlId: 102,
    anchorDocumentId: "doc-grap-iv",
    question: "What factors did CAQM consider while activating GRAP IV in previous years?",
    questionType: "Factors considered",
    timeHint: "Past decisions",
    issueHint: "GRAP",
    locationHint: "Delhi NCR",
    workflowMode: "question_review",
    queryType: "question_review",
    answerLead: "The question is answered through AQI, weather, and forecast-based triggers.",
    evidenceTitle: "CAQM GRAP IV activation record",
  },
  {
    name: "cd-dust-enforcement",
    searchSite: "caqm.nic.in",
    searchKeywords: "construction demolition dust enforcement reporting",
    savedUrlId: 103,
    anchorDocumentId: "doc-cd-dust",
    question:
      "How did CAQM directions translate into Delhi construction-and-demolition dust enforcement and reporting from January 2023 to December 2025?",
    questionType: "Compliance/follow-up",
    timeHint: "",
    issueHint: "Construction",
    locationHint: "Delhi NCR",
    workflowMode: "case_trace",
    queryType: "case_review",
    answerLead: "The evidence shows directions turning into inspections, reporting, and follow-up gaps.",
    evidenceTitle: "Delhi C&D dust enforcement record",
  },
];

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function sse(events: Array<{ event: string; data: unknown }>) {
  return events
    .map(
      (item) => `event: ${item.event}\ndata: ${JSON.stringify(item.data)}\n\n`,
    )
    .join("");
}

function buildPurposeState(scenario: Scenario): PurposeState {
  return {
    id: "purpose-1",
    title: "Delhi Air Quality",
    researchQuestion: scenario.question,
    jurisdiction: "Delhi NCR",
    region: "NCR",
    yearFrom: null,
    yearTo: null,
    sourcePreferences: ["Official orders"],
    targetActors: ["CAQM", "DPCC", "HSPCB"],
    outputGoal: "Cited evidence-backed brief",
    status: "active",
    summary: {
      savedUrlCount: 0,
      capturedEvidenceCount: 0,
      governanceReadyDocumentCount: 0,
    },
    authoritySources: [
      {
        key: "caqm",
        label: "CAQM",
        domain: "caqm.nic.in",
        evidenceRole: "Primary orders",
        reason: "Primary commission for Delhi-NCR air-quality orders.",
        confidence: 96,
        queryHints: ["order", "direction", "GRAP"],
        documentTerms: ["order", "direction", "revocation"],
      },
    ],
  };
}

function buildCollectorResult(scenario: Scenario) {
  return {
    title: scenario.evidenceTitle,
    url: `https://${scenario.searchSite}/orders/${scenario.savedUrlId}`,
    snippet: scenario.answerLead,
    ranking: { score: 0.97, reasons: ["official"], rank: 1 },
    purposeRelevance: {
      score: 0.98,
      matchedTerms: scenario.searchKeywords.split(/\s+/),
      reason: `Matches purpose terms: ${scenario.searchKeywords}`,
    },
  };
}

function buildEvidenceResponse(scenario: Scenario) {
  const candidate = {
    documentId: scenario.anchorDocumentId,
    kind: "URL" as const,
    urlId: scenario.savedUrlId,
    primaryFileId: null,
    mimeType: null,
    title: scenario.evidenceTitle,
    sourceLabel: `https://${scenario.searchSite}/orders/${scenario.savedUrlId}`,
    summary: scenario.answerLead,
    publishedAt: "2025-01-15T00:00:00.000Z",
    createdAt: "2025-01-15T00:00:00.000Z",
    updatedAt: "2025-01-15T00:00:00.000Z",
    anchor: true,
    anchorScore: 10,
    signalScore: 88,
    reasons: ["official source", "purpose match"],
    matchedIssues: [scenario.issueHint],
    matchedAgencies: scenario.name === "faridabad-industrial-emissions" ? ["HSPCB"] : ["CAQM"],
    matchedLanes: ["metadata", "anchor"],
    authorityScore: 96,
    freshnessScore: 70,
    matchScore: 94,
    whyRanked: [scenario.answerLead],
    duplicateCount: 0,
    clusterDocumentIds: [scenario.anchorDocumentId],
    clusterKinds: ["URL"],
    clusterReason: null,
    retrievalLanes: ["anchor", "metadata"],
    coverageFamilies: ["anchor", "metadata"],
    diversityReason: null,
    temporalReason: scenario.timeHint || null,
    stats: {
      claimCount: 2,
      eventCount: 2,
      gapCount: scenario.name === "cd-dust-enforcement" ? 1 : 0,
      relationCount: scenario.name === "cd-dust-enforcement" ? 1 : 0,
    },
  };

  return {
    query: {
      question: scenario.question,
      tokens: scenario.question
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 8),
      sourceScope: scenario.name === "cd-dust-enforcement" ? "mixed" : "urls",
      workflowMode: scenario.workflowMode,
      anchorDocumentIds: [scenario.anchorDocumentId],
      anchorUrlIds: [scenario.savedUrlId],
      limit: 8,
      collectorPurposeId: "purpose-1",
    },
    evidenceScope: {
      purpose: { id: "purpose-1", title: "Delhi Air Quality" },
      allowedDocumentIds: [scenario.anchorDocumentId],
      summary: {
        savedUrlCount: 1,
        capturedEvidenceCount: 1,
        governanceReadyDocumentCount: 1,
      },
    },
    workflow: {
      requestedMode: scenario.workflowMode,
      resolvedMode: scenario.workflowMode,
      rationale:
        scenario.workflowMode === "case_trace"
          ? "Case tracing mode was chosen explicitly, so retrieval will optimize for chronology, contradictions, and evidence gaps."
          : "Question Review mode was chosen explicitly, so retrieval will optimize for evidence-backed answers and gaps.",
      expectedOutputs:
        scenario.workflowMode === "case_trace"
          ? ["Chronological case trail", "Contradiction and override candidates", "Escalation-ready evidence pack"]
          : ["Evidence-backed answer", "Factors and chronology", "Verification and gap register"],
    },
    queryUnderstanding: {
      queryType: scenario.queryType,
      focusTerms:
        scenario.name === "cd-dust-enforcement"
          ? ["construction", "dust", "enforcement", "reporting"]
          : scenario.searchKeywords.split(/\s+/).slice(0, 4),
      timeHints:
        scenario.timeHint.length > 0 ? [scenario.timeHint] : ["Historical review"],
      locationHints: [scenario.locationHint],
      matchedIssues: [
        {
          id: `issue-${scenario.name}`,
          title: scenario.issueHint,
          kind: "GOVERNANCE_ISSUE",
          status: "OPEN",
        },
      ],
      matchedAgencies: [
        {
          id: scenario.name === "faridabad-industrial-emissions" ? "agency-hspcb" : "agency-caqm",
          name: scenario.name === "faridabad-industrial-emissions" ? "Haryana State Pollution Control Board" : "CAQM",
          category: "REGULATOR",
          jurisdiction: scenario.locationHint,
        },
      ],
    },
    temporalControl: {
      active: true,
      mode: "historical_neutral" as const,
      rationale: "The question explicitly asks for earlier years and archived evidence.",
      preferredSignals: ["dated orders", "reports", "follow-up actions"],
    },
    diversityControl: {
      active: true,
      rationale: "The question needs both official directions and implementation records.",
      balancedBy: ["Issue coverage", "Agency coverage"],
    },
    contradictionFoundation: {
      active: scenario.name === "cd-dust-enforcement",
      rationale:
        scenario.name === "cd-dust-enforcement"
          ? "Construction dust enforcement includes direction-to-implementation tracing."
          : "No contradiction-specific surfacing is needed for this question.",
      summary: {
        contradictionCount: scenario.name === "cd-dust-enforcement" ? 1 : 0,
        reviewCount: scenario.name === "cd-dust-enforcement" ? 1 : 0,
        overrideHintCount: 0,
        groupCount: scenario.name === "cd-dust-enforcement" ? 1 : 0,
      },
      groups:
        scenario.name === "cd-dust-enforcement"
          ? [
              {
                groupKey: "group-1",
                issueTitle: "Construction",
                label: "Direction vs enforcement gap",
                documentIds: [scenario.anchorDocumentId],
                documentTitles: [scenario.evidenceTitle],
                candidateCount: 1,
                reviewCount: 1,
                strongestBucket: "conflict" as const,
                strongestReason: "Implementation and reporting are not fully aligned.",
                relationIds: ["rel-1"],
              },
            ]
          : [],
      candidates: [],
      overrideHints: [],
      involvedDocumentIds: [scenario.anchorDocumentId],
    },
    retrievalDecision: {
      shouldAutoSelect: true,
      recommendedDocumentId: scenario.anchorDocumentId,
      confidence: "high" as const,
      rationale: "The anchored official source is the strongest match for the question.",
      topCandidateScore: 94,
      runnerUpScore: 64,
      scoreMargin: 30,
    },
    landscapeMappingSurface: {
      active: scenario.workflowMode === "landscape",
      rationale: "Landscape mapping is not the primary mode for these specific questions.",
      summary: {
        issueCount: 1,
        agencyCount: 1,
        spotlightCount: 1,
        currentPreferredCount: 1,
        conflictLinkedCount: 0,
      },
      sourceCoverage: {
        fileCount: 0,
        urlCount: 1,
        anchorCount: 1,
        metadataCount: 1,
        graphCount: 0,
        chunkCount: 0,
      },
      topIssues: [],
      topAgencies: [],
      spotlightDocuments: [],
    },
    caseTracingSurface: {
      active: scenario.workflowMode === "case_trace",
      rationale: "The case-tracing surface is active for the direction-to-enforcement question.",
      summary: {
        focusDocumentCount: 1,
        contradictionClusterCount: 1,
        comparisonCount: 1,
        overrideChainCount: 0,
        timelineHighlightCount: 1,
        reviewCount: 1,
      },
      focusDocuments: [],
      contradictionClusters: [],
      comparisonPairs: [],
      overrideChains: [],
      timelineHighlights: [],
    },
    questionReviewSurface: {
      active: scenario.workflowMode === "question_review",
      rationale: "The question-review surface is active for this answer-focused question.",
      question: scenario.question,
      queryType: scenario.queryType,
      summary: {
        sourceCount: 1,
        factorCount: 3,
        timelineHighlightCount: 1,
        actorCount: 1,
        gapCount: scenario.name === "cd-dust-enforcement" ? 1 : 0,
        reviewCount: 1,
      },
      answerSignals: [
        {
          title: "Official order",
          detail: scenario.answerLead,
          evidenceId: "evidence-1",
        },
      ],
      factors: [
        {
          title: "Timeline",
          detail: "Historical context and dated follow-up actions.",
        },
      ],
      timelineHighlights: [],
      actorInputs: [],
      openQuestions: scenario.name === "cd-dust-enforcement" ? ["Confirm reporting gap status."] : [],
    },
    candidates: [candidate],
    totalCandidates: 1,
    selectedDocumentId: scenario.anchorDocumentId,
    retrievalMetadata: {
      retrievalDecision: {
        confidence: "high",
        topCandidateScore: 94,
      },
    },
    sourceCounts: {
      fileCount: 0,
      urlCount: 1,
      anchorCount: 1,
    },
  };
}

function buildAnswerResponse(scenario: Scenario, sessionId: string) {
  const citation = {
    evidenceId: "evidence-1",
    quote: scenario.answerLead,
    sourceKind: "URL",
    sourceLabel: `https://${scenario.searchSite}/orders/${scenario.savedUrlId}`,
    sourceUrl: `https://${scenario.searchSite}/orders/${scenario.savedUrlId}`,
    fileId: null,
    fileName: null,
    chunkId: "chunk-1",
    sourceId: String(scenario.savedUrlId),
    sourceRevisionId: "rev-1",
    documentRevisionId: "docrev-1",
    pipelineConfigId: "pipe-1",
    documentId: scenario.anchorDocumentId,
    pageStart: 1,
    pageEnd: 2,
    charStart: 0,
    charEnd: 120,
  };

  return {
    sessionId,
    run: {
      id: `run-${scenario.savedUrlId}`,
      sessionId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
      status: "SUCCEEDED",
      question: scenario.question,
      answer:
        scenario.name === "faridabad-industrial-emissions"
          ? `${scenario.answerLead}\n\n- Compliance notices and inspection activity recur after 1990.\n- The answer remains evidence-bound to the stored source set.`
          : scenario.name === "grap-iv-factors"
            ? `${scenario.answerLead}\n\n- Factors include AQI, weather, forecasted worsening, and escalation logic.\n- The answer stays within the retrieved official source set.`
            : `${scenario.answerLead}\n\n- Directions are traced to inspections, reporting, and continuing gaps.\n- The answer stays within the retrieved official source set.`,
      structuredAnswer: {
        queryType: scenario.queryType,
        summary: scenario.answerLead,
        jurisdiction: scenario.locationHint,
        agencies:
          scenario.name === "faridabad-industrial-emissions"
            ? ["Haryana State Pollution Control Board"]
            : ["CAQM", "DPCC"],
        pollutants:
          scenario.name === "grap-iv-factors"
            ? ["PM2.5", "PM10"]
            : scenario.name === "cd-dust-enforcement"
              ? ["Construction dust"]
              : ["Industrial emissions"],
        timeRange: scenario.timeHint || null,
        findings: [
          {
            title: scenario.evidenceTitle,
            detail: scenario.answerLead,
          },
        ],
        conflicts:
          scenario.name === "cd-dust-enforcement"
            ? [
                {
                  title: "Reporting gap",
                  finding: "Implementation exists, but reporting remains incomplete.",
                },
              ]
            : [],
        evidenceGaps:
          scenario.name === "cd-dust-enforcement"
            ? ["Confirm whether every enforcement action is reported consistently."]
            : [],
        recommendedNextSteps:
          scenario.name === "cd-dust-enforcement"
            ? ["Inspect latest reporting trail.", "Open the linked official source."]
            : ["Open the cited source.", "Compare the cited passages with the answer."],
        confidence: {
          level: "high",
          rationale: "The answer is supported by a single anchored official source.",
          evidenceCoverage: "strong",
        },
      },
      queryType: scenario.queryType,
      jurisdiction: scenario.locationHint,
      agencies:
        scenario.name === "faridabad-industrial-emissions"
          ? ["Haryana State Pollution Control Board"]
          : ["CAQM", "DPCC"],
      pollutants:
        scenario.name === "grap-iv-factors"
          ? ["PM2.5", "PM10"]
          : scenario.name === "cd-dust-enforcement"
            ? ["Construction dust"]
            : ["Industrial emissions"],
      timeRange: scenario.timeHint || null,
      summary: scenario.answerLead,
      findings: [
        {
          title: scenario.evidenceTitle,
          detail: scenario.answerLead,
        },
      ],
      conflicts:
        scenario.name === "cd-dust-enforcement"
          ? [
              {
                title: "Reporting gap",
                finding: "Implementation exists, but reporting remains incomplete.",
              },
            ]
          : [],
      evidenceGaps:
        scenario.name === "cd-dust-enforcement"
          ? ["Confirm whether every enforcement action is reported consistently."]
          : [],
      recommendedNextSteps:
        scenario.name === "cd-dust-enforcement"
          ? ["Inspect latest reporting trail.", "Open the linked official source."]
          : ["Open the cited source.", "Compare the cited passages with the answer."],
      confidence: {
        level: "high",
        rationale: "The answer is supported by a single anchored official source.",
        evidenceCoverage: "strong",
      },
      claimCitations: [
        {
          claim: scenario.answerLead,
          citations: [citation],
        },
      ],
      citations: [citation],
      evidence: [
        {
          evidenceId: "evidence-1",
          title: scenario.evidenceTitle,
          summary: scenario.answerLead,
          citations: [citation],
        },
      ],
      caveats: [],
      openQuestions:
        scenario.name === "cd-dust-enforcement"
          ? ["Verify the latest reporting backlog."]
          : [],
      suggestedFollowUps:
        scenario.name === "cd-dust-enforcement"
          ? ["Check the next official update."]
          : ["Open the official source and compare the cited passage."],
      model: "gpt-5.4-mini",
      assistModel: "gpt-4o-mini",
      openaiResponseId: null,
      previousRunId: null,
      groundingStatus: "verified",
      validation: {
        status: "verified",
        qualityBand: "strong",
        recommendedAction: "use",
        validCitationCount: 1,
        invalidCitationCount: 0,
        supportedClaimCount: 1,
        evidenceCardCount: 1,
        officerFeedback: [],
      },
      candidateDocumentIds: [scenario.anchorDocumentId],
      finalEvidenceChunkIds: ["chunk-1"],
      retrievalMetadata: {
        officerQueryProfile: {
          domain: "air_quality_governance",
          queryType: scenario.queryType,
          jurisdiction: scenario.locationHint,
          pollutants:
            scenario.name === "grap-iv-factors"
              ? ["PM2.5", "PM10"]
              : scenario.name === "cd-dust-enforcement"
                ? ["Construction dust"]
                : ["Industrial emissions"],
          agencies:
            scenario.name === "faridabad-industrial-emissions"
              ? ["Haryana State Pollution Control Board"]
              : ["CAQM", "DPCC"],
          timeRange: scenario.timeHint || null,
        },
        retrievalTraceSummary: {
          candidateCount: 1,
          selectedDocumentCount: 1,
          selectedEvidenceCardCount: 1,
          officialSourceCandidateCount: 1,
          officialSourceEvidenceCount: 1,
          laneCounts: { anchor: 1, metadata: 1 },
          coverageCounts: { anchor: 1, metadata: 1 },
          topReasons: [{ reason: "official source", count: 1 }],
          selectedEvidence: [
            {
              evidenceId: "evidence-1",
              kind: "URL",
              documentId: scenario.anchorDocumentId,
              title: scenario.evidenceTitle,
              sourceLabel: `https://${scenario.searchSite}/orders/${scenario.savedUrlId}`,
              officialSource: true,
              airQualityScore: 94,
            },
          ],
        },
        multiStepResearch: {
          enabled: true,
          rationale: "The question needs multi-step retrieval across responsibility, chronology, or comparisons.",
          steps: [
            {
              id:
                scenario.name === "cd-dust-enforcement"
                  ? "case_tracing"
                  : "question_review",
              label:
                scenario.name === "cd-dust-enforcement"
                  ? "Case tracing"
                  : "Question review",
              question: scenario.question,
              purpose: scenario.answerLead,
              candidateCount: 1,
              documentIds: [scenario.anchorDocumentId],
              topSources: [
                {
                  documentId: scenario.anchorDocumentId,
                  title: scenario.evidenceTitle,
                  sourceLabel: `https://${scenario.searchSite}/orders/${scenario.savedUrlId}`,
                  matchScore: 94,
                  whyRanked: ["official source", "purpose match"],
                },
              ],
              retrievalDecision: {
                confidence: "high",
                shouldAutoSelect: true,
              },
              queryUnderstanding: {
                queryType: scenario.queryType,
              },
              coverageFamilies: ["anchor", "metadata"],
              retrievalLanes: ["anchor", "metadata"],
            },
          ],
        },
        graphRagSummary: {
          active: scenario.name === "cd-dust-enforcement",
          summary: {
            graphCandidateCount: scenario.name === "cd-dust-enforcement" ? 1 : 0,
            relationLaneCount: scenario.name === "cd-dust-enforcement" ? 1 : 0,
            contradictionCount: scenario.name === "cd-dust-enforcement" ? 1 : 0,
            overrideChainCount: 0,
            comparisonCount: scenario.name === "cd-dust-enforcement" ? 1 : 0,
            caseTrailEventCount: scenario.name === "cd-dust-enforcement" ? 1 : 0,
            actorCount: 1,
            openQuestionCount: scenario.name === "cd-dust-enforcement" ? 1 : 0,
          },
          relationshipPaths:
            scenario.name === "cd-dust-enforcement"
              ? [
                  {
                    id: "path-1",
                    kind: "case_trail",
                    label: "Direction to implementation trail",
                    detail: "CAQM direction connects to later enforcement reporting.",
                    documentIds: [scenario.anchorDocumentId],
                    relationTypes: ["REFERENCE"],
                    issueTitle: "Construction",
                  },
                ]
              : [],
          officerWarnings:
            scenario.name === "cd-dust-enforcement"
              ? ["1 graph relation(s) require analyst review."]
              : [],
        },
        notes: null,
      },
      latencyMs: 1200,
      error: null,
      collectorPurposeId: "purpose-1",
    },
  };
}

async function installMockBackend(page: Page, scenario: Scenario) {
  const purpose = buildPurposeState(scenario);
  const savedRows: Array<{ urlId: number; url: string; newlySaved: boolean; newlyLinked: boolean; status: string }> = [];
  let answerSessionId = `session-${scenario.savedUrlId}`;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;

    if (method === "GET" && pathname === "/api/collector-purposes") {
      return json(route, [purpose]);
    }

    if (method === "GET" && pathname === "/api/collector-purposes/purpose-1") {
      return json(route, purpose);
    }

    if (method === "GET" && pathname === "/api/tags") {
      return json(route, []);
    }

    if (method === "GET" && pathname === "/api/urls") {
      return json(route, { items: savedRows, total: savedRows.length, page: 1, pageSize: 50 });
    }

    if (method === "GET" && pathname === "/api/urls/facets") {
      return json(route, { total: savedRows.length });
    }

    if (method === "GET" && pathname === "/api/urls/queue-summary") {
      return json(route, { all: savedRows.length, neverCaptured: 0, staleCapture: 0, aiFailed: 0, metadataMissing: 0 });
    }

    if (method === "POST" && pathname === "/api/urls/exists") {
      return json(route, { exists: {} });
    }

    if (method === "GET" && pathname === "/api/search") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "x-next-page": "",
          "x-has-more": "0",
          "x-total-results": "1",
          "x-collector-search-id": `search-${scenario.savedUrlId}`,
        },
        body: JSON.stringify([buildCollectorResult(scenario)]),
      });
    }

    if (method === "POST" && pathname === "/api/search/rerank") {
      return json(route, []);
    }

    const saveMatch = pathname.match(/^\/api\/collector-purposes\/([^/]+)\/save-selection$/);
    if (method === "POST" && saveMatch) {
      const body = request.postDataJSON() as { urls?: Array<{ url: string }> };
      const rows =
        body.urls?.map((row) => ({
          urlId: scenario.savedUrlId,
          url: row.url,
          newlySaved: true,
          newlyLinked: true,
          status: "saved_to_purpose",
        })) ?? [];
      savedRows.push(...rows);
      purpose.summary.savedUrlCount = savedRows.length;
      purpose.summary.capturedEvidenceCount = 1;
      purpose.summary.governanceReadyDocumentCount = 1;
      return json(route, {
        rows,
        summary: purpose.summary,
      });
    }

    const revisionsMatch = pathname.match(/^\/api\/urls\/([^/]+)\/revisions$/);
    if (method === "GET" && revisionsMatch) {
      return json(route, {
        documentId: scenario.anchorDocumentId,
        revisions: [
          {
            id: `rev-${scenario.savedUrlId}`,
            documentId: scenario.anchorDocumentId,
            storedFileId: null,
            createdAt: "2025-01-15T00:00:00.000Z",
            captureType: "URL_TEXT",
            provenance: null,
          },
        ],
      });
    }

    if (method === "GET" && pathname === "/api/issues") {
      return json(route, {
        items: [
          {
            id: `issue-${scenario.name}`,
            title: scenario.issueHint,
            kind: "GOVERNANCE_ISSUE",
            status: "OPEN",
          },
        ],
      });
    }

    if (method === "GET" && pathname === "/api/agencies") {
      return json(route, {
        items: [
          {
            id: scenario.name === "faridabad-industrial-emissions" ? "agency-hspcb" : "agency-caqm",
            name: scenario.name === "faridabad-industrial-emissions" ? "Haryana State Pollution Control Board" : "CAQM",
            category: "REGULATOR",
            jurisdiction: scenario.locationHint,
          },
        ],
      });
    }

    if (method === "GET" && pathname === "/api/governance/workspace/answer-sessions") {
      return json(route, { sessions: [] });
    }

    if (method === "GET" && pathname === `/api/governance/workspace/answer-sessions/${encodeURIComponent(answerSessionId)}`) {
      return json(route, {
        id: answerSessionId,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        title: scenario.question,
        question: scenario.question,
        anchorDocumentIds: [scenario.anchorDocumentId],
        anchorUrlIds: [scenario.savedUrlId],
        sourceScope: scenario.name === "cd-dust-enforcement" ? "mixed" : "urls",
        requestedWorkflowMode: scenario.workflowMode,
        resolvedWorkflowMode: scenario.workflowMode,
        selectedIssueId: `issue-${scenario.name}`,
        selectedAgencyId: scenario.name === "faridabad-industrial-emissions" ? "agency-hspcb" : "agency-caqm",
        collectorPurposeId: "purpose-1",
        metadata: null,
        runs: [
          buildAnswerResponse(scenario, answerSessionId).run,
        ],
      });
    }

    if (method === "POST" && pathname === "/api/governance/workspace/retrieve") {
      return json(route, buildEvidenceResponse(scenario));
    }

    if (method === "POST" && pathname === "/api/governance/workspace/answer/stream") {
      const body = request.postDataJSON() as { sessionId?: string | null };
      answerSessionId = body.sessionId || answerSessionId;
      const response = buildAnswerResponse(scenario, answerSessionId);
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse([
          { event: "run", data: { type: "run", runId: response.run.id, sessionId: answerSessionId } },
          { event: "status", data: { type: "status", message: "Retrieving hybrid governance evidence" } },
          { event: "delta", data: { type: "delta", text: response.run.answer.slice(0, 80) } },
          { event: "final", data: response },
        ]),
      });
    }

    if (method === "POST" && pathname === "/api/governance/workspace/answer/evaluate") {
      return json(route, {
        runId: `run-${scenario.savedUrlId}`,
        status: "verified",
        qualityBand: "strong",
        recommendedAction: "use",
        scores: {
          retrieval: 92,
          citation: 96,
          coverage: 89,
          conflict: scenario.name === "cd-dust-enforcement" ? 76 : 92,
          overall: 94,
        },
        checks: [
          {
            key: "citations",
            label: "Citations",
            status: "pass",
            detail: "The answer cites the retrieved source set.",
          },
          {
            key: "coverage",
            label: "Coverage",
            status: "pass",
            detail: "The retrieved evidence is adequate for this trial run.",
          },
        ],
        officerFeedbackCount: 0,
        updatedAt: "2026-01-01T00:00:02.000Z",
      });
    }

    if (method === "POST" && pathname === "/api/governance/workspace/answer/feedback") {
      return json(route, {
        feedback: {
          id: "feedback-1",
          rating: "useful",
          target: "answer",
          claim: null,
          evidenceId: null,
          citationQuote: null,
          comment: null,
          createdAt: "2026-01-01T00:00:03.000Z",
        },
        evaluation: {
          runId: `run-${scenario.savedUrlId}`,
          status: "verified",
          qualityBand: "strong",
          recommendedAction: "use",
          scores: {
            retrieval: 92,
            citation: 96,
            coverage: 89,
            conflict: 92,
            overall: 94,
          },
          checks: [
            {
              key: "citations",
              label: "Citations",
              status: "pass",
              detail: "The answer cites the retrieved source set.",
            },
          ],
          officerFeedbackCount: 1,
          updatedAt: "2026-01-01T00:00:03.000Z",
        },
      });
    }

    if (method === "GET" && pathname === `/api/documents/${scenario.anchorDocumentId}/governance`) {
      return json(route, {
        document: {
          id: scenario.anchorDocumentId,
          kind: "URL",
          urlId: scenario.savedUrlId,
          primaryFileId: null,
          createdAt: "2025-01-15T00:00:00.000Z",
          updatedAt: "2025-01-15T00:00:00.000Z",
        },
        summary: {
          agencyCount: 1,
          issueCount: 1,
          mandateCount: 0,
          claimCount: 1,
          eventCount: 1,
          positionCount: 0,
          gapCount: scenario.name === "cd-dust-enforcement" ? 1 : 0,
          relationCount: scenario.name === "cd-dust-enforcement" ? 1 : 0,
        },
        agencies: [
          {
            id: scenario.name === "faridabad-industrial-emissions" ? "agency-hspcb" : "agency-caqm",
            slug: scenario.name === "faridabad-industrial-emissions" ? "hspcb" : "caqm",
            name: scenario.name === "faridabad-industrial-emissions" ? "Haryana State Pollution Control Board" : "CAQM",
            shortName: scenario.name === "faridabad-industrial-emissions" ? "HSPCB" : "CAQM",
            category: "REGULATOR",
            jurisdiction: scenario.locationHint,
            metadata: null,
            createdAt: "2025-01-15T00:00:00.000Z",
            updatedAt: "2025-01-15T00:00:00.000Z",
          },
        ],
        issues: [
          {
            id: `issue-${scenario.name}`,
            slug: scenario.name,
            title: scenario.issueHint,
            summary: scenario.answerLead,
            kind: "GOVERNANCE_ISSUE",
            status: "OPEN",
            metadata: null,
            createdAt: "2025-01-15T00:00:00.000Z",
            updatedAt: "2025-01-15T00:00:00.000Z",
          },
        ],
        mandates: [],
        claims: [
          {
            id: "claim-1",
            claimText: scenario.answerLead,
            claimSummary: scenario.answerLead,
            metadata: null,
            createdAt: "2025-01-15T00:00:00.000Z",
            updatedAt: "2025-01-15T00:00:00.000Z",
            provenance: null,
          },
        ],
        events: [
          {
            id: "event-1",
            title: scenario.evidenceTitle,
            summary: scenario.answerLead,
            eventDate: "2025-01-15",
            eventDateText: "15 Jan 2025",
            eventDatePrecision: "day",
            sortDate: "2025-01-15T00:00:00.000Z",
            sortDateEnd: null,
            usedDocumentDateFallback: false,
            createdAt: "2025-01-15T00:00:00.000Z",
            updatedAt: "2025-01-15T00:00:00.000Z",
            provenance: null,
          },
        ],
        positions: [],
        gaps:
          scenario.name === "cd-dust-enforcement"
            ? [
                {
                  id: "gap-1",
                  gapType: "OTHER",
                  title: "Reporting gap",
                  summary: "Follow-up reporting remains incomplete.",
                  metadata: null,
                  createdAt: "2025-01-15T00:00:00.000Z",
                  updatedAt: "2025-01-15T00:00:00.000Z",
                  provenance: null,
                },
              ]
            : [],
        relations:
          scenario.name === "cd-dust-enforcement"
            ? [
                {
                  id: "rel-1",
                  relationType: "REFERENCE",
                  confidence: 0.92,
                  rationale: "Direction to implementation trail",
                  issue: {
                    id: `issue-${scenario.name}`,
                    slug: scenario.name,
                    title: scenario.issueHint,
                    summary: scenario.answerLead,
                    kind: "GOVERNANCE_ISSUE",
                    status: "OPEN",
                    metadata: null,
                    createdAt: "2025-01-15T00:00:00.000Z",
                    updatedAt: "2025-01-15T00:00:00.000Z",
                  },
                  otherAgency: null,
                  fromClaim: null,
                  toClaim: null,
                  metadata: null,
                  createdAt: "2025-01-15T00:00:00.000Z",
                  updatedAt: "2025-01-15T00:00:00.000Z",
                  provenance: null,
                },
              ]
            : [],
      });
    }

    const timelineMatch = pathname.match(/^\/api\/issues\/([^/]+)\/timeline$/);
    if (method === "GET" && timelineMatch) {
      return json(route, {
        issue: {
          id: timelineMatch[1],
          slug: scenario.name,
          title: scenario.issueHint,
          summary: scenario.answerLead,
          kind: "GOVERNANCE_ISSUE",
          status: "OPEN",
          metadata: null,
          createdAt: "2025-01-15T00:00:00.000Z",
          updatedAt: "2025-01-15T00:00:00.000Z",
        },
        filters: {
          actorAgencyId: null,
          dateFrom: null,
          dateTo: null,
          sourceType: null,
          groupBy: "none",
          limit: 50,
        },
        summary: {
          entryCount: 1,
          eventCount: 1,
          positionCount: 0,
        },
        entries: [
          {
            id: "timeline-1",
            itemType: "event",
            label: scenario.evidenceTitle,
            summary: scenario.answerLead,
            sortDate: "2025-01-15T00:00:00.000Z",
            sortDateEnd: null,
            sortPrecision: "day",
            actorAgency: {
              id: scenario.name === "faridabad-industrial-emissions" ? "agency-hspcb" : "agency-caqm",
              slug: scenario.name === "faridabad-industrial-emissions" ? "hspcb" : "caqm",
              name: scenario.name === "faridabad-industrial-emissions" ? "Haryana State Pollution Control Board" : "CAQM",
              shortName: scenario.name === "faridabad-industrial-emissions" ? "HSPCB" : "CAQM",
              category: "REGULATOR",
              jurisdiction: scenario.locationHint,
              metadata: null,
              createdAt: "2025-01-15T00:00:00.000Z",
              updatedAt: "2025-01-15T00:00:00.000Z",
            },
            metadata: null,
            createdAt: "2025-01-15T00:00:00.000Z",
            updatedAt: "2025-01-15T00:00:00.000Z",
            event: {
              id: "event-1",
              title: scenario.evidenceTitle,
              summary: scenario.answerLead,
              eventDate: "2025-01-15",
              eventDateText: "15 Jan 2025",
              eventDatePrecision: "day",
              sortDate: "2025-01-15T00:00:00.000Z",
              sortDateEnd: null,
              usedDocumentDateFallback: false,
            },
            position: null,
            provenance: {
              confidence: "high",
              evidenceText: scenario.answerLead,
              pageNumbers: [1],
              chunkIds: ["chunk-1"],
              pipeline: {
                id: "pipe-1",
                name: "governance",
                version: "1",
                configHash: "hash",
                codeSha: null,
              },
              extractionModel: "model",
              extractionVersion: "v1",
              documentRevision: {
                storedFile: null,
              },
            },
          },
        ],
      });
    }

    const relationsMatch = pathname.match(/^\/api\/issues\/([^/]+)\/relations$/);
    if (method === "GET" && relationsMatch) {
      return json(route, {
        issue: {
          id: relationsMatch[1],
          slug: scenario.name,
          title: scenario.issueHint,
          summary: scenario.answerLead,
          kind: "GOVERNANCE_ISSUE",
          status: "OPEN",
          metadata: null,
          createdAt: "2025-01-15T00:00:00.000Z",
          updatedAt: "2025-01-15T00:00:00.000Z",
        },
        filters: {
          relationType: null,
          limit: 50,
        },
        summary: {
          relationCount: scenario.name === "cd-dust-enforcement" ? 1 : 0,
          byType: scenario.name === "cd-dust-enforcement" ? { reference: 1 } : {},
          byBucket: scenario.name === "cd-dust-enforcement" ? { reference: 1 } : {},
        },
        relations:
          scenario.name === "cd-dust-enforcement"
            ? [
                {
                  id: "rel-1",
                  relationType: "REFERENCE",
                  confidence: 0.92,
                  rationale: "Direction to implementation trail",
                  issue: {
                    id: relationsMatch[1],
                    slug: scenario.name,
                    title: scenario.issueHint,
                    summary: scenario.answerLead,
                    kind: "GOVERNANCE_ISSUE",
                    status: "OPEN",
                    metadata: null,
                    createdAt: "2025-01-15T00:00:00.000Z",
                    updatedAt: "2025-01-15T00:00:00.000Z",
                  },
                  otherAgency: null,
                  fromClaim: null,
                  toClaim: null,
                  metadata: null,
                  createdAt: "2025-01-15T00:00:00.000Z",
                  updatedAt: "2025-01-15T00:00:00.000Z",
                  provenance: null,
                },
              ]
            : [],
      });
    }

    const caseWorkspaceMatch = pathname.match(/^\/api\/issues\/([^/]+)\/case-workspace$/);
    if (method === "GET" && caseWorkspaceMatch) {
      return json(route, {
        issue: {
          id: caseWorkspaceMatch[1],
          slug: scenario.name,
          title: scenario.issueHint,
          summary: scenario.answerLead,
          kind: "GOVERNANCE_ISSUE",
          status: "OPEN",
          metadata: null,
          createdAt: "2025-01-15T00:00:00.000Z",
          updatedAt: "2025-01-15T00:00:00.000Z",
        },
        filters: {
          actorAgencyId: null,
          relationType: null,
          dateFrom: null,
          dateTo: null,
          limit: 50,
        },
        summary: {
          agencyCount: 1,
          timelineEntryCount: 1,
          eventCount: 1,
          positionCount: 0,
          contradictionCount: scenario.name === "cd-dust-enforcement" ? 1 : 0,
          gapCount: scenario.name === "cd-dust-enforcement" ? 1 : 0,
          sourceCount: 1,
          changedActorCount: 0,
        },
        actors: [],
        timeline: {
          summary: {
            byType: {
              event: 1,
              position: 0,
              entry: 1,
            },
          },
          entries: [],
        },
        relations: {
          summary: {
            relationCount: scenario.name === "cd-dust-enforcement" ? 1 : 0,
            byType: scenario.name === "cd-dust-enforcement" ? { reference: 1 } : {},
            byBucket: scenario.name === "cd-dust-enforcement" ? { reference: 1 } : {},
            requiresAnalystReviewCount: scenario.name === "cd-dust-enforcement" ? 1 : 0,
          },
          contradictions:
            scenario.name === "cd-dust-enforcement"
              ? []
              : [],
          alignments: [],
        },
        gaps: [],
        mandates: [],
        claims: [],
        events: [],
        sources: [],
      });
    }

    const agencyLandscapeMatch = pathname.match(/^\/api\/agencies\/([^/]+)\/landscape$/);
    if (method === "GET" && agencyLandscapeMatch) {
      return json(route, {
        agency: {
          id: agencyLandscapeMatch[1],
          slug: agencyLandscapeMatch[1],
          name:
            scenario.name === "faridabad-industrial-emissions"
              ? "Haryana State Pollution Control Board"
              : "CAQM",
          shortName:
            scenario.name === "faridabad-industrial-emissions" ? "HSPCB" : "CAQM",
          category: "REGULATOR",
          jurisdiction: scenario.locationHint,
          metadata: null,
          createdAt: "2025-01-15T00:00:00.000Z",
          updatedAt: "2025-01-15T00:00:00.000Z",
        },
        summary: {
          issueCount: 1,
          mandateCount: 0,
          positionCount: 0,
          gapCount: 0,
          outgoingRelationCount: 0,
          incomingRelationCount: 0,
        },
        issueMatrix: [
          {
            issue: {
              id: `issue-${scenario.name}`,
              slug: scenario.name,
              title: scenario.issueHint,
              summary: scenario.answerLead,
              kind: "GOVERNANCE_ISSUE",
              status: "OPEN",
              metadata: null,
              createdAt: "2025-01-15T00:00:00.000Z",
              updatedAt: "2025-01-15T00:00:00.000Z",
            },
            counts: {
              linked: 1,
              mandates: 0,
              positions: 0,
              gaps: 0,
              outgoingRelations: 0,
              incomingRelations: 0,
            },
          },
        ],
        issueLinks: [],
        mandates: [],
        positions: [],
        gaps: [],
        outgoingRelations: [],
        incomingRelations: [],
      });
    }

    return json(route, {});
  });
}

async function runTrial(page: Page, scenario: Scenario) {
  await installMockBackend(page, scenario);
  page.on("pageerror", (error) => {
    // Surface the browser stack in test output if the governance page crashes.
    console.error(`[pageerror:${scenario.name}] ${error.stack || error.message}`);
  });

  await page.goto("/app/url-collector?purposeId=purpose-1");
  await expect(page.getByRole("heading", { name: "URL Collector" })).toBeVisible();

  await page.getByLabel("Website").fill(scenario.searchSite);
  await page.getByLabel("Keywords").fill(scenario.searchKeywords);
  await page.getByRole("button", { name: "Search the web" }).click();

  await expect(page.getByText(scenario.evidenceTitle)).toBeVisible();
  await page.getByLabel(`Select ${scenario.evidenceTitle}`).check();
  await page.getByRole("button", { name: "Save to purpose (1)" }).click();
  await expect(page.getByText("Saved to purpose")).toBeVisible();

  await page.goto("/app/governance-workspace");
  await expect(
    page.getByPlaceholder("Ask an air quality governance question"),
  ).toBeVisible();

  await page.getByPlaceholder("Ask an air quality governance question").fill(scenario.question);

  await page.getByRole("button", { name: "Find evidence" }).first().click();
  await expect(page.getByText(scenario.evidenceTitle)).toBeVisible();
  await expect(page.getByText("Ready for cited answer")).toBeVisible();

  await page.getByRole("button", { name: "Generate answer from retrieved evidence" }).click();
  await expect(page.getByText(scenario.answerLead).first()).toBeVisible();
  await expect(page.getByText("Air quality officer brief")).toBeVisible();

  await page.getByRole("button", { name: "Evaluate" }).click();
  await expect(page.getByText("Strong", { exact: true })).toBeVisible();

  if (scenario.name === "cd-dust-enforcement") {
    await expect(
      page.getByRole("button", {
        name: "Construction",
        description: "Use this as the active issue lens",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("reporting gap", { exact: false }).first()).toBeVisible();
  }
}

for (const scenario of scenarios) {
  test(`governance workflow smoke: ${scenario.name}`, async ({ page }) => {
    await runTrial(page, scenario);
  });
}
