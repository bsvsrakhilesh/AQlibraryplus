import { expect, test, type Page, type Route } from "@playwright/test";

async function json(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installSavedUrlsApi(page: Page, items: unknown[] = []) {
  await page.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());

    if (pathname === "/api/saved-url-workspace") {
      return json(route, {
        urls: { items, total: items.length, page: 1, pageSize: 50 },
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
        libraryTotal: items.length,
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
  await page.addInitScript(() => localStorage.clear());
});

test("mobile opens on sources, with operations collapsed and compact source rows", async ({
  page,
}) => {
  await installSavedUrlsApi(page, [
    {
      id: 101,
      url: "https://caqm.nic.in/air-quality-report",
      title: "Delhi air quality progress report",
      snippet: "A long description that belongs in the detail view rather than the mobile list.",
      createdAt: "2026-07-10T10:00:00.000Z",
      updatedAt: "2026-07-12T10:00:00.000Z",
      visitCount: 0,
      isFavorited: false,
      tags: ["Delhi", "Air quality", "Regulation"],
      visibility: "private",
      latestSnapshot: {
        id: "snapshot-101",
        fileName: "air-quality-report.txt",
        captureType: "URL_TEXT",
        createdAt: "2026-07-12T10:00:00.000Z",
      },
    },
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/saved-urls");

  const source = page.getByText("Delhi air quality progress report");
  await expect(source).toBeVisible();
  expect((await source.boundingBox())?.y ?? Infinity).toBeLessThan(720);
  await expect(page.locator("details.saved-urls-workbench")).not.toHaveAttribute("open", "");
  await expect(page.getByRole("button", { name: "Details", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Text" })).toBeHidden();
  await expect(page.getByRole("button", { name: "PDF" })).toBeHidden();

  await page.getByRole("button", { name: "Add source" }).click();
  const quickAdd = page
    .getByRole("dialog")
    .getByPlaceholder("https://example.org/source");
  await quickAdd.fill("https://example.org/new-source");
  const addUrl = page.getByRole("button", { name: "Save source" });
  await expect(addUrl).toBeEnabled();
  await expect
    .poll(() => addUrl.evaluate((node) => getComputedStyle(node).backgroundImage))
    .toContain("linear-gradient");
  await page.keyboard.press("Escape");

});

test("saved URLs empty workspace has a clear, actionable control hierarchy", async ({
  page,
}) => {
  await installSavedUrlsApi(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/app/saved-urls");

  const toolbar = page.getByRole("toolbar", { name: "Saved URLs controls" });
  await expect(toolbar.getByLabel("Search saved URLs")).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Advanced filters" })).toBeVisible();
  await expect(toolbar.locator("#year-filter")).toBeVisible();
  await expect(toolbar.locator("#sortKey")).toBeVisible();
  await expect(toolbar.getByLabel("Quick add URL")).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Comfortable" })).toBeVisible();
  await toolbar.getByRole("button", { name: "Compact" }).click();
  await expect(toolbar.getByRole("button", { name: "Compact" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(toolbar.getByRole("button", { name: "Add URL" })).toBeDisabled();
  await expect
    .poll(() => toolbar.evaluate((node) => getComputedStyle(node).position))
    .toBe("relative");
  await expect(page.getByText("Live search ready")).toHaveCount(0);

  await page.getByRole("button", { name: "Add your first URL" }).click();
  await expect(toolbar.getByLabel("Quick add URL")).toBeFocused();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);


});

test("saved URLs controls remain usable on a mobile viewport", async ({ page }) => {
  await installSavedUrlsApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/saved-urls");

  const toolbar = page.getByRole("toolbar", { name: "Saved URLs controls" });
  await expect(toolbar.getByLabel("Search saved URLs")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add source" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add your first URL" })).toBeVisible();

  await toolbar.getByRole("button", { name: "Advanced filters" }).click();
  const filterSheet = page.getByRole("dialog", { name: "Refine saved URLs" });
  await expect(filterSheet).toBeVisible();
  await filterSheet.getByRole("button", { name: "Done" }).click();
  await expect(filterSheet).toBeHidden();

  await page.getByRole("button", { name: "Add source" }).click();
  const addSourceSheet = page.getByRole("dialog");
  await expect(addSourceSheet).toBeVisible();
  await expect(
    addSourceSheet.getByPlaceholder("https://example.org/source"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

});
