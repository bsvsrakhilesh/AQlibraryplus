import React, { useEffect, useMemo, useRef, useState } from "react";
import SearchIcon from "../icons/SearchIcon";
import { PlusButton } from "../ui/PlusButton";
import FormField from "../forms/FormField";
import { Sparkles } from "lucide-react";
import {
  normalizeCollectorWebsite,
  resolveWebsiteSuggestions,
  type WebsiteSuggestion,
} from "../../utils/urlCollector";

interface SearchFormProps {
  onSearch: (website: string, keywords: string) => void;
  isLoading: boolean;
  initialWebsite?: string;
  initialKeywords?: string;
  onWebsiteChange?: (v: string) => void;
  onKeywordsChange?: (v: string) => void;
  searchPreview?: string;
  currentScope?: {
    yearFrom: string;
    yearTo: string;
    jurisdiction: string;
    region: string;
    format: "any" | "pdfOnly" | "excludePdf";
  };
  onAiAssist?: (draft: {
    website: string;
    keywords: string;
    scope: {
      yearFrom: string;
      yearTo: string;
      jurisdiction: string;
      region: string;
      format: "any" | "pdfOnly" | "excludePdf";
    };
  }) => Promise<void> | void;
  aiAssistLoading?: boolean;
  aiAssistRationale?: string;
  searchDisabled?: boolean;
  websiteSuggestions?: Array<{
    domain: string;
    label: string;
    confidence?: number;
    source?: "authority" | "search";
  }>;
  resolveSearchSuggestions?: (
    query: string,
    signal: AbortSignal,
  ) => Promise<WebsiteSuggestion[]>;
}

const SearchForm: React.FC<SearchFormProps> = ({
  onSearch,
  isLoading,
  initialWebsite = "",
  initialKeywords = "",
  onWebsiteChange,
  onKeywordsChange,
  searchPreview,
  currentScope,
  onAiAssist,
  aiAssistLoading = false,
  aiAssistRationale,
  searchDisabled = false,
  websiteSuggestions = [],
  resolveSearchSuggestions,
}) => {
  const [website, setWebsite] = useState(initialWebsite);
  const [keywords, setKeywords] = useState(initialKeywords);
  const [websiteMenuOpen, setWebsiteMenuOpen] = useState(false);
  const [searchWebsiteSuggestions, setSearchWebsiteSuggestions] = useState<
    WebsiteSuggestion[]
  >([]);
  const [searchSuggestionsLoading, setSearchSuggestionsLoading] =
    useState(false);

  const siteRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);

  useEffect(() => setWebsite(initialWebsite), [initialWebsite]);
  useEffect(() => setKeywords(initialKeywords), [initialKeywords]);

  const resolvedWebsiteSuggestions = resolveWebsiteSuggestions({
    query: website,
    authoritySources: websiteSuggestions,
    limit: 8,
  });

  const mergedWebsiteSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const merged: WebsiteSuggestion[] = [];

    for (const suggestion of [
      ...resolvedWebsiteSuggestions,
      ...searchWebsiteSuggestions,
    ]) {
      const key = normalizeCollectorWebsite(suggestion.domain);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(suggestion);
    }

    return merged;
  }, [resolvedWebsiteSuggestions, searchWebsiteSuggestions]);

  useEffect(() => {
    const query = website.trim();

    if (!websiteMenuOpen || !resolveSearchSuggestions) {
      setSearchWebsiteSuggestions([]);
      setSearchSuggestionsLoading(false);
      return undefined;
    }

    const looksLikeDomain =
      /^[a-z][a-z0-9+\-.]*:\/\//i.test(query) ||
      /\.[a-z]{2,}(\b|\/|:|\/)/i.test(query) ||
      /^www\./i.test(query);

    if (!query || looksLikeDomain) {
      setSearchWebsiteSuggestions([]);
      setSearchSuggestionsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchSuggestionsLoading(true);
      void resolveSearchSuggestions(query, controller.signal)
        .then((suggestions) => {
          if (controller.signal.aborted) return;
          setSearchWebsiteSuggestions(Array.isArray(suggestions) ? suggestions : []);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSearchWebsiteSuggestions([]);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setSearchSuggestionsLoading(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [resolveSearchSuggestions, website, websiteMenuOpen]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const site = normalizeCollectorWebsite(website);
    onSearch(site, keywords.trim());
  };

  const handleWebsite = (v: string) => {
    setWebsite(v);
    onWebsiteChange?.(v);
    setWebsiteMenuOpen(true);
  };
  const handleKeywords = (v: string) => {
    setKeywords(v);
    onKeywordsChange?.(v);
  };

  const runAiAssist = async () => {
    if (!onAiAssist) return;

    await onAiAssist({
      website,
      keywords,
      scope: currentScope ?? {
        yearFrom: "",
        yearTo: "",
        jurisdiction: "",
        region: "",
        format: "any",
      },
    });
  };

  return (
    <form onSubmit={submit} noValidate className="w-full">
      {/* Website input */}
      <FormField
        label="Website"
        htmlFor="sf-website"
        helpText="Enter a site to scope the search. Leave empty to search the whole web."
      >
        <div className="relative">
          <div className="input-gradient-shell bg-landing-gradient rounded-full p-[1.5px]">
            <input
              id="sf-website"
              ref={siteRef}
              type="text"
              inputMode="url"
              autoComplete="off"
              placeholder="example.com or https://example.com"
              className="md3-input input-pill w-full"
              value={website}
              onChange={(e) => handleWebsite(e.target.value)}
              onFocus={() => setWebsiteMenuOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setWebsiteMenuOpen(false), 120);
              }}
            />
          </div>
          {websiteMenuOpen && (
            <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
              <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Suggested domains
              </div>
              <div className="max-h-60 overflow-auto">
                {searchSuggestionsLoading && (
                  <div className="px-3 py-3 text-sm text-slate-500">
                    Looking up real domains...
                  </div>
                )}
                {!searchSuggestionsLoading &&
                  website.trim() &&
                  mergedWebsiteSuggestions.length === 0 && (
                  <div className="px-3 py-3 text-sm text-slate-500">
                    No real domains found for this name yet.
                  </div>
                )}
                {!searchSuggestionsLoading &&
                  !website.trim() &&
                  mergedWebsiteSuggestions.length === 0 && (
                  <div className="px-3 py-3 text-sm text-slate-500">
                    Type a site name to surface real domains, or enter a full URL.
                  </div>
                )}
                {mergedWebsiteSuggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.domain}-${suggestion.source}`}
                    type="button"
                    className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition hover:bg-slate-50"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      handleWebsite(suggestion.domain);
                      setWebsiteMenuOpen(false);
                      siteRef.current?.focus();
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {suggestion.label}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {suggestion.domain}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                      {suggestion.source === "authority"
                        ? `${Math.max(1, Math.round(suggestion.confidence))}%`
                        : "web"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </FormField>

      {/* Keywords input */}
      <FormField
        label="Keywords"
        htmlFor="sf-keywords"
        helpText="Use commas for AND, pipes | for OR groups — e.g. governance, enforcement | smog tower, Delhi"
      >
        <div className="input-gradient-shell bg-landing-gradient rounded-full p-[1.5px]">
          <input
            id="sf-keywords"
            ref={keyRef}
            type="text"
            autoComplete="off"
            placeholder="e.g. air quality, governance | smog tower, Delhi"
            className="md3-input input-pill w-full"
            value={keywords}
            onChange={(e) => handleKeywords(e.target.value)}
          />
        </div>
      </FormField>

      {/* Actions */}
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <PlusButton
            type="submit"
            size="lg"
            variant="solid"
            loading={isLoading}
            disabled={searchDisabled || isLoading}
            className="w-full md:w-auto rounded-full min-h-11 px-5"
            aria-label="Search the web"
            title="Search the web"
          >
            <SearchIcon className="h-4 w-4" />
            Search
          </PlusButton>

          <PlusButton
            type="button"
            size="lg"
            variant="outline"
            loading={aiAssistLoading}
            disabled={searchDisabled || !keywords.trim() || isLoading}
            className="w-full md:w-auto rounded-full min-h-11 px-5"
            aria-label="Use AI to improve the search plan"
            title="Use AI to improve the search plan"
            onClick={runAiAssist}
          >
            <Sparkles className="h-4 w-4" />
            AI assist
          </PlusButton>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          AI assist sharpens domains, keywords, date hints, and PDF/news bias
          before you search.
        </p>
      </div>

      {aiAssistRationale && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          <span className="font-medium">AI assist</span>
          <span className="ml-2">{aiAssistRationale}</span>
        </div>
      )}

      {/* Built query display — shown after first search so researchers can verify what ran */}
      {searchPreview && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-800/50">
          <span className="mt-0.5 shrink-0 font-medium text-gray-500 dark:text-gray-400">
            Search plan
          </span>
          <code className="min-w-0 break-all font-mono text-gray-700 dark:text-gray-300 leading-relaxed">
            {searchPreview}
          </code>
          <button
            type="button"
            title="Copy search plan to clipboard"
            className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition-colors"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(searchPreview);
              } catch {
                /* clipboard unavailable */
              }
            }}
          >
            Copy
          </button>
        </div>
      )}
    </form>
  );
};

export default SearchForm;
