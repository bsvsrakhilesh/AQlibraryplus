"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const urlCanonical_1 = require("../utils/urlCanonical");
function loadGoldenCases() {
    const candidates = [
        node_path_1.default.resolve(process.cwd(), "test-fixtures", "urlCanonical.golden.json"),
        node_path_1.default.resolve(process.cwd(), "..", "test-fixtures", "urlCanonical.golden.json"),
    ];
    const file = candidates.find((candidate) => node_fs_1.default.existsSync(candidate));
    strict_1.default.ok(file, "Shared canonicalization fixture must exist");
    const parsed = JSON.parse(node_fs_1.default.readFileSync(file, "utf8"));
    return parsed.canonicalize ?? [];
}
(0, node_test_1.default)("canonicalizeUrl matches shared golden cases", () => {
    for (const c of loadGoldenCases()) {
        strict_1.default.equal((0, urlCanonical_1.canonicalizeUrl)(c.input), c.expected, c.name);
    }
});
(0, node_test_1.default)("canonicalizeUrl collapses duplicate collector URLs to a stable evidence key", () => {
    const expected = "https://example.com/reports/air-quality?a=1&b=2";
    const variants = [
        " HTTPS://Example.COM:443/reports//air-quality///?utm_source=newsletter&b=2&a=1#section ",
        "https://example.com/reports/air-quality?b=2&a=1&utm_medium=social",
        "example.com/reports/air-quality/?a=1&b=2&gclid=abc",
        "https://example.com./reports/air-quality?fbclid=abc&b=2&a=1#duplicate",
    ];
    strict_1.default.deepEqual(variants.map((url) => (0, urlCanonical_1.canonicalizeUrl)(url)), variants.map(() => expected));
});
(0, node_test_1.default)("canonicalizeUrl keeps meaningful collector URL state distinct", () => {
    strict_1.default.equal((0, urlCanonical_1.canonicalizeUrl)("https://example.com/report?utm_campaign=noise&page=2&year=2024"), "https://example.com/report?page=2&year=2024");
    strict_1.default.notEqual((0, urlCanonical_1.canonicalizeUrl)("https://example.com/report?page=2&year=2024"), (0, urlCanonical_1.canonicalizeUrl)("https://example.com/report?page=2&year=2023"));
    strict_1.default.notEqual((0, urlCanonical_1.canonicalizeUrl)("https://example.com/report?page=2&year=2024"), (0, urlCanonical_1.canonicalizeUrl)("http://example.com/report?page=2&year=2024"));
});
(0, node_test_1.default)("canonicalizeUrl preserves case-sensitive path distinctions", () => {
    strict_1.default.notEqual((0, urlCanonical_1.canonicalizeUrl)("https://example.com/Report"), (0, urlCanonical_1.canonicalizeUrl)("https://example.com/report"));
});
(0, node_test_1.default)("canonicalizeUrl preserves repeated query parameter value order", () => {
    strict_1.default.notEqual((0, urlCanonical_1.canonicalizeUrl)("https://example.com/search?tag=air&tag=policy"), (0, urlCanonical_1.canonicalizeUrl)("https://example.com/search?tag=policy&tag=air"));
});
(0, node_test_1.default)("canonicalizeUrl rejects malformed and unsupported source URL inputs", () => {
    strict_1.default.equal((0, urlCanonical_1.canonicalizeUrl)(""), "");
    strict_1.default.equal((0, urlCanonical_1.canonicalizeUrl)("   "), "");
    strict_1.default.equal((0, urlCanonical_1.canonicalizeUrl)("not a url ???"), "");
    strict_1.default.equal((0, urlCanonical_1.canonicalizeUrl)("mailto:test@example.com"), "");
    strict_1.default.equal((0, urlCanonical_1.canonicalizeUrl)("ftp://example.com/file"), "");
    strict_1.default.equal((0, urlCanonical_1.canonicalizeUrl)("javascript:alert(1)"), "");
    strict_1.default.equal((0, urlCanonical_1.canonicalizeUrl)("//example.com/report"), "https://example.com/report");
});
