import { expect, test, type Page, type Route } from "@playwright/test";

function now() {
  return new Date().toISOString();
}

async function json(route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers,
    body: JSON.stringify(body),
  });
}

async function installUrlCollectorApi(page: Page) {
  let deleted = false;
  const savedItems: any[] = [];

  const purpose = {
    id: "purpose-1",
    title: "Delhi Air Quality",
    researchQuestion: "What official records mention GRAP Stage IV?",
    jurisdiction: "Delhi",
    region: "NCR",
    yearFrom: null,
    yearTo: null,
    sourcePreferences: [],
    targetActors: [],
    outputGoal: null,
    status: "active",
    summary: {
      savedUrlCount: 0,
      capturedEvidenceCount: 0,
      governanceReadyDocumentCount: 0,
    },
    authoritySources: [
      {
        key: "caqm",
        label: "CAQM",
        domain: "caqm.nic.in",
        evidenceRole: "Primary orders",
        reason: "Primary commission for GRAP and air-quality management orders in Delhi-NCR.",
        confidence: 96,
        queryHints: ["GRAP", "Stage IV", "CAQM"],
        documentTerms: ["order", "direction", "revocation"],
      },
    ],
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;

    if (method === "GET" && pathname === "/api/collector-purposes") {
      return json(route, deleted ? [] : [purpose]);
    }

    if (method === "GET" && pathname === "/api/saved-url-workspace") {
      return json(route, {
        urls: {
          items: savedItems,
          total: savedItems.length,
          page: 1,
          pageSize: 50,
        },
        facets: { domains: [], tags: [], years: [] },
        queueSummary: {
          all: savedItems.length,
          neverCaptured: savedItems.length,
          staleCapture: 0,
          aiFailed: 0,
          metadataMissing: 0,
          updatedSinceReview: 0,
        },
        collections: [],
        savedSearches: [],
        taggingSummary: {
          total: savedItems.length,
          untagged: savedItems.length,
          byStatus: {},
          inProgress: 0,
          failed: 0,
          failedSample: [],
        },
        libraryTotal: savedItems.length,
      });
    }

    if (method === "GET" && pathname === "/api/saved-url-operations") {
      return json(route, { items: [] });
    }

    if (method === "GET" && pathname === "/api/saved-url-searches") {
      return json(route, []);
    }

    if (method === "GET" && pathname === "/api/urls/tagging/summary") {
      return json(route, {
        total: savedItems.length,
        untagged: savedItems.length,
        byStatus: {},
        inProgress: 0,
        failed: 0,
        failedSample: [],
      });
    }

    if (method === "GET" && pathname === "/api/search") {
      return json(
        route,
        [
          {
            title: "CAQM issues Stage IV directions",
            url: "https://caqm.nic.in/orders/stage-iv.pdf",
            snippet: "Official order about Stage IV restrictions.",
            ranking: { score: 0.97, reasons: ["official"], rank: 1 },
            purposeRelevance: {
              score: 0.98,
              matchedTerms: ["grap", "stage"],
              reason: "Matches purpose terms: grap, stage Official source match: CAQM",
            },
          },
        ],
        200,
        {
          "x-next-page": "",
          "x-has-more": "0",
          "x-total-results": "1",
          "x-collector-search-id": "search-1",
        },
      );
    }

    if (method === "POST" && pathname === "/api/urls/exists") {
      return json(route, { exists: {} });
    }

    if (
      method === "POST" &&
      pathname === "/api/collector-purposes/purpose-1/save-selection"
    ) {
      const body = request.postDataJSON() as {
        urls?: Array<{ url: string; title?: string; snippet?: string }>;
      };
      const rows = (body.urls ?? []).map((row, index) => {
        const id = 101 + index;
        savedItems.push({
          id,
          url: row.url,
          title: row.title ?? row.url,
          snippet: row.snippet ?? "",
          description: row.snippet ?? "",
          domain: "caqm.nic.in",
          visibility: "private",
          createdAt: now(),
          updatedAt: now(),
          lastVisitedAt: null,
          visitCount: 0,
          isFavorited: false,
          tags: [],
          collections: [],
          latestSnapshot: null,
        });
        return {
          urlId: id,
          url: row.url,
          newlySaved: true,
          newlyLinked: true,
          status: "saved_to_purpose",
        };
      });
      purpose.summary.savedUrlCount = savedItems.length;
      return json(route, { rows, summary: purpose.summary });
    }

    if (method === "DELETE" && pathname === "/api/collector-purposes/purpose-1") {
      deleted = true;
      return json(route, { ok: true });
    }

    if (method === "POST" && pathname === "/api/search/rerank") {
      return json(route, []);
    }

    return json(route, {});
  });
}

test("url collector clears stale results after deleting the active purpose", async ({ page }) => {
  await installUrlCollectorApi(page);

  await page.goto("/app/url-collector?purposeId=purpose-1");

  await expect(page.getByRole("heading", { name: "URL Collector" })).toBeVisible();
  await page.getByLabel("Website").fill("caqm.nic.in");
  await page.getByLabel("Keywords").fill("grap stage iv");
  await page.getByRole("button", { name: "Search the web" }).click();

  await expect(page.getByText("CAQM issues Stage IV directions")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete purpose" })).toBeVisible();

  await page.getByRole("button", { name: "Delete purpose" }).click();
  await page
    .getByRole("dialog", { name: "Delete research purpose?" })
    .getByRole("button", { name: "Delete purpose" })
    .click();

  await expect(page.getByText("Start by entering a website and keywords above.")).toBeVisible();
  await expect(page.getByText("CAQM issues Stage IV directions")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Save to purpose/i })).toHaveCount(0);
});

test("saved URLs refresh after a collector save without reloading the browser", async ({
  page,
}) => {
  await installUrlCollectorApi(page);

  await page.goto("/app/saved-urls");
  await expect(page.getByText("No saved URLs yet.")).toBeVisible();

  await page.getByRole("button", { name: "URL Collector" }).click();
  await page.getByRole("button", { name: "Research purpose" }).click();
  await page.getByRole("option", { name: "Delhi Air Quality" }).click();
  await page.getByLabel("Website").fill("caqm.nic.in");
  await page.getByLabel("Keywords").fill("grap stage iv");
  await page.getByRole("button", { name: "Search the web" }).click();

  await page.getByLabel("Select CAQM issues Stage IV directions").check();
  await page.getByRole("button", { name: "Save to purpose (1)" }).click();
  await expect(page.getByText("Saved to purpose")).toBeVisible();

  await page
    .getByRole("complementary", { name: "Primary sidebar" })
    .getByRole("button", { name: /Saved URLs$/ })
    .click();
  await expect(page.getByText("CAQM issues Stage IV directions", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("No saved URLs yet.")).toHaveCount(0);
});
