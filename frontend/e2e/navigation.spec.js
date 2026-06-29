import { test, expect } from "./fixtures/test-base.js";
import { waitForAppReady, dismissColdStart, navigateToTab } from "./fixtures/helpers.js";

test.describe("Navigation & Layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
  });

  test("app loads and shows My Decks tab by default", async ({ page }) => {
    await expect(page.locator('[role="tabpanel"]')).toBeVisible();
    // My Decks is the default tab
    const url = page.url();
    expect(url).not.toContain("tab=");
  });

  test("all tabs are navigable and render content", async ({ page }) => {
    const tabs = ["Analyze & Build", "Rules", "Card Search", "My Decks"];
    for (const tabName of tabs) {
      await navigateToTab(page, tabName);
      await expect(page.locator('[role="tabpanel"]')).toBeVisible();
      await expect(page.locator("main")).not.toBeEmpty();
    }
  });

  test("tab state persists in URL", async ({ page }) => {
    await navigateToTab(page, "Rules");
    await expect(page).toHaveURL(/tab=rules/);

    await navigateToTab(page, "Card Search");
    await expect(page).toHaveURL(/tab=cards/);

    await navigateToTab(page, "My Decks");
    // My Decks clears the tab param
    expect(page.url()).not.toContain("tab=");
  });

  test("visual: landing page layout", async ({ page }) => {
    await expect(page).toHaveScreenshot("landing.png", { fullPage: true });
  });
});
