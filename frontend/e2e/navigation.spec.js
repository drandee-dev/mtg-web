import { test, expect } from "./fixtures/test-base.js";
import { waitForAppReady, dismissColdStart, navigateToTab } from "./fixtures/helpers.js";

const atHome = (url) => url.pathname === "/" && url.search === "";

test.describe("Navigation & Layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
  });

  test("app loads and shows My Decks tab by default", async ({ page }) => {
    await expect(page.locator('main[role="tabpanel"]')).toBeVisible();
    // My Decks is the default tab
    await expect(page).toHaveURL(atHome);
  });

  test("all tabs are navigable and render content", async ({ page }) => {
    const tabs = ["Analyze & Build", "Rules", "Card Search", "My Decks"];
    for (const tabName of tabs) {
      await navigateToTab(page, tabName);
      await expect(page.locator('main[role="tabpanel"]')).toBeVisible();
      await expect(page.locator("main")).not.toBeEmpty();
    }
  });

  test("each place has its own address", async ({ page }) => {
    await navigateToTab(page, "Rules");
    await expect(page).toHaveURL(/\/rules$/);

    await navigateToTab(page, "Card Search");
    await expect(page).toHaveURL(/\/cards$/);

    await navigateToTab(page, "Commanders");
    await expect(page).toHaveURL(/\/commanders$/);

    await navigateToTab(page, "My Decks");
    await expect(page).toHaveURL(atHome);
  });

  test("a cold load of /rules opens Rules, and reload stays there", async ({ page }) => {
    await page.goto("/rules");
    await waitForAppReady(page);
    await expect(page.locator(".rules-input-row input")).toBeVisible();
    await expect(page).toHaveURL(/\/rules$/);

    await page.reload();
    await waitForAppReady(page);
    await expect(page.locator(".rules-input-row input")).toBeVisible();
    await expect(page).toHaveURL(/\/rules$/);
  });

  test("an old ?tab= link is replaced by its path", async ({ page }) => {
    await page.goto("/?tab=rules");
    await waitForAppReady(page);
    await expect(page.locator(".rules-input-row input")).toBeVisible();
    await expect(page).toHaveURL(/\/rules$/);

    // Replaced, not stacked: Back leaves for the page before the old link.
    await page.goBack();
    await expect(page).toHaveURL(atHome);
  });

  test("visual: landing page layout", async ({ page }) => {
    await expect(page).toHaveScreenshot("landing.png", { fullPage: true });
  });
});
