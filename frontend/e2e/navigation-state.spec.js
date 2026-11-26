// Navigation & state-persistence audit (2026-07-17): browser back walks tab
// history instead of exiting the app, and tab-local work (rules answers, card
// searches) survives leaving and returning to the tab.
import { test, expect } from "./fixtures/test-base.js";
import {
  waitForAppReady,
  dismissColdStart,
  navigateToTab,
} from "./fixtures/helpers.js";

test.describe("Navigation & state persistence", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
  });

  const litPlace = (page) => page.locator('nav[aria-label="Main"]:visible [aria-current="page"]');

  test("browser back returns to the previous tab", async ({ page }) => {
    await navigateToTab(page, "Commanders");
    await expect(page).toHaveURL(/\/commanders$/);
    await navigateToTab(page, "Card Search");
    await expect(page).toHaveURL(/\/cards$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/commanders$/);
    await expect(litPlace(page)).toHaveText("Commanders");
    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === "/" && url.search === ""); // decks (default) again

    await page.goForward();
    await expect(page).toHaveURL(/\/commanders$/);
    await expect(litPlace(page)).toHaveText("Commanders");
  });

  // A pop that changes neither tab nor commander (the skip link's #main-content
  // jump fires one) must not leave the next navigation without an address.
  test("an in-page jump does not swallow the next navigation", async ({ page }) => {
    await navigateToTab(page, "Commanders");
    await expect(page).toHaveURL(/\/commanders$/);
    await page.evaluate(() => { window.location.hash = "main-content"; });
    await expect(page).toHaveURL(/\/commanders#main-content$/);

    await navigateToTab(page, "Card Search");
    await expect(page).toHaveURL((url) => url.pathname === "/cards");
    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === "/commanders");
  });

  test("card search results survive a tab switch", async ({ page }) => {
    await navigateToTab(page, "Card Search");
    const nameInput = page.locator('input[placeholder="bolt"]');
    await nameInput.fill("bolt");
    await nameInput.press("Enter");
    await expect(page.locator(".results-table tbody tr").first()).toBeVisible({ timeout: 10000 });

    await navigateToTab(page, "Commanders");
    await navigateToTab(page, "Card Search");
    await expect(page.locator(".results-table tbody tr").first()).toBeVisible();
    await expect(nameInput).toHaveValue("bolt");
  });
});
