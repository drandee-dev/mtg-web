import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, deckMenuAction } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

test.describe("Deck Builder", () => {
  test("shared deck link loads cards into the grid", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await expect(page.locator(".card-grid-container")).toBeVisible();
    // The header's count, commander included, once cards are parsed. Shown on
    // both sizes since job 3.2.
    await expect(page.locator(".deck-head-count")).toHaveText("11 / 100 cards", { timeout: 10000 });
  });

  test("card groups render for the loaded deck", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    // Default stack view groups by type — at least one group header should appear.
    await expect(page.locator(".card-group, .stack-view").first()).toBeVisible({ timeout: 10000 });
  });

  test("share link action copies a URL to the clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await deckMenuAction(page, "Share link");
    await expect(page.locator(".toast")).toContainText(/copied|share/i, { timeout: 4000 });
  });

  test("visual: deck view with cards (grid)", async ({ page }) => {
    // This snapshot is specifically about the grid layout (see title) — force
    // it rather than ride whatever the default happens to be.
    await page.addInitScript(() => {
      try { localStorage.setItem("mtgweb:viewMode", "grid"); } catch { /* ignore */ }
    });
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await page.locator(".deck-head-count").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot("deck-view-cards.png", { fullPage: true });
  });
});
