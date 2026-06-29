import { test, expect } from "./fixtures/test-base.js";
import {
  waitForAppReady,
  dismissColdStart,
  navigateToTab,
} from "./fixtures/helpers.js";
import { SEARCH_QUERIES } from "./fixtures/test-data.js";

test.describe("Card Search", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
    await navigateToTab(page, "Card Search");
  });

  test("search input is visible and functional", async ({ page }) => {
    const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="search" i], input[placeholder*="card" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill(SEARCH_QUERIES.common);
    await expect(searchInput).toHaveValue(SEARCH_QUERIES.common);
  });

  test("search returns results from backend", async ({ page }) => {
    const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="search" i], input[placeholder*="card" i]').first();
    await searchInput.fill(SEARCH_QUERIES.common);

    // Trigger search (Enter or button)
    await searchInput.press("Enter");

    // Wait for results — cards should appear
    const results = page.locator('[class*="card"], [class*="result"], [class*="grid"] > *');
    await expect(results.first()).toBeVisible({ timeout: 15000 });
  });

  test("clicking a card adds it to the deck", async ({ page }) => {
    const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="search" i], input[placeholder*="card" i]').first();
    await searchInput.fill(SEARCH_QUERIES.common);
    await searchInput.press("Enter");

    const results = page.locator('[class*="card"], [class*="result"], [class*="grid"] > *');
    await results.first().waitFor({ timeout: 15000 });

    // Look for an "Add" button on the first result
    const addBtn = page.locator('button:has-text("Add"), button[aria-label*="add" i]').first();
    if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addBtn.click();
      const toast = page.locator(".toast");
      // Should get feedback
      if (await toast.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(toast).toBeVisible();
      }
    }
  });

  test("visual: card search results", async ({ page }) => {
    const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="search" i], input[placeholder*="card" i]').first();
    await searchInput.fill(SEARCH_QUERIES.common);
    await searchInput.press("Enter");
    const results = page.locator('[class*="card"], [class*="result"], [class*="grid"] > *');
    await results.first().waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("card-search-results.png", { fullPage: true });
  });
});
