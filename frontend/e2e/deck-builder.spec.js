import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, deckMenuAction } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

test.describe("Deck Builder", () => {
  test("shared deck link loads cards into the grid", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await expect(page.locator(".card-grid-container")).toBeVisible();
    // Commander-format completeness badge appears once cards are parsed.
    await expect(page.locator('.badge:has-text("/ 100")').first()).toBeVisible({ timeout: 10000 });
  });

  test("card groups render for the loaded deck", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    // Default grid view groups by type — at least one group header should appear.
    await expect(page.locator(".card-group, .stack-view").first()).toBeVisible({ timeout: 10000 });
  });

  test("share link action copies a URL to the clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await deckMenuAction(page, "Share link");
    await expect(page.locator(".toast")).toContainText(/copied|share/i, { timeout: 4000 });
  });

  test("visual: deck view with cards (grid)", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await page.locator('.badge:has-text("/ 100")').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot("deck-view-cards.png", { fullPage: true });
  });
});
