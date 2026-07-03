import test from "node:test";
import assert from "node:assert/strict";

test("site-scoped empty searches broaden to siteless fallback queries", async () => {
  const { googleSearchWithFallback } = await import(
    "../services/searchFallback.service"
  );

  const calls: Array<{ q: string; site: string | null | undefined }> = [];
  const searchImpl = async (
    q: string,
    _page: number,
    opts: { site?: string },
  ) => {
    calls.push({ q, site: opts.site });

    if (opts.site === "hspcb.gov.in") {
      return { results: [], totalResults: 0, nextPage: null };
    }

    if (!opts.site && q === "hspcb air quality enforcement") {
      return {
        results: [
          {
            title: "Recovered result",
            url: "https://example.org/recovered",
            snippet: "Recovered through siteless fallback",
          },
        ],
        totalResults: 1,
        nextPage: null,
      };
    }

    return { results: [], totalResults: 0, nextPage: null };
  };

  const result = await googleSearchWithFallback(
    "hspcb air quality enforcement",
    1,
    { site: "hspcb.gov.in" },
    searchImpl as any,
  );

  assert.equal(result.fallbackApplied, true);
  assert.equal(result.results.length, 1);
  assert.equal(calls[0]?.site, "hspcb.gov.in");
  const lastCall = calls[calls.length - 1];
  assert.equal(lastCall?.site, undefined);
  assert.equal(lastCall?.q, "hspcb air quality enforcement");
});
