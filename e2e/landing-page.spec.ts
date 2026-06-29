import { expect, test } from "@playwright/test";

test.describe("Smart Scrape landing page", () => {
  test("explains the documented evidence workflow without running app operations", async ({ page }) => {
    const operationalRequests: string[] = [];
    page.on("request", (request) => {
      if (["xhr", "fetch", "websocket"].includes(request.resourceType())) {
        operationalRequests.push(request.url());
      }
    });

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Build an evidence trail that survives scrutiny." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "From research purpose to verified finding." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "One workspace for the complete evidence lifecycle." })).toBeVisible();
    await expect(page.getByText("Illustrative workflow · no live analysis")).toBeVisible();
    expect(operationalRequests).toEqual([]);
  });

  test("presents all five work surfaces with accurate descriptions", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("heading", { name: "One workspace for the complete evidence lifecycle." }).scrollIntoViewIfNeeded();

    const governanceTab = page.getByRole("tab", { name: /Governance Workspace/ });
    await governanceTab.click();
    await expect(governanceTab).toHaveAttribute("aria-selected", "true");
    const surfaceCopy = page.locator(".ssl-surface-panel__copy");
    await expect(surfaceCopy.getByRole("heading", { name: "Investigate governance questions" })).toBeVisible();
    await expect(surfaceCopy.getByText("Retrieve official evidence, trace agencies and timelines, and inspect contradictions.")).toBeVisible();

    const notebookTab = page.getByRole("tab", { name: /Notebook/ });
    await notebookTab.click();
    await expect(surfaceCopy.getByRole("heading", { name: "Analyse selected sources" })).toBeVisible();
    await expect(surfaceCopy.getByText("Control retrieval scope, ask focused questions, inspect citations, and write notes.")).toBeVisible();
  });

  test("supports mobile navigation and reduced motion without horizontal overflow", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const menuButton = page.getByRole("button", { name: "Open menu" });
    await menuButton.click();
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menuButton).toBeFocused();

    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);

    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
      expect(layout.width, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(layout.viewport);
    }
  });
});
