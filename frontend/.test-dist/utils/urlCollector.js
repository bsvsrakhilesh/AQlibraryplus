"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toYYYY = toYYYY;
exports.normalizeCollectorWebsite = normalizeCollectorWebsite;
exports.normalizeCollectorKeywords = normalizeCollectorKeywords;
exports.buildCollectorSearchQuery = buildCollectorSearchQuery;
exports.resolveCollectorSearchTargets = resolveCollectorSearchTargets;
exports.resolveWebsiteSuggestions = resolveWebsiteSuggestions;
exports.collectWebsiteSuggestionsFromSearchResults = collectWebsiteSuggestionsFromSearchResults;
exports.collectorResultDedupKey = collectorResultDedupKey;
exports.mergeCollectorSearchResults = mergeCollectorSearchResults;
exports.formatAppliedCollectorSearchPlan = formatAppliedCollectorSearchPlan;
exports.inferPreferredCollectorCapture = inferPreferredCollectorCapture;
exports.isDirectPdfSearchResult = isDirectPdfSearchResult;
exports.getCollectorCaptureMeta = getCollectorCaptureMeta;
exports.suggestCollectorCaptureName = suggestCollectorCaptureName;
const urlCanonical_1 = require("./urlCanonical");
const PDF_FIRST_DOC_TYPES = new Set([
    "court_order",
    "notification",
    "report",
    "parliamentary_material",
    "affidavit_filing",
    "guideline_circular",
    "official_document",
]);
function formatPlanValue(s) {
    const t = (s || "").trim();
    if (!t)
        return "";
    const alreadyQuoted = (t.startsWith('"') && t.endsWith('"')) ||
        (t.startsWith("'") && t.endsWith("'"));
    if (alreadyQuoted)
        return t;
    return t.includes(" ") ? `"${t}"` : t;
}
function toYYYY(s) {
    const t = (s || "").trim();
    if (!t)
        return "";
    const m = t.match(/^(\d{4})/);
    return m ? m[1] : "";
}
function normalizeCollectorWebsite(raw) {
    const v = raw.trim();
    if (!v)
        return "";
    const cleanHost = (host) => host.trim().toLowerCase().replace(/^\s*www\./i, "").replace(/\.+$/, "");
    try {
        const maybeUrl = v.match(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//)
            ? v
            : `https://${v}`;
        const u = new URL(maybeUrl);
        return cleanHost(u.hostname);
    }
    catch {
        return cleanHost(v.split(/[\/\s?#]/)[0]);
    }
}
function normalizeCollectorKeywords(raw) {
    const s = (raw || "").trim();
    if (!s)
        return "";
    const cleaned = s.replace(/\bAND\b/gi, " ").trim();
    const orGroups = cleaned
        .split("|")
        .map((g) => g.trim())
        .filter(Boolean);
    const groupQueries = orGroups.map((group) => {
        const parts = group
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean);
        const terms = parts.map((p) => {
            const alreadyQuoted = (p.startsWith('"') && p.endsWith('"')) ||
                (p.startsWith("'") && p.endsWith("'"));
            if (alreadyQuoted)
                return p;
            return p.includes(" ") ? `"${p}"` : p;
        });
        return terms.join(" ");
    });
    return groupQueries.length > 1
        ? `(${groupQueries.join(") OR (")})`
        : groupQueries[0];
}
function buildCollectorSearchQuery(kws) {
    return (kws || "").trim();
}
function resolveCollectorSearchTargets(input) {
    const limit = typeof input.limit === "number" && Number.isFinite(input.limit)
        ? Math.max(1, Math.floor(input.limit))
        : 6;
    const targets = [];
    const seen = new Set();
    const push = (site, label, confidence) => {
        const normalized = normalizeCollectorWebsite(String(site ?? ""));
        if (!normalized || seen.has(normalized))
            return;
        seen.add(normalized);
        targets.push({
            site: normalized,
            label: String(label ?? normalized).trim() || normalized,
            confidence: Number.isFinite(confidence) ? Number(confidence) : 0,
        });
    };
    const sources = Array.isArray(input.authoritySources)
        ? input.authoritySources
        : [];
    if (input.site) {
        const normalizedSite = normalizeCollectorWebsite(input.site);
        const match = sources.find((source) => normalizeCollectorWebsite(source.domain) === normalizedSite);
        push(normalizedSite, match?.label ?? normalizedSite, match?.confidence ?? 100);
    }
    for (const source of sources) {
        push(source.domain, source.label, source.confidence ?? 0);
        if (targets.length >= limit)
            break;
    }
    return targets.slice(0, limit);
}
function resolveWebsiteSuggestions(input) {
    const query = String(input.query ?? "").trim().toLowerCase();
    const limit = typeof input.limit === "number" && Number.isFinite(input.limit)
        ? Math.max(1, Math.floor(input.limit))
        : 8;
    const sources = Array.isArray(input.authoritySources)
        ? input.authoritySources
        : [];
    const matches = [];
    const seen = new Set();
    const push = (domain, label, confidence, source) => {
        const normalized = normalizeCollectorWebsite(String(domain ?? ""));
        if (!normalized || seen.has(normalized))
            return;
        seen.add(normalized);
        matches.push({
            domain: normalized,
            label: String(label ?? normalized).trim() || normalized,
            confidence: Number.isFinite(confidence) ? Number(confidence) : 0,
            source,
        });
    };
    const tokens = query
        .split(/[\s,./_-]+/g)
        .map((token) => token.trim())
        .filter(Boolean);
    for (const source of sources) {
        const haystack = `${source.label} ${source.domain}`.toLowerCase();
        if (!query ||
            tokens.some((token) => token.length >= 2 && haystack.includes(token))) {
            push(source.domain, source.label, source.confidence ?? 0, "authority");
        }
    }
    return matches.slice(0, limit);
}
function collectWebsiteSuggestionsFromSearchResults(rows, limit = 6) {
    const seen = new Set();
    const suggestions = [];
    const push = (domain, label, confidence) => {
        const normalized = normalizeCollectorWebsite(domain);
        if (!normalized || seen.has(normalized))
            return;
        seen.add(normalized);
        suggestions.push({
            domain: normalized,
            label: label.trim() || normalized,
            confidence,
            source: "search",
        });
    };
    for (let index = 0; index < rows.length && suggestions.length < limit; index += 1) {
        const row = rows[index];
        let domain = "";
        try {
            domain = new URL(row.url).hostname.replace(/^www\./i, "");
        }
        catch {
            domain = normalizeCollectorWebsite(row.url);
        }
        push(domain, row.title || domain, Math.max(10, 100 - index * 10));
    }
    return suggestions.slice(0, limit);
}
function collectorResultDedupKey(url) {
    const canonical = (0, urlCanonical_1.canonicalizeUrl)(url);
    return canonical || String(url || "").trim();
}
function mergeCollectorSearchResults(existing, incoming, options = {}) {
    const limit = typeof options.limit === "number" && Number.isFinite(options.limit)
        ? Math.max(0, options.limit)
        : undefined;
    const seen = new Set();
    const rows = [];
    let added = 0;
    let skipped = 0;
    const push = (row, countIncoming) => {
        const key = collectorResultDedupKey(row.url);
        if (!key || seen.has(key)) {
            if (countIncoming)
                skipped += 1;
            return;
        }
        seen.add(key);
        rows.push(row);
        if (countIncoming)
            added += 1;
    };
    for (const row of existing) {
        if (limit !== undefined && rows.length >= limit)
            break;
        push(row, false);
    }
    for (const row of incoming) {
        if (limit !== undefined && rows.length >= limit)
            break;
        push(row, true);
    }
    return { rows, added, skipped };
}
function formatAppliedCollectorSearchPlan(query, opts) {
    const parts = [];
    const q = (query || "").trim();
    if (q)
        parts.push(q);
    const site = String(opts?.site ?? "").trim();
    if (site)
        parts.push(`site=${site}`);
    const yearFrom = typeof opts?.yearFrom === "number" ? String(opts.yearFrom) : "";
    const yearTo = typeof opts?.yearTo === "number" ? String(opts.yearTo) : "";
    if (yearFrom || yearTo) {
        parts.push(`years=${yearFrom || "..."}-${yearTo || "..."}`);
    }
    const jurisdiction = String(opts?.jurisdiction ?? "").trim();
    if (jurisdiction) {
        parts.push(`jurisdiction=${formatPlanValue(jurisdiction)}`);
    }
    const region = String(opts?.region ?? "").trim();
    if (region) {
        parts.push(`region=${formatPlanValue(region)}`);
    }
    if (opts?.fileType === "pdf")
        parts.push("format=pdf");
    if (opts?.fileType === "html")
        parts.push("format=html");
    if (opts?.excludeFileType === "pdf")
        parts.push("format=exclude-pdf");
    return parts.join(" | ");
}
function inferPreferredCollectorCapture(result) {
    const docType = result.intelligence?.docType;
    if (docType) {
        return PDF_FIRST_DOC_TYPES.has(docType) ? "pdf" : "text";
    }
    const url = String(result.url || "").toLowerCase();
    if (/\.pdf(?:$|[?#])/.test(url) || /format=pdf/.test(url))
        return "pdf";
    return "text";
}
function isDirectPdfSearchResult(result) {
    const url = String(result.url || "").toLowerCase();
    if (/\.pdf(?:$|[?#])/.test(url) || url.includes(".pdf?"))
        return true;
    if (result.intelligence?.fileTypeHint === "pdf")
        return true;
    return false;
}
function getCollectorCaptureMeta(mode) {
    return mode === "pdf"
        ? {
            shortLabel: "PDF",
            longLabel: "Capture PDF",
            title: "Capture this result as PDF",
        }
        : {
            shortLabel: "Text",
            longLabel: "Capture Text",
            title: "Capture this result as text",
        };
}
function suggestCollectorCaptureName(url, title, mode) {
    const looksLikeUrlTitle = (t) => !!t && /^https?:\/\//i.test(t.trim());
    const fromUrl = (u) => {
        try {
            const parsed = new URL(u);
            for (const [, value] of parsed.searchParams.entries()) {
                const s = String(value || "");
                if (s.toLowerCase().includes(".pdf")) {
                    const base = s.split("/").pop() || "document.pdf";
                    return decodeURIComponent(base);
                }
            }
            const base = decodeURIComponent(parsed.pathname.split("/").pop() || "");
            return base || parsed.hostname || "page";
        }
        catch {
            return "page";
        }
    };
    const raw = title && !looksLikeUrlTitle(title) ? title.trim() : fromUrl(url).trim();
    const stem = raw.replace(/\.(pdf|txt)$/i, "").slice(0, 60) || "page";
    return mode === "pdf" ? `${stem}.pdf` : `${stem}.txt`;
}
