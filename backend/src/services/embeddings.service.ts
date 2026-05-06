// backend/src/services/embeddings.service.ts
import { env } from "../config/env";
import { openaiClient } from "./openaiClient";

export const DEFAULT_EMBEDDING_MODEL = env.EMBEDDING_MODEL;
export const EMBEDDING_DIM = env.EMBEDDING_DIMENSIONS;

export type EmbeddingConfig = {
  model: string;
  dimensions: number;
  batchSize: number;
  maxRetries: number;
  retryBaseMs: number;
};

export type EmbeddingBatchProgress = {
  batchIndex: number;
  batchCount: number;
  startIndex: number;
  endIndex: number;
  itemCount: number;
  charCount: number;
  model: string;
  dimensions: number;
};

function cleanInput(s: string) {
  return (s ?? "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

export function getEmbeddingConfig(): EmbeddingConfig {
  const model = String(env.EMBEDDING_MODEL || "text-embedding-3-small").trim();
  const dimensions = Number(env.EMBEDDING_DIMENSIONS || 1536);
  const batchSize = Number(env.EMBEDDING_BATCH_SIZE || 96);
  const maxRetries = Number(env.EMBEDDING_MAX_RETRIES || 3);
  const retryBaseMs = Number(env.EMBEDDING_RETRY_BASE_MS || 750);

  if (!model) throw new Error("EMBEDDING_MODEL is required.");
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error("EMBEDDING_DIMENSIONS must be a positive integer.");
  }
  if (!Number.isInteger(batchSize) || batchSize <= 0 || batchSize > 2048) {
    throw new Error("EMBEDDING_BATCH_SIZE must be between 1 and 2048.");
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 10) {
    throw new Error("EMBEDDING_MAX_RETRIES must be between 0 and 10.");
  }

  if (model === "text-embedding-3-small" && dimensions > 1536) {
    throw new Error(
      "text-embedding-3-small supports at most 1536 dimensions.",
    );
  }
  if (model === "text-embedding-3-large" && dimensions > 3072) {
    throw new Error(
      "text-embedding-3-large supports at most 3072 dimensions.",
    );
  }

  return { model, dimensions, batchSize, maxRetries, retryBaseMs };
}

export function embeddingModelLabel(config: EmbeddingConfig = getEmbeddingConfig()) {
  return `${config.model}@${config.dimensions}`;
}

export function toPgVectorLiteral(vec: number[]) {
  const expected = getEmbeddingConfig().dimensions;
  if (!Array.isArray(vec) || vec.length !== expected) {
    throw new Error(
      `Embedding dim mismatch: expected ${expected}, got ${vec?.length ?? 0}`,
    );
  }
  return `[${vec.join(",")}]`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function classifyEmbeddingError(error: unknown) {
  const e = error as any;
  const status = Number(e?.status ?? e?.statusCode ?? e?.response?.status ?? 0);
  const code = String(e?.code ?? e?.error?.code ?? "").toLowerCase();
  const message = String(e?.message ?? "");

  if (status === 429 || code.includes("rate")) return "rate_limited";
  if ([408, 409, 425, 500, 502, 503, 504].includes(status)) {
    return "retryable_upstream";
  }
  if (/timeout|etimedout|econnreset|network/i.test(message)) {
    return "retryable_network";
  }
  if (status >= 400 && status < 500) return "non_retryable_request";
  return "unknown";
}

function isRetryableEmbeddingError(error: unknown) {
  const category = classifyEmbeddingError(error);
  return (
    category === "rate_limited" ||
    category === "retryable_upstream" ||
    category === "retryable_network"
  );
}

async function createEmbeddingBatch(
  input: string[],
  config: EmbeddingConfig,
): Promise<number[][]> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    try {
      const resp = await openaiClient().embeddings.create({
        model: config.model,
        input,
        dimensions: config.dimensions,
      });

      return resp.data.map((item) => item.embedding as number[]);
    } catch (error) {
      lastError = error;
      if (attempt >= config.maxRetries || !isRetryableEmbeddingError(error)) {
        throw error;
      }
      const delay = config.retryBaseMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function embedTexts(
  texts: string[],
  model: string = DEFAULT_EMBEDDING_MODEL,
  opts?: {
    dimensions?: number;
    batchSize?: number;
    onBatchStart?: (progress: EmbeddingBatchProgress) => void | Promise<void>;
    onBatchComplete?: (progress: EmbeddingBatchProgress) => void | Promise<void>;
  },
): Promise<number[][]> {
  if (!env.OPENAI_ENABLED) return [];
  if (!texts?.length) return [];

  const base = getEmbeddingConfig();
  const config: EmbeddingConfig = {
    ...base,
    model,
    dimensions: opts?.dimensions ?? base.dimensions,
    batchSize: opts?.batchSize ?? base.batchSize,
  };

  const cleaned = texts.map(cleanInput);
  const out: number[][] = [];
  const batchCount = Math.ceil(cleaned.length / config.batchSize);

  for (let i = 0; i < cleaned.length; i += config.batchSize) {
    const batch = cleaned.slice(i, i + config.batchSize);
    const progress: EmbeddingBatchProgress = {
      batchIndex: Math.floor(i / config.batchSize) + 1,
      batchCount,
      startIndex: i,
      endIndex: i + batch.length - 1,
      itemCount: batch.length,
      charCount: batch.reduce((sum, text) => sum + text.length, 0),
      model: config.model,
      dimensions: config.dimensions,
    };

    await opts?.onBatchStart?.(progress);
    const embeddings = await createEmbeddingBatch(batch, config);
    out.push(...embeddings);
    await opts?.onBatchComplete?.(progress);
  }

  return out;
}

export async function embedQuery(
  query: string,
  model: string = DEFAULT_EMBEDDING_MODEL,
): Promise<number[] | null> {
  if (!env.OPENAI_ENABLED) return null;

  const q = cleanInput(query);
  if (!q) return null;

  const config = getEmbeddingConfig();
  const resp = await openaiClient().embeddings.create({
    model,
    input: q,
    dimensions: config.dimensions,
  });

  const emb = resp.data?.[0]?.embedding as number[] | undefined;
  if (!emb) return null;
  return emb;
}
