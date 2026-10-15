// Per-deck drafts (UX overhaul decision 6): unsaved edits to a saved deck are
// kept in the browser as they happen, come back when the deck is reopened, and
// show as "Unsaved" beside Save. Leaving a saved deck never asks "discard?".

import { test, expect } from "./fixtures/test-base.js";
import {
  waitForAppReady,
  dismissColdStart,
  seedLocalDecks,
  navigateToTab,
  backToDeck,
  loadSharedDeck,
  deckMenuAction,
} from "./fixtures/helpers.js";
import { TEST_DECK_STORAGE, TEST_DECK_TEXT, TEST_DECK_LINES, TEST_COMMANDER } from "./fixtures/test-data.js";

const OTHER_DECK = {
  id: "test-deck-2",
  name: "Other deck",
  format: "commander",
  decklist_text: `Commander\n1 ${TEST_COMMANDER}\n\nDeck\n1 Sol Ring\n1 Command Tower`,
};

const draftOf = (page, id) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k)), `mtgweb:draft:${id}`);
const savedDecks = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("mtgweb:decks") || "[]"));
const unsavedMark = (page) => page.locator(".deck-unsaved:visible");
const deckTitle = (page) => page.locator(".deck-title");
const boltInDeck = (page) => page.locator('.card-grid-container [aria-label*="Lightning Bolt"]');

async function openFromDecks(page, name) {
  await page.locator(".deck-card", { hasText: name }).locator(".deck-card-art").click();
  await expect(deckTitle(page)).toContainText(name);
  await expect(page.locator(".card-grid-container")).toBeVisible({ timeout: 10000 });
}

// An edit that works on both viewports: add a card from Card Search.
async function addBolt(page) {
  await navigateToTab(page, "Card Search");
  const name = page.locator('input[placeholder="bolt"]');
  await name.fill("bolt");
  await name.press("Enter");
  await page.locator(".results-table tbody tr", { hasText: "Lightning Bolt" })
    .getByRole("button", { name: /^Add to / }).click();
  await backToDeck(page);
  await expect(page.locator(".card-grid-container")).toBeVisible();
}

test.describe("Deck drafts", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
    await seedLocalDecks(page, [TEST_DECK_STORAGE, OTHER_DECK]);
    await page.reload();
    await waitForAppReady(page);
    await dismissColdStart(page);
  });

  test("a deck just opened is not unsaved; an edit marks it and is kept as a draft", async ({ page }) => {
    await openFromDecks(page, TEST_DECK_STORAGE.name);
    await expect(unsavedMark(page)).toHaveCount(0);
    expect(await draftOf(page, TEST_DECK_STORAGE.id)).toBeNull();

    await addBolt(page);
    await expect(unsavedMark(page)).toHaveText("Unsaved");
    await expect.poll(async () => (await draftOf(page, TEST_DECK_STORAGE.id))?.decklist_text).toContain("Lightning Bolt");
    // The deck itself is untouched until Save.
    const saved = (await savedDecks(page)).find((d) => d.id === TEST_DECK_STORAGE.id);
    expect(saved.decklist_text).not.toContain("Lightning Bolt");
  });

  test("the draft comes back after a reload and after opening another deck, with no prompt", async ({ page }) => {
    const dialogs = [];
    page.on("dialog", (d) => { dialogs.push(d.type()); d.dismiss().catch(() => {}); });

    await openFromDecks(page, TEST_DECK_STORAGE.name);
    await addBolt(page);
    await expect(unsavedMark(page)).toHaveText("Unsaved");

    await page.reload();
    await waitForAppReady(page);
    await page.goto("/");
    await waitForAppReady(page);
    await openFromDecks(page, TEST_DECK_STORAGE.name);
    await expect(boltInDeck(page).first()).toBeAttached();
    await expect(unsavedMark(page)).toHaveText("Unsaved");

    // Opening another deck goes straight through (a dismissed "discard?"
    // confirm would leave the first deck on screen) and shows that deck clean.
    await navigateToTab(page, "My Decks");
    await openFromDecks(page, OTHER_DECK.name);
    await expect(unsavedMark(page)).toHaveCount(0);
    await expect(boltInDeck(page)).toHaveCount(0);

    await navigateToTab(page, "My Decks");
    await openFromDecks(page, TEST_DECK_STORAGE.name);
    await expect(boltInDeck(page).first()).toBeAttached();
    await expect(unsavedMark(page)).toHaveText("Unsaved");
    expect(dialogs).toEqual([]);
  });

  test("Save writes the deck and clears the draft", async ({ page }) => {
    await openFromDecks(page, TEST_DECK_STORAGE.name);
    await addBolt(page);
    await expect(unsavedMark(page)).toHaveText("Unsaved");

    await page.locator("button.primary:visible", { hasText: /^Save/ }).first().click();
    await expect(unsavedMark(page)).toHaveCount(0);
    await expect.poll(async () => draftOf(page, TEST_DECK_STORAGE.id)).toBeNull();
    const saved = (await savedDecks(page)).find((d) => d.id === TEST_DECK_STORAGE.id);
    expect(saved.decklist_text).toContain("Lightning Bolt");
  });

  test("Discard changes returns to the saved deck, and Undo brings the edits back", async ({ page }) => {
    await openFromDecks(page, TEST_DECK_STORAGE.name);
    // Nothing to discard on a clean deck.
    await page.locator(".more-menu-btn:visible").first().click();
    await expect(page.locator('.more-menu-item:has-text("Discard changes")')).toHaveCount(0);
    await page.keyboard.press("Escape");

    await addBolt(page);
    await expect(unsavedMark(page)).toHaveText("Unsaved");
    await deckMenuAction(page, "Discard changes");
    await expect(unsavedMark(page)).toHaveCount(0);
    await expect(boltInDeck(page)).toHaveCount(0);
    await expect.poll(async () => draftOf(page, TEST_DECK_STORAGE.id)).toBeNull();

    await page.locator(".toast .toast-action", { hasText: "Undo" }).click();
    await expect(unsavedMark(page)).toHaveText("Unsaved");
    await expect(boltInDeck(page).first()).toBeAttached();
    await expect.poll(async () => (await draftOf(page, TEST_DECK_STORAGE.id))?.decklist_text).toContain("Lightning Bolt");
  });

  test("a format change counts as unsaved, not only card edits", async ({ page, isMobile }) => {
    test.skip(isMobile, "the format select is in the desktop header");
    await openFromDecks(page, TEST_DECK_STORAGE.name);
    await expect(unsavedMark(page)).toHaveCount(0);

    await page.locator(".dh-format").selectOption("legacy");
    await expect(unsavedMark(page)).toHaveText("Unsaved");
    expect((await draftOf(page, TEST_DECK_STORAGE.id)).format).toBe("legacy");

    await page.locator(".dh-format").selectOption("commander");
    await expect(unsavedMark(page)).toHaveCount(0);
    await expect.poll(async () => draftOf(page, TEST_DECK_STORAGE.id)).toBeNull();
  });

  // Each edit here leaves the deck's own card list alone, which is all the
  // old check looked at.
  test("a Considering change or a commander change counts as unsaved", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop card-modal flow");
    await seedLocalDecks(page, [{
      ...TEST_DECK_STORAGE,
      decklist_text: `${TEST_DECK_STORAGE.decklist_text}\nMaybeboard\n1 Lightning Bolt`,
    }]);
    await page.reload();
    await waitForAppReady(page);
    await openFromDecks(page, TEST_DECK_STORAGE.name);
    await expect(unsavedMark(page)).toHaveCount(0);

    const considering = page.locator(".considering-group, .stack-column-considering");
    await considering.locator('[aria-label*="Lightning Bolt"]').first().click();
    await page.locator(".cdm-panel button.btn-danger", { hasText: "Remove" }).click();
    await expect(unsavedMark(page)).toHaveText("Unsaved");
    await expect.poll(async () => (await draftOf(page, TEST_DECK_STORAGE.id))?.decklist_text).not.toContain("Lightning Bolt");
    const afterConsidering = (await draftOf(page, TEST_DECK_STORAGE.id)).decklist_text;
    for (const line of TEST_DECK_LINES) expect(afterConsidering).toContain(line);

    await deckMenuAction(page, "Discard changes");
    await expect(unsavedMark(page)).toHaveCount(0);

    await page.locator(`.card-grid-container [aria-label*="${TEST_COMMANDER.split(",")[0]}"]`).first().click();
    await page.locator(".cdm-actions button", { hasText: "Change commander" }).click();
    await expect(unsavedMark(page)).toHaveText("Unsaved");
    await expect.poll(async () => (await draftOf(page, TEST_DECK_STORAGE.id))?.decklist_text).not.toContain(TEST_COMMANDER);
    const afterCommander = (await draftOf(page, TEST_DECK_STORAGE.id)).decklist_text;
    for (const line of TEST_DECK_LINES) expect(afterCommander).toContain(line);
  });

  test("deleting a deck and undoing brings its unsaved edits back", async ({ page }) => {
    await openFromDecks(page, TEST_DECK_STORAGE.name);
    await addBolt(page);
    await expect(unsavedMark(page)).toHaveText("Unsaved");

    await navigateToTab(page, "My Decks");
    const tile = page.locator(".deck-card", { hasText: TEST_DECK_STORAGE.name });
    await tile.getByRole("button", { name: /^Actions for / }).click();
    await tile.locator(".deck-card-menu-item", { hasText: "Delete" }).click();
    await expect(tile).toHaveCount(0);
    expect(await draftOf(page, TEST_DECK_STORAGE.id)).toBeNull();

    await page.locator(".toast .toast-action", { hasText: "Undo" }).click();
    await openFromDecks(page, TEST_DECK_STORAGE.name);
    await expect(boltInDeck(page).first()).toBeAttached();
    await expect(unsavedMark(page)).toHaveText("Unsaved");
  });
});

// A share link opened again is re-read and matched back onto the saved deck,
// so that path has to restore the draft too.
test("opening a share link again keeps the edits made since it was saved", async ({ page }) => {
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  await expect.poll(async () => (await savedDecks(page)).length).toBe(1);
  const [{ id }] = await savedDecks(page);
  await expect(unsavedMark(page)).toHaveCount(0);

  await addBolt(page);
  await expect(unsavedMark(page)).toHaveText("Unsaved");
  await expect.poll(async () => (await draftOf(page, id))?.decklist_text).toContain("Lightning Bolt");

  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  await expect(boltInDeck(page).first()).toBeAttached({ timeout: 10000 });
  await expect(unsavedMark(page)).toHaveText("Unsaved");
  expect((await savedDecks(page)).length).toBe(1);
});
