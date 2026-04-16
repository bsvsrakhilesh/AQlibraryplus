import axios from "axios";
import { env } from "../config/env";

export type InstitutionalArticleInspection = {
  ok: true;
  enabled: boolean;
  reachable: boolean;
  nodeName: string | null;
  provider: string | null;
  finalUrl: string | null;
  sourceHost: string | null;
  sourceName: string | null;
  title: string | null;
  h1: string | null;
  canonicalUrl: string | null;
  author: string | null;
  publishedAt: string | null;
  snippet: string | null;
  textPreview: string | null;
  textLength: number;
  paywallDetected: boolean;
  paywallSignals: string[];
  isLikelyArticle: boolean;
  extractionConfidence: "high" | "medium" | "low";
  contentType: string | null;
  note: string | null;
  message: string | null;
};

type UpstreamInspection = Partial<InstitutionalArticleInspection> & {
  ok?: boolean;
  message?: string | null;
};

function icnBaseUrl(): string {
  return String(env.ICN_BASE_URL || "http://host.docker.internal:7081").replace(
    /\/+$/,
    "",
  );
}

function icnHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (env.ICN_SHARED_SECRET) {
    headers["x-icn-shared-secret"] = env.ICN_SHARED_SECRET;
  }
  return headers;
}

function upstreamErrorMessage(error: any, fallback: string): string {
  return error?.response?.data?.message || error?.message || fallback;
}

export type InstitutionalSessionLoginProvider =
  | "openathens"
  | "proquest"
  | "nexis"
  | "pressreader"
  | "custom";

export type InstitutionalNodeHealth = {
  ok: true;
  enabled: boolean;
  reachable: boolean;
  nodeName: string | null;
  browserReady: boolean;
  headlessDefault: boolean | null;
  lastLaunchAt: string | null;
  lastCaptureAt: string | null;
  lastLoginOpenedAt: string | null;
  browserChannel: string | null;
  message: string | null;
};

type UpstreamNodeHealth = Partial<InstitutionalNodeHealth> & {
  ok?: boolean;
  message?: string | null;
};

export async function getInstitutionalNodeHealthProxy(): Promise<InstitutionalNodeHealth> {
  if (!env.ICN_ENABLED) {
    return {
      ok: true,
      enabled: false,
      reachable: false,
      nodeName: null,
      browserReady: false,
      headlessDefault: null,
      lastLaunchAt: null,
      lastCaptureAt: null,
      lastLoginOpenedAt: null,
      browserChannel: null,
      message: "Institutional capture is disabled on the backend.",
    };
  }

  try {
    const res = await axios.get<UpstreamNodeHealth>(`${icnBaseUrl()}/health`, {
      timeout: env.ICN_TIMEOUT_MS,
      headers: icnHeaders(),
    });

    const data = res.data || {};

    return {
      ok: true,
      enabled: true,
      reachable: true,
      nodeName: data.nodeName ?? null,
      browserReady: Boolean(data.browserReady),
      headlessDefault:
        typeof data.headlessDefault === "boolean" ? data.headlessDefault : null,
      lastLaunchAt: data.lastLaunchAt ?? null,
      lastCaptureAt: data.lastCaptureAt ?? null,
      lastLoginOpenedAt: data.lastLoginOpenedAt ?? null,
      browserChannel:
        typeof data.browserChannel === "string" ? data.browserChannel : null,
      message: data.message ?? null,
    };
  } catch (error: any) {
    return {
      ok: true,
      enabled: true,
      reachable: false,
      nodeName: null,
      browserReady: false,
      headlessDefault: null,
      lastLaunchAt: null,
      lastCaptureAt: null,
      lastLoginOpenedAt: null,
      browserChannel: null,
      message: upstreamErrorMessage(
        error,
        "Could not read institutional node health.",
      ),
    };
  }
}

export type InstitutionalSessionStatus = {
  ok: true;
  enabled: boolean;
  reachable: boolean;
  authenticated: boolean;
  nodeName: string | null;
  pages: number;
  cookieCount: number;
  headless: boolean | null;
  providerHints: string[];
  lastLaunchAt: string | null;
  lastCaptureAt: string | null;
  lastLoginOpenedAt: string | null;
  message: string | null;
};

type UpstreamSessionStatus = Partial<InstitutionalSessionStatus> & {
  ok?: boolean;
  message?: string | null;
};

export async function getInstitutionalSessionStatusProxy(): Promise<InstitutionalSessionStatus> {
  if (!env.ICN_ENABLED) {
    return {
      ok: true,
      enabled: false,
      reachable: false,
      authenticated: false,
      nodeName: null,
      pages: 0,
      cookieCount: 0,
      headless: null,
      providerHints: [],
      lastLaunchAt: null,
      lastCaptureAt: null,
      lastLoginOpenedAt: null,
      message: "Institutional capture is disabled on the backend.",
    };
  }

  try {
    const res = await axios.get<UpstreamSessionStatus>(
      `${icnBaseUrl()}/session/status`,
      {
        timeout: env.ICN_TIMEOUT_MS,
        headers: icnHeaders(),
      },
    );

    const data = res.data || {};
    const cookieCount =
      typeof data.cookieCount === "number" ? data.cookieCount : 0;
    const providerHints = Array.isArray(data.providerHints)
      ? data.providerHints.filter(Boolean)
      : [];

    return {
      ok: true,
      enabled: true,
      reachable: true,
      authenticated: cookieCount > 0 || providerHints.length > 0,
      nodeName: data.nodeName ?? null,
      pages: typeof data.pages === "number" ? data.pages : 0,
      cookieCount,
      headless: typeof data.headless === "boolean" ? data.headless : null,
      providerHints,
      lastLaunchAt: data.lastLaunchAt ?? null,
      lastCaptureAt: data.lastCaptureAt ?? null,
      lastLoginOpenedAt: data.lastLoginOpenedAt ?? null,
      message: data.message ?? null,
    };
  } catch (error: any) {
    return {
      ok: true,
      enabled: true,
      reachable: false,
      authenticated: false,
      nodeName: null,
      pages: 0,
      cookieCount: 0,
      headless: null,
      providerHints: [],
      lastLaunchAt: null,
      lastCaptureAt: null,
      lastLoginOpenedAt: null,
      message: upstreamErrorMessage(
        error,
        "Could not read institutional session status.",
      ),
    };
  }
}

export type InstitutionalOpenLoginResult = {
  ok: true;
  enabled: boolean;
  reachable: boolean;
  nodeName: string | null;
  message: string | null;
  startUrl: string | null;
  browserChannel: string | null;
};

type UpstreamOpenLoginResult = Partial<InstitutionalOpenLoginResult> & {
  ok?: boolean;
  message?: string | null;
};

export async function openInstitutionalLoginProxy(input: {
  provider?: InstitutionalSessionLoginProvider;
  url?: string | null;
}): Promise<InstitutionalOpenLoginResult> {
  if (!env.ICN_ENABLED) {
    return {
      ok: true,
      enabled: false,
      reachable: false,
      nodeName: null,
      message: "Institutional capture is disabled on the backend.",
      startUrl: null,
      browserChannel: null,
    };
  }

  try {
    const res = await axios.post<UpstreamOpenLoginResult>(
      `${icnBaseUrl()}/session/open-login`,
      {
        provider: input.provider,
        url: input.url ?? null,
      },
      {
        timeout: env.ICN_TIMEOUT_MS,
        headers: {
          ...icnHeaders(),
          "Content-Type": "application/json",
        },
      },
    );

    const data = res.data || {};

    return {
      ok: true,
      enabled: true,
      reachable: true,
      nodeName: data.nodeName ?? null,
      message: data.message ?? null,
      startUrl: data.startUrl ?? null,
      browserChannel: data.browserChannel ?? null,
    };
  } catch (error: any) {
    return {
      ok: true,
      enabled: true,
      reachable: false,
      nodeName: null,
      message: upstreamErrorMessage(
        error,
        "Could not open institutional login window.",
      ),
      startUrl: null,
      browserChannel: null,
    };
  }
}

export async function inspectInstitutionalArticleProxy(input: {
  url: string;
}): Promise<InstitutionalArticleInspection> {
  if (!env.ICN_ENABLED) {
    return {
      ok: true,
      enabled: false,
      reachable: false,
      nodeName: null,
      provider: null,
      finalUrl: null,
      sourceHost: null,
      sourceName: null,
      title: null,
      h1: null,
      canonicalUrl: null,
      author: null,
      publishedAt: null,
      snippet: null,
      textPreview: null,
      textLength: 0,
      paywallDetected: false,
      paywallSignals: [],
      isLikelyArticle: false,
      extractionConfidence: "low",
      contentType: null,
      note: null,
      message: "Institutional capture is disabled on the backend.",
    };
  }

  try {
    const res = await axios.post<UpstreamInspection>(
      `${icnBaseUrl()}/inspect/article`,
      { url: input.url },
      {
        timeout: env.ICN_TIMEOUT_MS,
        headers: {
          ...icnHeaders(),
          "Content-Type": "application/json",
        },
      },
    );

    const data = res.data || {};

    return {
      ok: true,
      enabled: true,
      reachable: true,
      nodeName: data.nodeName ?? null,
      provider: data.provider ?? null,
      finalUrl: data.finalUrl ?? null,
      sourceHost: data.sourceHost ?? null,
      sourceName: data.sourceName ?? null,
      title: data.title ?? null,
      h1: data.h1 ?? null,
      canonicalUrl: data.canonicalUrl ?? null,
      author: data.author ?? null,
      publishedAt: data.publishedAt ?? null,
      snippet: data.snippet ?? null,
      textPreview: data.textPreview ?? null,
      textLength: typeof data.textLength === "number" ? data.textLength : 0,
      paywallDetected: Boolean(data.paywallDetected),
      paywallSignals: Array.isArray(data.paywallSignals)
        ? data.paywallSignals.filter(Boolean)
        : [],
      isLikelyArticle: Boolean(data.isLikelyArticle),
      extractionConfidence:
        data.extractionConfidence === "high" ||
        data.extractionConfidence === "medium" ||
        data.extractionConfidence === "low"
          ? data.extractionConfidence
          : "low",
      contentType: data.contentType ?? null,
      note: data.note ?? null,
      message: data.message ?? null,
    };
  } catch (error: any) {
    return {
      ok: true,
      enabled: true,
      reachable: false,
      nodeName: null,
      provider: null,
      finalUrl: null,
      sourceHost: null,
      sourceName: null,
      title: null,
      h1: null,
      canonicalUrl: null,
      author: null,
      publishedAt: null,
      snippet: null,
      textPreview: null,
      textLength: 0,
      paywallDetected: false,
      paywallSignals: [],
      isLikelyArticle: false,
      extractionConfidence: "low",
      contentType: null,
      note: null,
      message: upstreamErrorMessage(
        error,
        "Could not inspect the article through the institutional node.",
      ),
    };
  }
}

export type InstitutionalFallbackProvider =
  | "pressreader"
  | "proquest"
  | "nexis";

export type InstitutionalFallbackCandidate = {
  provider: InstitutionalFallbackProvider;
  query: string;
  rank: number;
  title: string | null;
  url: string | null;
  snippet: string | null;
  sourceName: string | null;
  publishedAt: string | null;
  score: number;
  scoreBreakdown: {
    title: number;
    source: number;
    date: number;
    snippet: number;
  };
  matchedBy: string[];
};

export type InstitutionalFallbackProviderDebug = {
  provider: InstitutionalFallbackProvider;
  startUrl: string;
  attempts: Array<{
    query: string;
    inputFound: boolean;
    submitted: boolean;
    startUrl: string;
    resultUrl: string | null;
    pageTitle: string | null;
    anchorCount: number;
    rawCandidateCount: number;
    notes: string[];
  }>;
  notes: string[];
};

export type InstitutionalFallbackSearchResult = {
  ok: true;
  enabled: boolean;
  reachable: boolean;
  nodeName: string | null;
  originalUrl: string;
  inspection: InstitutionalArticleInspection | null;
  searchedProviders: InstitutionalFallbackProvider[];
  queryVariants: string[];
  candidates: InstitutionalFallbackCandidate[];
  bestCandidate: InstitutionalFallbackCandidate | null;
  debug: InstitutionalFallbackProviderDebug[];
  note: string | null;
  message: string | null;
};

type UpstreamFallbackSearch = Partial<InstitutionalFallbackSearchResult> & {
  ok?: boolean;
  message?: string | null;
};

export async function searchInstitutionalArticleFallbackProxy(input: {
  url: string;
  providerOrder?: InstitutionalFallbackProvider[];
  maxCandidates?: number;
}): Promise<InstitutionalFallbackSearchResult> {
  if (!env.ICN_ENABLED) {
    return {
      ok: true,
      enabled: false,
      reachable: false,
      nodeName: null,
      originalUrl: input.url,
      inspection: null,
      searchedProviders: [],
      queryVariants: [],
      candidates: [],
      bestCandidate: null,
      debug: [],
      note: null,
      message: "Institutional capture is disabled on the backend.",
    };
  }

  try {
    const res = await axios.post<UpstreamFallbackSearch>(
      `${icnBaseUrl()}/search/fallback/article`,
      {
        url: input.url,
        providerOrder: input.providerOrder,
        maxCandidates: input.maxCandidates,
      },
      {
        timeout: env.ICN_TIMEOUT_MS,
        headers: {
          ...icnHeaders(),
          "Content-Type": "application/json",
        },
      },
    );

    const data = res.data || {};

    return {
      ok: true,
      enabled: true,
      reachable: true,
      nodeName: data.nodeName ?? null,
      originalUrl: data.originalUrl ?? input.url,
      inspection: data.inspection ?? null,
      searchedProviders: Array.isArray(data.searchedProviders)
        ? (data.searchedProviders.filter(
            Boolean,
          ) as InstitutionalFallbackProvider[])
        : [],
      queryVariants: Array.isArray(data.queryVariants)
        ? data.queryVariants.filter(Boolean)
        : [],
      candidates: Array.isArray(data.candidates)
        ? (data.candidates as InstitutionalFallbackCandidate[])
        : [],
      bestCandidate: data.bestCandidate ?? null,
      debug: Array.isArray((data as any).debug)
        ? ((data as any).debug as InstitutionalFallbackProviderDebug[])
        : [],
      note: data.note ?? null,
      message: data.message ?? null,
    };
  } catch (error: any) {
    return {
      ok: true,
      enabled: true,
      reachable: false,
      nodeName: null,
      originalUrl: input.url,
      inspection: null,
      searchedProviders: [],
      queryVariants: [],
      candidates: [],
      bestCandidate: null,
      debug: [],
      note: null,
      message: upstreamErrorMessage(
        error,
        "Could not run the institutional fallback search.",
      ),
    };
  }
}
