"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ChevronLeft, Home, Search, X } from "lucide-react";
import { motion } from "framer-motion";

type Crumb = { id: string; label: string; onClick: () => void };

type Props = {
  path: Crumb[];
  rootLabel?: string;

  currentFolderId?: string | null;
  onBack?: () => void;
  onForward?: () => void;
  backEnabled?: boolean;
  forwardEnabled?: boolean;

  onNavigate?: (folderId: string | null) => void | Promise<void>;

  onResolvePathText?: (text: string) => Promise<string | null> | string | null;

  onSearchSubmit?: (q: string) => void;
  initialSearch?: string;
  searchPlaceholder?: string;
  searchMetaText?: string;
};

export default function Breadcrumbs({
  path,
  rootLabel = "Root",
  currentFolderId = null,
  onBack,
  onForward,
  backEnabled,
  forwardEnabled,
  onNavigate,
  onResolvePathText,
  onSearchSubmit,
  initialSearch = "",
  searchPlaceholder,
  searchMetaText,
}: Props) {
  const displayPath = useMemo(() => {
    const safePath = Array.isArray(path) ? path.filter(Boolean) : [];

    if (!currentFolderId) return safePath;

    const idx = safePath.findIndex((c) => c.id === currentFolderId);
    return idx >= 0 ? safePath.slice(0, idx + 1) : safePath;
  }, [path, currentFolderId]);

  const currentPathString = useMemo(() => {
    if (!displayPath || displayPath.length === 0) return rootLabel;
    return displayPath.map((c) => c.label).join(" / ");
  }, [displayPath, rootLabel]);

  const [editing, setEditing] = useState(false);
  const [pathText, setPathText] = useState(currentPathString);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const crumbsRef = useRef<HTMLDivElement | null>(null);

  const [search, setSearch] = useState(initialSearch);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [isResolvingPath, setIsResolvingPath] = useState(false);

  useEffect(() => {
    setSearch(initialSearch ?? "");
  }, [initialSearch]);

  useEffect(() => {
    if (!editing) setPathText(currentPathString);
  }, [currentPathString, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
    if (!editing) setResolveError(null);
  }, [editing]);

  useEffect(() => {
    const el = crumbsRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollLeft = el.scrollWidth;
    });
  }, [displayPath]);

  const [backStack, setBackStack] = useState<(string | null)[]>([]);
  const [forwardStack, setForwardStack] = useState<(string | null)[]>([]);
  const lastIdRef = useRef<string | null>(currentFolderId ?? null);

  useEffect(() => {
    const now = currentFolderId ?? null;
    const prev = lastIdRef.current;

    if (prev === now) return;

    if (prev !== null || now !== null) {
      setBackStack((bs) => [...bs, prev ?? null]);
      setForwardStack([]);
    }
    lastIdRef.current = now;
  }, [currentFolderId]);

  const runNavigate = useCallback(
    async (target: string | null) => {
      if (onNavigate) {
        await Promise.resolve(onNavigate(target));
        return;
      }

      if (!target) return;

      const crumb = path.find((c) => c.id === target);
      if (crumb) {
        await Promise.resolve(crumb.onClick());
        return;
      }

      await Promise.resolve(path[path.length - 1]?.onClick());
    },
    [onNavigate, path],
  );

  const internalBack = useCallback(() => {
    setBackStack((bs) => {
      if (bs.length === 0) return bs;

      const nextBs = bs.slice(0, -1);
      const target = bs[bs.length - 1] ?? null;
      const prev = currentFolderId ?? null;

      setForwardStack((fs) => [...fs, prev]);
      lastIdRef.current = target;
      void runNavigate(target);

      return nextBs;
    });
  }, [currentFolderId, runNavigate]);

  const internalForward = useCallback(() => {
    setForwardStack((fs) => {
      if (fs.length === 0) return fs;

      const nextFs = fs.slice(0, -1);
      const target = fs[fs.length - 1] ?? null;
      const prev = currentFolderId ?? null;

      setBackStack((bs) => [...bs, prev]);
      lastIdRef.current = target;
      void runNavigate(target);

      return nextFs;
    });
  }, [currentFolderId, runNavigate]);

  const internalCanBack = backStack.length > 0;
  const internalCanForward = forwardStack.length > 0;

  const canBack = backEnabled ?? (onBack ? true : internalCanBack);
  const canForward = forwardEnabled ?? (onForward ? true : internalCanForward);

  const doBack = onBack ?? internalBack;
  const doForward = onForward ?? internalForward;

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setPathText(currentPathString);
    setResolveError(null);
    setIsResolvingPath(false);
  }, [currentPathString]);

  const resolveAndNavigate = useCallback(async () => {
    const text = pathText.trim();
    setResolveError(null);
    setIsResolvingPath(true);

    try {
      if (!text || text.toLowerCase() === rootLabel.toLowerCase()) {
        await runNavigate(null);
        setEditing(false);
        return;
      }

      let resolved: string | null = null;

      if (onResolvePathText) {
        const maybe = await onResolvePathText(text);
        if (typeof maybe === "string" || maybe === null) {
          resolved = maybe;
        }
      }

      if (resolved === null) {
        const segments = text.split(/[\\/]/).map((s) => s.trim());
        const last = segments.filter(Boolean).pop()?.toLowerCase();
        if (last) {
          const match = displayPath.find((c) => c.label.toLowerCase() === last);
          if (match) resolved = match.id;
        }
      }

      if (resolved === null) {
        setResolveError("Path not found in this workspace");
        return;
      }

      await runNavigate(resolved);
      setEditing(false);
    } catch {
      setResolveError("Could not open that path right now");
    } finally {
      setIsResolvingPath(false);
    }
  }, [pathText, rootLabel, onResolvePathText, displayPath, runNavigate]);

  const handleAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void resolveAndNavigate();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEditing();
    }
  };

  const focusSearch = useCallback(() => {
    if (!searchInputRef.current) return;
    searchInputRef.current.focus();
    searchInputRef.current.select();
  }, []);

  useEffect(() => {
    if (!onSearchSubmit) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const isShortcut =
        (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f";
      if (!isShortcut) return;

      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        !!target?.closest('[contenteditable="true"]');

      if (isTypingTarget && target !== searchInputRef.current) return;

      event.preventDefault();
      focusSearch();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusSearch, onSearchSubmit]);

  const shortcutLabel = useMemo(() => {
    if (
      typeof navigator !== "undefined" &&
      navigator.platform.toLowerCase().includes("mac")
    ) {
      return "⌘F";
    }
    return "Ctrl+F";
  }, []);

  const SearchBox = onSearchSubmit ? (
    <div
      className="flex w-full shrink-0 flex-col gap-1 rounded-2xl bg-[hsl(var(--fm-bg-elev))] px-3 py-2 shadow-sm lg:w-[22rem]"
      role="search"
      aria-label="File manager search"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={focusSearch}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[hsl(var(--fm-muted))] transition hover:bg-black/5 hover:text-[hsl(var(--foreground))] dark:hover:bg-white/10"
          aria-label="Focus search"
          title="Focus search"
        >
          <Search className="h-4 w-4" />
        </button>

        <input
          ref={searchInputRef}
          id="file-manager-search"
          data-file-manager-search="true"
          type="search"
          name="file-manager-search"
          value={search}
          onChange={(e) => {
            const v = e.target.value;
            setSearch(v);
            onSearchSubmit?.(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && search) {
              e.preventDefault();
              setSearch("");
              onSearchSubmit?.("");
            }
          }}
          placeholder={
            searchPlaceholder ??
            (currentFolderId ? "Search this folder" : "Search")
          }
          className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[hsl(var(--fm-muted))]"
          aria-label={searchPlaceholder ?? "Search files"}
        />

        {search ? (
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[hsl(var(--fm-muted))] transition hover:bg-black/5 hover:text-[hsl(var(--foreground))] dark:hover:bg-white/10"
            onClick={() => {
              setSearch("");
              onSearchSubmit?.("");
              requestAnimationFrame(() => {
                searchInputRef.current?.focus();
              });
            }}
            aria-label="Clear search"
            title="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={focusSearch}
            className="hidden shrink-0 rounded-lg border border-black/5 px-2 py-1 text-[11px] font-medium tracking-wide text-[hsl(var(--fm-muted))] transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10 lg:inline-flex"
            aria-label="Focus search with keyboard shortcut"
            title="Focus search"
          >
            {shortcutLabel}
          </button>
        )}
      </div>

      {searchMetaText ? (
        <div className="pl-9 text-[11px] text-[hsl(var(--fm-muted))]">
          {searchMetaText}
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <motion.nav
      aria-label="Folder navigation"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="w-full flex flex-col gap-3 text-sm lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="flex items-center gap-3 min-w-0 w-full lg:flex-1">
        <div className="inline-flex items-center rounded-2xl shadow-sm overflow-hidden">
          <button
            type="button"
            className={`px-3 py-2 transition-colors ${
              canBack && !isResolvingPath
                ? "hover:bg-[hsl(var(--surface-elevated))]"
                : "opacity-40 cursor-not-allowed"
            }`}
            onClick={doBack}
            disabled={!canBack || isResolvingPath}
            aria-label="Back"
            title="Back"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={`px-3 py-2 transition-colors ${
              canForward && !isResolvingPath
                ? "hover:bg-[hsl(var(--surface-elevated))]"
                : "opacity-40 cursor-not-allowed"
            }`}
            onClick={doForward}
            disabled={!canForward || isResolvingPath}
            aria-label="Forward"
            title="Forward"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div
          className={`flex-1 rounded-2xl shadow-sm px-3 py-1.5 flex items-center gap-2 min-w-0 ${
            resolveError ? "ring-1 ring-rose-400/70 dark:ring-rose-400/60" : ""
          }`}
          data-invalid={resolveError ? "true" : "false"}
          aria-busy={isResolvingPath ? "true" : "false"}
        >
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-[hsl(var(--fm-accent))] shadow-(--fm-shadow)"
            onClick={() => void runNavigate(null)}
            title="Go to root"
            aria-label="Go to root"
            disabled={isResolvingPath}
          >
            <Home className="h-4 w-4" />
          </button>

          <div className="flex-1 min-w-0" ref={crumbsRef}>
            {editing ? (
              <input
                ref={inputRef}
                name="folder-path"
                value={pathText}
                onChange={(e) => {
                  setPathText(e.target.value);
                  if (resolveError) setResolveError(null);
                }}
                onKeyDown={handleAddressKeyDown}
                onBlur={() => {
                  if (!isResolvingPath) cancelEditing();
                }}
                className="w-full bg-transparent text-sm outline-none"
                spellCheck={false}
                aria-invalid={resolveError ? "true" : undefined}
                aria-describedby={
                  resolveError ? "folder-path-error" : undefined
                }
              />
            ) : (
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-transparent">
                {!displayPath || displayPath.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => void runNavigate(null)}
                    className="rounded-xl px-2 py-1 text-xs text-[hsl(var(--fm-muted))] transition hover:bg-[hsl(var(--surface-elevated))] md:text-sm"
                    disabled={isResolvingPath}
                  >
                    {rootLabel}
                  </button>
                ) : (
                  displayPath.map((crumb, idx) => {
                    const isLast = idx === displayPath.length - 1;
                    const label = String(crumb.label || "").trim() || "Folder";

                    return (
                      <div
                        key={crumb.id}
                        className="flex items-center gap-1 shrink-0"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            void Promise.resolve(crumb.onClick());
                          }}
                          aria-current={isLast ? "page" : undefined}
                          disabled={isResolvingPath}
                          className={`px-2 py-1 rounded-xl text-xs md:text-sm transition-colors whitespace-nowrap ${
                            isLast
                              ? "border border-[hsl(var(--fm-border))] bg-[hsl(var(--fm-bg-elev))] text-[hsl(var(--foreground))] shadow-sm"
                              : "hover:bg-[hsl(var(--surface-elevated))] text-[hsl(var(--fm-text))]"
                          }`}
                        >
                          {label}
                        </button>
                        {!isLast && (
                          <ChevronRight className="h-3 w-3 text-[hsl(var(--fm-muted))]" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 w-full lg:w-auto">
        <div className="mr-auto min-w-0">
          {resolveError ? (
            <p
              id="folder-path-error"
              role="status"
              className="text-xs text-rose-600 dark:text-rose-300"
            >
              {resolveError}
            </p>
          ) : editing ? (
            <p className="text-xs text-[hsl(var(--fm-muted))]">
              {isResolvingPath
                ? "Resolving path…"
                : "Press Enter to open • Esc to cancel"}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          className="h-9 shrink-0 px-3 rounded-xl border border-[hsl(var(--fm-border))] bg-[hsl(var(--fm-bg-elev))] text-xs md:text-sm hover:bg-[hsl(var(--surface-elevated))] transition-colors disabled:cursor-wait disabled:opacity-70"
          onClick={() => {
            if (editing) {
              cancelEditing();
              return;
            }
            setEditing(true);
          }}
          title={editing ? "Exit address editing" : "Edit address"}
          disabled={isResolvingPath}
        >
          {editing ? "Done" : "Edit"}
        </button>

        {SearchBox}
      </div>
    </motion.nav>
  );
}
