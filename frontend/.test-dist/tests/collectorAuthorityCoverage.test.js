"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const collectorAuthorityCoverage_1 = require("../utils/collectorAuthorityCoverage");
const grapSources = [
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
(0, node_test_1.default)("collector authority coverage treats missing CAQM as high evidence risk", () => {
    const summary = (0, collectorAuthorityCoverage_1.summarizeCollectorAuthorityCoverage)(grapSources, [
        {
            title: "CPCB GRAP reference",
            url: "https://cpcb.nic.in/grap-guidelines.pdf",
        },
        {
            title: "Haryana directions",
            url: "https://www.hspcb.gov.in/orders/grap-stage-iv.pdf",
        },
    ]);
    strict_1.default.equal(summary.score, 59);
    strict_1.default.equal(summary.risk, "high");
    strict_1.default.equal(summary.criticalMissingCount, 1);
    strict_1.default.deepEqual(summary.missingRoles, ["Primary orders"]);
    strict_1.default.equal(summary.missingSources[0].domain, "caqm.nic.in");
});
(0, node_test_1.default)("collector authority coverage recognizes subdomains and complete role coverage", () => {
    strict_1.default.equal((0, collectorAuthorityCoverage_1.collectorHostMatchesAuthority)("https://orders.caqm.nic.in/WriteReadData/LINKS/stage-iv-order.pdf", "caqm.nic.in"), true);
    const summary = (0, collectorAuthorityCoverage_1.summarizeCollectorAuthorityCoverage)(grapSources, [
        { title: "CAQM order", url: "https://caqm.nic.in/order.pdf" },
        { title: "CPCB note", url: "https://cpcb.nic.in/note.pdf" },
        { title: "Haryana action plan", url: "https://hspcb.gov.in/action-plan.pdf" },
    ]);
    strict_1.default.equal(summary.score, 100);
    strict_1.default.equal(summary.risk, "low");
    strict_1.default.equal(summary.missingCount, 0);
    strict_1.default.deepEqual(summary.missingRoles, []);
    strict_1.default.ok(summary.roleCoverage.every((role) => role.covered > 0));
});
