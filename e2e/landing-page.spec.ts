import { expect, test } from "@playwright/test";

test.describe("AQlibrary+ landing page", () => {
  test("explains the documented evidence workflow without running app operations", async ({ page }) => {
    const operationalRequests: string[] = [];
    page.on("request", (request) => {
      if (["xhr", "fetch", "websocket"].includes(request.resourceType())) {
        operationalRequests.push(request.url());
      }
    });

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Find the source. Keep the proof. Explain what happened." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "From first question to checked answer." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Everything you need to collect, organize, and explain records." })).toBeVisible();
    await expect(page.getByText("Workspace overview")).toBeVisible();
    expect(operationalRequests).toEqual([]);
  });

  test("presents all five work surfaces with accurate descriptions", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("heading", { name: "Everything you need to collect, organize, and explain records." }).scrollIntoViewIfNeeded();

    const governanceTab = page.getByRole("tab", { name: /Governance Workspace/ });
    await governanceTab.click();
    await expect(governanceTab).toHaveAttribute("aria-selected", "true");
    const surfaceCopy = page.locator(".ssl-surface-panel__copy");
    await expect(surfaceCopy.getByRole("heading", { name: "Understand what happened" })).toBeVisible();
    await expect(surfaceCopy.getByText("Compare official records, follow agency actions, build timelines, and spot gaps in the story.")).toBeVisible();

    const notebookTab = page.getByRole("tab", { name: /Notebook/ });
    await notebookTab.click();
    await expect(surfaceCopy.getByRole("heading", { name: "Turn records into notes" })).toBeVisible();
    await expect(surfaceCopy.getByText("Ask questions about selected sources, check cited passages, and write up what the records show.")).toBeVisible();
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
