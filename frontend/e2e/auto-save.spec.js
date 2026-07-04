// Deck auto-save — a brand-new deck is saved automatically the moment it has
// an identity: arriving via a share link, or picking the first commander.
// Duplicate protection: reopening the same link adopts the saved deck.

import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, navigateToTab } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

const decksInStorage = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("mtgweb:decks") || "[]"));

test.describe("Deck auto-save", () => {
  test("share link auto-saves as a named deck", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await expect.poll(async () => (await decksInStorage(page)).length).toBe(1);
    const decks = await decksInStorage(page);
    expect(decks[0].name).toBe(TEST_COMMANDER);
    expect(decks[0].decklist_text).toContain("Rhystic Study");
    // The open deck adopts the saved identity — header shows the name
    await expect(
      page.locator(".deck-title:visible, .mobile-deck-name:visible").first()
    ).toContainText("Atraxa");
  });

  test("revisiting the same share link does not duplicate", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await expect.poll(async () => (await decksInStorage(page)).length).toBe(1);

    await page.reload();
    await page.waitForSelector('[role="tabpanel"]');
    // Give the auto-save effect time to run (it should dedup, not save)
    await page.waitForTimeout(800);
    expect((await decksInStorage(page)).length).toBe(1);
  });

  test("picking a first commander auto-saves a new deck", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".app");
    await navigateToTab(page, "Analyze & Build");

    await page.locator("#cmd-input").fill("atraxa");
    await page.locator(".autocomplete .ac-item").first().click();

    await expect.poll(async () => (await decksInStorage(page)).length).toBe(1);
    const decks = await decksInStorage(page);
    expect(decks[0].name).toBe(TEST_COMMANDER);
    await expect(
      page.locator(".deck-title:visible, .mobile-deck-name:visible").first()
    ).toContainText("Atraxa");
  });
});
