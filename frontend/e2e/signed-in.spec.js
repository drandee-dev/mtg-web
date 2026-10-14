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
    .getByRole("button", { name: /^Add to / }).click();
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

  // A deck whose save the account turned down is kept in this browser for that
  // account only: signed out (and reloaded) nobody else is offered it.
  test("a deck kept for the account is not offered once signed out", async ({ page }) => {
    const cloud = await fakeCloud(page);
    await page.goto("/");
    await waitForAppReady(page);
    cloud.failSaves = 1;
    await openNewDeck(page);
    await newDeckDoor(page, "Paste or import").click();
    await page.locator("#nd-paste").fill(TEST_DECK_STORAGE.decklist_text);
    await page.getByRole("button", { name: "Create the deck →" }).click();
    const keptRow = page.locator(".kept-decks [role=status]");
    await expect(keptRow).toHaveCount(1);
    const owner = await page.evaluate(() => {
      const k = Object.keys(localStorage).find((key) => key.startsWith("sb-") && key.endsWith("-auth-token"));
      return [JSON.parse(localStorage.getItem("mtgweb:kept"))[0].owner, JSON.parse(localStorage.getItem(k)).user.id];
    });
    expect(owner[0]).toBe(owner[1]);

    // Signed out, then a fresh load of Decks home.
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith("sb-") && k.endsWith("-auth-token")) localStorage.removeItem(k);
    });
    await page.goto("/");
    await waitForAppReady(page);
    expect(await hasSession(page)).toBe(false);
    await expect(page.locator(".dh")).toBeVisible();
    await expect(keptRow).toHaveCount(0);
    await openNewDeck(page);
    await expect(page.getByRole("heading", { name: "Start a new deck" })).toBeVisible();
    await expect(keptRow).toHaveCount(0);
    // Still kept for the account that made it.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mtgweb:kept")).length)).toBe(1);
  });

  // A kept deck's Try again on one screen, then the same press on the other
  // screen while the first save is still out: one save, one deck.
  test("Try again pressed again on Decks home during a slow retry makes one deck", async ({ page }) => {
    const cloud = await fakeCloud(page);
    await page.goto("/");
    await waitForAppReady(page);
    cloud.failSaves = 1;
    await openNewDeck(page);
    await newDeckDoor(page, "Paste or import").click();
    await page.locator("#nd-paste").fill(TEST_DECK_STORAGE.decklist_text);
    await page.getByRole("button", { name: "Create the deck →" }).click();
    const tryAgain = page.locator(".kept-decks").getByRole("button", { name: "Try again" });
    await expect(tryAgain).toHaveCount(1);

    cloud.saveDelay = 2000;
    await tryAgain.click();
    await navigateToTab(page, "Decks");
    await expect(tryAgain).toBeEnabled();
    await tryAgain.click();
    await expect.poll(() => cloud.decks.length, { timeout: 10000 }).toBe(1);
    await page.waitForTimeout(2500); // a second save would have landed by now
    expect(cloud.decks.length).toBe(1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mtgweb:kept") || "[]"))).toEqual([]);
  });

  // The same, with the account gone during the build, not the save: a build
  // takes a minute, and the store it saves to is the one from when the door
  // was pressed. The account has to be taken then too.
  test("a sign-out during a slow build: the deck is not opened under the other account", async ({ page }) => {
    await page.clock.install();
    const cloud = await fakeCloud(page);
    await page.route("**/api/deck/wizard/skeleton*", async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.fallback();
    });
    await page.goto("/");
    await waitForAppReady(page);
    await openNewDeck(page);
    await page.locator("#gen-cmd").fill("atraxa");
    await page.locator(".gen-candidate", { hasText: "Atraxa" }).click();
    await page.getByRole("button", { name: /^Build the 99/ }).click();
    await expect(page.locator(".gen-building")).toBeVisible();

    cloud.auth = "revoked";
    await page.clock.fastForward("02:00:00");
    await wake(page);
    await expect.poll(() => hasSession(page), { timeout: 10000 }).toBe(false);
    expect(cloud.decks, "the build had already finished; nothing was tested").toEqual([]);

    // It was saved where it was asked for, and opened nowhere.
    await expect.poll(() => cloud.decks.length, { timeout: 15000 }).toBe(1);
    await page.waitForTimeout(800); // an open would have happened by now
    await expect(page).toHaveURL(atPath("/new"));
    await expect(grid(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("mtgweb:decks"))).toBeNull();
    // Not in silence: without being told, the next move is to build (and pay) again.
    await expect(page.locator(".toast")).toContainText("to the account that was signed in when it was started");
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
    await tile.getByRole("button", { name: /^Actions for / }).click();
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

// Decks made in this browser while signed out, then a sign-in: the account's
// list replaces them on screen, so Decks home offers to copy them over.
test.describe("Signed in, with decks saved in this browser", () => {
  test.skip(!cloudOrigin, "no frontend/.env, so this build has no cloud mode");

  const LOCAL = [
    { ...TEST_DECK_STORAGE, id: "local-1", name: "Browser deck one", updated_at: "2026-01-03T00:00:00.000Z" },
    { ...TEST_DECK_STORAGE, id: "local-2", name: "Browser deck two", updated_at: "2026-01-04T00:00:00.000Z" },
  ];
  const offer = (page) => page.getByRole("button", { name: "Copy to my account" });
  const localDecks = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mtgweb:decks")));

  async function openHome(page, cloudDecks) {
    const cloud = await fakeCloud(page, cloudDecks);
    await page.addInitScript((d) => {
      if (!localStorage.getItem("mtgweb:decks")) localStorage.setItem("mtgweb:decks", JSON.stringify(d));
    }, LOCAL);
    await page.goto("/");
    await waitForAppReady(page);
    return cloud;
  }

  test("an empty account is offered the browser's decks, copies them once, and the browser keeps its own", async ({ page }) => {
    const cloud = await openHome(page, []);
    await expect(page.locator("main")).toContainText("2 decks are saved in this browser and not in your account");

    await offer(page).click();
    await expect(page.locator(".toast", { hasText: "Copied 2 decks to your account." })).toBeVisible();
    await expect(offer(page)).toHaveCount(0);
    expect(cloud.decks.map((d) => d.name).sort()).toEqual(["Browser deck one", "Browser deck two"]);
    // Fresh ids in the account, not the browser's: an id another account
    // copied, or one that is not a UUID, would be refused.
    expect(cloud.decks.some((d) => d.id.startsWith("local-"))).toBe(false);
    await expect(page.locator(".deck-card")).toHaveCount(2);

    // The marks outlive a reload: nothing is offered twice.
    await page.reload();
    await waitForAppReady(page);
    await expect(page.locator(".deck-card")).toHaveCount(2);
    await expect(offer(page)).toHaveCount(0);
    expect(cloud.decks).toHaveLength(2);
    const kept = await localDecks(page);
    expect(kept.map((d) => d.name).sort()).toEqual(["Browser deck one", "Browser deck two"]);
    expect(kept.every((d) => d.copiedTo?.length === 1)).toBe(true);
  });

  test("a deck whose copy fails stays offered, and a second press copies only that one", async ({ page }) => {
    const cloud = await openHome(page, [CLOUD_DECK]);
    await expect(page.locator(".deck-card")).toHaveCount(1);
    cloud.failSaves = 1;

    await offer(page).click();
    await expect(page.locator(".toast", { hasText: "Copied 1 deck. 1 deck could not be copied; try again." })).toBeVisible();
    await expect(page.locator("main")).toContainText("1 deck is saved in this browser and not in your account");

    await offer(page).click();
    await expect(page.locator(".toast", { hasText: "Copied 1 deck to your account." })).toBeVisible();
    await expect(offer(page)).toHaveCount(0);
    expect(cloud.decks.map((d) => d.name).sort()).toEqual(["Browser deck one", "Browser deck two", CLOUD_DECK.name].sort());
  });

  test("leaving Decks home and coming back mid-copy does not start a second copy", async ({ page }) => {
    const cloud = await openHome(page, []);
    cloud.saveDelay = 1500;
    await offer(page).click();
    await navigateToTab(page, "Commanders");
    await navigateToTab(page, "My Decks");
    // Still the same copy: the button says so and does nothing.
    await expect(page.getByRole("button", { name: "Copying…" })).toBeDisabled();
    await expect(page.locator(".toast", { hasText: "Copied 2 decks to your account." })).toBeVisible({ timeout: 10000 });
    expect(cloud.decks).toHaveLength(2);
  });

  test("a sign-out mid-copy stops it, and says the rest are still in this browser", async ({ page }) => {
    await page.clock.install();
    const cloud = await openHome(page, []);
    cloud.saveDelay = 1500;
    await offer(page).click();
    // The token runs out and the refresh is refused while the first save is out.
    cloud.auth = "revoked";
    await page.clock.fastForward("02:00:00");
    await wake(page);
    await expect(page.locator(".toast", { hasText: "before the account changed. The rest are still in this browser." })).toBeVisible({ timeout: 20000 });
    expect(cloud.decks.length).toBeLessThan(2);
    expect(await hasSession(page)).toBe(false);
    expect((await localDecks(page)).map((d) => d.name).sort()).toEqual(["Browser deck one", "Browser deck two"]);
  });
});
