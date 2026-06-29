import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, deckMenuAction } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

async function openPlaytest(page) {
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  await deckMenuAction(page, "Playtest");
  await page.locator('h2:has-text("Playtest")').waitFor({ timeout: 8000 });
}

test.describe("Playtest", () => {
  test("entering playtest shows the UI with an opening hand", async ({ page }) => {
    await openPlaytest(page);
    await expect(page.locator('h2:has-text("Playtest")')).toBeVisible();
    await expect(page.locator('h3:has-text("Hand (")')).toBeVisible();
    await expect(page.locator(':text("Opening hand")')).toBeVisible();
  });

  test("keep hand advances to the playing phase", async ({ page }) => {
    await openPlaytest(page);
    await page.locator('button:has-text("Keep")').click();
    await expect(page.locator('button:has-text("Next turn")')).toBeVisible();
  });

  test("close returns to the deck view", async ({ page }) => {
    await openPlaytest(page);
    await page.locator('button:has-text("Close")').click();
    await expect(page.locator('h2:has-text("Playtest")')).toHaveCount(0);
    await expect(page.locator('.badge:has-text("/ 100")').first()).toBeVisible();
  });

  // No visual snapshot here: the opening hand is randomly shuffled, so a screenshot
  // would differ every run. The functional tests above cover playtest behavior.
});
