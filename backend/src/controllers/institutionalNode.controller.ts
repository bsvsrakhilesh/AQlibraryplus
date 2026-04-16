import type { Request, Response } from "express";
import {
  getInstitutionalNodeHealthProxy,
  getInstitutionalSessionStatusProxy,
  inspectInstitutionalArticleProxy,
  openInstitutionalLoginProxy,
  searchInstitutionalArticleFallbackProxy,
} from "../services/institutionalNode.service";
import { log, requestMeta } from "../utils/logger";

export async function institutionalNodeHealthHandler(
  req: Request,
  res: Response,
) {
  const data = await getInstitutionalNodeHealthProxy();

  log.info("institutional_node_health_checked", {
    ...requestMeta(req),
    enabled: data.enabled,
    reachable: data.reachable,
    nodeName: data.nodeName,
    browserReady: data.browserReady,
  });

  return res.json(data);
}

export async function institutionalSessionStatusHandler(
  req: Request,
  res: Response,
) {
  const data = await getInstitutionalSessionStatusProxy();

  log.info("institutional_session_status_checked", {
    ...requestMeta(req),
    enabled: data.enabled,
    reachable: data.reachable,
    authenticated: data.authenticated,
    nodeName: data.nodeName,
    cookieCount: data.cookieCount,
    providerHints: data.providerHints,
  });

  return res.json(data);
}

export async function institutionalOpenLoginHandler(
  req: Request,
  res: Response,
) {
  const data = await openInstitutionalLoginProxy(req.body || {});

  log.info("institutional_open_login_requested", {
    ...requestMeta(req),
    provider: req.body?.provider ?? null,
    url: req.body?.url ?? null,
    enabled: data.enabled,
    reachable: data.reachable,
    nodeName: data.nodeName,
    browserChannel: data.browserChannel,
  });

  return res.json(data);
}

export async function institutionalInspectArticleHandler(
  req: Request,
  res: Response,
) {
  const data = await inspectInstitutionalArticleProxy(req.body || {});

  log.info("institutional_article_inspected", {
    ...requestMeta(req),
    url: req.body?.url ?? null,
    reachable: data.reachable,
    paywallDetected: data.paywallDetected,
    isLikelyArticle: data.isLikelyArticle,
    provider: data.provider,
    sourceHost: data.sourceHost,
  });

  return res.json(data);
}

export async function institutionalFallbackSearchHandler(
  req: Request,
  res: Response,
) {
  const data = await searchInstitutionalArticleFallbackProxy(req.body || {});

  log.info("institutional_fallback_search_completed", {
    ...requestMeta(req),
    url: req.body?.url ?? null,
    reachable: data.reachable,
    searchedProviders: data.searchedProviders,
    candidateCount: data.candidates.length,
    bestProvider: data.bestCandidate?.provider ?? null,
    bestScore: data.bestCandidate?.score ?? null,
  });

  return res.json(data);
}
