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

  test("browser back returns to the previous tab", async ({ page }) => {
    await navigateToTab(page, "Rules");
    await expect(page).toHaveURL(/tab=rules/);
    await navigateToTab(page, "Card Search");
    await expect(page).toHaveURL(/tab=cards/);

    await page.goBack();
    await expect(page).toHaveURL(/tab=rules/);
    await page.goBack();
    await expect(page).not.toHaveURL(/tab=/); // decks (default) again
  });

  test("rules Q&A history survives a tab switch", async ({ page }) => {
    // Seed a completed exchange the way Rules.jsx persists one.
    await page.evaluate(() => {
      localStorage.setItem("mtgweb:ruleschat", JSON.stringify([
        { role: "user", text: "Does deathtouch kill planeswalkers?" },
        { role: "ai", text: "Deathtouch only applies to damage dealt to creatures.", citations: [] },
      ]));
    });
    await page.reload();
    await waitForAppReady(page);
    await navigateToTab(page, "Rules");
    await expect(page.locator(".rules-msg-user-bubble")).toContainText("deathtouch");

    await navigateToTab(page, "Card Search");
    await navigateToTab(page, "Rules");
    await expect(page.locator(".rules-msg-user-bubble")).toContainText("deathtouch");

    // Clear history empties the thread and restores the quick-ask chips.
    await page.locator(".rules-header button", { hasText: "Clear history" }).click();
    await expect(page.locator(".rules-msg-user-bubble")).toHaveCount(0);
    await expect(page.locator(".rules-chips button").first()).toBeVisible();
  });

  test("card search results survive a tab switch", async ({ page }) => {
    await navigateToTab(page, "Card Search");
    const nameInput = page.locator('input[placeholder="bolt"]');
    await nameInput.fill("bolt");
    await nameInput.press("Enter");
    await expect(page.locator(".results-table tbody tr").first()).toBeVisible({ timeout: 10000 });

    await navigateToTab(page, "Rules");
    await navigateToTab(page, "Card Search");
    await expect(page.locator(".results-table tbody tr").first()).toBeVisible();
    await expect(nameInput).toHaveValue("bolt");
  });
});
