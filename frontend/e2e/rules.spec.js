import { test, expect } from "./fixtures/test-base.js";
import {
  waitForAppReady,
  dismissColdStart,
  navigateToTab,
} from "./fixtures/helpers.js";

test.describe("Rules", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
    await navigateToTab(page, "Rules");
  });

  test("rules tab renders with search input", async ({ page }) => {
    const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="rule" i], input[placeholder*="search" i], textarea').first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });
  });

  test("rules search returns results", async ({ page }) => {
    const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="rule" i], input[placeholder*="search" i], textarea').first();
    await searchInput.fill("trample");
    await searchInput.press("Enter");

    // The AI answer bubble, not the question echoed back in the user bubble.
    await expect(page.locator(".rules-msg-ai-text")).toContainText(
      "assign excess combat damage", { timeout: 15000 },
    );
    await expect(page.locator(".rules-citation")).toContainText("702.19");
  });

  test("empty answer shows a toast, not a blank bubble", async ({ page }) => {
    // Registered after the shared mock, so it wins for this test.
    await page.route("**/api/rules/ask/stream", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body:
          `data: ${JSON.stringify({ status: "done", text: "" })}\n\n` +
          `data: ${JSON.stringify({ status: "citations", citations: [], cards: [] })}\n\n`,
      }),
    );
    const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="rule" i], input[placeholder*="search" i], textarea').first();
    await searchInput.fill("trample");
    await searchInput.press("Enter");

    await expect(page.locator(".toast")).toContainText("empty reply");
    await expect(page.locator(".rules-msg-user-bubble")).toContainText("trample");
    await expect(page.locator(".rules-msg-ai")).toHaveCount(0);
  });

  test("visual: rules tab", async ({ page }) => {
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("rules-tab.png", { fullPage: true });
  });
});
