import { test, expect } from "./fixtures/test-base.js";
import {
  waitForAppReady,
  dismissColdStart,
  navigateToTab,
  seedLocalDecks,
  clearLocalStorage,
} from "./fixtures/helpers.js";
import { TEST_DECK_STORAGE } from "./fixtures/test-data.js";

test.describe("My Decks", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
  });

  test("empty state shows a get-started call to action", async ({ page }) => {
    await clearLocalStorage(page);
    await page.reload();
    await waitForAppReady(page);
    await dismissColdStart(page);

    await expect(page.locator("main")).toBeVisible();
    // New-user landing surfaces a "Start…" CTA — desktop shows "Start with AI",
    // mobile shows "Start Building". Match whichever is visible for the viewport.
    await expect(
      page.getByRole("button", { name: /start/i }).filter({ visible: true }).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("seeded decks appear in the list", async ({ page }) => {
    await seedLocalDecks(page, [TEST_DECK_STORAGE]);
    await page.reload();
    await waitForAppReady(page);
    await dismissColdStart(page);

    await expect(page.locator(`text=${TEST_DECK_STORAGE.name}`)).toBeVisible({ timeout: 5000 });
  });

  test("opening a deck shows it in the editor", async ({ page }) => {
    await seedLocalDecks(page, [TEST_DECK_STORAGE]);
    await page.reload();
    await waitForAppReady(page);
    await dismissColdStart(page);

    // Clicking the deck card's art opens it in the editor (the old hover
    // overlay with Edit/Playtest/Export buttons was removed).
    await page.locator(".deck-card .deck-card-art").first().click();

    await expect(page).toHaveURL(/tab=deck/);
    await expect(page.locator(".card-grid-container")).toBeVisible({ timeout: 10000 });
  });

  test("visual: my decks with saved deck", async ({ page }) => {
    await seedLocalDecks(page, [TEST_DECK_STORAGE]);
    await page.reload();
    await waitForAppReady(page);
    await dismissColdStart(page);
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("my-decks-with-deck.png", { fullPage: true });
  });
});
