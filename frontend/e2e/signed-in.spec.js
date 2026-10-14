// A deck open in the editor while the account or its deck list changes under
// it. Runs signed in against a fake account (fixtures/fake-cloud.js): the
// cloud store is where a save or a delete takes long enough to be overtaken.

import { test, expect } from "./fixtures/test-base.js";
import { waitForAppReady, navigateToTab, backToDeck, openNewDeck, newDeckDoor } from "./fixtures/helpers.js";
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

  // A deck is saved before it opens, and the account's save is slow. "New
  // deck" pressed while that save is out asks for another deck: the screen
  // must stay fresh, and the first deck must not open over it when it lands.
  test("New deck during a slow save stays a fresh screen, and each deck is its own row", async ({ page }) => {
    const screen = page.getByRole("heading", { name: "Start a new deck" });
    const cloud = await fakeCloud(page);
    await page.goto("/");
    await waitForAppReady(page);
    await openNewDeck(page);
    await expect(page).toHaveURL(atPath("/new"));

    cloud.saveDelay = 1500;
    await page.locator("#gen-cmd").fill("atraxa");
    await page.locator(".gen-candidate", { hasText: "Atraxa" }).click();
    await page.getByRole("button", { name: /^Start from scratch/ }).click();
    await openNewDeck(page);
    await expect(screen).toBeVisible();
    expect(cloud.decks, "the first save had already returned; nothing was tested").toEqual([]);

    await expect.poll(() => cloud.decks.length, { timeout: 10000 }).toBe(1);
    const first = cloud.decks[0].id;
    // The list reload and the toast follow the save; an open would too.
    await expect(page.locator(".toast")).toContainText("Saved as");
    await page.waitForTimeout(600);
    await expect(page).toHaveURL(atPath("/new"));
    await expect(screen).toBeVisible();
    expect(await draftOf(page, first)).toBeNull();

    // The second deck gets a row and an address of its own, in the account.
    cloud.saveDelay = 0;
    await newDeckDoor(page, "Blank deck").click();
    await expect.poll(() => cloud.decks.length, { timeout: 10000 }).toBe(2);
    const second = cloud.decks.find((d) => d.id !== first);
    await expect(page).toHaveURL(atPath(`/decks/${second.id}`));
    await expect(unsavedMark(page)).toHaveCount(0);
    expect(second.name).toBe("Untitled deck");
    expect(cloud.decks.find((d) => d.id === first).decklist_text).toContain("Atraxa");
    expect(await page.evaluate(() => localStorage.getItem("mtgweb:decks"))).toBeNull();
  });

  // Only a slow save leaves room for a second press: this browser's own
  // storage answers before a double click's second half lands.
  test("two presses on a door during a slow save make one deck", async ({ page }) => {
    const cloud = await fakeCloud(page);
    await page.goto("/");
    await waitForAppReady(page);
    await openNewDeck(page);

    cloud.saveDelay = 800;
    await newDeckDoor(page, "Blank deck").dblclick();
    await expect.poll(() => cloud.decks.length, { timeout: 10000 }).toBe(1);
    await page.waitForTimeout(1200); // a second save would have landed by now
    expect(cloud.decks.length).toBe(1);
    await expect(page).toHaveURL(atPath(`/decks/${cloud.decks[0].id}`));
  });

  // The save went to the account that asked. If that account is gone by the
  // time it returns, the deck must not open: in the editor it would belong to
  // no store on hand, and the next Save would copy it into this browser.
  test("a sign-out during a slow save: the deck is not opened under the other account", async ({ page }) => {
    await page.clock.install();
    const cloud = await fakeCloud(page);
    await page.goto("/");
    await waitForAppReady(page);
    await openNewDeck(page);

    cloud.saveDelay = 1500;
    await newDeckDoor(page, "Blank deck").click();
    // The token runs out and the refresh is refused: the account is gone.
    cloud.auth = "revoked";
    await page.clock.fastForward("02:00:00");
    await wake(page);
    await expect.poll(() => hasSession(page), { timeout: 10000 }).toBe(false);
    expect(cloud.decks, "the save had already returned; nothing was tested").toEqual([]);

    await expect.poll(() => cloud.decks.length, { timeout: 10000 }).toBe(1);
    await page.waitForTimeout(800); // an open would have happened by now
    await expect(page).toHaveURL(atPath("/new"));
    await expect(grid(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Start a new deck" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("mtgweb:decks"))).toBeNull();
  });

  // The one way a deck can still get its id under an open layer: a panel
  // opened while its save was out. Back then closes the panel onto the history
  // entry /new was pushed as, and the address has to say where the app is.
  test("a deck saved while the account panel is open: Back closes the panel onto the deck's address", async ({ page }) => {
    const cloud = await fakeCloud(page);
    await page.goto("/");
    await waitForAppReady(page);
    await openNewDeck(page);

    cloud.saveDelay = 1500;
    await newDeckDoor(page, "Blank deck").click();
    await page.locator('[aria-label="Account menu"]:visible').first().click();
    await page.locator(".avp-row", { hasText: "Account settings" }).click();
    await expect(page.locator(".account-panel")).toBeVisible();
    expect(cloud.decks, "the save had already returned; nothing was tested").toEqual([]);

    await expect.poll(() => cloud.decks.length, { timeout: 10000 }).toBe(1);
    const { id } = cloud.decks[0];
    await expect(deckTitle(page)).toContainText("Untitled deck");
    await expect(page.locator(".account-panel")).toBeVisible();

    await page.goBack();
    await expect(page.locator(".account-panel")).toHaveCount(0);
    await expect(page).toHaveURL(atPath(`/decks/${id}`));
    await expect(deckTitle(page)).toContainText("Untitled deck");
    // And the next Back leaves the deck: no /new left standing under it.
    await page.goBack();
    await expect(page).toHaveURL(atPath("/"));
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
