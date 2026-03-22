export type ReviewStampMap = Record<string, string>;

export function loadReviewStampMap(storageKey: string): ReviewStampMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveReviewStampMap(
  storageKey: string,
  reviewMap: ReviewStampMap,
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(reviewMap));
  } catch {}
}

export function markReviewedEntries(
  prev: ReviewStampMap,
  ids: string[],
  reviewedAt = new Date().toISOString(),
): ReviewStampMap {
  const next = { ...prev };
  for (const id of ids) {
    next[String(id)] = reviewedAt;
  }
  return next;
}

export function isUpdatedSinceReview(
  updatedAt?: string | null,
  reviewedAt?: string | null,
) {
  if (!updatedAt) return false;
  if (!reviewedAt) return true;

  const updatedMs = new Date(updatedAt).getTime();
  const reviewedMs = new Date(reviewedAt).getTime();

  if (!Number.isFinite(updatedMs) || !Number.isFinite(reviewedMs)) return true;
  return updatedMs > reviewedMs;
}
