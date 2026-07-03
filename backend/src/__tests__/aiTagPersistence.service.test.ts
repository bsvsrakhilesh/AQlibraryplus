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
