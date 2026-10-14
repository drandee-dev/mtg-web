// A share link's deck is saved the moment it arrives, like every new deck.
// Duplicate protection: reopening the same link opens the deck it already made.
// (The other ways a deck is made, and a share link whose save fails, are in
// new-deck.spec.js. A commander picked in a deck is an edit now, not a save.)

import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck } from "./fixtures/helpers.js";
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

    // A reload is on the saved deck's own address now, so open the link again.
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    // Give a second save time to land (it should dedup, not save)
    await page.waitForTimeout(800);
    expect((await decksInStorage(page)).length).toBe(1);
    const [{ id }] = await decksInStorage(page);
    await expect(page).toHaveURL(new RegExp(`/decks/${id}$`));
  });

});
