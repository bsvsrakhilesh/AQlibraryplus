import axios from "axios";
import { readFile } from "fs/promises";
import * as path from "path";
import { createDom } from "../utils/dom";
import { Readability } from "@mozilla/readability";
import pdf from "pdf-parse";
import dns from "dns/promises";
import net from "net";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs/promises";
import * as unzipper from "unzipper";

const MAX_HTML_BYTES = Number(
  process.env.EXTRACT_MAX_HTML_BYTES || 10 * 1024 * 1024,
);
const PREVIEW_SNIPPET_CHARS = Number(process.env.EXTRACT_PREVIEW_CHARS || 260);
const USER_AGENT = process.env.EXTRACT_USER_AGENT || "SmartScrapeBot/1.0";
const URL_METADATA_TIMEOUT_MS = Number(
  process.env.EXTRACT_URL_TIMEOUT_MS || 30000,
);
const MAX_PDF_BYTES = Number(
  process.env.EXTRACT_MAX_PDF_BYTES || 20 * 1024 * 1024,
);

export type PublishedAtSource =
  | "pdf_info"
  | "pdf_pages"
  | "pdf_text_heuristic"
  | "jsonld"
  | "html_meta"
  | "text_explicit"
  | "text_heuristic"
  | "filename_pattern"
  | "url_pattern"
  | "unknown";

export type PublishedAtMeta = {
  source: PublishedAtSource;
  confidence: number; // 0..1
  details?: Record<string, any>;
};

export type PublishedAtCandidate = {
  date: Date;
  source: Exclude<PublishedAtSource, "unknown">;
  confidence: number;
  raw?: string;
  evidenceText?: string;
  locator?: Record<string, any>;
  reason?: string;
};

function ipv4ToInt(ip: string) {
  const parts = ip.split(".").map((x) => Number(x));
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)
  )
    return null;
  return (
    ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]
  );
}

function isPrivateIp(ip: string) {
  const family = net.isIP(ip);
  if (family === 4) {
    const n = ipv4ToInt(ip);
    if (n == null) return true;

    const inRange = (a: string, b: string) => {
      const na = ipv4ToInt(a)!;
      const nb = ipv4ToInt(b)!;
      return n >= na && n <= nb;
    };

    return (
      inRange("10.0.0.0", "10.255.255.255") || // 10/8
      inRange("172.16.0.0", "172.31.255.255") || // 172.16/12
      inRange("192.168.0.0", "192.168.255.255") || // 192.168/16
      inRange("127.0.0.0", "127.255.255.255") || // loopback
      inRange("169.254.0.0", "169.254.255.255") || // link-local
      inRange("0.0.0.0", "0.255.255.255") // "this network"
    );
  }

  if (family === 6) {
    const t = ip.toLowerCase();
    return (
      t === "::1" || // loopback
      t.startsWith("fc") ||
      t.startsWith("fd") || // fc00::/7 unique local
      t.startsWith("fe8") ||
      t.startsWith("fe9") ||
      t.startsWith("fea") ||
      t.startsWith("feb") // fe80::/10 link-local (approx)
    );
  }

  // Not a valid IP string => treat as unsafe if we ever get here.
  return true;
}

async function assertSafeUrl(rawUrl: string) {
  const u = new URL(rawUrl);

  if (!["http:", "https:"].includes(u.protocol)) {
    throw new Error("Only http/https URLs are allowed");
  }

  const host = (u.hostname || "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local")) {
    throw new Error("Blocked hostname");
  }

  // DNS resolve and block private/internal IPs (SSRF protection)
  const addrs = await dns.lookup(host, { all: true });
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      throw new Error("Blocked private/internal IP");
    }
  }
}

function cleanSnippet(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\u0000/g, "")
    .trim();
}

function titleFromExtractedText(text: string) {
  return (
    String(text || "")
      .split(/\r?\n|\.|\|/)
      .map((x) => cleanSnippet(x))
      .find(Boolean) || ""
  );
}

const PUBLISHED_AT_SOURCE_PRIORITY: Record<PublishedAtSource, number> = {
  jsonld: 100,
  html_meta: 90,
  text_explicit: 88,
  pdf_pages: 86,
  pdf_text_heuristic: 28,
  pdf_info: 20,
  filename_pattern: 34,
  url_pattern: 32,
  text_heuristic: 24,
  unknown: 0,
};

const WEAK_CONTEXTUAL_PUBLISHED_AT_SOURCES = new Set<PublishedAtSource>([
  "pdf_info",
  "pdf_text_heuristic",
  "text_heuristic",
]);

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function isUsableCandidate(candidate: PublishedAtCandidate) {
  const year = candidate.date.getUTCFullYear();
  return (
    candidate.date instanceof Date &&
    Number.isFinite(candidate.date.getTime()) &&
    year >= 1990 &&
    year <= 2100
  );
}

function sortPublishedAtCandidates(candidates: PublishedAtCandidate[]) {
  return dedupePublishedAtCandidates(candidates)
    .filter(isUsableCandidate)
    .map((candidate) => ({
      ...candidate,
      confidence: clampConfidence(candidate.confidence),
    }))
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      const priorityDiff =
        PUBLISHED_AT_SOURCE_PRIORITY[b.source] -
        PUBLISHED_AT_SOURCE_PRIORITY[a.source];
      if (priorityDiff !== 0) return priorityDiff;
      return b.date.getTime() - a.date.getTime();
    });
}

function sortSelectablePublishedAtCandidates(
  candidates: PublishedAtCandidate[],
) {
  return sortPublishedAtCandidates(candidates).filter(
    (candidate) =>
      !WEAK_CONTEXTUAL_PUBLISHED_AT_SOURCES.has(candidate.source) ||
      candidate.confidence >= 0.6,
  );
}

function dedupePublishedAtCandidates(candidates: PublishedAtCandidate[]) {
  const out: PublishedAtCandidate[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const key = publishedAtCandidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }

  return out;
}

function publishedAtCandidateKey(candidate: PublishedAtCandidate) {
  return [
    candidate.source,
    candidate.date.toISOString().slice(0, 10),
    candidate.raw || "",
    JSON.stringify(candidate.locator || {}),
  ].join("|");
}

export function chooseBestPublishedAtCandidate(
  candidates: PublishedAtCandidate[],
) {
  return sortSelectablePublishedAtCandidates(candidates)[0] ?? null;
}

function serializePublishedAtCandidate(candidate: PublishedAtCandidate) {
  return {
    date: candidate.date.toISOString(),
    source: candidate.source,
    confidence: clampConfidence(candidate.confidence),
    ...(candidate.raw ? { raw: candidate.raw } : {}),
    ...(candidate.evidenceText ? { evidenceText: candidate.evidenceText } : {}),
    ...(candidate.locator ? { locator: candidate.locator } : {}),
    ...(candidate.reason ? { reason: candidate.reason } : {}),
  };
}

export function publishedAtMetaFromCandidates(
  candidates: PublishedAtCandidate[],
): PublishedAtMeta {
  const allSorted = sortPublishedAtCandidates(candidates);
  const sorted = sortSelectablePublishedAtCandidates(candidates);
  const winning = sorted[0];

  if (!winning) {
    return {
      source: "unknown",
      confidence: 0.0,
      details: {
        topCandidates: allSorted.slice(0, 5).map(serializePublishedAtCandidate),
        ignoredCandidates: allSorted.slice(0, 5).map(serializePublishedAtCandidate),
      },
    };
  }

  return {
    source: winning.source,
    confidence: clampConfidence(winning.confidence),
    details: {
      winningCandidate: serializePublishedAtCandidate(winning),
      topCandidates: sorted.slice(0, 5).map(serializePublishedAtCandidate),
      ignoredCandidates: (() => {
        const selectableKeys = new Set(sorted.map(publishedAtCandidateKey));
        return allSorted
          .filter(
            (candidate) =>
              !selectableKeys.has(publishedAtCandidateKey(candidate)),
          )
          .slice(0, 5)
          .map(serializePublishedAtCandidate);
      })(),
    },
  };
}

export function withPublishedAtMeta(
  existing: unknown,
  publishedAtMeta: PublishedAtMeta | null | undefined,
) {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, any>) }
      : {};

  if (!publishedAtMeta) return base;
  return { ...base, publishedAtMeta };
}


export async function extractTextFromUrl(url: string): Promise<string> {
  await assertSafeUrl(url);

  const { data: html } = await axios.get<string>(url, {
    timeout: 15000,
    responseType: "text",
    maxContentLength: MAX_HTML_BYTES,
    maxBodyLength: MAX_HTML_BYTES,
    headers: { "User-Agent": USER_AGENT },
    validateStatus: (s) => s >= 200 && s < 300,
  });

  const dom = createDom(html, url);
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const title = article?.title || dom.window.document.title || "";
  const text =
    article?.textContent || dom.window.document.body?.textContent || "";
  return `${title}\n\n${text}`.trim();
}

function tryParseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;

  const isoDay = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/);
  if (
    isoDay &&
    !dateFromUtcParts(Number(isoDay[1]), Number(isoDay[2]), Number(isoDay[3]))
  ) {
    return null;
  }

  // handle ISO / RFC / common formats
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d;

  // sometimes JSON-LD has "2024-01-01T..." etc; Date() already covers most.
  return null;
}

function uniqNonEmpty(arr: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of arr) {
    const t = String(a || "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function extractLdJson(dom: any): any[] {
  const nodes = Array.from(
    dom.window.document.querySelectorAll('script[type="application/ld+json"]'),
  );

  const out: any[] = [];
  for (const n of nodes) {
    const txt = (n as any)?.textContent || "";
    if (!txt.trim()) continue;
    try {
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      // ignore invalid json-ld blocks
    }
  }
  return out;
}

function pickAuthorsFromLd(ld: any[]): string[] {
  const authors: string[] = [];

  const pushAuthor = (a: any) => {
    if (!a) return;
    if (typeof a === "string") authors.push(a);
    else if (Array.isArray(a)) a.forEach(pushAuthor);
    else if (typeof a === "object") {
      // common JSON-LD shapes
      if (typeof a.name === "string") authors.push(a.name);
      else if (typeof a["@name"] === "string") authors.push(a["@name"]);
    }
  };

  for (const obj of ld) {
    if (!obj || typeof obj !== "object") continue;

    // some sites wrap actual article inside @graph
    const graph = Array.isArray(obj["@graph"]) ? obj["@graph"] : null;
    const targets = graph ? graph : [obj];

    for (const t of targets) {
      if (!t || typeof t !== "object") continue;
      pushAuthor((t as any).author);
      pushAuthor((t as any).creator);
    }
  }

  return uniqNonEmpty(authors);
}

function pickPublishedFromLd(ld: any[]): Date | null {
  return chooseBestPublishedAtCandidate(
    extractPublishedAtCandidatesFromLd(ld),
  )?.date ?? null;
}

function extractPublishedAtCandidatesFromLd(ld: any[]): PublishedAtCandidate[] {
  const candidates: PublishedAtCandidate[] = [];
  const fields: Array<{ field: string; confidence: number; reason: string }> = [
    {
      field: "datePublished",
      confidence: 0.92,
      reason: "JSON-LD datePublished",
    },
    {
      field: "dateCreated",
      confidence: 0.82,
      reason: "JSON-LD dateCreated",
    },
    {
      field: "dateModified",
      confidence: 0.6,
      reason: "JSON-LD dateModified fallback",
    },
  ];

  for (const obj of ld) {
    if (!obj || typeof obj !== "object") continue;

    const graph = Array.isArray(obj["@graph"]) ? obj["@graph"] : null;
    const targets = graph ? graph : [obj];

    for (const t of targets) {
      if (!t || typeof t !== "object") continue;
      for (const { field, confidence, reason } of fields) {
        const raw = (t as any)[field];
        const date = tryParseDate(raw);
        if (!date) continue;
        candidates.push({
          date,
          source: "jsonld",
          confidence,
          raw: String(raw),
          locator: { field },
          reason,
        });
      }
    }
  }

  return candidates;
}

function pickMetaContent(doc: Document, selectors: string[]) {
  for (const sel of selectors) {
    const v = doc.querySelector(sel)?.getAttribute("content");
    if (v && v.trim()) return v.trim();
  }
  return "";
}

const MONTH_NUMBER_BY_NAME: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MONTH_PATTERN =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";

const DATE_EXPRESSION_PATTERN = [
  "\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}",
  "\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{2,4}",
  `\\d{1,2}\\s+(?:${MONTH_PATTERN})\\s+\\d{4}`,
  `(?:${MONTH_PATTERN})\\s+\\d{1,2},?\\s+\\d{4}`,
].join("|");

const EXPLICIT_PUBLICATION_CUE_PATTERN =
  "(?:published(?:\\s+on)?|publication\\s+date|issued(?:\\s+on)?|date\\s+of\\s+issue|order\\s+dated|notification\\s+dated|gazette\\s+date|released(?:\\s+on)?|dated)";

function normalizeTwoDigitYear(year: number) {
  return year < 100 ? year + 2000 : year;
}

function monthNumber(raw: string) {
  return MONTH_NUMBER_BY_NAME[raw.toLowerCase().replace(/\.$/, "")] ?? null;
}

function parsePublishedDateExpression(raw: string | null | undefined) {
  const t = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;

  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    return dateFromUtcParts(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  m = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) {
    return dateFromUtcParts(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    return dateFromUtcParts(
      normalizeTwoDigitYear(Number(m[3])),
      Number(m[2]),
      Number(m[1]),
    );
  }

  m = t.match(
    new RegExp(`^(\\d{1,2})\\s+(${MONTH_PATTERN})\\s+(\\d{4})$`, "i"),
  );
  if (m) {
    const month = monthNumber(m[2]);
    return month
      ? dateFromUtcParts(Number(m[3]), month, Number(m[1]))
      : null;
  }

  m = t.match(
    new RegExp(`^(${MONTH_PATTERN})\\s+(\\d{1,2}),?\\s+(\\d{4})$`, "i"),
  );
  if (m) {
    const month = monthNumber(m[1]);
    return month
      ? dateFromUtcParts(Number(m[3]), month, Number(m[2]))
      : null;
  }

  return tryParseDate(t);
}

function evidenceWindow(text: string, index: number, rawLength: number) {
  const start = Math.max(0, index - 70);
  const end = Math.min(text.length, index + rawLength + 70);
  return cleanSnippet(text.slice(start, end));
}

function makeTextCandidate(
  text: string,
  matchIndex: number,
  raw: string,
  source: Exclude<PublishedAtSource, "unknown">,
  confidence: number,
  reason: string,
  locator?: Record<string, any>,
): PublishedAtCandidate | null {
  const date = parsePublishedDateExpression(raw);
  if (!date) return null;

  return {
    date,
    source,
    confidence,
    raw,
    evidenceText: evidenceWindow(text, matchIndex, raw.length),
    ...(locator ? { locator } : {}),
    reason,
  };
}

export function extractPublishedAtCandidatesFromText(
  text: string,
  options: {
    explicitSource?: Exclude<PublishedAtSource, "unknown">;
    genericSource?: Exclude<PublishedAtSource, "unknown">;
    locator?: Record<string, any>;
    explicitConfidence?: number;
    genericConfidence?: number;
    maxGenericCandidates?: number;
  } = {},
): PublishedAtCandidate[] {
  const sourceText = String(text || "");
  if (!sourceText.trim()) return [];

  const candidates: PublishedAtCandidate[] = [];
  const explicitSource = options.explicitSource ?? "text_explicit";
  const genericSource = options.genericSource ?? "text_heuristic";
  const explicitConfidence = options.explicitConfidence ?? 0.88;
  const genericConfidence = options.genericConfidence ?? 0.38;

  const explicitRx = new RegExp(
    `\\b(${EXPLICIT_PUBLICATION_CUE_PATTERN})\\b\\s*[:\\-]?\\s*(${DATE_EXPRESSION_PATTERN})`,
    "gi",
  );

  let explicit: RegExpExecArray | null;
  while ((explicit = explicitRx.exec(sourceText))) {
    const raw = explicit[2];
    const c = makeTextCandidate(
      sourceText,
      explicit.index,
      raw,
      explicitSource,
      explicitConfidence,
      "Explicit publication cue in text",
      options.locator,
    );
    if (c) candidates.push(c);
  }

  const genericRx = new RegExp(`\\b(${DATE_EXPRESSION_PATTERN})\\b`, "gi");
  const maxGenericCandidates = options.maxGenericCandidates ?? 6;
  let genericCount = 0;
  let generic: RegExpExecArray | null;
  while (
    genericCount < maxGenericCandidates &&
    (generic = genericRx.exec(sourceText))
  ) {
    const raw = generic[1];
    const c = makeTextCandidate(
      sourceText,
      generic.index,
      raw,
      genericSource,
      genericConfidence,
      "Date found in text without an explicit publication cue",
      options.locator,
    );
    if (c) {
      candidates.push(c);
      genericCount++;
    }
  }

  return candidates;
}

function looksLikePdfBytes(buf: Buffer) {
  // PDF header starts with "%PDF-"
  return buf.length >= 5 && buf.slice(0, 5).toString("utf8") === "%PDF-";
}

async function sniffIsPdfUrl(url: string): Promise<boolean> {
  // quick check: ".pdf" in path or query
  const u = new URL(url);
  const raw = `${u.pathname}${u.search}`.toLowerCase();
  if (raw.includes(".pdf")) return true;

  // fallback: HEAD content-type
  try {
    const resp = await axios.head(url, {
      timeout: 8000,
      headers: { "User-Agent": USER_AGENT },
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 500,
    });

    const ct = String(resp.headers?.["content-type"] || "").toLowerCase();
    return ct.includes("application/pdf");
  } catch {
    return false;
  }
}

function extractPublishedAtFromUrl(url: string): Date | null {
  // Try patterns like /2023/09/30/ or -2023-09-30-
  const m =
    url.match(/\/(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\/|$)/) ||
    url.match(/(20\d{2})[\-_](\d{1,2})[\-_](\d{1,2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d))
    return null;
  return dateFromUtcParts(y, mo, d);
}

function publishedAtCandidateFromUrl(url: string): PublishedAtCandidate | null {
  const date = extractPublishedAtFromUrl(url);
  if (!date) return null;

  return {
    date,
    source: "url_pattern",
    confidence: 0.35,
    raw: url,
    locator: { url },
    reason: "Date pattern found in URL",
  };
}

function publishedAtCandidateFromFilename(
  fileName: string | null | undefined,
): PublishedAtCandidate | null {
  const baseName = path.basename(String(fileName || "")).trim();
  if (!baseName) return null;

  const normalized = baseName.replace(/[_\s]+/g, "-");
  const compactYearFirst = normalized.match(/\b(20\d{2})(\d{2})(\d{2})\b/);
  const textPattern = new RegExp(`\\b(${DATE_EXPRESSION_PATTERN})\\b`, "i");
  const m = compactYearFirst || normalized.match(textPattern);
  if (!m) return null;

  const raw = compactYearFirst ? m[0] : m[1];
  const date = parsePublishedDateExpression(raw);
  if (!date) return null;

  return {
    date,
    source: "filename_pattern",
    confidence: 0.34,
    raw,
    locator: { fileName: baseName },
    reason: "Date pattern found in filename",
  };
}

function dateFromUtcParts(year: number, month: number, day: number) {
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return dt;
}

function publishedAtFallbackFromUrl(url: string): {
  publishedAt: Date | null;
  publishedAtMeta: PublishedAtMeta;
} {
  const candidate = publishedAtCandidateFromUrl(url);
  const publishedAt = candidate?.date ?? null;
  return {
    publishedAt,
    publishedAtMeta: publishedAtMetaFromCandidates(candidate ? [candidate] : []),
  };
}

function tryParseDateLoose(s: string | null | undefined): Date | null {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;

  // PDF info dates often look like: D:20220101123456+05'30'
  const m = t.match(/^D:(\d{4})(\d{2})(\d{2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = dateFromUtcParts(y, mo, d);
    if (dt) return dt;
  }

  return tryParseDate(t);
}

async function extractPdfPagesFromBuffer(
  buf: Buffer,
  pageNumbers?: number[] | ((totalPages: number) => number[]),
) {
  // PDF.js rejects Node.js Buffer instances even though Buffer extends
  // Uint8Array. Copy into a plain Uint8Array at the library boundary.
  const loadingTask = pdfjsLib.getDocument({ data: Uint8Array.from(buf) });
  const pdfDoc = await loadingTask.promise;

  const pages: { pageNumber: number; text: string }[] = [];
  const totalPages = pdfDoc.numPages;
  const requestedPageNumbers =
    typeof pageNumbers === "function" ? pageNumbers(totalPages) : pageNumbers;
  const selectedPageNumbers = requestedPageNumbers?.length
    ? Array.from(new Set(requestedPageNumbers))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= totalPages)
        .sort((a, b) => a - b)
    : Array.from({ length: totalPages }, (_, index) => index + 1);

  for (const i of selectedPageNumbers) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();

    const strings = (content.items as any[])
      .map((it) => (typeof it.str === "string" ? it.str : ""))
      .filter(Boolean);

    const text = strings.join(" ").replace(/\s+/g, " ").trim();
    pages.push({ pageNumber: i, text });
  }

  return { pages, totalPages };
}

function boundaryPdfPageNumbers(totalPages: number) {
  return Array.from(new Set([1, 2, totalPages - 1, totalPages])).filter(
    (pageNumber) => pageNumber >= 1 && pageNumber <= totalPages,
  );
}

function remainingPdfPageNumbers(totalPages: number, seen: number[]) {
  const seenSet = new Set(seen);
  return Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (pageNumber) => !seenSet.has(pageNumber),
  );
}

function publishedAtCandidatesFromPdfPages(
  pages: { pageNumber: number; text: string }[],
) {
  return pages.flatMap((page) =>
    extractPublishedAtCandidatesFromText(page.text, {
      explicitSource: "pdf_pages",
      genericSource: "pdf_text_heuristic",
      explicitConfidence: 0.88,
      genericConfidence: 0.5,
      maxGenericCandidates: 3,
      locator: { pageNumber: page.pageNumber },
    }),
  );
}

function pdfInfoDateCandidate(
  infoDate: string,
  field: string,
): PublishedAtCandidate | null {
  const date = tryParseDateLoose(infoDate);
  if (!date) return null;
  return {
    date,
    source: "pdf_info",
    confidence: 0.45,
    raw: infoDate,
    locator: { field },
    reason: "PDF internal metadata date; may represent file creation rather than publication",
  };
}

async function extractPdfBufferMetadata(args: {
  buf: Buffer;
  fallbackTitle: string;
  sourceUrl?: string | null;
  fileName?: string | null;
}): Promise<{
  title: string;
  snippet: string;
  authors: string[];
  publishedAt: Date | null;
  publishedAtMeta: PublishedAtMeta;
}> {
  let out: any;
  try {
    out = await pdf(args.buf);
  } catch {
    const fallbackCandidates = [
      ...(args.sourceUrl
        ? [publishedAtCandidateFromUrl(args.sourceUrl)].filter(
            (c): c is PublishedAtCandidate => Boolean(c),
          )
        : []),
      publishedAtCandidateFromFilename(args.fileName ?? args.fallbackTitle),
    ].filter((c): c is PublishedAtCandidate => Boolean(c));
    const meta = publishedAtMetaFromCandidates(fallbackCandidates);
    return {
      title: args.fallbackTitle,
      snippet: "",
      authors: [],
      publishedAt: chooseBestPublishedAtCandidate(fallbackCandidates)?.date ?? null,
      publishedAtMeta: meta,
    };
  }

  const text = String(out?.text || "");
  const cleaned = cleanSnippet(text);

  const infoTitle = String(out?.info?.Title || "").trim();
  const titleFromText = titleFromExtractedText(text);
  const title = (infoTitle || titleFromText || args.fallbackTitle).trim();

  const infoAuthor = String(out?.info?.Author || "").trim();
  const authors = uniqNonEmpty([...(infoAuthor ? [infoAuthor] : [])]);

  const infoField = out?.info?.CreationDate ? "CreationDate" : "ModDate";
  const infoDate = String(
    out?.info?.CreationDate || out?.info?.ModDate || "",
  ).trim();

  const candidates: PublishedAtCandidate[] = [];
  const infoCandidate = pdfInfoDateCandidate(infoDate, infoField);
  if (infoCandidate) candidates.push(infoCandidate);

  let totalPages = 0;
  let boundaryPages: { pageNumber: number; text: string }[] = [];

  try {
    const firstPass = await extractPdfPagesFromBuffer(
      args.buf,
      boundaryPdfPageNumbers,
    );
    totalPages = firstPass.totalPages;
    boundaryPages = firstPass.pages;
    candidates.push(...publishedAtCandidatesFromPdfPages(boundaryPages));
  } catch {
    candidates.push(
      ...extractPublishedAtCandidatesFromText(text, {
        explicitSource: "pdf_pages",
        genericSource: "pdf_text_heuristic",
        explicitConfidence: 0.82,
        genericConfidence: 0.5,
        locator: { source: "pdf_parse_text" },
      }),
    );
  }

  const bestAfterBoundary = chooseBestPublishedAtCandidate(candidates);
  if (
    totalPages > 0 &&
    totalPages <= 25 &&
    (!bestAfterBoundary || bestAfterBoundary.confidence < 0.8)
  ) {
    try {
      const fullPass = await extractPdfPagesFromBuffer(
        args.buf,
        remainingPdfPageNumbers(
          totalPages,
          boundaryPages.map((page) => page.pageNumber),
        ),
      );
      candidates.push(...publishedAtCandidatesFromPdfPages(fullPass.pages));
    } catch {
      // Boundary/page extraction is best effort; keep existing candidates.
    }
  }

  const filenameCandidate = publishedAtCandidateFromFilename(
    args.fileName ?? args.fallbackTitle,
  );
  if (filenameCandidate) candidates.push(filenameCandidate);

  if (args.sourceUrl) {
    const urlCandidate = publishedAtCandidateFromUrl(args.sourceUrl);
    if (urlCandidate) candidates.push(urlCandidate);
  }

  const best = chooseBestPublishedAtCandidate(candidates);
  const publishedAtMeta = publishedAtMetaFromCandidates(candidates);
  const snippet = cleaned.slice(0, PREVIEW_SNIPPET_CHARS);

  return {
    title,
    snippet,
    authors,
    publishedAt: best?.date ?? null,
    publishedAtMeta,
  };
}

async function extractPdfUrlMetadata(url: string): Promise<{
  title: string;
  snippet: string;
  authors: string[];
  publishedAt: Date | null;
  publishedAtMeta: PublishedAtMeta;
}> {
  let resp: any;
  try {
    resp = await axios.get<ArrayBuffer>(url, {
      timeout: URL_METADATA_TIMEOUT_MS,
      responseType: "arraybuffer",
      maxContentLength: MAX_PDF_BYTES,
      maxBodyLength: MAX_PDF_BYTES,
      headers: { "User-Agent": USER_AGENT },
      validateStatus: (s) => s >= 200 && s < 500,
    });
  } catch {
    // Network/DNS/timeout/etc -> never throw up to controller
    return {
      title: url,
      snippet: "",
      authors: [],
      ...publishedAtFallbackFromUrl(url),
    };
  }

  if (resp.status >= 400) {
    return {
      title: url,
      snippet: "",
      authors: [],
      ...publishedAtFallbackFromUrl(url),
    };
  }

  const buf = Buffer.from(resp.data);

  const ct = String(resp.headers?.["content-type"] || "").toLowerCase();

  const isPdf = ct.includes("application/pdf") || looksLikePdfBytes(buf);
  if (!isPdf) {
    return {
      title: url,
      snippet: "",
      authors: [],
      ...publishedAtFallbackFromUrl(url),
    };
  }

  return extractPdfBufferMetadata({
    buf,
    fallbackTitle: url,
    sourceUrl: url,
    fileName: new URL(url).pathname.split("/").pop() || url,
  });
}

export async function extractUrlMetadata(url: string): Promise<{
  title: string;
  snippet: string;
  authors: string[];
  publishedAt: Date | null;
  publishedAtMeta: PublishedAtMeta;
}> {
  await assertSafeUrl(url);

  // If it's a PDF URL, try PDF extraction, but never let it bubble into 502
  try {
    if (await sniffIsPdfUrl(url)) {
      return await extractPdfUrlMetadata(url);
    }
  } catch {
    // fallthrough to HTML path
  }

  let resp: any;
  try {
    resp = await axios.get<string>(url, {
      timeout: URL_METADATA_TIMEOUT_MS,
      responseType: "text",
      maxContentLength: MAX_HTML_BYTES,
      maxBodyLength: MAX_HTML_BYTES,
      headers: { "User-Agent": USER_AGENT },
      // accept 4xx so we can return graceful fallback instead of throwing
      validateStatus: (s) => s >= 200 && s < 500,
    });
  } catch {
    return {
      title: url,
      snippet: "",
      authors: [],
      ...publishedAtFallbackFromUrl(url),
    };
  }

  // Paywall/login/blocked → don't throw, just return safe fallback
  if (resp.status >= 400) {
    return {
      title: url,
      snippet: "",
      authors: [],
      ...publishedAtFallbackFromUrl(url),
    };
  }

  const html = resp.data;

  const dom = createDom(html, url);
  const doc = dom.window.document;

  const ogTitle =
    doc.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
    doc.querySelector('meta[name="twitter:title"]')?.getAttribute("content") ||
    "";

  const ld = extractLdJson(dom);

  const reader = new Readability(doc);
  const article = reader.parse();

  const title = (article?.title || ogTitle || doc.title || url).trim();

  const rawText = article?.textContent || doc.body?.textContent || "";
  const snippet = cleanSnippet(rawText).slice(0, PREVIEW_SNIPPET_CHARS);

  // -------- authors & publishedAt --------
  // authors: JSON-LD first; fallback to meta tags; fallback to Readability byline
  const authorsLd = pickAuthorsFromLd(ld);
  const metaAuthor = pickMetaContent(doc, [
    'meta[name="author"]',
    'meta[property="article:author"]',
    'meta[name="parsely-author"]',
    'meta[name="dc.creator"]',
    'meta[name="DC.creator"]',
  ]);

  const byline =
    typeof (article as any)?.byline === "string" ? (article as any).byline : "";

  const authors = authorsLd.length
    ? authorsLd
    : uniqNonEmpty([
        ...(metaAuthor ? [metaAuthor] : []),
        ...(byline ? [byline] : []),
      ]);

  const metaPublished = pickMetaContent(doc, [
    'meta[property="article:published_time"]',
    'meta[name="pubdate"]',
    'meta[name="publish-date"]',
    'meta[name="date"]',
    'meta[itemprop="datePublished"]',
    'meta[name="DC.date"]',
    'meta[name="dc.date"]',
  ]);

  const publishedAtCandidates: PublishedAtCandidate[] = [
    ...extractPublishedAtCandidatesFromLd(ld),
  ];

  const metaParsed = tryParseDate(metaPublished);
  if (metaParsed) {
    publishedAtCandidates.push({
      date: metaParsed,
      source: "html_meta",
      confidence: 0.65,
      raw: metaPublished,
      locator: { selector: "published meta tag" },
      reason: "HTML publication meta tag",
    });
  }

  const urlCandidate = publishedAtCandidateFromUrl(url);
  if (urlCandidate) publishedAtCandidates.push(urlCandidate);

  const bestPublishedAt = chooseBestPublishedAtCandidate(publishedAtCandidates);
  const publishedAtMeta = publishedAtMetaFromCandidates(publishedAtCandidates);

  return {
    title,
    snippet,
    authors,
    publishedAt: bestPublishedAt?.date ?? null,
    publishedAtMeta,
  };
}

export async function extractPreviewFromUrl(
  url: string,
): Promise<{ title: string; snippet: string }> {
  const { title, snippet } = await extractUrlMetadata(url);
  return { title, snippet };
}

export async function extractTextFromFile(
  filePath: string,
  mimeType: string,
): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (
    ext === ".docx" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const archive = await unzipper.Open.file(filePath);
    const documentXml = archive.files.find(
      (entry: { path: string }) => entry.path === "word/document.xml",
    );
    if (!documentXml) throw new Error("DOCX document.xml is missing");
    if (documentXml.uncompressedSize > 25 * 1024 * 1024) {
      throw new Error("DOCX document text is too large to extract safely");
    }

    const xml = (await documentXml.buffer()).toString("utf8");
    return xml
      .replace(/<w:tab\b[^>]*\/>/gi, "\t")
      .replace(/<w:br\b[^>]*\/>/gi, "\n")
      .replace(/<\/w:p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  if (ext === ".html" || ext === ".htm" || mimeType === "text/html") {
    const html = await readFile(filePath, "utf8");
    const dom = createDom(html, "https://local.invalid/");
    dom.window.document
      .querySelectorAll("script, style, noscript, template")
      .forEach((node) => node.remove());
    dom.window.document
      .querySelectorAll(
        "address, article, aside, blockquote, br, div, dl, fieldset, figcaption, figure, footer, form, h1, h2, h3, h4, h5, h6, header, hr, li, main, nav, ol, p, pre, section, table, tr, ul",
      )
      .forEach((node) => node.insertAdjacentText("afterend", " "));
    return String(dom.window.document.body?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }
  if (mimeType?.startsWith("text/") || ext === ".txt") {
    try {
      return (await readFile(filePath, "utf8")).toString();
    } catch {
      /* fallthrough */
    }
  }
  if (ext === ".pdf" || mimeType === "application/pdf") {
    const buf = await readFile(filePath);
    const out = await pdf(buf);
    return out.text || "";
  }
  try {
    return (await readFile(filePath, "utf8")).toString();
  } catch {
    return "";
  }
}

export async function extractPdfPagesFromFile(
  storagePath: string,
): Promise<{ pageNumber: number; text: string }[]> {
  const buf = await fs.readFile(storagePath);
  const loadingTask = pdfjsLib.getDocument({ data: Uint8Array.from(buf) });
  const pdf = await loadingTask.promise;

  const pages: { pageNumber: number; text: string }[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = (content.items as any[])
      .map((it) => (typeof it.str === "string" ? it.str : ""))
      .filter(Boolean);
    const text = strings.join(" ").replace(/\s+/g, " ").trim();
    pages.push({ pageNumber: i, text });
  }
  return pages;
}

export function detectScannedPdf(
  pages: { pageNumber: number; text: string }[],
): {
  pageCount: number;
  totalChars: number;
  avgCharsPerPage: number;
  nonEmptyPages: number;
  nonEmptyRatio: number;
  avgWordsPerPage: number;
  isScannedLikely: boolean;
  thresholdCharsPerPage: number;
  thresholdNonEmptyRatio: number;
} {
  const pageCount = pages.length;

  const normalized = pages.map((p) => String(p.text || "").trim());

  const totalChars = normalized.reduce(
    (sum, text) => sum + text.replace(/\s+/g, "").length,
    0,
  );

  const totalWords = normalized.reduce((sum, text) => {
    if (!text) return sum;
    return sum + text.split(/\s+/).filter(Boolean).length;
  }, 0);

  const nonEmptyPages = normalized.filter((text) => text.length > 0).length;

  const avgCharsPerPage = pageCount > 0 ? totalChars / pageCount : 0;
  const avgWordsPerPage = pageCount > 0 ? totalWords / pageCount : 0;
  const nonEmptyRatio = pageCount > 0 ? nonEmptyPages / pageCount : 0;

  const thresholdCharsPerPage = 20;
  const thresholdNonEmptyRatio = 0.5;

  const isScannedLikely =
    pageCount > 0 &&
    (avgCharsPerPage < thresholdCharsPerPage ||
      nonEmptyRatio < thresholdNonEmptyRatio);

  return {
    pageCount,
    totalChars,
    avgCharsPerPage,
    nonEmptyPages,
    nonEmptyRatio,
    avgWordsPerPage,
    isScannedLikely,
    thresholdCharsPerPage,
    thresholdNonEmptyRatio,
  };
}

// ---------- File metadata extraction helpers (used by other services) ----------

export async function extractTextFromStoredFile(
  storagePath: string,
  mimeType: string,
) {
  return extractTextFromFile(storagePath, mimeType);
}

export async function extractSnippetFromStoredFile(
  storagePath: string,
  mimeType: string,
) {
  const text = await extractTextFromFile(storagePath, mimeType);
  const cleaned = cleanSnippet(text);
  return cleaned.slice(0, PREVIEW_SNIPPET_CHARS);
}

export async function extractTitleFromStoredFile(
  storagePath: string,
  mimeType: string,
) {
  const text = await extractTextFromFile(storagePath, mimeType);
  const titleFromText = titleFromExtractedText(text);
  return titleFromText || path.basename(storagePath);
}

export async function extractStoredFileMetadata(
  storagePath: string,
  mimeType: string,
  opts: { fileName?: string | null; sourceUrl?: string | null } = {},
): Promise<{
  title: string;
  snippet: string;
  sourcePublishedAt: Date | null;
  sourceAuthors: string[];
  publishedAtMeta: PublishedAtMeta;
}> {
  const fileName = opts.fileName?.trim() || path.basename(storagePath);
  const lowerMime = String(mimeType || "").toLowerCase();
  const lowerName = fileName.toLowerCase();

  if (lowerMime.includes("pdf") || lowerName.endsWith(".pdf")) {
    try {
      const buf = await readFile(storagePath);
      const meta = await extractPdfBufferMetadata({
        buf,
        fallbackTitle: fileName,
        sourceUrl: opts.sourceUrl ?? null,
        fileName,
      });
      return {
        title: meta.title,
        snippet: meta.snippet,
        sourcePublishedAt: meta.publishedAt,
        sourceAuthors: meta.authors,
        publishedAtMeta: meta.publishedAtMeta,
      };
    } catch {
      // fall through to filename/source URL fallback below
    }
  }

  const text = await extractTextFromFile(storagePath, mimeType);
  const cleaned = cleanSnippet(text);
  const titleFromText = titleFromExtractedText(text);

  const candidates = extractPublishedAtCandidatesFromText(text, {
    explicitSource: "text_explicit",
    genericSource: "text_heuristic",
    explicitConfidence: 0.88,
    genericConfidence: 0.38,
    locator: { fileName },
  });

  const filenameCandidate = publishedAtCandidateFromFilename(fileName);
  if (filenameCandidate) candidates.push(filenameCandidate);

  if (opts.sourceUrl) {
    const urlCandidate = publishedAtCandidateFromUrl(opts.sourceUrl);
    if (urlCandidate) candidates.push(urlCandidate);
  }

  const best = chooseBestPublishedAtCandidate(candidates);
  return {
    title: titleFromText || fileName,
    snippet: cleaned.slice(0, PREVIEW_SNIPPET_CHARS),
    sourcePublishedAt: best?.date ?? null,
    sourceAuthors: [],
    publishedAtMeta: publishedAtMetaFromCandidates(candidates),
  };
}

export async function extractFileMetadata(
  storagePath: string,
  mimeType: string,
): Promise<{ title: string; snippet: string }> {
  const { title, snippet } = await extractStoredFileMetadata(
    storagePath,
    mimeType,
  );
  return { title, snippet };
}
