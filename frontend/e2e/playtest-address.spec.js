// Playtest has its own address while it is open (UX overhaul job 1.5):
// /decks/<id>/playtest. It is a layer over the deck, so Back closes it and a
// reload lands on the deck. Runs against the hermetic mock backend.

import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, deckMenuAction, waitForAppReady, dismissColdStart, seedLocalDecks } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER, TEST_DECK_STORAGE } from "./fixtures/test-data.js";

const DECK_URL = /\/decks\/[^/]+$/;
const PLAYTEST_URL = /\/decks\/[^/]+\/playtest$/;

async function openPlaytest(page) {
  // Desktop header has a direct "Playtest" button; mobile keeps it in the ⋯ menu.
  const directBtn = page.locator('.dh-actions button:has-text("Playtest")');
  if (await directBtn.isVisible()) await directBtn.click();
  else await deckMenuAction(page, "Playtest");
  await page.locator('h2:has-text("Playtest")').waitFor({ timeout: 8000 });
}

test.describe("Playtest address", () => {
  test("opening Playtest shows its address, and Back closes it onto the deck", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await expect(page).toHaveURL(DECK_URL);
    await openPlaytest(page);
    await expect(page).toHaveURL(PLAYTEST_URL);

    await page.goBack();
    await expect(page.locator('h2:has-text("Playtest")')).toHaveCount(0);
    await expect(page).toHaveURL(DECK_URL);
    await expect(page.locator(".deck-head")).toBeVisible();
  });

  test("Close puts the deck's address back", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openPlaytest(page);
    await expect(page).toHaveURL(PLAYTEST_URL);

    await page.locator('button:has-text("Close")').click();
    await expect(page.locator('h2:has-text("Playtest")')).toHaveCount(0);
    await expect(page).toHaveURL(DECK_URL);
  });

  test("a reload at the playtest address lands on the deck, at the deck's address", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openPlaytest(page);
    await expect(page).toHaveURL(PLAYTEST_URL);

    await page.reload();
    await waitForAppReady(page);
    await expect(page.locator(".deck-head")).toBeVisible();
    await expect(page.locator('h2:has-text("Playtest")')).toHaveCount(0);
    await expect(page).toHaveURL(DECK_URL);
  });

  test("leaving a closed Playtest by Back goes to where you were, not to a stale playtest address", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openPlaytest(page);
    await page.locator('button:has-text("Close")').click();
    await expect(page).toHaveURL(DECK_URL);
    // Back from the deck must not land on /playtest (the closed layer's entry).
    await page.goBack();
    await expect(page).not.toHaveURL(PLAYTEST_URL);
    await expect(page.locator('h2:has-text("Playtest")')).toHaveCount(0);
  });

  // Opened from a tile on the Decks home, the deck and the layer arrive in one
  // commit: one entry each, the playtest one carrying the playtest address.
  test("Playtest from a Decks-home tile: its address, then the deck, then Decks", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
    await seedLocalDecks(page, [TEST_DECK_STORAGE]);
    await page.reload();
    await waitForAppReady(page);
    await dismissColdStart(page);

    await page.getByRole("button", { name: `Actions for ${TEST_DECK_STORAGE.name}` }).click();
    await page.locator(".deck-card-menu-item", { hasText: "Playtest" }).click();
    await page.locator('h2:has-text("Playtest")').waitFor({ timeout: 8000 });
    await expect(page).toHaveURL(`/decks/${TEST_DECK_STORAGE.id}/playtest`);

    await page.goBack();
    await expect(page.locator('h2:has-text("Playtest")')).toHaveCount(0);
    await expect(page).toHaveURL(`/decks/${TEST_DECK_STORAGE.id}`);
    await page.goBack();
    await expect(page).toHaveURL((u) => u.pathname === "/");
  });
});
