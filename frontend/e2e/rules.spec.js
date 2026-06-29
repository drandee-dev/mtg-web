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

    // Wait for results to appear
    const results = page.locator("main").locator("text=/trample/i");
    await expect(results.first()).toBeVisible({ timeout: 15000 });
  });

  test("visual: rules tab", async ({ page }) => {
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("rules-tab.png", { fullPage: true });
  });
});
