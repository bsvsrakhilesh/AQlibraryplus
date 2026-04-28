import prisma from "../config/database";
import { TaggingStatus } from "../generated/prisma/client";
import {
  syncGovernanceForStoredFileTx,
  syncGovernanceForUrlTx,
} from "./governanceGraphSync.service";
import {
  deriveSeparatedTags,
  mergeUniqueTags,
  normalizeTagList,
  withSeparatedTagsMeta,
} from "../utils/tagBuckets";
import { extractUrlMetadata } from "./extract.service";

const TOPK = Number(process.env.TAGS_TOPK || 10);
const USE_LLM = (process.env.TAGS_USE_LLM || "true").toLowerCase() === "true";

type AiTagObject = {
  value: string;
  display: string;
  type: string;
  source: string;
  confidence: number | null;
  evidence: string | null;
  locator: Record<string, any> | null;
  rank?: number;
};

const SMART_TAG_ARRAY_KEYS = [
  "taxonomyTags",
  "aiDiscoveredTags",
  "topics",
  "documentType",
  "actionsDecisions",
  "taxonomySuggestions",
] as const;

const SMART_TAG_ENTITY_KEYS = [
  "agencies",
  "organizations",
  "locations",
  "people",
  "legalReferences",
  "schemesPrograms",
  "datesDeadlines",
] as const;

function cleanString(value: unknown, max = 500): string | null {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.slice(0, max);
}

function cleanConfidence(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(1, num));
}

function cleanLocator(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, any>;
}

function displayFromValue(value: string) {
  const map: Record<string, string> = {
    construction_demolition: "C&D",
    waste_burning: "Waste burning",
    biomass_burning: "Biomass burning",
    industry_power: "Industry & power",
    dg_sets: "DG sets",
    office_memorandum: "Office memorandum",
    sop_guideline: "SOP / Guideline",
    pm25: "PM2.5",
    pm10: "PM10",
    no2: "NO2",
    o3: "O3",
    co: "CO",
    grap: "GRAP",
  };
  return map[value] ?? value.replace(/_/g, " ");
}

function normalizeAiTagObjects(data: any, aiTags: string[]): AiTagObject[] {
  const rawDetails = Array.isArray(data?.tag_details)
    ? data.tag_details
    : Array.isArray(data?.tagDetails)
      ? data.tagDetails
      : [];

  const out: AiTagObject[] = [];
  const seen = new Set<string>();

  function add(raw: any, fallbackRank?: number) {
    const value = cleanString(raw?.value ?? raw?.tag ?? raw, 160);
    if (!value) return;

    const type = cleanString(raw?.type, 80) ?? "keyword";
    const key = `${type}:${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);

    const rankRaw = Number(raw?.rank ?? fallbackRank);
    const rank = Number.isInteger(rankRaw) && rankRaw > 0 ? rankRaw : undefined;

    out.push({
      value,
      display: cleanString(raw?.display, 180) ?? displayFromValue(value),
      type,
      source: cleanString(raw?.source, 120) ?? "tagger",
      confidence: cleanConfidence(raw?.confidence ?? raw?.score),
      evidence: cleanString(raw?.evidence, 1200),
      locator: cleanLocator(raw?.locator),
      ...(rank ? { rank } : {}),
    });
  }

  rawDetails.forEach((raw: any) => add(raw));
  aiTags.forEach((tag, idx) =>
    add(
      {
        value: tag,
        type: "keyword",
        source: "legacy_tags",
        confidence: 0.5,
      },
      idx + 1,
    ),
  );

  return out.slice(0, 100);
}

function confidenceBand(value: unknown): "high" | "medium" | "low" {
  const score = cleanConfidence(value) ?? 0;
  if (score >= 0.85) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

function normalizeSmartTagEvidence(value: unknown): any[] {
  const arr = Array.isArray(value) ? value : value ? [value] : [];

  return arr
    .map((raw) => {
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const quote = cleanString((raw as any).quote ?? (raw as any).evidence, 1200);
        if (!quote) return null;

        const pageRaw = Number((raw as any).page);
        return {
          quote,
          ...(Number.isFinite(pageRaw) ? { page: pageRaw } : {}),
          ...((raw as any).section
            ? { section: cleanString((raw as any).section, 180) }
            : {}),
          ...((raw as any).locator && typeof (raw as any).locator === "object"
            ? { locator: (raw as any).locator }
            : {}),
        };
      }

      const quote = cleanString(raw, 1200);
      return quote ? { quote } : null;
    })
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeSmartTagItem(raw: any, fallbackCategory?: string) {
  const value = cleanString(raw?.value ?? raw?.tag ?? raw, 160);
  if (!value) return null;

  const category = cleanString(raw?.category ?? fallbackCategory, 80) ?? "AI-Discovered Tags";
  const type = cleanString(raw?.type, 80) ?? "keyword";
  const source = cleanString(raw?.source, 120) ?? "tagger";
  const confidence = cleanConfidence(raw?.confidence ?? raw?.score);

  return {
    value,
    category,
    type,
    source,
    confidence,
    confidenceBand: cleanString(raw?.confidenceBand, 20) ?? confidenceBand(confidence),
    matchedTaxonomy: cleanString(raw?.matchedTaxonomy, 160),
    status: cleanString(raw?.status, 80) ?? "suggested",
    evidence: normalizeSmartTagEvidence(raw?.evidence),
  };
}

function normalizeSmartTagArray(value: unknown, fallbackCategory: string) {
  if (!Array.isArray(value)) return [];

  const out: any[] = [];
  const seen = new Set<string>();

  for (const raw of value) {
    const item = normalizeSmartTagItem(raw, fallbackCategory);
    if (!item) continue;

    const key = `${item.category}:${item.type}:${item.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out.slice(0, 80);
}

function normalizeSmartTags(data: any, userTags: string[]) {
  const raw = data?.smart_tags ?? data?.smartTags ?? null;
  const hasRaw = raw && typeof raw === "object" && !Array.isArray(raw);

  if (!hasRaw && userTags.length === 0) return null;

  const src = hasRaw ? raw : {};
  const out: Record<string, any> = {
    profile: "smart_tags",
    version: Number(src.version ?? 1) || 1,
  };

  for (const key of SMART_TAG_ARRAY_KEYS) {
    const fallbackCategory =
      key === "taxonomyTags"
        ? "Taxonomy Tags"
        : key === "aiDiscoveredTags" || key === "taxonomySuggestions"
          ? "AI-Discovered Tags"
          : key === "topics"
            ? "Topics"
            : key === "documentType"
              ? "Document Type"
              : "Actions / Decisions";
    out[key] = normalizeSmartTagArray(src[key], fallbackCategory);
  }

  out.entities = {};
  const rawEntities =
    src.entities && typeof src.entities === "object" && !Array.isArray(src.entities)
      ? src.entities
      : {};

  for (const key of SMART_TAG_ENTITY_KEYS) {
    out.entities[key] = normalizeSmartTagArray(rawEntities[key], "Entities");
  }

  out.userTags = userTags.map((tag) => ({
    value: tag,
    category: "User Tags",
    type: "manual",
    source: "user",
    confidence: null,
    confidenceBand: "high",
    matchedTaxonomy: null,
    status: "user_added",
    evidence: [],
  }));

  const fromItems = normalizeSmartTagArray(src.items, "AI-Discovered Tags");
  const flattened = [
    ...out.taxonomyTags,
    ...out.aiDiscoveredTags,
    ...out.topics,
    ...Object.values(out.entities).flatMap((items: any) =>
      Array.isArray(items) ? items : [],
    ),
    ...out.documentType,
    ...out.actionsDecisions,
    ...out.userTags,
  ];

  out.items = (fromItems.length ? fromItems : flattened).slice(0, 160);
  return out;
}

function parseStructuredDate(value: unknown): Date | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);

    if (year < 100) year += year >= 70 ? 1900 : 2000;

    const dt = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}

function derivePublishedAtFromAiTaggerPayload(data: any): Date | null {
  const candidates = Array.isArray(data?.structured?.entities?.dates)
    ? data.structured.entities.dates
    : [];

  for (const candidate of candidates) {
    const parsed = parseStructuredDate(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function buildUnifiedTagsMeta(
  prev: any,
  args: {
    jobId: string;
    data: any;
    userTags: string[];
    aiTags: string[];
  },
) {
  const seeded = withSeparatedTagsMeta(prev, {
    userTags: args.userTags,
    aiTags: args.aiTags,
  });

  const p: Record<string, any> =
    seeded && typeof seeded === "object" ? (seeded as Record<string, any>) : {};

  const prevTagger: Record<string, any> =
    p.tagger && typeof p.tagger === "object"
      ? (p.tagger as Record<string, any>)
      : {};

  const prevAiTagger: Record<string, any> =
    p.aiTagger && typeof p.aiTagger === "object"
      ? (p.aiTagger as Record<string, any>)
      : {};

  const data = args.data;
  const phrases = Array.isArray(data?.phrases) ? data.phrases : [];
  const unigrams = Array.isArray(data?.unigrams) ? data.unigrams : [];
  const structured = data?.structured ?? null;
  const governance = data?.governance ?? null;
  const extraction = data?.extraction ?? null;
  const hash = data?.hash ?? null;
  const aiTagObjects = normalizeAiTagObjects(data, args.aiTags);
  const smartTags = normalizeSmartTags(data, args.userTags);

  return {
    ...p,
    tagger: {
      ...prevTagger,
      schemaVersion: 2,
      phrases,
      unigrams,
      aiTags: args.aiTags,
      aiTagObjects,
      smartTags,
      structured,
      governance,
      extraction,
      topk: TOPK,
      use_llm: USE_LLM,
      jobId: args.jobId,
      updatedAt: new Date().toISOString(),
      normalizedTextSha256: hash ?? null,
      normalizedTextHashAlgorithm: hash ? "sha256" : null,
      structuredLlmUsed: data?.structured_llm_used ?? false,
      structuredLlmModel: data?.structured_llm_model ?? null,
      governanceLlmUsed: data?.governance_llm_used ?? false,
      governanceLlmModel: data?.governance_llm_model ?? null,
    },
    aiTagger: {
      ...prevAiTagger,
      schemaVersion: 2,
      tags: args.aiTags,
      tagObjects: aiTagObjects,
      smartTags,
      phrases,
      unigrams,
      structured,
      governance,
    },
  };
}

function getFailureMessage(data: any) {
  return String(
    data?.error || data?.message || "Unknown ai-tagger failure",
  ).slice(0, 500);
}

export async function persistAiTagFailureForFile(
  fileId: string,
  jobId: string,
  data: any,
) {
  await prisma.storedFile.updateMany({
    where: {
      id: fileId,
      taggingJobId: jobId,
    },
    data: {
      taggingStatus: TaggingStatus.FAILED,
      taggingJobId: null,
      taggingError: getFailureMessage(data),
    },
  });
}

export async function persistAiTagFailureForUrl(
  urlId: number,
  jobId: string,
  data: any,
) {
  await prisma.url.updateMany({
    where: {
      id: urlId,
      taggingJobId: jobId,
    },
    data: {
      taggingStatus: TaggingStatus.FAILED,
      taggingJobId: null,
      taggingError: getFailureMessage(data),
    },
  });
}

export async function persistAiTagSuccessForFile(
  fileId: string,
  jobId: string,
  data: any,
) {
  const latest = await prisma.storedFile.findFirst({
    where: {
      id: fileId,
      taggingJobId: jobId,
    },
    select: {
      id: true,
      tags: true,
      tagsMeta: true,
      sourcePublishedAt: true,
    },
  });

  if (!latest) {
    return {
      applied: false as const,
      tags: [] as string[],
      userTags: [] as string[],
      aiTags: [] as string[],
    };
  }

  const aiTags = normalizeTagList(data?.tags);
  const currentTagState = deriveSeparatedTags(latest.tags, latest.tagsMeta);
  const userTags = currentTagState.userTags;
  const effectiveTags = mergeUniqueTags(userTags, aiTags);

  const governance = data?.governance ?? null;
  const structuredPublishedAt = derivePublishedAtFromAiTaggerPayload(data);

  await prisma.$transaction(async (tx) => {
    await tx.storedFile.update({
      where: { id: fileId },
      data: {
        tags: { set: effectiveTags },
        contentHash: data?.hash ?? null,
        taggerVersion: data?.tagger_version ?? null,
        sourcePublishedAt:
          latest.sourcePublishedAt ?? structuredPublishedAt ?? null,
        tagsMeta: buildUnifiedTagsMeta(latest.tagsMeta, {
          jobId,
          data,
          userTags,
          aiTags,
        }) as any,
        taggingStatus: TaggingStatus.SUCCESS,
        taggingJobId: null,
        taggingError: null,
      },
    });

    await tx.documentRevision.updateMany({
      where: { storedFileId: fileId },
      data: {
        contentHash: data?.hash ?? null,
      },
    });

    await syncGovernanceForStoredFileTx(tx, fileId, {
      governance,
      taggerVersion: data?.tagger_version ?? null,
      llmModel: data?.governance_llm_model ?? null,
    });
  });

  return {
    applied: true as const,
    tags: effectiveTags,
    userTags,
    aiTags,
  };
}

export async function persistAiTagSuccessForUrl(
  urlId: number,
  jobId: string,
  data: any,
) {
  const latest = await prisma.url.findFirst({
    where: {
      id: urlId,
      taggingJobId: jobId,
    },
    select: {
      id: true,
      url: true,
      tags: true,
      tagsMeta: true,
      publishedAt: true,
      authors: true,
    },
  });

  if (!latest) {
    return {
      applied: false as const,
      tags: [] as string[],
      userTags: [] as string[],
      aiTags: [] as string[],
    };
  }

  const aiTags = normalizeTagList(data?.tags);
  const currentTagState = deriveSeparatedTags(latest.tags, latest.tagsMeta);
  const userTags = currentTagState.userTags;
  const effectiveTags = mergeUniqueTags(userTags, aiTags);

  const governance = data?.governance ?? null;
  const structuredPublishedAt = derivePublishedAtFromAiTaggerPayload(data);
  let extractedMeta: Awaited<ReturnType<typeof extractUrlMetadata>> | null =
    null;

  if (!latest.publishedAt || latest.authors.length === 0) {
    try {
      extractedMeta = await extractUrlMetadata(latest.url);
    } catch {
      extractedMeta = null;
    }
  }

  const extractedPublishedAt = extractedMeta?.publishedAt ?? null;
  const nextPublishedAt =
    latest.publishedAt ?? extractedPublishedAt ?? structuredPublishedAt ?? null;
  const nextAuthors = latest.authors.length
    ? latest.authors
    : (extractedMeta?.authors ?? []);

  const nextTagsMeta: any = buildUnifiedTagsMeta(latest.tagsMeta, {
    jobId,
    data,
    userTags,
    aiTags,
  });

  if (!latest.publishedAt && extractedPublishedAt && extractedMeta) {
    nextTagsMeta.publishedAtMeta = extractedMeta.publishedAtMeta;
  } else if (!latest.publishedAt && structuredPublishedAt) {
    nextTagsMeta.publishedAtMeta = {
      source: "ai_tagger_structured",
      confidence: 0.5,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.url.update({
      where: { id: urlId },
      data: {
        tags: { set: effectiveTags },
        contentHash: data?.hash ?? null,
        taggerVersion: data?.tagger_version ?? null,
        ...(nextPublishedAt ? { publishedAt: nextPublishedAt } : {}),
        authors: nextAuthors,
        tagsMeta: nextTagsMeta as any,
        taggingStatus: TaggingStatus.SUCCESS,
        taggingJobId: null,
        taggingError: null,
      },
    });

    await syncGovernanceForUrlTx(tx, urlId, {
      governance,
      taggerVersion: data?.tagger_version ?? null,
      llmModel: data?.governance_llm_model ?? null,
    });
  });

  return {
    applied: true as const,
    tags: effectiveTags,
    userTags,
    aiTags,
  };
}
