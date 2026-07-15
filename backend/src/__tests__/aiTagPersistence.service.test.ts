import test from "node:test";
import assert from "node:assert/strict";

async function loadHooks() {
  process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
  const mod = await import("../services/aiTagPersistence.service");
  return mod.aiTagPersistenceTestHooks;
}

test("normalizeStructuredIntelligence falls back to smart tags with evidence", async () => {
  const hooks = await loadHooks();
  const out = hooks.normalizeStructuredIntelligence(
    {},
    {
      profile: "smart_tags",
      version: 1,
      topics: [
        {
          value: "air quality management",
          category: "Topics",
          type: "topic",
          source: "tagger",
          confidence: 0.91,
          status: "matched",
          evidence: [{ quote: "Commission for Air Quality Management issued..." }],
        },
      ],
      items: [],
    },
    [],
  );

  assert.equal(out?.profile, "structured_intelligence");
  assert.equal(out?.domain, "air_quality_governance");
  assert.equal(out?.topics?.[0]?.label, "air quality management");
});

test("normalizeStructuredIntelligence falls back to ai tag objects when structured and smart tags are absent", async () => {
  const hooks = await loadHooks();
  const out = hooks.normalizeStructuredIntelligence(
    {},
    null,
    [
      {
        value: "grap",
        display: "GRAP",
        type: "program",
        source: "legacy_tags",
        confidence: 0.72,
        evidence: "GRAP measures will be implemented with immediate effect.",
        locator: null,
      },
      {
        value: "pm25",
        display: "PM2.5",
        type: "pollutant",
        source: "legacy_tags",
        confidence: 0.68,
        evidence: "PM2.5 levels remained above the threshold.",
        locator: null,
      },
    ],
  );

  assert.equal(out?.profile, "structured_intelligence");
  assert.equal(out?.programs?.[0]?.label, "GRAP");
  assert.equal(out?.pollutantsMeasurements?.[0]?.label, "PM2.5");
});

test("normalizeStructuredIntelligence preserves more than eighty grounded locations", async () => {
  const hooks = await loadHooks();
  const locations = Array.from({ length: 100 }, (_, index) => ({
    id: `location-${index}`,
    label: `Location ${index}`,
    type: "location",
    category: "locations",
    normalizedValue: `location_${index}`,
    confidence: 0.9,
    source: "llm_validated",
    evidence: [{ quote: `Location ${index} is explicitly named.` }],
    locator: null,
    status: "matched",
  }));
  const out = hooks.normalizeStructuredIntelligence(
    {
      structured_intelligence_v1: {
        profile: "structured_intelligence",
        version: 1,
        domain: "air_quality_governance",
        locations,
        items: locations,
      },
    },
    null,
    [],
  );

  assert.equal(out?.locations.length, 100);
  assert.equal(out?.items.length, 100);
});

test("normalizeStructuredIntelligence preserves a complete empty map receipt", async () => {
  const hooks = await loadHooks();
  const out = hooks.normalizeStructuredIntelligence(
    {
      structured_intelligence_v1: {
        profile: "structured_intelligence",
        version: 1,
        domain: "air_quality_governance",
        mapCoverage: {
          mode: "map_merge",
          totalWindows: 4,
          succeededWindows: 4,
          failedWindows: 0,
          complete: true,
        },
        items: [],
      },
    },
    null,
    [],
  );

  assert.equal(out?.items.length, 0);
  assert.deepEqual(out?.mapCoverage, {
    mode: "map_merge",
    totalWindows: 4,
    succeededWindows: 4,
    failedWindows: 0,
    complete: true,
  });
});

test("structured evidence spans and entailment receipts survive persistence", async () => {
  const hooks = await loadHooks();
  const quote = "The order prohibits construction in Gurugram.";
  const out = hooks.normalizeStructuredIntelligence(
    {
      structured_intelligence_v1: {
        profile: "structured_intelligence",
        version: 1,
        domain: "air_quality_governance",
        mapCoverage: {
          mode: "llm_map_merge",
          required: true,
          attempted: true,
          totalWindows: 4,
          succeededWindows: 4,
          failedWindows: 0,
          complete: true,
        },
        restrictions: [
          {
            id: "restriction-1",
            label: "Construction prohibited",
            type: "restriction",
            category: "restrictions",
            normalizedValue: "construction_prohibited",
            confidence: 0.94,
            source: "llm_validated",
            evidence: [
              {
                quote,
                page: 9,
                charStart: 120,
                charEnd: 120 + quote.length,
                sourceUnitId: "page-9",
                locator: { kind: "page", pageNumber: 9 },
              },
            ],
            locator: { kind: "page", pageNumber: 9 },
            status: "matched",
            validation: {
              grounding: "exact_source_span",
              entailment: "supported",
              validator: "llm_critic_v1",
            },
          },
        ],
        items: [],
      },
    },
    null,
    [],
  );

  assert.equal(out?.restrictions[0].evidence[0].charStart, 120);
  assert.equal(out?.restrictions[0].evidence[0].sourceUnitId, "page-9");
  assert.equal(out?.restrictions[0].validation?.entailment, "supported");
});

test("smart-tag persistence does not cap entity arrays", async () => {
  const hooks = await loadHooks();
  const locations = Array.from({ length: 150 }, (_, index) => ({
    value: `Location ${index}`,
    category: "Entities",
    type: "location",
    source: "llm_validated",
    confidence: 0.9,
    status: "matched",
    evidence: [{ quote: `Location ${index} is explicitly named.` }],
  }));
  const out = hooks.normalizeSmartTags(
    {
      smart_tags: {
        profile: "smart_tags",
        version: 1,
        entities: { locations },
        items: locations,
      },
    },
    [],
  );

  assert.equal(out?.entities.locations.length, 150);
  assert.equal(out?.items.length, 150);
});
