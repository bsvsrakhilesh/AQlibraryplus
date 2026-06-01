import test from "node:test";
import assert from "node:assert/strict";
import {
  collectorHostMatchesAuthority,
  summarizeCollectorAuthorityCoverage,
  type CollectorAuthorityCoverageSource,
} from "../utils/collectorAuthorityCoverage";

const grapSources: CollectorAuthorityCoverageSource[] = [
  {
    key: "caqm",
    label: "CAQM",
    domain: "caqm.nic.in",
    evidenceRole: "Primary orders",
    confidence: 96,
  },
  {
    key: "cpcb",
    label: "CPCB",
    domain: "cpcb.nic.in",
    evidenceRole: "National standard",
    confidence: 74,
  },
  {
    key: "hspcb",
    label: "HSPCB",
    domain: "hspcb.gov.in",
    evidenceRole: "State implementation",
    confidence: 67,
  },
];

test("collector authority coverage treats missing CAQM as high evidence risk", () => {
  const summary = summarizeCollectorAuthorityCoverage(grapSources, [
    {
      title: "CPCB GRAP reference",
      url: "https://cpcb.nic.in/grap-guidelines.pdf",
    },
    {
      title: "Haryana directions",
      url: "https://www.hspcb.gov.in/orders/grap-stage-iv.pdf",
    },
  ]);

  assert.equal(summary.score, 59);
  assert.equal(summary.risk, "high");
  assert.equal(summary.criticalMissingCount, 1);
  assert.deepEqual(summary.missingRoles, ["Primary orders"]);
  assert.equal(summary.missingSources[0].domain, "caqm.nic.in");
});

test("collector authority coverage recognizes subdomains and complete role coverage", () => {
  assert.equal(
    collectorHostMatchesAuthority(
      "https://orders.caqm.nic.in/WriteReadData/LINKS/stage-iv-order.pdf",
      "caqm.nic.in",
    ),
    true,
  );

  const summary = summarizeCollectorAuthorityCoverage(grapSources, [
    { title: "CAQM order", url: "https://caqm.nic.in/order.pdf" },
    { title: "CPCB note", url: "https://cpcb.nic.in/note.pdf" },
    { title: "Haryana action plan", url: "https://hspcb.gov.in/action-plan.pdf" },
  ]);

  assert.equal(summary.score, 100);
  assert.equal(summary.risk, "low");
  assert.equal(summary.missingCount, 0);
  assert.deepEqual(summary.missingRoles, []);
  assert.ok(summary.roleCoverage.every((role) => role.covered > 0));
});
