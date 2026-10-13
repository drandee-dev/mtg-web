// Deck addresses (UX overhaul job 1.4): a saved deck is /decks/<id> and the
// editor with no saved deck in it is /new. Reload, a bookmark, a second
// browser tab, Back and Forward all land on the deck the address names.

import { test, expect } from "./fixtures/test-base.js";
import {
  openAddress,
  waitForAppReady,
  seedLocalDecks,
  navigateToTab,
  loadSharedDeck,
} from "./fixtures/helpers.js";
import { TEST_DECK_STORAGE, TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

const DECK_A = { ...TEST_DECK_STORAGE, updated_at: "2026-01-02T00:00:00.000Z" };
const DECK_B = {
  id: "test-deck-2",
  name: "Other deck",
  format: "commander",
  decklist_text: `Commander\n1 ${TEST_COMMANDER}\n\nDeck\n1 Sol Ring\n1 Command Tower`,
  updated_at: "2026-01-01T00:00:00.000Z",
};

const savedDecks = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("mtgweb:decks") || "[]"));
const draftOf = (page, id) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k)), `mtgweb:draft:${id}`);
const atPath = (path) => (url) => url.pathname === path && url.search === "";
const deckTitle = (page) => page.locator(".deck-title:visible, .mobile-deck-name:visible").first();
const grid = (page) => page.locator(".card-grid-container");
const inDeck = (page, card) => grid(page).locator(`[aria-label*="${card}"]`);
const unsavedMark = (page) => page.locator(".deck-unsaved:visible");

async function openFromDecks(page, name) {
  await page.locator(".deck-card", { hasText: name }).locator(".deck-card-art").click();
  await expect(deckTitle(page)).toContainText(name);
  await expect(grid(page)).toBeVisible({ timeout: 10000 });
}

// An edit that works on both viewports: add a card from Card Search.
async function addBolt(page) {
  await navigateToTab(page, "Card Search");
  const name = page.locator('input[placeholder="bolt"]');
  await name.fill("bolt");
  await name.press("Enter");
  await page.locator(".results-table tbody tr", { hasText: "Lightning Bolt" })
    .getByRole("button", { name: "+ Add" }).click();
  await navigateToTab(page, "Analyze & Build");
  await expect(grid(page)).toBeVisible();
}

test.describe("Deck addresses", () => {
  test.beforeEach(async ({ page }) => {
    await openAddress(page, "/");
    await seedLocalDecks(page, [DECK_A, DECK_B]);
    await openAddress(page, "/");
  });

  test("an open deck has its own address and title, and a reload stays on it", async ({ page }) => {
    await openFromDecks(page, DECK_A.name);
    await expect(page).toHaveURL(atPath(`/decks/${DECK_A.id}`));
    await expect(page).toHaveTitle(`${DECK_A.name} · MTG Workshop`);

    await page.reload();
    await waitForAppReady(page);
    await expect(page).toHaveURL(atPath(`/decks/${DECK_A.id}`));
    await expect(deckTitle(page)).toContainText(DECK_A.name);
    await expect(inDeck(page, "Rhystic Study").first()).toBeAttached({ timeout: 10000 });
    await expect(unsavedMark(page)).toHaveCount(0);
  });

  test("a cold load opens the deck without saving anything", async ({ page }) => {
    await openAddress(page, `/decks/${DECK_B.id}`);
    await expect(deckTitle(page)).toContainText(DECK_B.name);
    await expect(inDeck(page, "Sol Ring").first()).toBeAttached({ timeout: 10000 });
    await expect(inDeck(page, "Rhystic Study")).toHaveCount(0);
    await expect(page).toHaveTitle(`${DECK_B.name} · MTG Workshop`);

    // Give a stray auto-save time to run; the stored decks must be untouched.
    await page.waitForTimeout(800);
    expect(await savedDecks(page)).toEqual([DECK_A, DECK_B]);
    expect(await draftOf(page, DECK_B.id)).toBeNull();
  });

  test("unsaved edits come back when the deck is opened from its address", async ({ page }) => {
    await openFromDecks(page, DECK_A.name);
    await addBolt(page);
    await expect(unsavedMark(page)).toHaveText("Unsaved");
    await expect.poll(async () => (await draftOf(page, DECK_A.id))?.decklist_text).toContain("Lightning Bolt");

    await openAddress(page, `/decks/${DECK_A.id}`);
    await expect(inDeck(page, "Lightning Bolt").first()).toBeAttached({ timeout: 10000 });
    await expect(unsavedMark(page)).toHaveText("Unsaved");
    const saved = (await savedDecks(page)).find((d) => d.id === DECK_A.id);
    expect(saved).toEqual(DECK_A);
  });

  test("an unknown id says so and links back to Decks", async ({ page }) => {
    await openAddress(page, "/decks/no-such-deck");
    await expect(page.getByRole("heading", { name: "Deck not found" })).toBeVisible();
    await expect(page).toHaveTitle("Deck not found · MTG Workshop");
    await expect(grid(page)).toHaveCount(0);
    expect(await savedDecks(page)).toEqual([DECK_A, DECK_B]);

    await page.getByRole("button", { name: /Back to decks/ }).click();
    await expect(page).toHaveURL(atPath("/"));
    await expect(page.locator(".deck-card", { hasText: DECK_A.name })).toBeVisible();
  });

  test("Back and Forward move between two decks", async ({ page }) => {
    await openFromDecks(page, DECK_A.name);
    await navigateToTab(page, "My Decks");
    await openFromDecks(page, DECK_B.name);
    await expect(page).toHaveURL(atPath(`/decks/${DECK_B.id}`));
    await expect(inDeck(page, "Rhystic Study")).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(atPath("/"));
    await page.goBack();
    await expect(page).toHaveURL(atPath(`/decks/${DECK_A.id}`));
    await expect(deckTitle(page)).toContainText(DECK_A.name);
    await expect(inDeck(page, "Rhystic Study").first()).toBeAttached({ timeout: 10000 });

    await page.goForward();
    await page.goForward();
    await expect(page).toHaveURL(atPath(`/decks/${DECK_B.id}`));
    await expect(deckTitle(page)).toContainText(DECK_B.name);
    await expect(inDeck(page, "Sol Ring").first()).toBeAttached({ timeout: 10000 });
    await expect(inDeck(page, "Rhystic Study")).toHaveCount(0);
    // Walking history saves nothing.
    expect(await savedDecks(page)).toEqual([DECK_A, DECK_B]);
  });

  test("the empty editor is /new, and an old ?tab=deck link lands there", async ({ page }) => {
    await navigateToTab(page, "Analyze & Build");
    await expect(page).toHaveURL(atPath("/new"));
    await expect(page.locator(".empty-deck")).toBeVisible();

    await openAddress(page, "/?tab=deck");
    await expect(page).toHaveURL(atPath("/new"));
    await expect(page.locator(".empty-deck")).toBeVisible();
  });

  test("a new deck takes over /new when it is saved, so Back skips the empty editor", async ({ page }) => {
    await navigateToTab(page, "Analyze & Build");
    await expect(page).toHaveURL(atPath("/new"));
    await page.locator("#cmd-input").fill("atraxa");
    await page.locator(".autocomplete .ac-item").first().click();

    await expect.poll(async () => (await savedDecks(page)).length).toBe(3);
    const created = (await savedDecks(page)).find((d) => d.id !== DECK_A.id && d.id !== DECK_B.id);
    await expect(page).toHaveURL(atPath(`/decks/${created.id}`));

    await page.goBack();
    await expect(page).toHaveURL(atPath("/"));
    await page.goForward();
    await expect(page).toHaveURL(atPath(`/decks/${created.id}`));
    await expect(deckTitle(page)).toContainText("Atraxa");
  });

  test("a new deck not saved yet survives Back onto a saved deck", async ({ page }) => {
    const dialogs = [];
    page.on("dialog", (d) => { dialogs.push(d.type()); d.dismiss().catch(() => {}); });

    await openFromDecks(page, DECK_A.name);
    await navigateToTab(page, "My Decks");
    await page.locator(".deck-card-new").click();
    await expect(page).toHaveURL(atPath("/new"));
    // No commander, so nothing auto-saves: the card lives only in the editor.
    await addBolt(page);
    await expect(page).toHaveURL(atPath("/new"));
    await expect(inDeck(page, "Lightning Bolt").first()).toBeAttached();

    // /decks/A, /, /new, /cards, /new: four back to the saved deck.
    await page.evaluate(() => window.history.go(-4));
    await expect(page).toHaveURL(atPath(`/decks/${DECK_A.id}`));
    await expect(deckTitle(page)).toContainText(DECK_A.name);
    await expect(inDeck(page, "Lightning Bolt")).toHaveCount(0);

    await page.evaluate(() => window.history.go(4));
    await expect(page).toHaveURL(atPath("/new"));
    await expect(inDeck(page, "Lightning Bolt").first()).toBeAttached({ timeout: 10000 });
    expect(await savedDecks(page)).toEqual([DECK_A, DECK_B]);
    expect(dialogs).toEqual([]);
  });

  test("deleting the open deck empties the editor, and its address is not found", async ({ page }) => {
    await openFromDecks(page, DECK_A.name);
    await addBolt(page);
    await expect(unsavedMark(page)).toHaveText("Unsaved");

    await navigateToTab(page, "My Decks");
    const tile = page.locator(".deck-card", { hasText: DECK_A.name });
    await tile.getByRole("button", { name: "Deck actions" }).click();
    await tile.locator(".deck-card-menu-item", { hasText: "Delete" }).click();
    await expect(tile).toHaveCount(0);

    // The editor no longer holds the deleted deck.
    await navigateToTab(page, "Analyze & Build");
    await expect(page).toHaveURL(atPath("/new"));
    await expect(page.locator(".empty-deck")).toBeVisible();
    expect(await draftOf(page, DECK_A.id)).toBeNull();

    await openAddress(page, `/decks/${DECK_A.id}`);
    await expect(page.getByRole("heading", { name: "Deck not found" })).toBeVisible();
    expect(await draftOf(page, DECK_A.id)).toBeNull();
  });
});

// A share link is how a deck arrives; once saved, its address is the deck.
test("a share link lands on its deck's address, and Back returns to it in one press", async ({ page }) => {
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  await expect.poll(async () => (await savedDecks(page)).length).toBe(1);
  const [{ id }] = await savedDecks(page);
  await expect(page).toHaveURL(atPath(`/decks/${id}`));

  await navigateToTab(page, "Rules");
  await expect(page).toHaveURL(atPath("/rules"));
  await page.reload();
  await waitForAppReady(page);
  await expect(page).toHaveURL(atPath("/rules"));

  await page.goBack();
  await expect(page).toHaveURL(atPath(`/decks/${id}`));
  await expect(inDeck(page, "Rhystic Study").first()).toBeAttached({ timeout: 10000 });
  expect((await savedDecks(page)).length).toBe(1);
});

// What the first commander pick auto-saves: a commander and nothing else.
test("a deck that is only a commander reopens with its commander", async ({ page }) => {
  await openAddress(page, "/");
  await seedLocalDecks(page, [
    { id: "cmd-only", name: "Just Atraxa", format: "commander", decklist_text: `Commander\n1 ${TEST_COMMANDER}\nDeck\n` },
    {
      id: "cmd-considering",
      name: "Atraxa and a maybe",
      format: "commander",
      decklist_text: `Commander\n1 ${TEST_COMMANDER}\nDeck\n\nMaybeboard\n1 Lightning Bolt`,
    },
  ]);

  await openAddress(page, "/decks/cmd-only");
  await expect(deckTitle(page)).toContainText("Just Atraxa");
  // The commander is set, so the picker that asks for one is not shown.
  await expect(page.locator(".cmdr-strip-name")).toHaveText(TEST_COMMANDER);
  await expect(page.locator(".cmdr-input-row")).toHaveCount(0);
  await expect(unsavedMark(page)).toHaveCount(0);

  await openAddress(page, "/decks/cmd-considering");
  await expect(page.locator(".cmdr-strip-name")).toHaveText(TEST_COMMANDER);
  await expect(page.locator(".cmdr-input-row")).toHaveCount(0);
  const considering = page.locator(".considering-group, .stack-column-considering");
  await expect(considering.locator('[aria-label*="Lightning Bolt"]').first()).toBeAttached({ timeout: 10000 });
  await expect(unsavedMark(page)).toHaveCount(0);
});
