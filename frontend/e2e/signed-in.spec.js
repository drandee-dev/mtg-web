// A deck open in the editor while the account or its deck list changes under
// it. Runs signed in against a fake account (fixtures/fake-cloud.js): the
// cloud store is where a save or a delete takes long enough to be overtaken.

import { test, expect } from "./fixtures/test-base.js";
import { waitForAppReady, navigateToTab, backToDeck, openNewDeck } from "./fixtures/helpers.js";
import { TEST_DECK_STORAGE } from "./fixtures/test-data.js";
import { fakeCloud, cloudOrigin, hasSession } from "./fixtures/fake-cloud.js";

const CLOUD_DECK = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Cloud deck",
  format: "commander",
  decklist_text: TEST_DECK_STORAGE.decklist_text,
  updated_at: "2026-01-02T00:00:00.000Z",
};

const atPath = (path) => (url) => url.pathname === path && url.search === "";
const deckTitle = (page) => page.locator(".deck-title:visible, .mobile-deck-name:visible").first();
const grid = (page) => page.locator(".card-grid-container");
const boltInDeck = (page) => grid(page).locator('[aria-label*="Lightning Bolt"]');
const unsavedMark = (page) => page.locator(".deck-unsaved:visible");
const notFound = (page) => page.getByRole("heading", { name: "Deck not found" });
const draftOf = (page, id) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k)), `mtgweb:draft:${id}`);
// What the browser does when a phone wakes or a background tab comes forward.
const wake = (page) => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

async function openCloudDeck(page) {
  await page.goto(`/decks/${CLOUD_DECK.id}`);
  await waitForAppReady(page);
  await expect(deckTitle(page)).toContainText(CLOUD_DECK.name, { timeout: 15000 });
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
  await expect(unsavedMark(page)).toHaveText("Unsaved");
}

test.describe("Signed in", () => {
  test.skip(!cloudOrigin, "no frontend/.env, so this build has no cloud mode");

  test("a sign-out lets go of the open deck, and its address says it is not in this browser", async ({ page }) => {
    await page.clock.install();
    const cloud = await fakeCloud(page, [CLOUD_DECK]);
    await openCloudDeck(page);
    await addBolt(page);

    // The token runs out and the refresh is refused: the account is gone.
    cloud.auth = "revoked";
    await page.clock.fastForward("02:00:00");
    await wake(page);
    await expect(notFound(page)).toBeVisible({ timeout: 60000 });
    await expect(page.locator("main")).toContainText("This deck isn't in this browser");
    await expect(grid(page)).toHaveCount(0);
    await expect(page).toHaveURL(atPath(`/decks/${CLOUD_DECK.id}`));
    expect(await hasSession(page)).toBe(false);
    // Nothing of the account's was written into this browser's own decks.
    expect(await page.evaluate(() => localStorage.getItem("mtgweb:decks"))).toBeNull();
  });

  test("a tab that wakes with no connection keeps its deck: a failed refresh is not a sign-out", async ({ page }) => {
    await page.clock.install();
    const cloud = await fakeCloud(page, [CLOUD_DECK]);
    await openCloudDeck(page);
    await addBolt(page);

    cloud.auth = "down";
    const before = cloud.authCalls;
    await page.clock.fastForward("02:00:00");
    await wake(page);
    // The refresh is tried, fails, and its retries run out.
    await expect.poll(() => cloud.authCalls).toBeGreaterThan(before);
    for (let i = 0; i < 6; i++) {
      await page.clock.fastForward("00:00:30");
      await page.waitForTimeout(500);
    }
    await expect(notFound(page)).toHaveCount(0);
    await expect(deckTitle(page)).toContainText(CLOUD_DECK.name);
    await expect(boltInDeck(page).first()).toBeAttached();
    await expect(unsavedMark(page)).toHaveText("Unsaved");
    expect(await hasSession(page)).toBe(true);
  });

  // Two new decks both have no id. "New deck" clicked while the first one's
  // save is out must stay a new deck, not become the saved one.
  test("New deck during a slow first save stays its own deck", async ({ page }) => {
    const cloud = await fakeCloud(page);
    await page.goto("/");
    await waitForAppReady(page);
    await openNewDeck(page);
    await expect(page).toHaveURL(atPath("/new"));

    cloud.saveDelay = 1500;
    await page.locator("#cmd-input").fill("atraxa");
    await page.locator(".autocomplete .ac-item").first().click();
    await openNewDeck(page);
    await expect(page.locator(".empty-deck")).toBeVisible();
    expect(cloud.decks, "the first save had already returned; nothing was tested").toEqual([]);

    await expect.poll(() => cloud.decks.length, { timeout: 10000 }).toBe(1);
    const first = cloud.decks[0].id;
    // The list reload and the adopt follow the save.
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(atPath("/new"));
    await expect(page.locator(".empty-deck")).toBeVisible();
    await expect(unsavedMark(page)).toHaveCount(0);
    expect(await draftOf(page, first)).toBeNull();

    // The second deck gets a row and an address of its own. (The mocked
    // search offers any known card; which one leads the deck does not matter.)
    cloud.saveDelay = 0;
    await page.locator("#cmd-input").fill("sol ring");
    await page.locator(".autocomplete .ac-item", { hasText: "Sol Ring" }).click();
    await expect.poll(() => cloud.decks.length, { timeout: 10000 }).toBe(2);
    const second = cloud.decks.find((d) => d.id !== first);
    await expect(page).toHaveURL(atPath(`/decks/${second.id}`));
    expect(second.decklist_text).toContain("Sol Ring");
    expect(cloud.decks.find((d) => d.id === first).decklist_text).toContain("Atraxa");
  });

  test("a slow delete does not load the deck back, and Undo returns it in place with its edits", async ({ page }) => {
    const cloud = await fakeCloud(page, [CLOUD_DECK]);
    await openCloudDeck(page);
    await addBolt(page);

    await navigateToTab(page, "My Decks");
    cloud.deleteDelay = 1500;
    const tile = page.locator(".deck-card", { hasText: CLOUD_DECK.name });
    await tile.getByRole("button", { name: "Deck actions" }).click();
    await tile.locator(".deck-card-menu-item", { hasText: "Delete" }).click();
    // Back on the deck before the delete has returned: it is still there.
    await page.goBack();
    await expect(page).toHaveURL(atPath(`/decks/${CLOUD_DECK.id}`));
    await expect(grid(page)).toBeVisible();
    expect(cloud.decks.map((d) => d.id)).toEqual([CLOUD_DECK.id]);

    await expect(notFound(page)).toBeVisible({ timeout: 10000 });
    expect(cloud.decks).toEqual([]);
    // The list reload that follows the delete must not bring it back either.
    await page.waitForTimeout(1000);
    await expect(notFound(page)).toBeVisible();
    await expect(grid(page)).toHaveCount(0);

    await page.locator(".toast .toast-action", { hasText: "Undo" }).click();
    await expect(deckTitle(page)).toContainText(CLOUD_DECK.name);
    await expect(page).toHaveURL(atPath(`/decks/${CLOUD_DECK.id}`));
    await expect(boltInDeck(page).first()).toBeAttached({ timeout: 10000 });
    await expect(unsavedMark(page)).toHaveText("Unsaved");
    expect(cloud.decks.map((d) => d.id)).toEqual([CLOUD_DECK.id]);
    expect((await draftOf(page, CLOUD_DECK.id)).decklist_text).toContain("Lightning Bolt");
  });
});
