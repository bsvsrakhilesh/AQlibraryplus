import { Collection } from "../lib/types";
import { canonicalize } from "./saved";
import {
  createCollectionApi,
  deleteCollectionApi,
  fetchCollections,
  fetchCollectionsUrlMap,
  renameCollectionApi,
  setCollectionsForUrlApi,
} from "../lib/api";

// These localStorage keys stay the same so existing UI code keeps working.
const COLLECTIONS_KEY = "collections";
const URL_COLLECTIONS_KEY = "urlCollectionsByUrl";

// Debounced refresh to keep backend as source-of-truth without spamming requests
let hydrateTimer: any = null;

function scheduleHydrate(delayMs = 350) {
  if (hydrateTimer) clearTimeout(hydrateTimer);
  hydrateTimer = setTimeout(() => {
    hydrateCollectionsFromBackend().catch(() => {});
  }, delayMs);
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function genId(): string {
  return "c_" + Math.random().toString(36).slice(2, 10);
}

function ensureDefaultLocalCollection() {
  const cols = readJSON<Collection[]>(COLLECTIONS_KEY, []);
  if (cols.length > 0) return;
  const def: Collection = {
    id: "c_general",
    name: "General",
    ownerId: "local",
    createdAt: new Date().toISOString(),
    visibility: "private",
  };
  writeJSON(COLLECTIONS_KEY, [def]);
}

/**
 * Backend-backed hydration:
 * - Fetch collections + url-map from backend
 * - Write them into the same localStorage keys used by the UI
 *
 * Call once on app start (App.tsx useEffect).
 */
export async function hydrateCollectionsFromBackend(): Promise<void> {
  ensureDefaultLocalCollection();
  try {
    const [cols, mapRes] = await Promise.all([
      fetchCollections(),
      fetchCollectionsUrlMap(),
    ]);

    // If backend has no collections yet, seed with the local default (stable id)
    if (cols.length === 0) {
      const local = readJSON<Collection[]>(COLLECTIONS_KEY, []);
      const def = local.find((c) => c.id === "c_general") || local[0];
      if (def) {
        await createCollectionApi({
          id: def.id,
          name: def.name,
          visibility: def.visibility,
        });
      }
      // re-fetch
      const nextCols = await fetchCollections();
      writeJSON(COLLECTIONS_KEY, nextCols as any);
    } else {
      writeJSON(COLLECTIONS_KEY, cols as any);
    }

    writeJSON(URL_COLLECTIONS_KEY, mapRes.map);
  } catch (e) {
    // Offline / backend unavailable: keep local cache
    console.warn("[collections] backend hydrate failed; using local cache", e);
  }
}

/** Read-only, synchronous: UI can call this freely. */
export function getCollections(): Collection[] {
  ensureDefaultLocalCollection();
  return readJSON<Collection[]>(COLLECTIONS_KEY, []);
}

/**
 * Create locally first (so UI updates instantly), then persist to backend.
 * IDs are client-generated but accepted by backend, so there is no remapping.
 */
export function createCollection(name: string): Collection {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Name required");
  const cols = getCollections();
  const c: Collection = {
    id: genId(),
    name: trimmed,
    ownerId: "local",
    createdAt: new Date().toISOString(),
    visibility: "private",
  };
  writeJSON(COLLECTIONS_KEY, [...cols, c]);

  // persist (best-effort) + converge to server truth
  createCollectionApi({ id: c.id, name: c.name, visibility: c.visibility })
    .then(() => scheduleHydrate())
    .catch((e) => {
      console.error("[collections] create failed", e);
      // still try to re-hydrate later in case backend succeeded but response failed
      scheduleHydrate(1200);
    });

  return c;
}

export function renameCollection(id: string, name: string) {
  const cols = getCollections().map((c) =>
    c.id === id ? { ...c, name: name.trim() } : c,
  );
  writeJSON(COLLECTIONS_KEY, cols);

  renameCollectionApi(id, name.trim())
    .then(() => scheduleHydrate())
    .catch((e) => {
      console.error("[collections] rename failed", e);
      scheduleHydrate(1200);
    });
}

export function deleteCollection(id: string) {
  const cols = getCollections().filter((c) => c.id != id);
  writeJSON(COLLECTIONS_KEY, cols);

  // remove from URL mapping
  const map = readJSON<Record<string, string[]>>(URL_COLLECTIONS_KEY, {});
  const next: Record<string, string[]> = {};
  Object.entries(map).forEach(([u, arr]) => {
    const filtered = (arr || []).filter((cid) => cid !== id);
    if (filtered.length) next[u] = filtered;
  });
  writeJSON(URL_COLLECTIONS_KEY, next);

  deleteCollectionApi(id)
    .then(() => scheduleHydrate())
    .catch((e) => {
      console.error("[collections] delete failed", e);
      scheduleHydrate(1200);
    });
}

export function getUrlCollections(rawUrl: string): string[] {
  const u = canonicalize(rawUrl);
  const map = readJSON<Record<string, string[]>>(URL_COLLECTIONS_KEY, {});
  return map[u] || [];
}

function writeUrlCollections(rawUrl: string, collectionIds: string[]) {
  const u = canonicalize(rawUrl);
  const map = readJSON<Record<string, string[]>>(URL_COLLECTIONS_KEY, {});
  map[u] = Array.from(new Set(collectionIds.filter(Boolean)));
  writeJSON(URL_COLLECTIONS_KEY, map);
}

export function setUrlCollections(rawUrl: string, collectionIds: string[]) {
  writeUrlCollections(rawUrl, collectionIds);
  setCollectionsForUrlApi({ url: rawUrl, collectionIds })
    .then(() => scheduleHydrate())
    .catch((e) => {
      console.error("[collections] set url collections failed", e);
      scheduleHydrate(1200);
    });
}

export function addUrlToCollection(collectionId: string, rawUrl: string) {
  if (!collectionId) return;
  const existing = new Set(getUrlCollections(rawUrl));
  existing.add(collectionId);
  setUrlCollections(rawUrl, Array.from(existing));
}

export function removeUrlFromCollection(collectionId: string, rawUrl: string) {
  const existing = new Set(getUrlCollections(rawUrl));
  existing.delete(collectionId);
  setUrlCollections(rawUrl, Array.from(existing));
}

/**
 * When a URL is removed from Saved URLs, also scrub it from category membership.
 * (We do NOT delete backend URL here; that happens in the Saved URL delete flow.)
 */
export function reconcileUrlCollections(rawUrl: string): boolean {
  const u = canonicalize(rawUrl);
  const map = readJSON<Record<string, string[]>>(URL_COLLECTIONS_KEY, {});
  if (!(u in map)) return false;
  delete map[u];
  writeJSON(URL_COLLECTIONS_KEY, map);
  return true;
}
