import test from "node:test";
import assert from "node:assert/strict";

test("resolveCollectorSearchTargets prioritizes the selected site and broadens to related official domains", async () => {
  const { resolveCollectorSearchTargets } = await import("./urlCollector");

  const targets = resolveCollectorSearchTargets({
    site: "https://hspcb.gov.in",
    authoritySources: [
      { domain: "hspcb.gov.in", label: "HSPCB", confidence: 56 },
      { domain: "caqm.nic.in", label: "CAQM", confidence: 61 },
      { domain: "delhi.gov.in", label: "Delhi Government", confidence: 54 },
    ],
    limit: 6,
  });

  assert.equal(targets[0]?.site, "hspcb.gov.in");
  assert.equal(targets[0]?.label, "HSPCB");
  assert.ok(targets.some((target) => target.site === "caqm.nic.in"));
  assert.ok(targets.some((target) => target.site === "delhi.gov.in"));
  assert.equal(targets.length, 3);
});

test("resolveWebsiteSuggestions only returns matching authority sources", async () => {
  const { resolveWebsiteSuggestions } = await import("./urlCollector");

  const suggestions = resolveWebsiteSuggestions({
    query: "CAQM Delhi",
    authoritySources: [
      { domain: "caqm.nic.in", label: "CAQM", confidence: 61 },
      { domain: "hspcb.gov.in", label: "HSPCB", confidence: 56 },
    ],
    limit: 8,
  });

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]?.source, "authority");
  assert.ok(suggestions.some((item) => item.domain === "caqm.nic.in"));
});

test("collectWebsiteSuggestionsFromSearchResults derives real domains from search hits", async () => {
  const { collectWebsiteSuggestionsFromSearchResults } = await import(
    "./urlCollector"
  );

  const suggestions = collectWebsiteSuggestionsFromSearchResults(
    [
      {
        title: "The Hindu - Delhi edition",
        url: "https://www.thehindu.com/news/cities/Delhi/",
      } as any,
      {
        title: "The Hindu business news",
        url: "https://www.thehindu.com/business/",
      } as any,
      {
        title: "Delhi Government order",
        url: "https://delhi.gov.in/orders/2025",
      } as any,
    ],
    6,
  );

  assert.equal(suggestions[0]?.domain, "thehindu.com");
  assert.equal(suggestions[0]?.source, "search");
  assert.ok(suggestions.some((item) => item.domain === "delhi.gov.in"));
});
