"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const urlCollector_1 = require("../utils/urlCollector");
(0, node_test_1.default)("normalizeCollectorWebsite strips scheme, path, and www prefix", () => {
    strict_1.default.equal((0, urlCollector_1.normalizeCollectorWebsite)("https://www.example.com/path?q=1"), "example.com");
    strict_1.default.equal((0, urlCollector_1.normalizeCollectorWebsite)("example.com/reports"), "example.com");
    strict_1.default.equal((0, urlCollector_1.normalizeCollectorWebsite)("HTTPS://WWW.Example.COM./reports"), "example.com");
});
(0, node_test_1.default)("normalizeCollectorKeywords keeps AND groups clean and OR groups explicit", () => {
    const out = (0, urlCollector_1.normalizeCollectorKeywords)('governance, enforcement | smog tower, "Delhi High Court"');
    strict_1.default.equal(out, '(governance enforcement) OR ("smog tower" "Delhi High Court")');
});
(0, node_test_1.default)("formatAppliedCollectorSearchPlan shows structured filters without polluting the query", () => {
    const query = (0, urlCollector_1.buildCollectorSearchQuery)((0, urlCollector_1.normalizeCollectorKeywords)("air quality, governance"));
    const out = (0, urlCollector_1.formatAppliedCollectorSearchPlan)(query, {
        site: "example.com",
        yearFrom: 2020,
        yearTo: 2024,
        jurisdiction: "Delhi High Court",
        region: "South Asia",
        fileType: "pdf",
    });
    strict_1.default.equal(out, '\"air quality\" governance | site=example.com | years=2020-2024 | jurisdiction=\"Delhi High Court\" | region=\"South Asia\" | format=pdf');
    strict_1.default.equal(out.includes("filetype:"), false);
    strict_1.default.equal(out.includes("after:"), false);
    strict_1.default.equal(out.includes("before:"), false);
});
(0, node_test_1.default)("formatAppliedCollectorSearchPlan shows PDF exclusion as exclusion, not html-only", () => {
    const out = (0, urlCollector_1.formatAppliedCollectorSearchPlan)("air quality", {
        excludeFileType: "pdf",
    });
    strict_1.default.equal(out, "air quality | format=exclude-pdf");
    strict_1.default.equal(out.includes("format=html"), false);
});
(0, node_test_1.default)("mergeCollectorSearchResults deduplicates paged collector results by canonical URL", () => {
    const firstPage = [
        {
            title: "Original report",
            url: "https://example.gov/orders/report.pdf?download=1&utm_source=search#page=1",
            snippet: "First result wins.",
        },
    ];
    const secondPage = [
        {
            title: "Duplicate report",
            url: "https://EXAMPLE.gov:443/orders//report.pdf/?download=1&fbclid=abc",
            snippet: "Should be hidden as a duplicate.",
        },
        {
            title: "Different year",
            url: "https://example.gov/orders/report.pdf?download=1&year=2024",
        },
    ];
    const out = (0, urlCollector_1.mergeCollectorSearchResults)(firstPage, secondPage);
    strict_1.default.equal(out.added, 1);
    strict_1.default.equal(out.skipped, 1);
    strict_1.default.deepEqual(out.rows.map((row) => row.title), ["Original report", "Different year"]);
});
(0, node_test_1.default)("mergeCollectorSearchResults preserves case-sensitive source URL differences", () => {
    const out = (0, urlCollector_1.mergeCollectorSearchResults)([{ title: "Upper path", url: "https://example.gov/Report" }], [{ title: "Lower path", url: "https://example.gov/report" }]);
    strict_1.default.equal(out.added, 1);
    strict_1.default.equal(out.skipped, 0);
    strict_1.default.deepEqual(out.rows.map((row) => row.title), ["Upper path", "Lower path"]);
});
(0, node_test_1.default)("inferPreferredCollectorCapture prefers PDF for official document types and PDF urls", () => {
    const courtOrder = {
        title: "Order",
        url: "https://example.com/order",
        intelligence: {
            docType: "court_order",
            sourceType: "court",
            fileTypeHint: "html",
            confidence: "high",
        },
    };
    const article = {
        title: "Article",
        url: "https://example.com/news",
        intelligence: {
            docType: "news_article",
            sourceType: "news",
            fileTypeHint: "html",
            confidence: "medium",
        },
    };
    const directPdf = {
        title: "PDF",
        url: "https://example.com/report.pdf?download=1",
    };
    strict_1.default.equal((0, urlCollector_1.inferPreferredCollectorCapture)(courtOrder), "pdf");
    strict_1.default.equal((0, urlCollector_1.inferPreferredCollectorCapture)(article), "text");
    strict_1.default.equal((0, urlCollector_1.inferPreferredCollectorCapture)(directPdf), "pdf");
});
(0, node_test_1.default)("isDirectPdfSearchResult distinguishes PDFs from container pages", () => {
    strict_1.default.equal((0, urlCollector_1.isDirectPdfSearchResult)({
        title: "Report",
        url: "https://example.gov/report.pdf",
    }), true);
    strict_1.default.equal((0, urlCollector_1.isDirectPdfSearchResult)({
        title: "Orders",
        url: "https://example.gov/orders",
        intelligence: {
            docType: "official_document",
            sourceType: "government",
            fileTypeHint: "html",
            confidence: "high",
        },
    }), false);
});
(0, node_test_1.default)("suggestCollectorCaptureName prefers embedded pdf filenames and keeps a stable extension", () => {
    const out = (0, urlCollector_1.suggestCollectorCaptureName)("https://sci.gov.in/export?filename=Important%20Order.PDF", "https://sci.gov.in/export?filename=Important%20Order.PDF", "pdf");
    strict_1.default.equal(out, "Important Order.pdf");
});
