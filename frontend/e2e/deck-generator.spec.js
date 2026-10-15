// The doors of the New deck screen that build or fetch a deck: the one-shot
// generator (commander, describe, collection), the precon lookup and the
// step-by-step wizard. Runs entirely against the hermetic mock backend, with
// no live FastAPI and no model key. The screen itself, and the guards around
// saving, are in new-deck.spec.js.
//
// There is no review screen: a deck is saved the moment it is built and opens
// as itself. What that screen used to show is checked where it lives now: the
// saved decklist, the reason on a card's detail, the buy list on the deck page.
import { test, expect } from "./fixtures/test-base.js";
import { waitForAppReady, dismissColdStart, navigateToTab, openNewDeck, seedLocalDecks, deckMenuAction } from "./fixtures/helpers.js";

const savedDecks = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("mtgweb:decks") || "[]"));
const onADeck = (url) => /^\/decks\/[^/]+$/.test(url.pathname) && url.search === "";
const door = (page, name) => page.locator(".nd-door", { hasText: name });
const buildButton = (page) => page.getByRole("button", { name: /^Build the \d+/ });
const sentTo = (page, path) => page.waitForRequest((r) => r.url().includes(path));
// Copies in a stored decklist, the commander's own line included.
const copies = (text) => text.split("\n").reduce((n, l) => n + Number(l.match(/^(\d+)\s/)?.[1] || 0), 0);

async function openNew(page) {
  await page.goto("/");
  await waitForAppReady(page);
  await dismissColdStart(page);
  await openNewDeck(page);
  await expect(page.getByRole("heading", { name: "Start a new deck" })).toBeVisible();
}

// The commander door as far as its choice.
async function pickCommander(page, query = "atraxa", name = "Atraxa") {
  await page.locator("#gen-cmd").fill(query);
  await page.locator(".gen-candidate", { hasText: name }).click();
}

// The deck a build just made: on its own address, and the last one saved.
async function builtDeck(page) {
  await expect(page).toHaveURL(onADeck, { timeout: 20000 });
  await expect(page.getByRole("tablist", { name: "Deck sections" })).toBeVisible();
  return (await savedDecks(page)).at(-1);
}

// "I know my commander" for Atraxa, built.
async function buildAtraxa(page) {
  await openNew(page);
  await pickCommander(page);
  await buildButton(page).click();
  return builtDeck(page);
}

// The raw decklist, via the deck view's own text editor. The card grid renders
// the commander as its own column and never in the 99, so it cannot show
// whether the commander was also left in the maindeck — this can.
async function rawDecklist(page) {
  // Desktop and mobile each render their own ⋯ menu; use whichever is visible.
  await page.locator(".more-menu-btn:visible").first().click();
  await page.locator(".more-menu-item", { hasText: "Edit as text" }).click();
  const text = await page.locator(".deck-text-editor").inputValue();
  await page.locator(".more-menu-btn:visible").first().click();
  await page.locator(".more-menu-item", { hasText: "Hide text editor" }).click();
  return text;
}

test.describe("Building a deck from the New deck screen", () => {
  test("the step counter follows the door, not a fixed total", async ({ page }) => {
    await openNew(page);
    const back = page.locator(".gen-head button", { hasText: "Back" });

    await door(page, "Start from a precon").click();
    await expect(page.locator(".gen-step")).toContainText("Step 2 of 3");
    await back.click();
    await door(page, "Build from my collection").click();
    await expect(page.locator(".gen-step")).toContainText("Step 2 of 4");
    await back.click();
    await door(page, "Paste or import").click();
    await expect(page.locator(".gen-step")).toContainText("Step 2 of 2");
    await back.click();
    await pickCommander(page);
    await expect(page.locator(".gen-step")).toContainText("Step 2 of 3");
    // Back from a door is the screen again, with the search cleared.
    await back.click();
    await expect(page.locator("#gen-cmd")).toHaveValue("");
    await expect(page.locator(".gen-candidate")).toHaveCount(0);
  });

  test("known commander builds a legal 100-card deck that opens as a deck", async ({ page }) => {
    const deck = await buildAtraxa(page);

    // The build is 100 cards and says how many carry a reason.
    await expect(page.locator(".toast")).toContainText("Deck built: 100 cards.");
    expect(copies(deck.decklist_text)).toBe(100);
    // ai/fills closed a category gap, trading a basic for a real card.
    expect(deck.decklist_text).toContain("1 Malakir Rebirth");

    // Normal deck view, not a bespoke display surface.
    await expect(page.locator(".card-grid-container")).toBeVisible();
    // The commander goes to the command zone, not into the 99 as well.
    await expect(await rawDecklist(page)).not.toContain("Atraxa");
    expect(deck.decklist_text.match(/Atraxa/g)).toHaveLength(1);
  });

  // F2: a partner-capable pick offers solo or a legal partner, and the pair
  // reaches the skeleton as one "A && B" string and the command zone as two.
  // Scryfall answers the first pick; the backend's partner_of search answers
  // the partner. Returns a getter for the partner_of the page sent.
  async function routePair(page, first, partner) {
    const ok = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    await page.route("https://api.scryfall.com/cards/search**", (route) =>
      route.fulfill(ok({ object: "list", total_cards: 1, data: [first] })));
    let partnerOf = null;
    await page.route("**/api/commanders/search*", (route) => {
      partnerOf = new URL(route.request().url()).searchParams.get("partner_of");
      return route.fulfill(ok({ results: [partner] }));
    });
    return () => partnerOf;
  }

  test("a partner pick builds a 100-card deck for the pair", async ({ page }) => {
    const thrasios = "Thrasios, Triton Hero";
    const tymna = "Tymna the Weaver";
    const partnerOf = await routePair(page, {
      name: thrasios, type_line: "Legendary Creature — Merfolk Wizard",
      color_identity: ["G", "U"], mana_cost: "{G}{U}",
      oracle_text: "{4}: Scry 1, then reveal the top card of your library. If it's a land card, "
        + "put it onto the battlefield tapped. Otherwise, draw a card.\n"
        + "Partner (You can have two commanders if both have partner.)",
    }, { name: tymna, type_line: "Legendary Creature — Human Cleric", color_identity: ["W", "B"] });

    await openNew(page);
    await page.locator("#gen-cmd").fill("thras");
    const pick = page.locator(".gen-candidate", { hasText: thrasios });
    await expect(pick).toContainText("Add a partner?");
    await pick.click();

    // On this door a pick only settles who the commander is; nothing builds yet.
    await expect(page.locator("button", { hasText: "Go solo" })).toBeVisible();
    await page.locator("#gen-partner").fill("tym");
    await page.locator(".gen-candidate", { hasText: tymna }).click();
    expect(partnerOf()).toBe(thrasios);
    await expect(page.locator(".nd-chosen h2")).toHaveText(`${thrasios} + ${tymna}`);

    const skeleton = sentTo(page, "/api/deck/wizard/skeleton");
    await page.getByRole("button", { name: /^Build the 98/ }).click();
    expect((await skeleton).postDataJSON().commander).toBe(`${thrasios} && ${tymna}`);

    const deck = await builtDeck(page);
    expect(copies(deck.decklist_text)).toBe(100);
    expect(deck.name).toBe(`${thrasios} + ${tymna}`);
    const text = await rawDecklist(page);
    expect(text).not.toContain(thrasios);
    expect(text).not.toContain(tymna);
  });

  // A Background can't lead alone (CR 702.124k): no solo choice, and the pair
  // lists the creature first so it is the deck's face.
  test("a Background pick has no solo choice and pairs creature-first", async ({ page }) => {
    const giants = "Raised by Giants";
    const wilson = "Wilson, Refined Grizzly";
    await routePair(page, {
      name: giants, type_line: "Legendary Enchantment — Background",
      color_identity: ["G"], mana_cost: "{5}{G}",
      oracle_text: "Commander creatures you own have base power and toughness 10/10 and are Giants in addition to their other types.",
    }, { name: wilson, type_line: "Legendary Creature — Bear Warrior", color_identity: ["G"] });

    await openNew(page);
    await page.locator("#gen-cmd").fill("giants");
    await page.locator(".gen-candidate", { hasText: giants }).click();

    await expect(page.locator("#gen-partner")).toBeVisible();
    await expect(page.locator("button", { hasText: /solo/i })).toHaveCount(0);
    await page.locator("#gen-partner").fill("wil");
    await page.locator(".gen-candidate", { hasText: wilson }).click();
    await expect(page.locator(".nd-chosen h2")).toHaveText(`${wilson} + ${giants}`);

    const skeleton = sentTo(page, "/api/deck/wizard/skeleton");
    await page.getByRole("button", { name: /^Build the 98/ }).click();
    expect((await skeleton).postDataJSON().commander).toBe(`${wilson} && ${giants}`);
  });

  test("describing a deck offers commanders that fit and builds from the one picked", async ({ page }) => {
    await openNew(page);
    await page.locator("#gen-describe").fill("I want counters on everything and lots of proliferate");
    // The budget set on the card is the build's price cap.
    await page.locator(".nd-field select").selectOption("5");
    await page.locator("button", { hasText: "Find my commander" }).click();

    await expect(page.locator(".gen-candidate").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".gen-step")).toContainText("Step 2 of 3");
    await expect(page.getByLabel("Max price per card")).toHaveValue("5");
    const skeleton = sentTo(page, "/api/deck/wizard/skeleton");
    await page.locator(".gen-candidate").first().click();
    expect((await skeleton).postDataJSON().max_card_price).toBe(5);

    const deck = await builtDeck(page);
    expect(copies(deck.decklist_text)).toBe(100);
  });

  test("precon route saves the published decklist as a deck", async ({ page }) => {
    await openNew(page);
    await door(page, "Start from a precon").click();

    // Partial name is enough — the endpoint fuzzy-matches server side.
    await page.locator("#gen-precon").fill("necron");
    await page.locator("button", { hasText: "Find this deck" }).click();

    await expect(page.locator(".gen-summary")).toContainText("43 cards");
    await expect(page.locator(".gen-step")).toContainText("Step 3 of 3");
    await expect(page.locator(".gen-h2")).toContainText("Necron Dynasties");
    // Other matches from the same search are offered rather than hidden.
    await expect(page.locator(".gen-candidate", { hasText: "Tyranid Swarm" })).toBeVisible();

    await page.locator("button", { hasText: "Create this deck" }).click();
    await expect(page.locator(".card-grid-container")).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.card-grid-container [aria-label="1x Sol Ring"]')).toHaveCount(1);
    // The commander belongs in the command zone only. The card grid hides it
    // from the 99 either way, so check the decklist text itself — that's what
    // gets saved, shared, exported and analyzed.
    await expect(await rawDecklist(page)).not.toContain("Atraxa");
    // Imported list is not generator output, so nothing claims to explain it.
    await page.locator('.card-grid-container [aria-label="1x Sol Ring"]').click();
    await expect(page.locator(".cdm-why")).toHaveCount(0);
  });

  test("an unmatched precon name reports it and stays put", async ({ page }) => {
    await openNew(page);
    await door(page, "Start from a precon").click();
    await page.locator("#gen-precon").fill("not a real deck");
    await page.locator("button", { hasText: "Find this deck" }).click();
    await expect(page.locator(".toast")).toContainText("No precon found");
    await expect(page.locator("#gen-precon")).toBeVisible();
  });

  test("guided route hands off to the category-fill wizard, whose deck is saved under its commander", async ({ page }) => {
    await openNew(page);
    await door(page, "Guide me step by step").click();
    await expect(page.locator(".gen-step")).toContainText("Step 2 of 3");
    await expect(page.locator("h2", { hasText: "Deck wizard" })).toBeVisible();

    await page.getByPlaceholder("Start typing… e.g. nethroi").fill("atraxa");
    await page.locator(".ac-item", { hasText: "Atraxa" }).click();
    await page.locator("button", { hasText: "Build skeleton" }).click();
    for (;;) {
      const next = page.locator("button", { hasText: "Skip to next" });
      await expect(next.or(page.locator("button", { hasText: "Review deck" })).first()).toBeVisible();
      if (!(await next.count())) break;
      await next.click();
    }
    await page.locator("button", { hasText: "Review deck" }).first().click();
    expect(await savedDecks(page)).toEqual([]);
    await page.locator("button", { hasText: "Create the deck" }).click();

    const deck = await builtDeck(page);
    expect(deck.name).toBe("Atraxa, Praetors' Voice");
    // The staples and the mana base are picked for you; the commander leads.
    expect(deck.decklist_text.startsWith("Commander\n1 Atraxa, Praetors' Voice\nDeck\n")).toBe(true);
    expect(deck.decklist_text).toContain("1 Sol Ring");
  });
});

test.describe("Collection route", () => {
  // Owns 6 of the 9 mock skeleton picks plus the util land; leaves Deepglow
  // Skate, Smothering Tithe, Counterspell and Kodama's Reach un-owned. A
  // blank-name row exercises the skip-and-continue malformed-row path.
  const COLLECTION_CSV = [
    "name,set,quantity",
    "Sol Ring,cmr,1",
    "Arcane Signet,,1",
    "Command Tower,40k,2",
    "Rhystic Study,,1",
    "Cultivate,,1",
    "Swords to Plowshares,,1",
    ",,3",
  ].join("\n");

  test("a malformed row is skipped and reported, not fatal to the import", async ({ page }) => {
    await openNew(page);
    await door(page, "Build from my collection").click();
    await page.locator("#gen-collection").fill(COLLECTION_CSV);
    await expect(page.locator(".gen .panel")).toContainText("6 unique cards recognized");
    await expect(page.locator(".gen .panel")).toContainText("1 row skipped");
  });

  test("builds a deck weighted toward owned cards, and the deck page lists only the gap to buy", async ({ page }) => {
    await openNew(page);
    await door(page, "Build from my collection").click();

    // Upload a file rather than paste, to exercise the file-load path too.
    await page.locator('input[type="file"]').setInputFiles({
      name: "collection.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(COLLECTION_CSV),
    });
    await expect(page.locator(".gen .panel")).toContainText("6 unique cards recognized");
    await page.locator("button", { hasText: "Continue" }).click();

    await expect(page.locator(".gen-step")).toContainText("Step 3 of 4");
    await pickCommander(page);
    const deck = await builtDeck(page);
    expect(copies(deck.decklist_text)).toBe(100);

    // The buy list came with the deck: only what the collection lacks, priced
    // from the same per-card lookup, and totalled.
    const buy = page.getByRole("region", { name: "What to buy" });
    await expect(buy).toContainText("picks already in your collection");
    await expect(buy.locator(".gen-card-row", { hasText: "Counterspell" }).locator(".badge.warn")).toContainText("Buy");
    await expect(buy.locator(".gen-card-row", { hasText: "Sol Ring" })).toHaveCount(0);
    await expect(buy.locator(".gen-lede")).toContainText("cards to buy");
    await expect(buy.locator(".gen-lede")).toContainText("$26.05");

    // It is shown once: dismissed, it does not come back with the deck.
    await buy.getByRole("button", { name: "Dismiss" }).click();
    await expect(buy).toHaveCount(0);
    await page.reload();
    await waitForAppReady(page);
    await expect(page.locator(".card-grid-container")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("region", { name: "What to buy" })).toHaveCount(0);
  });
});

test.describe("Generated deck reasons", () => {
  test.skip(({ isMobile }) => isMobile, "desktop card grid flow");

  const solRing = (page) => page.locator('.card-grid-container [aria-label="1x Sol Ring"]').first();

  test("a generated card explains itself in the card detail modal", async ({ page }) => {
    await buildAtraxa(page);
    await solRing(page).click();
    await expect(page.locator(".cdm-why")).toContainText("Pulls its weight");
  });

  // Regression: build notes are keyed by card name with no deck in the key, so
  // switching decks without clearing them made the generated deck's reasoning
  // show up on a same-named card in an entirely different deck.
  test("build notes do not follow a card into another deck", async ({ page }) => {
    const OTHER = {
      id: "other-deck",
      name: "Hand-built deck",
      format: "commander",
      decklist_text: "Commander\n1 Atraxa, Praetors' Voice\nDeck\n1 Sol Ring\n1 Counterspell",
    };
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
    await seedLocalDecks(page, [OTHER]);

    // Generate a deck — Sol Ring picks up a note.
    await buildAtraxa(page);
    await solRing(page).click();
    await expect(page.locator(".cdm-why")).toContainText("Pulls its weight");
    await page.locator(".cdm-close").click();

    // Switch to the hand-built deck WITHOUT a reload — same page, same module
    // state. Its Sol Ring was never explained by anything.
    await navigateToTab(page, "My Decks");
    await page.locator(".deck-card", { hasText: OTHER.name }).locator(".deck-card-art").click();
    await expect(page.locator(".card-grid-container")).toBeVisible({ timeout: 10000 });
    await solRing(page).click();
    await expect(page.locator(".cdm-name")).toHaveText("Sol Ring");
    await expect(page.locator(".cdm-why")).toHaveCount(0);
  });

  // Regression: a URL import replaces the deck wholesale, same as opening a
  // saved one. The mock import also contains Sol Ring, so a surviving note
  // would attach itself to a card this deck never explained.
  test("build notes do not survive a URL import over the generated deck", async ({ page }) => {
    await buildAtraxa(page);
    await solRing(page).click();
    await expect(page.locator(".cdm-why")).toContainText("Pulls its weight");
    await page.locator(".cdm-close").click();

    // Replace it with an imported deck that also runs Sol Ring.
    await deckMenuAction(page, "Import cards");
    await page.locator('.icm-tabs [role="tab"]', { hasText: "From URL" }).click();
    await page.locator(".icm-panel input").fill("https://archidekt.com/decks/12345");
    await page.locator(".icm-foot button", { hasText: "Import" }).click();
    await page.locator(".icm-confirm button", { hasText: "Replace deck" }).click();
    await expect(page.locator(".deck-title")).toContainText("Mock Import");

    await solRing(page).click();
    await expect(page.locator(".cdm-name")).toHaveText("Sol Ring");
    await expect(page.locator(".cdm-why")).toHaveCount(0);
  });

  // Regression: emptying the deck by hand and pasting a list is a wholesale
  // replacement too, and it goes through mergeImportedText's wasEmpty branch
  // rather than any of App's deck-switch callbacks.
  test("build notes do not survive a paste into an emptied deck", async ({ page }) => {
    await buildAtraxa(page);
    await solRing(page).click();
    await expect(page.locator(".cdm-why")).toContainText("Pulls its weight");
    await page.locator(".cdm-close").click();

    // Strip the deck back to nothing: clear the 99, then the commander.
    await page.locator(".dh-actions .more-menu-btn").click();
    await page.locator(".more-menu-item", { hasText: "Edit as text" }).click();
    await page.locator(".deck-text-editor").fill("");
    await page.locator('.card-grid-container [aria-label*="Atraxa"]').first().click();
    await page.locator(".cdm-actions button", { hasText: "Change commander" }).click();
    await expect(page.locator(".empty-deck")).toBeVisible();

    // Paste a fresh list that also runs Sol Ring. A paste into an empty deck
    // opens the Job 3 guided review (goals → bracket/ratings → swaps); close
    // it to get back to the deck grid, same as a user would.
    await page.locator(".empty-action", { hasText: "Import cards" }).click();
    await page.locator(".icm-panel textarea").fill("1 Sol Ring\n1 Counterspell");
    await page.locator(".icm-foot button", { hasText: "Import" }).click();
    await page.locator(".upr-panel .icm-close").click();

    await solRing(page).click();
    await expect(page.locator(".cdm-name")).toHaveText("Sol Ring");
    await expect(page.locator(".cdm-why")).toHaveCount(0);
  });
});

// G4: a per-card price cap, offered beside Format and Bracket in all three
// places a deck gets generated. The backend flags cards over the cap rather
// than dropping them (so the collection route can keep owned ones) and adds a
// budget_picks list; this skeleton is what it returns under a cap.
test.describe("Per-card price cap", () => {
  async function routeCappedSkeleton(page, {
    budgetPicks = [{ name: "Counterspell", reason: "most played under your price cap" }],
    lands,
  } = {}) {
    await page.route("**/api/deck/wizard/skeleton*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        error: false,
        commander: { name: "Atraxa, Praetors' Voice", color_identity: ["W", "U", "B", "G"] },
        skeleton: {
          staples: [{ name: "Sol Ring", reason: "format staple" }],
          suggested_lands: [{ name: "Command Tower", reason: "staple", roles: ["Land"], is_land: true }],
          high_synergy: [
            { name: "Deepglow Skate", synergy: 0.92 },
            { name: "Rhystic Study", synergy: 0.71, over_cap: true },
          ],
          top_cards: [
            { name: "Smothering Tithe", synergy: 0.6, over_cap: true },
            { name: "Cultivate", synergy: 0.4 },
          ],
          budget_picks: budgetPicks,
          ...(lands && { lands }),
        },
        bracket: null,
      }),
    }));
  }

  test("the select offers the caps and defaults to any price", async ({ page }) => {
    await openNew(page);
    await pickCommander(page);
    const cap = page.getByLabel("Max price per card");
    await expect(cap).toHaveValue("");
    expect(await cap.locator("option").allTextContents()).toEqual([
      "Any card price",
      "Up to $1.00 a card", "Up to $2.00 a card", "Up to $5.00 a card",
      "Up to $10.00 a card", "Up to $20.00 a card",
    ]);
    // Untouched, the cap is not sent at all.
    const skeleton = sentTo(page, "/api/deck/wizard/skeleton");
    await buildButton(page).click();
    expect((await skeleton).postDataJSON()).not.toHaveProperty("max_card_price");
  });

  test("one-shot build sends the cap and leaves flagged cards out", async ({ page }) => {
    await routeCappedSkeleton(page);
    await openNew(page);
    await pickCommander(page);
    await page.getByLabel("Max price per card").selectOption("5");

    const skeleton = sentTo(page, "/api/deck/wizard/skeleton");
    const fills = sentTo(page, "/api/deck/ai/fills");
    await buildButton(page).click();
    expect((await skeleton).postDataJSON().max_card_price).toBe(5);
    expect((await fills).postDataJSON().max_card_price).toBe(5);

    const { decklist_text } = await builtDeck(page);
    expect(copies(decklist_text)).toBe(100);
    expect(decklist_text).toContain("1 Deepglow Skate");
    expect(decklist_text).not.toContain("Rhystic Study");
    expect(decklist_text).not.toContain("Smothering Tithe");
    // The lists ran short, so the budget pick fills a slot.
    expect(decklist_text).toContain("1 Counterspell");
  });

  test("collection build sends the cap but keeps a flagged card you own", async ({ page }) => {
    await routeCappedSkeleton(page);
    await openNew(page);
    await door(page, "Build from my collection").click();
    await page.locator("#gen-collection").fill("name,set,quantity\nRhystic Study,,1");
    await page.locator("button", { hasText: "Continue" }).click();
    await page.getByLabel("Max price per card").selectOption("5");

    const skeleton = sentTo(page, "/api/deck/wizard/skeleton");
    const fills = sentTo(page, "/api/deck/ai/fills");
    await pickCommander(page);
    expect((await skeleton).postDataJSON().max_card_price).toBe(5);
    expect((await fills).postDataJSON().max_card_price).toBe(5);

    const { decklist_text } = await builtDeck(page);
    expect(copies(decklist_text)).toBe(100);
    expect(decklist_text).toContain("1 Rhystic Study"); // owned: the cap doesn't apply
    expect(decklist_text).not.toContain("Smothering Tithe"); // would have to be bought
  });

  test("guided wizard sends the cap and hides flagged cards", async ({ page }) => {
    await routeCappedSkeleton(page);
    await openNew(page);
    await door(page, "Guide me step by step").click();
    await page.getByLabel("Max price per card").selectOption("5");
    await page.getByPlaceholder("Start typing… e.g. nethroi").fill("atraxa");
    await page.locator(".ac-item", { hasText: "Atraxa" }).click();

    const skeleton = sentTo(page, "/api/deck/wizard/skeleton");
    await page.locator("button", { hasText: "Build skeleton" }).click();
    expect((await skeleton).postDataJSON().max_card_price).toBe(5);

    // Step through every category: the flagged cards are never offered.
    await expect(page.locator("button", { hasText: "Add all" })).toBeVisible();
    const seen = [];
    for (;;) {
      seen.push(await page.locator(".gen").innerText());
      const next = page.locator("button", { hasText: "Skip to next" });
      if (!(await next.count())) break;
      await next.click();
    }
    const all = seen.join("\n");
    expect(all).toContain("Deepglow Skate");
    expect(all).toContain("Budget picks");
    expect(all).toContain("Counterspell");
    expect(all).not.toContain("Rhystic Study");
    expect(all).not.toContain("Smothering Tithe");
  });

  // Under a cap the Budget picks step can list more cards than a deck holds
  // (every leftover list card, then the generic ones). It is a top-up for the
  // 63 spell slots the one-shot generator fills, so "Add all" stops there and
  // the utility lands and the basics still have room.
  test("guided wizard's Add all tops up the spell slots and leaves room for lands", async ({ page }) => {
    const land = (name) => ({ name, roles: ["Land"], is_land: true });
    await routeCappedSkeleton(page, {
      budgetPicks: Array.from({ length: 120 }, (_, i) => ({ name: `Budget Pick ${i}` })),
      lands: ["Path of Ancestry", "Exotic Orchard", "Reliquary Tower"].map(land),
    });
    await openNew(page);
    await door(page, "Guide me step by step").click();
    await page.getByLabel("Max price per card").selectOption("5");
    await page.getByPlaceholder("Start typing… e.g. nethroi").fill("atraxa");
    await page.locator(".ac-item", { hasText: "Atraxa" }).click();
    await page.locator("button", { hasText: "Build skeleton" }).click();

    const addAll = page.locator("button", { hasText: "Add all" });
    await expect(addAll).toBeVisible();
    for (;;) {
      // Three spells are in by the Budget picks step, so it may add 60 of 120.
      if (await page.locator("h3", { hasText: "Budget picks" }).count()) {
        await expect(addAll).toHaveText("Add all (60)");
      }
      await addAll.click();
      const next = page.locator("button", { hasText: "Skip to next" });
      if (!(await next.count())) break;
      await next.click();
    }
    // 63 spells, Command Tower and the three utility lands: basics still to come.
    await expect(page.locator(".badge", { hasText: "picked" })).toHaveText("67/99 picked");
    await page.locator("button", { hasText: "Review deck" }).first().click();
    await expect(page.locator(".gen")).toContainText("68 cards (including commander)");
    await expect(page.locator(".gen")).toContainText("Need 32 more for 100");
  });
});
