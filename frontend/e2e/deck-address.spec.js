// Deck addresses (UX overhaul job 1.4): a saved deck is /decks/<id> and /new
// is the New deck screen, where a deck is made. Reload, a bookmark, a second
// browser tab, Back and Forward all land on the deck the address names.

import { test, expect } from "./fixtures/test-base.js";
import {
  openAddress,
  waitForAppReady,
  seedLocalDecks,
  navigateToTab,
  openNewDeck,
  pickNewDeckCommander,
  pasteNewDeck as pasteList,
  backToDeck,
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
  await backToDeck(page);
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

  test("the New deck screen is /new, and an old ?tab=deck link lands there", async ({ page }) => {
    const screen = page.getByRole("heading", { name: "Start a new deck" });
    await openNewDeck(page);
    await expect(page).toHaveURL(atPath("/new"));
    await expect(screen).toBeVisible();

    await openAddress(page, "/?tab=deck");
    await expect(page).toHaveURL(atPath("/new"));
    await expect(screen).toBeVisible();
  });

  test("a new deck takes over /new the moment it is made, so Back skips that screen", async ({ page }) => {
    await pickNewDeckCommander(page);
    await expect(page).toHaveURL(atPath("/new"));
    await page.getByRole("button", { name: /^Start from scratch/ }).click();

    await expect.poll(async () => (await savedDecks(page)).length).toBe(3);
    const created = (await savedDecks(page)).find((d) => d.id !== DECK_A.id && d.id !== DECK_B.id);
    await expect(page).toHaveURL(atPath(`/decks/${created.id}`));

    await page.goBack();
    await expect(page).toHaveURL(atPath("/"));
    await page.goForward();
    await expect(page).toHaveURL(atPath(`/decks/${created.id}`));
    await expect(deckTitle(page)).toContainText("Atraxa");
  });

  // A pasted list is saved, and has its address, before the upgrade guide
  // opens over it: the guide's history entry sits on /decks/<id>, never on /new.
  async function pasteNewDeck(page) {
    await pasteList(page, `Commander\n1 ${TEST_COMMANDER}\n\nDeck\n1 Sol Ring\n1 Arcane Signet\n1 Counterspell`);
    await expect(page.locator('[aria-label="Upgrade this deck"]')).toBeVisible();
    await expect.poll(async () => (await savedDecks(page)).length).toBe(3);
    const created = (await savedDecks(page)).find((d) => d.id !== DECK_A.id && d.id !== DECK_B.id);
    await expect(page).toHaveURL(atPath(`/decks/${created.id}`));
    return created.id;
  }
  const onPastedDeck = async (page, id) => {
    await expect(page).toHaveURL(atPath(`/decks/${id}`));
    await expect(inDeck(page, "Counterspell").first()).toBeAttached({ timeout: 10000 });
    await expect(page.locator(".nd, .empty-deck")).toHaveCount(0);
  };

  test("a deck pasted on /new keeps its address when the guide is closed with its button", async ({ page }) => {
    const id = await pasteNewDeck(page);
    await page.locator(".upr-panel .icm-close").click();
    await onPastedDeck(page, id);

    // Leaving and coming Back lands on the deck, not on the /new it started as.
    await navigateToTab(page, "Rules");
    await expect(page).toHaveURL(atPath("/rules"));
    await page.goBack();
    await onPastedDeck(page, id);
    // One more Back leaves the deck: the guide's entry did not pile up under it.
    await page.goBack();
    await expect(page).toHaveURL(atPath("/"));
    await page.goForward();
    await onPastedDeck(page, id);
  });

  test("a deck pasted on /new keeps its address when the guide is closed with Back", async ({ page }) => {
    const id = await pasteNewDeck(page);
    await page.goBack();
    await expect(page.locator('[aria-label="Upgrade this deck"]')).toHaveCount(0);
    await onPastedDeck(page, id);

    await navigateToTab(page, "Rules");
    await expect(page).toHaveURL(atPath("/rules"));
    await page.goBack();
    await onPastedDeck(page, id);

    await page.reload();
    await waitForAppReady(page);
    await onPastedDeck(page, id);
    expect((await savedDecks(page)).length).toBe(3);
  });

  // From a deck: New deck, Back, Forward, Back. Each press shows what its
  // address names. (Forward onto /new used to do nothing visible and rewrite
  // that entry to the deck's address, which left a dead Back press behind it.)
  test("New deck from a deck with unsaved edits: Back and Forward each show their own address", async ({ page }) => {
    const dialogs = [];
    page.on("dialog", (d) => { dialogs.push(d.type()); d.dismiss().catch(() => {}); });
    const screen = page.getByRole("heading", { name: "Start a new deck" });
    const onDeckA = async () => {
      await expect(page).toHaveURL(atPath(`/decks/${DECK_A.id}`));
      await expect(deckTitle(page)).toContainText(DECK_A.name);
      // The edit came back from the deck's draft.
      await expect(inDeck(page, "Lightning Bolt").first()).toBeAttached({ timeout: 10000 });
      await expect(unsavedMark(page)).toHaveText("Unsaved");
      await expect(screen).toHaveCount(0);
    };

    await openFromDecks(page, DECK_A.name);
    await addBolt(page);
    await openNewDeck(page);
    await expect(page).toHaveURL(atPath("/new"));
    await expect(screen).toBeVisible();
    await expect(grid(page)).toHaveCount(0);

    await page.goBack();
    await onDeckA();
    await page.goForward();
    await expect(page).toHaveURL(atPath("/new"));
    await expect(screen).toBeVisible();
    await page.goBack();
    await onDeckA();

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

    // The editor no longer holds the deleted deck: Back onto its address
    // finds nothing to show.
    await page.goBack();
    await expect(page).toHaveURL(atPath(`/decks/${DECK_A.id}`));
    await expect(page.getByRole("heading", { name: "Deck not found" })).toBeVisible();
    await expect(grid(page)).toHaveCount(0);
    expect(await draftOf(page, DECK_A.id)).toBeNull();

    await openAddress(page, `/decks/${DECK_A.id}`);
    await expect(page.getByRole("heading", { name: "Deck not found" })).toBeVisible();
    expect(await draftOf(page, DECK_A.id)).toBeNull();
  });

  test("Undo after a delete brings the deck back at the same address", async ({ page }) => {
    await openFromDecks(page, DECK_A.name);
    await navigateToTab(page, "My Decks");
    const tile = page.locator(".deck-card", { hasText: DECK_A.name });
    await tile.getByRole("button", { name: "Deck actions" }).click();
    await tile.locator(".deck-card-menu-item", { hasText: "Delete" }).click();
    await expect(tile).toHaveCount(0);

    await page.locator(".toast .toast-action", { hasText: "Undo" }).click();
    await expect(tile).toHaveCount(1);
    expect((await savedDecks(page)).map((d) => d.id).sort()).toEqual([DECK_A.id, DECK_B.id].sort());

    await openAddress(page, `/decks/${DECK_A.id}`);
    await expect(deckTitle(page)).toContainText(DECK_A.name);
    await expect(inDeck(page, "Rhystic Study").first()).toBeAttached({ timeout: 10000 });
  });

  // Back onto the deleted deck's address, then Undo: the deck loads the moment
  // it is back in the list, so its unsaved edits have to be back before that.
  test("Undo from the deleted deck's own address brings its unsaved edits back with it", async ({ page }) => {
    await openFromDecks(page, DECK_A.name);
    await addBolt(page);
    await expect(unsavedMark(page)).toHaveText("Unsaved");
    await navigateToTab(page, "My Decks");
    const tile = page.locator(".deck-card", { hasText: DECK_A.name });
    await tile.getByRole("button", { name: "Deck actions" }).click();
    await tile.locator(".deck-card-menu-item", { hasText: "Delete" }).click();
    await expect(tile).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(atPath(`/decks/${DECK_A.id}`));
    await expect(page.getByRole("heading", { name: "Deck not found" })).toBeVisible();
    await page.locator(".toast .toast-action", { hasText: "Undo" }).click();

    await expect(deckTitle(page)).toContainText(DECK_A.name);
    await expect(inDeck(page, "Lightning Bolt").first()).toBeAttached({ timeout: 10000 });
    await expect(unsavedMark(page)).toHaveText("Unsaved");
    expect((await draftOf(page, DECK_A.id)).decklist_text).toContain("Lightning Bolt");
  });

  // The deck list saves a rename itself, so the editor has to hear about it:
  // left with the old name, its next Save would write that name back.
  test("a rename from the deck list reaches the open deck and survives its next Save", async ({ page, isMobile }) => {
    test.skip(isMobile, "at phone width a first-row tile's Rename sits under the filter bar");
    page.on("dialog", (d) => d.accept("Renamed in the list"));
    await openFromDecks(page, DECK_A.name);
    await navigateToTab(page, "My Decks");
    const tile = page.locator(".deck-card", { hasText: DECK_A.name });
    await tile.getByRole("button", { name: "Deck actions" }).click();
    await tile.locator(".deck-card-menu-item", { hasText: "Rename" }).click();
    await expect(page.locator(".deck-card", { hasText: "Renamed in the list" })).toHaveCount(1);

    await page.goBack();
    await expect(page).toHaveURL(atPath(`/decks/${DECK_A.id}`));
    await expect(deckTitle(page)).toContainText("Renamed in the list");
    await expect(page).toHaveTitle("Renamed in the list · MTG Workshop");
    await expect(unsavedMark(page)).toHaveCount(0);

    // The name is already right in storage, so wait on something only this
    // Save changes before reading it.
    const stored = async () => (await savedDecks(page)).find((d) => d.id === DECK_A.id);
    const renamedAt = (await stored()).updated_at;
    await page.locator("button.primary:visible", { hasText: /^Save/ }).first().click();
    await expect.poll(async () => (await stored()).updated_at).not.toBe(renamedAt);
    expect((await stored()).name).toBe("Renamed in the list");
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
