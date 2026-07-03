import type { SearchResult } from "../lib/types";
import { canonicalizeUrl } from "./urlCanonical";

export type CaptureMode = "text" | "pdf";
export type CollectorSearchWebOptions = {
  site?: string;
  yearFrom?: number;
  yearTo?: number;
  jurisdiction?: string;
  region?: string;
  fileType?: "pdf" | "html";
  excludeFileType?: "pdf";
  lr?: string;
  cr?: string;
  gl?: string;
};

export type CollectorSearchTarget = {
  site: string;
  label: string;
  confidence: number;
};

export type WebsiteSuggestion = {
  domain: string;
  label: string;
  confidence: number;
  source: "authority" | "search";
};

const PDF_FIRST_DOC_TYPES = new Set([
  "court_order",
  "notification",
  "report",
  "parliamentary_material",
  "affidavit_filing",
  "guideline_circular",
  "official_document",
]);

function formatPlanValue(s: string): string {
  const t = (s || "").trim();
  if (!t) return "";
  const alreadyQuoted =
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"));
  if (alreadyQuoted) return t;
  return t.includes(" ") ? `"${t}"` : t;
}

export function toYYYY(s: string): string {
  const t = (s || "").trim();
  if (!t) return "";
  const m = t.match(/^(\d{4})/);
  return m ? m[1] : "";
}

export function normalizeCollectorWebsite(raw: string): string {
  const v = raw.trim();
  if (!v) return "";

  const cleanHost = (host: string) =>
    host.trim().toLowerCase().replace(/^\s*www\./i, "").replace(/\.+$/, "");

  try {
    const maybeUrl = v.match(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//)
      ? v
      : `https://${v}`;
    const u = new URL(maybeUrl);
    return cleanHost(u.hostname);
  } catch {
    return cleanHost(v.split(/[\/\s?#]/)[0]);
  }
}

export function normalizeCollectorKeywords(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";

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
      const alreadyQuoted =
        (p.startsWith('"') && p.endsWith('"')) ||
        (p.startsWith("'") && p.endsWith("'"));
      if (alreadyQuoted) return p;
      return p.includes(" ") ? `"${p}"` : p;
    });

    return terms.join(" ");
  });

  return groupQueries.length > 1
    ? `(${groupQueries.join(") OR (")})`
    : groupQueries[0];
}

export function buildCollectorSearchQuery(kws: string): string {
  return (kws || "").trim();
}

export function resolveCollectorSearchTargets(input: {
  site?: string;
  authoritySources?: Array<{
    domain: string;
    label: string;
    confidence?: number;
  }>;
  limit?: number;
}): CollectorSearchTarget[] {
  const limit =
    typeof input.limit === "number" && Number.isFinite(input.limit)
      ? Math.max(1, Math.floor(input.limit))
      : 6;
  const targets: CollectorSearchTarget[] = [];
  const seen = new Set<string>();

  const push = (
    site: string | undefined,
    label: string | undefined,
    confidence: number | undefined,
  ) => {
    const normalized = normalizeCollectorWebsite(String(site ?? ""));
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    targets.push({
      site: normalized,
      label: String(label ?? normalized).trim() || normalized,
      confidence: Number.isFinite(confidence as number) ? Number(confidence) : 0,
    });
  };

  const sources = Array.isArray(input.authoritySources)
    ? input.authoritySources
    : [];

  if (input.site) {
    const normalizedSite = normalizeCollectorWebsite(input.site);
    const match = sources.find(
      (source) => normalizeCollectorWebsite(source.domain) === normalizedSite,
    );
    push(
      normalizedSite,
      match?.label ?? normalizedSite,
      match?.confidence ?? 100,
    );
  }

  for (const source of sources) {
    push(source.domain, source.label, source.confidence ?? 0);
    if (targets.length >= limit) break;
  }

  return targets.slice(0, limit);
}

export function resolveWebsiteSuggestions(input: {
  query: string;
  authoritySources?: Array<{
    domain: string;
    label: string;
    confidence?: number;
  }>;
  limit?: number;
}): WebsiteSuggestion[] {
  const query = String(input.query ?? "").trim().toLowerCase();
  const limit =
    typeof input.limit === "number" && Number.isFinite(input.limit)
      ? Math.max(1, Math.floor(input.limit))
      : 8;
  const sources = Array.isArray(input.authoritySources)
    ? input.authoritySources
    : [];
  const matches: WebsiteSuggestion[] = [];
  const seen = new Set<string>();

  const push = (
    domain: string | undefined,
    label: string | undefined,
    confidence: number | undefined,
    source: WebsiteSuggestion["source"],
  ) => {
    const normalized = normalizeCollectorWebsite(String(domain ?? ""));
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    matches.push({
      domain: normalized,
      label: String(label ?? normalized).trim() || normalized,
      confidence: Number.isFinite(confidence as number) ? Number(confidence) : 0,
      source,
    });
  };

  const tokens = query
    .split(/[\s,./_-]+/g)
    .map((token) => token.trim())
    .filter(Boolean);

  for (const source of sources) {
    const haystack = `${source.label} ${source.domain}`.toLowerCase();
    if (
      !query ||
      tokens.some((token) => token.length >= 2 && haystack.includes(token))
    ) {
      push(source.domain, source.label, source.confidence ?? 0, "authority");
    }
  }

  return matches.slice(0, limit);
}

export function collectWebsiteSuggestionsFromSearchResults(
  rows: SearchResult[],
  limit = 6,
): WebsiteSuggestion[] {
  const seen = new Set<string>();
  const suggestions: WebsiteSuggestion[] = [];

  const push = (domain: string, label: string, confidence: number) => {
    const normalized = normalizeCollectorWebsite(domain);
    if (!normalized || seen.has(normalized)) return;
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
    } catch {
      domain = normalizeCollectorWebsite(row.url);
    }
    push(domain, row.title || domain, Math.max(10, 100 - index * 10));
  }

  return suggestions.slice(0, limit);
}

export function collectorResultDedupKey(url: string): string {
  const canonical = canonicalizeUrl(url);
  return canonical || String(url || "").trim();
}

export function mergeCollectorSearchResults(
  existing: SearchResult[],
  incoming: SearchResult[],
  options: { limit?: number } = {},
): { rows: SearchResult[]; added: number; skipped: number } {
  const limit =
    typeof options.limit === "number" && Number.isFinite(options.limit)
      ? Math.max(0, options.limit)
      : undefined;
  const seen = new Set<string>();
  const rows: SearchResult[] = [];
  let added = 0;
  let skipped = 0;

  const push = (row: SearchResult, countIncoming: boolean) => {
    const key = collectorResultDedupKey(row.url);
    if (!key || seen.has(key)) {
      if (countIncoming) skipped += 1;
      return;
    }

    seen.add(key);
    rows.push(row);
    if (countIncoming) added += 1;
  };

  for (const row of existing) {
    if (limit !== undefined && rows.length >= limit) break;
    push(row, false);
  }

  for (const row of incoming) {
    if (limit !== undefined && rows.length >= limit) break;
    push(row, true);
  }

  return { rows, added, skipped };
}

export function formatAppliedCollectorSearchPlan(
  query: string,
  opts?: CollectorSearchWebOptions | null,
): string {
  const parts: string[] = [];
  const q = (query || "").trim();

  if (q) parts.push(q);

  const site = String(opts?.site ?? "").trim();
  if (site) parts.push(`site=${site}`);

  const yearFrom =
    typeof opts?.yearFrom === "number" ? String(opts.yearFrom) : "";
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

  if (opts?.fileType === "pdf") parts.push("format=pdf");
  if (opts?.fileType === "html") parts.push("format=html");
  if (opts?.excludeFileType === "pdf") parts.push("format=exclude-pdf");

  return parts.join(" | ");
}

export function inferPreferredCollectorCapture(
  result: SearchResult,
): CaptureMode {
  const docType = result.intelligence?.docType;

  if (docType) {
    return PDF_FIRST_DOC_TYPES.has(docType) ? "pdf" : "text";
  }

  const url = String(result.url || "").toLowerCase();
  if (/\.pdf(?:$|[?#])/.test(url) || /format=pdf/.test(url)) return "pdf";
  return "text";
}

export function isDirectPdfSearchResult(result: SearchResult): boolean {
  const url = String(result.url || "").toLowerCase();
  if (/\.pdf(?:$|[?#])/.test(url) || url.includes(".pdf?")) return true;
  if (result.intelligence?.fileTypeHint === "pdf") return true;
  return false;
}

export function getCollectorCaptureMeta(mode: CaptureMode) {
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

export function suggestCollectorCaptureName(
  url: string,
  title: string | undefined,
  mode: CaptureMode,
) {
  const looksLikeUrlTitle = (t?: string) =>
    !!t && /^https?:\/\//i.test(t.trim());

  const fromUrl = (u: string) => {
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
    } catch {
      return "page";
    }
  };

  const raw =
    title && !looksLikeUrlTitle(title) ? title.trim() : fromUrl(url).trim();

  const stem = raw.replace(/\.(pdf|txt)$/i, "").slice(0, 60) || "page";
  return mode === "pdf" ? `${stem}.pdf` : `${stem}.txt`;
}
