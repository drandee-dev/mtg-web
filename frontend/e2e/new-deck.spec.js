// The New deck screen (UX overhaul job 2.2). /new is one screen with every
// way to start a deck, and a deck is saved the moment it is created: each door
// ends in one save and /new's history entry becomes /decks/<id>. No door
// leaves an unsaved deck in the editor, and nothing is built until a button
// that says so is pressed.

import { test, expect } from "./fixtures/test-base.js";
import {
  waitForAppReady, dismissColdStart, navigateToTab, openNewDeck, deckMenuAction, loadSharedDeck,
} from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

const savedDecks = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("mtgweb:decks") || "[]"));
const atPath = (path) => (url) => url.pathname === path && url.search === "";
const onADeck = (url) => /^\/decks\/[^/]+$/.test(url.pathname) && url.search === "";
const deckTitle = (page) => page.locator(".deck-title:visible, .mobile-deck-name:visible").first();
const grid = (page) => page.locator(".card-grid-container");
const inDeck = (page, card) => grid(page).locator(`[aria-label*="${card}"]`);
const heading = (page) => page.getByRole("heading", { name: "Start a new deck" });
const door = (page, name) => page.locator(".nd-door", { hasText: name });
const guide = (page) => page.locator('[aria-label="Upgrade this deck"]');
const saveButton = (page) => page.locator("button.primary:visible", { hasText: /^Save/ }).first();

// Every request a build makes. The skeleton is free; narrate, fills and the
// chat are the ones behind the server's AI check, the ones "Uses AI" means.
function watchBuilds(page) {
  const seen = [];
  page.on("request", (r) => {
    const m = r.url().match(/\/api\/(deck\/wizard\/(?:skeleton|narrate)|deck\/ai\/fills|planeswalker\/chat)$/);
    if (m) seen.push(m[1]);
  });
  return seen;
}
const PAID = /narrate|fills|chat/;

async function openNew(page) {
  await page.goto("/");
  await waitForAppReady(page);
  await dismissColdStart(page);
  await openNewDeck(page);
  await expect(page).toHaveURL(atPath("/new"));
  await expect(heading(page)).toBeVisible();
}

// The commander door, as far as the choice between a build and a blank deck.
async function pickAtraxa(page) {
  await page.locator("#gen-cmd").fill("atraxa");
  await page.locator(".gen-candidate", { hasText: TEST_COMMANDER }).click();
  await expect(page.getByRole("heading", { name: TEST_COMMANDER })).toBeVisible();
}

// localStorage refuses the deck list until the returned function is called:
// a full or blocked store, which is how a signed-out save fails.
async function refuseSaves(page) {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    let refuse = true;
    window.__allowSaves = () => { refuse = false; };
    Storage.prototype.setItem = function (key, value) {
      if (refuse && key === "mtgweb:decks") throw new Error("storage is full");
      return setItem.call(this, key, value);
    };
  });
  return () => page.evaluate(() => window.__allowSaves());
}

test.describe("New deck screen", () => {
  test("two cards and five doors, each saying what it calls", async ({ page }) => {
    await openNew(page);
    await expect(page).toHaveTitle(/^New deck · /);

    const describe = page.locator(".nd-card", { hasText: "Describe what you like" });
    await expect(describe.locator(".nd-tag")).toHaveText("Uses AI");
    await expect(describe.locator("textarea")).toBeVisible();
    // The commander card has no badge of its own: its two buttons each carry one.
    const known = page.locator(".nd-card", { hasText: "I know my commander" });
    await expect(known.locator(".nd-tag")).toHaveCount(0);
    await expect(known.locator("#gen-cmd")).toBeVisible();

    const doors = await page.locator(".nd-door").evaluateAll((els) =>
      els.map((el) => [el.querySelector("b").textContent, el.querySelector("i").textContent]));
    // What each door's code calls: a collection build is a build.
    expect(doors).toEqual([
      ["Guide me step by step", "No AI"],
      ["Start from a precon", "No AI"],
      ["Build from my collection", "Uses AI"],
      ["Paste or import a list", "No AI"],
      ["Blank deck", "No AI"],
    ]);
    // On a phone the cards stack and nothing runs off the side.
    const { scrollWidth, clientWidth } = await page.evaluate(() => {
      const de = document.documentElement;
      return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth };
    });
    expect(scrollWidth).toBe(clientWidth);
  });

  test("a blank deck is saved at once and takes /new's place in history", async ({ page }) => {
    await openNew(page);
    await door(page, "Blank deck").click();

    await expect(page).toHaveURL(onADeck);
    const decks = await savedDecks(page);
    expect(decks.map((d) => [d.name, d.decklist_text])).toEqual([["Untitled deck", ""]]);
    expect(new URL(page.url()).pathname).toBe(`/decks/${decks[0].id}`);
    await expect(deckTitle(page)).toContainText("Untitled deck");
    await expect(page.locator(".deck-unsaved:visible")).toHaveCount(0);
    // The deck exists, so its empty state adds cards to it; it starts no deck.
    await expect(page.locator(".empty-action")).toHaveText([/Search for cards/, /Import cards/]);

    // Back leaves for where New deck was pressed, not for /new.
    await page.goBack();
    await expect(page).toHaveURL(atPath("/"));
    await page.goForward();
    await expect(page).toHaveURL(atPath(`/decks/${decks[0].id}`));
    await expect(deckTitle(page)).toContainText("Untitled deck");
    expect((await savedDecks(page)).length).toBe(1);
  });

  test("an untitled deck takes its first commander's name on Save; a renamed one keeps its own", async ({ page }) => {
    const pickInDeck = async () => {
      await page.locator("#cmd-input").fill("atraxa");
      await page.locator(".autocomplete .ac-item").first().click();
      await expect(page.locator(".deck-unsaved:visible")).toHaveText("Unsaved");
    };

    await openNew(page);
    await door(page, "Blank deck").click();
    await expect(page).toHaveURL(onADeck);
    await pickInDeck();
    // The pick is an edit like any other now: nothing is saved behind your back.
    expect((await savedDecks(page))[0].name).toBe("Untitled deck");
    await saveButton(page).click();
    await expect(deckTitle(page)).toContainText("Atraxa");
    expect((await savedDecks(page)).map((d) => d.name)).toEqual([TEST_COMMANDER]);

    await openNewDeck(page);
    await door(page, "Blank deck").click();
    await expect(deckTitle(page)).toContainText("Untitled deck");
    page.once("dialog", (d) => d.accept("My brew"));
    await deckMenuAction(page, "Rename deck");
    await expect(deckTitle(page)).toContainText("My brew");
    await pickInDeck();
    await saveButton(page).click();
    await expect(page.locator(".deck-unsaved:visible")).toHaveCount(0);
    expect((await savedDecks(page)).map((d) => d.name).sort()).toEqual([TEST_COMMANDER, "My brew"].sort());
  });

  test("a pasted list has its address before the upgrade guide opens, and Back never lands on /new", async ({ page }) => {
    await openNew(page);
    await door(page, "Paste or import").click();
    await page.locator("#nd-paste").fill(`Commander\n1 ${TEST_COMMANDER}\n\nDeck\n1 Sol Ring\n1 Arcane Signet\n1 Counterspell`);
    await page.getByRole("button", { name: "Create the deck →" }).click();

    await expect(guide(page)).toBeVisible();
    // The id came first: there is no moment with the guide open over /new.
    expect(onADeck(new URL(page.url()))).toBe(true);
    const [deck] = await savedDecks(page);
    expect(deck.name).toBe(TEST_COMMANDER);
    expect(deck.decklist_text).toBe(`Commander\n1 ${TEST_COMMANDER}\nDeck\n1 Sol Ring\n1 Arcane Signet\n1 Counterspell`);

    // Back closes the guide and stays on the deck; the next Back leaves it.
    await page.goBack();
    await expect(guide(page)).toHaveCount(0);
    await expect(page).toHaveURL(atPath(`/decks/${deck.id}`));
    await expect(inDeck(page, "Counterspell").first()).toBeAttached();
    await page.goBack();
    await expect(page).toHaveURL(atPath("/"));
    expect((await savedDecks(page)).length).toBe(1);
  });

  test("a deck link imports with its name, and its sideboard goes to Considering", async ({ page }) => {
    await openNew(page);
    await door(page, "Paste or import").click();
    await page.locator("#nd-url").fill("https://archidekt.com/decks/123/mock");
    await page.getByRole("button", { name: "Import the deck →" }).click();

    await expect(guide(page)).toBeVisible();
    expect(onADeck(new URL(page.url()))).toBe(true);
    const [deck] = await savedDecks(page);
    expect(deck.name).toBe("Mock Import");
    expect(deck.decklist_text).toBe(`Commander\n1 ${TEST_COMMANDER}\nDeck\n1 Sol Ring\n1 Counterspell\nMaybeboard\n1 Lightning Bolt`);
  });

  // Enter in the link field imports too, and a held key repeats: the button
  // being disabled does nothing for the key.
  test("Enter twice in the deck-link field imports once and makes one deck", async ({ page }) => {
    let imports = 0;
    await page.route("**/api/deck/import-url", async (route) => {
      imports++;
      await new Promise((r) => setTimeout(r, 600));
      await route.fallback();
    });
    await openNew(page);
    await door(page, "Paste or import").click();
    await page.locator("#nd-url").fill("https://archidekt.com/decks/123/mock");
    await page.locator("#nd-url").press("Enter");
    await page.locator("#nd-url").press("Enter");

    await expect(page).toHaveURL(onADeck);
    await page.waitForTimeout(900); // a second import would have landed by now
    expect(imports).toBe(1);
    expect((await savedDecks(page)).length).toBe(1);
  });

  test("a precon is confirmed, then saved under its own name", async ({ page }) => {
    const builds = watchBuilds(page);
    await openNew(page);
    await door(page, "Start from a precon").click();
    await page.locator("#gen-precon").fill("necron");
    await page.getByRole("button", { name: "Find this deck →" }).click();
    await expect(page.getByRole("heading", { name: "Necron Dynasties" })).toBeVisible();
    expect(await savedDecks(page)).toEqual([]);

    await page.getByRole("button", { name: "Create this deck →" }).click();
    await expect(page).toHaveURL(onADeck);
    await expect(deckTitle(page)).toContainText("Necron Dynasties");
    const [deck] = await savedDecks(page);
    expect(deck.decklist_text.startsWith(`Commander\n1 ${TEST_COMMANDER}\nDeck\n1 Sol Ring`)).toBe(true);
    expect(builds).toEqual([]);
  });

  test("I know my commander: a pick, then a choice whose buttons say what they call", async ({ page }) => {
    const builds = watchBuilds(page);
    await openNew(page);
    await pickAtraxa(page);

    const build = page.getByRole("button", { name: /^Build the 99/ });
    const scratch = page.getByRole("button", { name: /^Start from scratch/ });
    await expect(build).toContainText("Uses AI");
    await expect(scratch).toContainText("No AI");
    // Picking built nothing.
    expect(builds).toEqual([]);
    expect(await savedDecks(page)).toEqual([]);

    await scratch.click();
    await expect(page).toHaveURL(onADeck);
    await expect(deckTitle(page)).toContainText("Atraxa");
    const [deck] = await savedDecks(page);
    // A commander and nothing else, as assembleDecklist writes it.
    expect([deck.name, deck.decklist_text]).toEqual([TEST_COMMANDER, `Commander\n1 ${TEST_COMMANDER}\nDeck\n`]);
    await expect(page.locator(".deck-unsaved:visible")).toHaveCount(0);
    // "No AI" was true: not one request to a build endpoint.
    expect(builds).toEqual([]);
  });

  test("a build is saved the moment it returns: no review screen to lose it on", async ({ page }) => {
    const builds = watchBuilds(page);
    await openNew(page);
    await pickAtraxa(page);
    await page.getByRole("button", { name: /^Build the 99/ }).click();

    await expect(page).toHaveURL(onADeck, { timeout: 15000 });
    await expect(page.locator(".toast")).toContainText(/Deck built: 100 cards\. \d+ of \d+ picks carry a reason\./);
    await expect(page.getByRole("button", { name: /Open in deck view/ })).toHaveCount(0);
    await expect(deckTitle(page)).toContainText("Atraxa");
    await expect(page.locator(".deck-unsaved:visible")).toHaveCount(0);
    const [deck] = await savedDecks(page);
    expect(deck.name).toBe(TEST_COMMANDER);
    expect(deck.decklist_text).toContain("1 Deepglow Skate");
    // "Uses AI" was true: the build called the endpoints behind the AI check.
    expect(builds.filter((b) => PAID.test(b)).length).toBeGreaterThan(0);

    // Back leaves the deck for the page before /new; the build is not behind it.
    await page.goBack();
    await expect(page).toHaveURL(atPath("/"));
  });

  // A built deck was paid for. If its save is turned down it is kept in this
  // browser, for the account that built it, until it saves or is discarded.
  const unsavedYet = (page) => page.locator(".kept-decks [role=status]").filter({ hasText: `“${TEST_COMMANDER}” isn’t saved yet` });
  const keptStore = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mtgweb:kept") || "[]"));
  async function buildWithSavesRefused(page) {
    await openNew(page);
    await pickAtraxa(page);
    await page.getByRole("button", { name: /^Build the 99/ }).click();
    await expect(unsavedYet(page)).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(atPath("/new"));
    expect(await savedDecks(page)).toEqual([]);
  }

  test("a built deck the save turns down is kept and saved on a second try, without building again", async ({ page }) => {
    const allow = await refuseSaves(page);
    const builds = watchBuilds(page);
    await buildWithSavesRefused(page);
    await expect(page.locator(".toast", { hasText: "It's kept in this browser" })).toBeVisible();
    const built = builds.length;
    expect(builds.filter((b) => b.endsWith("skeleton")).length).toBe(1);

    await allow();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page).toHaveURL(onADeck);
    await expect(deckTitle(page)).toContainText("Atraxa");
    expect((await savedDecks(page))[0].decklist_text).toContain("1 Deepglow Skate");
    // The deck that was paid for is the one saved, and it is no longer kept.
    expect(builds.length).toBe(built);
    expect(await keptStore(page)).toEqual([]);
  });

  test("Discard drops the kept deck and leaves the build's step", async ({ page }) => {
    await refuseSaves(page);
    await buildWithSavesRefused(page);
    await page.getByRole("button", { name: "Discard" }).click();
    await expect(page.locator(".kept-decks")).toHaveCount(0);
    expect(await keptStore(page)).toEqual([]);
    await expect(page.getByRole("button", { name: /^Build the 99/ })).toBeVisible();
  });

  test("a kept deck survives a reload and is offered on Decks home", async ({ page }) => {
    await refuseSaves(page);
    await buildWithSavesRefused(page);
    await page.goto("/");
    await waitForAppReady(page);
    await expect(unsavedYet(page)).toBeVisible();
    // The init script refuses again after the reload; let this try through.
    await page.evaluate(() => window.__allowSaves());
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page).toHaveURL(onADeck);
    expect((await savedDecks(page))[0].decklist_text).toContain("1 Deepglow Skate");
    expect(await keptStore(page)).toEqual([]);
  });

  test("a build whose save fails after New deck was pressed shows on the screen already open, and outlives the next deck", async ({ page }) => {
    const allow = await refuseSaves(page);
    // Hold the build at its last request, so New deck can be pressed mid-build.
    let release;
    const held = new Promise((r) => { release = r; });
    let reached;
    const atFills = new Promise((r) => { reached = r; });
    await page.route("**/api/deck/ai/fills", async (route) => { reached(); await held; await route.fallback(); });
    await openNew(page);
    await pickAtraxa(page);
    await page.getByRole("button", { name: /^Build the 99/ }).click();
    await atFills;
    await openNewDeck(page);
    await expect(heading(page)).toBeVisible();
    release();
    await expect(unsavedYet(page)).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(atPath("/new"));

    // The next deck's save fails too: a blank deck has nothing to keep.
    await door(page, "Blank deck").click();
    await expect(page.locator(".toast", { hasText: "Couldn't save the deck" })).toBeVisible();
    await expect(unsavedYet(page)).toHaveCount(1);
    // And the next one saves: the kept deck is still there afterwards.
    await allow();
    await door(page, "Blank deck").click();
    await expect(page).toHaveURL(onADeck);
    await openNewDeck(page);
    await expect(unsavedYet(page)).toHaveCount(1);
    expect((await keptStore(page)).length).toBe(1);
  });

  test("when the browser's storage is full, the toast does not say the deck is kept", async ({ page }) => {
    await page.addInitScript(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "mtgweb:decks" || key === "mtgweb:kept") throw new Error("storage is full");
        return setItem.call(this, key, value);
      };
    });
    await openNew(page);
    await pickAtraxa(page);
    await page.getByRole("button", { name: /^Build the 99/ }).click();
    await expect(page.locator(".toast", { hasText: "It could not be kept either" })).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".toast", { hasText: "It's kept" })).toHaveCount(0);
    await expect(page.locator(".kept-decks")).toHaveCount(0);
  });
});

// Every arrival at /new is a fresh screen, which is what makes "New deck" on
// that screen start over. A Back press that goes nowhere is not an arrival.
test("a Back press that changes nothing keeps what was typed on the screen", async ({ page }) => {
  await openNew(page);
  await page.locator("#gen-describe").fill("Elves that win with one attack");
  // The skip link adds a history entry for the same screen.
  await page.locator('a[href="#main-content"]').focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/new#main-content$/);
  await page.goBack();
  await expect(page).toHaveURL(atPath("/new"));
  await expect(page.locator("#gen-describe")).toHaveValue("Elves that win with one attack");
});

// A build takes a minute on production. Whatever the person does meanwhile,
// the deck they paid for is saved, and it never opens over where they went.
test.describe("Leaving while a deck is being built", () => {
  async function startSlowBuild(page) {
    await page.route("**/api/deck/wizard/skeleton*", async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.fallback();
    });
    await openNew(page);
    await pickAtraxa(page);
    await page.getByRole("button", { name: /^Build the 99/ }).click();
    await expect(page.locator(".gen-building")).toBeVisible();
  }

  test("to another place: the deck is saved, offered by the toast, and not opened", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await startSlowBuild(page);
    // A running build has no Back of its own: leaving is the bar's job.
    await expect(page.locator(".gen-head button", { hasText: "Back" })).toHaveCount(0);

    await navigateToTab(page, "Rules");
    await expect.poll(async () => (await savedDecks(page)).length, { timeout: 15000 }).toBe(1);
    await expect(page).toHaveURL(atPath("/rules"));
    await expect(grid(page)).toHaveCount(0);
    const toast = page.locator(".toast");
    await expect(toast).toContainText(`Saved as "${TEST_COMMANDER}".`);

    await toast.getByRole("button", { name: "Open" }).click();
    const [deck] = await savedDecks(page);
    await expect(page).toHaveURL(atPath(`/decks/${deck.id}`));
    await expect(deckTitle(page)).toContainText("Atraxa");
    expect(errors).toEqual([]);
  });

  test("to a fresh New deck: the screen stays fresh", async ({ page }) => {
    await startSlowBuild(page);
    await openNewDeck(page);
    await expect(heading(page)).toBeVisible();

    await expect.poll(async () => (await savedDecks(page)).length, { timeout: 15000 }).toBe(1);
    await page.waitForTimeout(400); // an open would have happened by now
    await expect(page).toHaveURL(atPath("/new"));
    await expect(heading(page)).toBeVisible();
    await expect(page.locator(".toast")).toContainText(`Saved as "${TEST_COMMANDER}".`);
  });
});

test.describe("A commander named in the address", () => {
  test("a commander page links to /new?commander=, which looks the name up and builds nothing", async ({ page }) => {
    const builds = watchBuilds(page);
    await page.goto("/commanders/atraxa-praetors-voice");
    await waitForAppReady(page);
    const link = page.getByRole("link", { name: "Build a deck with this commander" });
    await expect(link).toHaveAttribute("href", "/new?commander=Atraxa%2C+Praetors%27+Voice");
    await link.click();

    await expect(page).toHaveURL((u) => u.pathname === "/new" && u.searchParams.get("commander") === TEST_COMMANDER);
    await expect(page.getByRole("button", { name: /^Build the 99/ })).toBeVisible();
    // The same address cold, as a reload or a shared link would open it.
    await page.reload();
    await waitForAppReady(page);
    await expect(page.getByRole("button", { name: /^Build the 99/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: TEST_COMMANDER })).toBeVisible();
    expect(builds).toEqual([]);
    expect(await savedDecks(page)).toEqual([]);

    // The name does not follow you: not onto the deck, not to another place,
    // and not back to a fresh New deck.
    await page.getByRole("button", { name: /^Start from scratch/ }).click();
    await expect(page).toHaveURL(onADeck);
    await navigateToTab(page, "Rules");
    await expect(page).toHaveURL(atPath("/rules"));
    await openNewDeck(page);
    await expect(page).toHaveURL(atPath("/new"));
    await expect(heading(page)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Build the 99/ })).toHaveCount(0);
    expect(builds).toEqual([]);
  });

  // A one-tap pick is looked up before it is taken, and its answer opens the
  // commander door. Another door pressed meanwhile would be pulled out from
  // under the person, so the doors wait for the answer.
  test("the doors wait while a one-tap pick is being looked up", async ({ page }) => {
    await page.route("**/api/commanders/search*", async (route) => {
      await new Promise((r) => setTimeout(r, 1000));
      await route.fallback();
    });
    await openNew(page);
    await page.locator(".nd-chip", { hasText: "Atraxa" }).click();
    await expect(door(page, "Blank deck")).toBeDisabled();
    await expect(door(page, "Start from a precon")).toBeDisabled();
    await expect(page.getByRole("button", { name: /^Build the 99/ })).toBeVisible();
    expect(await savedDecks(page)).toEqual([]);
  });

  test("New deck in the bar clears a commander the address named", async ({ page }) => {
    await page.goto(`/new?commander=${encodeURIComponent(TEST_COMMANDER)}`);
    await waitForAppReady(page);
    await expect(page.getByRole("button", { name: /^Build the 99/ })).toBeVisible();
    await openNewDeck(page);
    await expect(page).toHaveURL(atPath("/new"));
    await expect(heading(page)).toBeVisible();
  });

  test("a name that is no commander is not taken on trust", async ({ page }) => {
    const builds = watchBuilds(page);
    // The mock's commander search knows one commander, and this is not it.
    await page.goto("/new?commander=Lightning%20Bolt");
    await waitForAppReady(page);
    await expect(heading(page)).toBeVisible();
    await expect(page.locator(".toast")).toContainText("isn't a commander this app knows");
    await expect(page.getByRole("button", { name: /^Build the/ })).toHaveCount(0);
    expect(builds).toEqual([]);
  });

  test("a lookup that fails is not a yes either", async ({ page }) => {
    await page.route("**/api/commanders/search*", (route) => route.fulfill({ status: 500, body: "boom" }));
    await page.goto("/new?commander=Totally%20Not%20A%20Card");
    await waitForAppReady(page);
    await expect(heading(page)).toBeVisible();
    await expect(page.locator(".toast")).toContainText("Couldn't look that commander up");
    await expect(page.getByRole("button", { name: /^(Build the|Start from scratch)/ })).toHaveCount(0);
    expect(await savedDecks(page)).toEqual([]);
  });
});

test.describe("A share link's deck", () => {
  test("shows an error with Try again when its save fails, and opens once it saves", async ({ page }) => {
    const allow = await refuseSaves(page);
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);

    await expect(page.getByRole("heading", { name: "This shared deck isn't saved yet" })).toBeVisible();
    await expect(grid(page)).toHaveCount(0);
    expect(await savedDecks(page)).toEqual([]);

    await allow();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page).toHaveURL(onADeck);
    await expect(deckTitle(page)).toContainText("Atraxa");
    await expect(inDeck(page, "Rhystic Study").first()).toBeAttached();
    expect((await savedDecks(page)).length).toBe(1);
  });
});

test.describe("New deck screen, visual", () => {
  test("visual: the new deck screen", async ({ page }) => {
    await openNew(page);
    // The one-tap picks arrive with the commander directory.
    await expect(page.locator(".nd-chip")).toHaveCount(2);
    await expect(page).toHaveScreenshot("new-deck.png", { fullPage: true });
  });
});
