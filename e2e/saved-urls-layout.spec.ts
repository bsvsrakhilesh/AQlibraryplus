import { expect, test, type Page, type Route } from "@playwright/test";

async function json(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installEmptySavedUrlsApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());

    if (pathname === "/api/saved-url-workspace") {
      return json(route, {
        urls: { items: [], total: 0, page: 1, pageSize: 50 },
        facets: { domains: [], tags: [], years: [] },
        queueSummary: {
          all: 0,
          neverCaptured: 0,
          staleCapture: 0,
          aiFailed: 0,
          metadataMissing: 0,
          updatedSinceReview: 0,
        },
        collections: [],
        savedSearches: [],
        taggingSummary: {
          total: 0,
          untagged: 0,
          byStatus: {},
          inProgress: 0,
          failed: 0,
          failedSample: [],
        },
        libraryTotal: 0,
      });
    }

    if (pathname === "/api/saved-url-operations") {
      return json(route, { items: [] });
    }

    if (pathname === "/api/collector-purposes") {
      return json(route, []);
    }

    if (pathname === "/api/saved-url-searches") {
      return json(route, []);
    }

    if (pathname === "/api/urls/tagging/summary") {
      return json(route, {
        total: 0,
        untagged: 0,
        byStatus: {},
        inProgress: 0,
        failed: 0,
        failedSample: [],
      });
    }

    return json(route, {});
  });
}

test.beforeEach(async ({ page }) => {
  await installEmptySavedUrlsApi(page);
  await page.addInitScript(() => localStorage.clear());
});

test("saved URLs empty workspace has a clear, actionable control hierarchy", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/app/saved-urls");

  const toolbar = page.getByRole("toolbar", { name: "Saved URLs controls" });
  await expect(toolbar.getByLabel("Search saved URLs")).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Advanced filters" })).toBeVisible();
  await expect(toolbar.getByLabel("Filter by saved year")).toBeVisible();
  await expect(toolbar.getByLabel(/Sort direction:/)).toBeVisible();
  await expect(toolbar.getByLabel("Quick add URL")).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Add URL" })).toBeDisabled();
  await expect(page.getByText("Live search ready")).toHaveCount(0);

  await page.getByRole("button", { name: "Add your first URL" }).click();
  await expect(toolbar.getByLabel("Quick add URL")).toBeFocused();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);


});

test("saved URLs controls remain usable on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/saved-urls");

  const toolbar = page.getByRole("toolbar", { name: "Saved URLs controls" });
  await expect(toolbar.getByLabel("Search saved URLs")).toBeVisible();
  await expect(toolbar.getByLabel("Quick add URL")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add your first URL" })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

});
