// Suggested goals — when a deck has no goals set, the analyzed reality
// (detected bracket, price + headroom) is offered as a one-tap starting goal
// set. Never silently applied; dismissal persists per deck.

import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

test.describe("Deck goals — suggested from analysis", () => {
  test.skip(({ isMobile }) => isMobile, "desktop sidebar flow");

  test("banner offers detected bracket + price headroom; Use adopts them", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    // Mock analyze: bracket 2, $68.93 → suggested ceiling $100 (15% headroom, $25 steps)
    const bar = page.locator(".dg-suggest-bar");
    await expect(bar).toBeVisible({ timeout: 15000 }); // waits out the 2s analyze debounce
    await expect(bar).toContainText("bracket 2");
    await expect(bar).toContainText("$100");

    await bar.locator("button", { hasText: "Use these" }).click();
    await expect(page.locator(".dg-suggest-bar")).toHaveCount(0);
    const chips = page.locator(".deck-goals .dg-chips");
    await expect(chips).toContainText("B2 target");
    await expect(chips).toContainText("≤ $100");
  });

  test("dismiss hides the banner and persists across reload", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const bar = page.locator(".dg-suggest-bar");
    await expect(bar).toBeVisible({ timeout: 15000 });
    await bar.locator(".dg-suggest-x").click();
    await expect(page.locator(".dg-suggest-bar")).toHaveCount(0);

    // Same deck id on reload (share-link dedup) — dismissal must stick
    await page.reload();
    await page.waitForSelector(".deck-goals", { timeout: 15000 });
    await page.waitForTimeout(3500); // analyze debounce would re-show it if not persisted
    await expect(page.locator(".dg-suggest-bar")).toHaveCount(0);
  });
});
