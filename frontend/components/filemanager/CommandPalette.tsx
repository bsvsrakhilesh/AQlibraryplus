"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  CornerDownLeft,
  Clock3,
  Sparkles,
  ArrowRight,
  X,
} from "lucide-react";

export type PaletteCommand = {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
  group?: string;
  run: () => void;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
};

function scoreMatch(q: string, text: string) {
  // simple fuzzy-ish scoring: exact includes + word boundary boost
  const t = text.toLowerCase();
  const qq = q.toLowerCase().trim();
  if (!qq) return 1;
  if (t === qq) return 100;
  if (t.includes(qq)) return 60;
  // token scoring
  const tokens = qq.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const tok of tokens) {
    if (t.includes(tok)) score += 10;
  }
  return score;
}

function groupBy<T>(arr: T[], keyFn: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of arr) {
    const k = keyFn(x);
    const v = m.get(k) ?? [];
    v.push(x);
    m.set(k, v);
  }
  return m;
}

const RECENT_STORAGE_KEY = "fm.command-palette.recent";
const MAX_RECENT = 6;
const MAX_RESULTS = 50;

const DEFAULT_SUGGESTED_IDS = [
  "action.upload",
  "action.newfolder",
  "nav.home",
  "nav.favorites",
  "nav.trash",
  "help.hotkeys",
];

export default function CommandPalette({ isOpen, onClose, commands }: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const [recentIds, setRecentIds] = useState<string[]>([]);

  const rememberRecent = useCallback((id: string) => {
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENT);
      try {
        window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore localStorage failures
      }
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const recentIndex = new Map(recentIds.map((id, index) => [id, index]));

    const scored: Array<{ c: PaletteCommand; s: number }> = [];

    for (const c of commands) {
      const hay = [c.title, c.subtitle, ...(c.keywords ?? [])]
        .filter(Boolean)
        .join(" ");

      const baseScore = scoreMatch(q, hay);
      if (q && baseScore <= 0) continue;

      const recentBoost =
        !q && recentIndex.has(c.id)
          ? 120 - (recentIndex.get(c.id) ?? 0) * 5
          : 0;

      const priorityBoost =
        !q && (c.group === "Actions" || c.group === "Navigation") ? 20 : 0;

      scored.push({
        c,
        s: baseScore + recentBoost + priorityBoost,
      });
    }

    return scored
      .sort((a, b) => b.s - a.s || a.c.title.localeCompare(b.c.title))
      .map((x) => x.c)
      .slice(0, MAX_RESULTS);
  }, [commands, query, recentIds]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (q) {
      return groupBy(filtered, (c) => c.group ?? "Commands");
    }

    const m = new Map<string, PaletteCommand[]>();

    const suggestedFromRecent = recentIds
      .map(
        (id) =>
          filtered.find((c) => c.id === id) ??
          commands.find((c) => c.id === id),
      )
      .filter((c): c is PaletteCommand => !!c)
      .slice(0, MAX_RECENT);

    const suggestedFallback = filtered
      .filter(
        (c) =>
          DEFAULT_SUGGESTED_IDS.includes(c.id) &&
          !suggestedFromRecent.some((x) => x.id === c.id),
      )
      .slice(0, Math.max(0, MAX_RECENT - suggestedFromRecent.length));

    const suggested = [...suggestedFromRecent, ...suggestedFallback].slice(
      0,
      MAX_RECENT,
    );

    if (suggested.length > 0) {
      m.set("Suggested", suggested);
    }

    for (const c of filtered) {
      if (suggested.some((x) => x.id === c.id)) continue;
      const key = c.group ?? "Commands";
      const bucket = m.get(key) ?? [];
      bucket.push(c);
      m.set(key, bucket);
    }

    return m;
  }, [commands, filtered, query, recentIds]);

  const flat = useMemo(() => filtered, [filtered]);
  const hasQuery = query.trim().length > 0;
  const topCommand = flat[0];

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setRecentIds(parsed.filter((x): x is string => typeof x === "string"));
      }
    } catch {
      // ignore localStorage parse failures
    }
  }, []);

  useEffect(() => {
    setRecentIds((prev) =>
      prev.filter((id) => commands.some((c) => c.id === id)),
    );
  }, [commands]);

  // reset state when opening
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setActiveIdx(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const el = document.querySelector<HTMLElement>(
      `[data-command-idx="${activeIdx}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, isOpen]);

  // a11y: trap focus + esc + outside click + scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const prevActive = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(flat.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = flat[activeIdx];
        if (cmd) {
          rememberRecent(cmd.id);
          onClose();
          cmd.run();
        }
        return;
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (dialogRef.current && !dialogRef.current.contains(target)) {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("mousedown", onMouseDown, true);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("mousedown", onMouseDown, true);
      setTimeout(() => prevActive?.focus?.(), 0);
    };
  }, [isOpen, onClose, flat, activeIdx, rememberRecent]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-80 bg-black/30 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="w-[min(760px,96vw)] rounded-2xl border border-app surface shadow-2xl overflow-hidden"
        >
          <div className="border-b border-app">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-app bg-[hsl(var(--surface-elev))]">
                <Search className="w-4 h-4 text-neutral-500" />
              </div>

              <div className="min-w-0 flex-1">
                <input
                  ref={inputRef}
                  name="command-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search actions, views, navigation…"
                  className="w-full bg-transparent outline-none text-sm font-medium"
                />
                <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
                  <span>
                    {flat.length} result{flat.length === 1 ? "" : "s"}
                  </span>
                  {topCommand ? (
                    <>
                      <span>•</span>
                      <span className="truncate">
                        Top match: {topCommand.title}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>

              {hasQuery ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-[hsl(var(--surface-elev))] hover:text-[hsl(var(--foreground))]"
                  aria-label="Clear command search"
                  title="Clear"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <div className="hidden md:inline-flex items-center gap-1 rounded-full border border-app px-2.5 py-1 text-[11px] text-neutral-500">
                  <Clock3 className="h-3 w-3" />
                  Recent first
                </div>
              )}

              <div className="text-[11px] text-neutral-500 flex items-center gap-1 shrink-0">
                <CornerDownLeft className="w-3 h-3" /> Enter
              </div>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-auto">
            {flat.length === 0 ? (
              <div className="p-6">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-neutral-500" />
                  No matching commands
                </div>
                <div className="mt-2 text-sm text-neutral-500">
                  Try “upload”, “trash”, “favorites”, or “sort by date”.
                </div>
              </div>
            ) : (
              Array.from(grouped.entries()).map(([group, items]) => (
                <div key={group} className="py-2">
                  <div className="px-4 pb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-neutral-500">
                    {group === "Suggested" ? (
                      <Sparkles className="h-3.5 w-3.5" />
                    ) : null}
                    <span>{group}</span>
                    <span className="rounded-full border border-app px-1.5 py-0.5 normal-case tracking-normal">
                      {items.length}
                    </span>
                  </div>

                  <div className="px-2">
                    {items.map((c) => {
                      const idx = flat.findIndex((x) => x.id === c.id);
                      const active = idx === activeIdx;
                      const isRecent = recentIds.includes(c.id);

                      return (
                        <button
                          key={c.id}
                          data-command-idx={idx}
                          onMouseEnter={() => setActiveIdx(idx)}
                          onClick={() => {
                            rememberRecent(c.id);
                            onClose();
                            c.run();
                          }}
                          className={[
                            "w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors",
                            active
                              ? "bg-[hsl(var(--surface-elev))]"
                              : "hover:bg-[hsl(var(--surface-elev))]",
                          ].join(" ")}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{c.title}</div>
                            {c.subtitle && (
                              <div className="text-xs text-neutral-500 line-clamp-1">
                                {c.subtitle}
                              </div>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-2 text-[11px] text-neutral-500">
                            {isRecent ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-app px-2 py-1">
                                <Clock3 className="h-3 w-3" />
                                Recent
                              </span>
                            ) : null}
                            {active ? <ArrowRight className="h-4 w-4" /> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-2 border-t border-app text-[11px] text-neutral-500 flex items-center justify-between gap-3">
            <span>↑ ↓ navigate • Enter run • Esc close</span>
            <span className="truncate">
              Ctrl/Cmd + K • Recently used commands appear first
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
