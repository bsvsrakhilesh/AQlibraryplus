import { googleSearch, type GoogleSearchOpts } from "./search.service";
import { log } from "../utils/logger";

export type SearchFallbackResult = {
  results: Array<{ title: string; url: string; snippet: string }>;
  totalResults: number | null;
  nextPage?: number | null;
  retriedQueries?: string[];
  fallbackApplied?: boolean;
};

/**
 * Query expansion strategies for common search patterns.
 * Maps original keywords to alternative search attempts.
 */
const QUERY_EXPANSION_MAP: Record<string, string[]> = {
  // CAQM-related queries
  "caqm construction demolition dust": [
    "CAQM C&D dust enforcement",
    "CAQM construction dust orders",
    "CAQM demolition dust guidelines",
    "CAQM",
  ],
  "caqm enforcement directions": [
    "CAQM enforcement orders",
    "CAQM directions notifications",
    "CAQM enforcement",
    "CAQM",
  ],

  // Generic Air Quality & CAQM
  "delhi air quality enforcement": [
    "CAQM enforcement",
    "Delhi air quality regulations",
    "air quality enforcement India",
  ],
};

/**
 * Indian government domains for targeted fallback searches
 */
const INDIAN_GOV_DOMAINS: Record<string, string> = {
  caqm: "caqm.nic.in",
  dpcc: "dpcc.delhigovt.nic.in",
  cpcb: "cpcb.nic.in",
  hspcb: "hspcb.gov.in",
  gazette: "egazette.nic.in",
  parliament: "sansad.in",
  courts: "sci.gov.in",
};

/**
 * Detect which Indian government domain might be relevant based on query
 */
function detectRelevantDomain(q: string): string | undefined {
  const lowerQ = q.toLowerCase();

  if (lowerQ.includes("caqm") || lowerQ.includes("dust") || lowerQ.includes("air quality")) {
    return INDIAN_GOV_DOMAINS.caqm;
  }
  if (lowerQ.includes("dpcc") || lowerQ.includes("delhi")) {
    return INDIAN_GOV_DOMAINS.dpcc;
  }
  if (lowerQ.includes("cpcb") || lowerQ.includes("pollution control")) {
    return INDIAN_GOV_DOMAINS.cpcb;
  }
  if (lowerQ.includes("notification") || lowerQ.includes("gazette")) {
    return INDIAN_GOV_DOMAINS.gazette;
  }

  return undefined;
}

/**
 * Get expanded query variations for fallback search attempts
 */
function getExpandedQueries(q: string): string[] {
  const lowerQ = q.toLowerCase().trim();

  // Check if we have a predefined expansion
  for (const [pattern, expansions] of Object.entries(QUERY_EXPANSION_MAP)) {
    if (lowerQ.includes(pattern.toLowerCase())) {
      return expansions;
    }
  }

  // Generic fallback: remove quoted parts and try simpler versions
  const unquoted = lowerQ.replace(/["']/g, "");
  if (unquoted !== lowerQ) {
    return [unquoted];
  }

  // If query is very specific, try extracting key terms
  const words = lowerQ.split(/\s+/).filter((w) => w.length > 3);
  if (words.length > 2) {
    // Try combinations of key words
    return [
      words.slice(0, 2).join(" "),
      words[0],
    ];
  }

  return [];
}

export async function googleSearchWithFallback(
  q: string,
  page: number = 1,
  opts: GoogleSearchOpts = {},
): Promise<SearchFallbackResult> {
  const startedAt = Date.now();
  const retriedQueries: string[] = [];
  let fallbackApplied = false;

  try {
    // First attempt: original query
    log.info("search.fallback.attempt", {
      query: q,
      attempt: 1,
      type: "original",
      ms: Date.now() - startedAt,
    });

    const result = await googleSearch(q, page, opts);

    // If we got results, return them
    if (result.results.length > 0) {
      return {
        results: result.results,
        totalResults: result.totalResults,
        nextPage: result.nextPage,
        retriedQueries: [],
        fallbackApplied: false,
      };
    }

    log.info("search.fallback.noResults", {
      query: q,
      totalResults: result.totalResults,
      resultCount: result.results.length,
      ms: Date.now() - startedAt,
    });

    // No results with original query - try expanded variations
    const expandedQueries = getExpandedQueries(q);

    for (const expandedQ of expandedQueries) {
      if (!expandedQ || expandedQ === q) continue;

      retriedQueries.push(expandedQ);

      log.info("search.fallback.attempt", {
        query: expandedQ,
        originalQuery: q,
        attempt: retriedQueries.length + 1,
        type: "expanded",
        ms: Date.now() - startedAt,
      });

      try {
        const expandedResult = await googleSearch(expandedQ, page, opts);

        if (expandedResult.results.length > 0) {
          log.info("search.fallback.foundWithExpanded", {
            originalQuery: q,
            expandedQuery: expandedQ,
            resultCount: expandedResult.results.length,
            ms: Date.now() - startedAt,
          });

          return {
            results: expandedResult.results,
            totalResults: expandedResult.totalResults,
            nextPage: expandedResult.nextPage,
            retriedQueries,
            fallbackApplied: true,
          };
        }
      } catch (err) {
        log.warn("search.fallback.expandedFailed", {
          originalQuery: q,
          expandedQuery: expandedQ,
          error: String(err),
        });
      }
    }

    // Final fallback: try site-specific search for Indian government domains
    const relevantDomain = detectRelevantDomain(q);

    if (relevantDomain && !opts.site) {
      log.info("search.fallback.attempt", {
        query: q,
        site: relevantDomain,
        attempt: retriedQueries.length + 2,
        type: "govDomain",
        ms: Date.now() - startedAt,
      });

      try {
        const siteResult = await googleSearch(q, page, {
          ...opts,
          site: relevantDomain,
        });

        if (siteResult.results.length > 0) {
          log.info("search.fallback.foundWithGovDomain", {
            originalQuery: q,
            govDomain: relevantDomain,
            resultCount: siteResult.results.length,
            ms: Date.now() - startedAt,
          });

          retriedQueries.push(`site:${relevantDomain}`);

          return {
            results: siteResult.results,
            totalResults: siteResult.totalResults,
            nextPage: siteResult.nextPage,
            retriedQueries,
            fallbackApplied: true,
          };
        }
      } catch (err) {
        log.warn("search.fallback.govDomainFailed", {
          originalQuery: q,
          govDomain: relevantDomain,
          error: String(err),
        });
      }
    }

    // All fallbacks exhausted - return empty results with history
    log.warn("search.fallback.allExhausted", {
      originalQuery: q,
      retriedQueries,
      totalAttempts: retriedQueries.length + 1,
      ms: Date.now() - startedAt,
    });

    return {
      results: [],
      totalResults: 0,
      retriedQueries,
      fallbackApplied: true,
    };
  } catch (err) {
    log.error("search.fallback.criticalError", {
      query: q,
      error: String(err),
      ms: Date.now() - startedAt,
    });

    throw err;
  }
}
