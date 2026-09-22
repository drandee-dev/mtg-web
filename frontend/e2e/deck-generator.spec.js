// Branching entry screen + one-shot full-deck generator. Runs entirely
// against the hermetic mock backend — no live FastAPI, no model key.
import { test, expect } from "./fixtures/test-base.js";
import { waitForAppReady, dismissColdStart, navigateToTab, seedLocalDecks } from "./fixtures/helpers.js";

async function openGenerator(page) {
  await page.goto("/");
  await waitForAppReady(page);
  await dismissColdStart(page);
  // The empty deck view's "Guided build" action is the entry point.
  await navigateToTab(page, "Analyze & Build");
  await page.locator(".empty-action", { hasText: "Guided build" }).click();
  await expect(page.locator(".gen-doors")).toBeVisible();
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

test.describe("Deck generator entry screen", () => {
  test("offers five labelled routes with honest effort badges", async ({ page }) => {
    await openGenerator(page);
    const doors = page.locator(".gen-door");
    await expect(doors).toHaveCount(5);
    await expect(doors.nth(0)).toContainText("Describe what you like");
    await expect(doors.nth(0).locator(".gen-badge")).toHaveText("Uses AI");
    await expect(doors.nth(1)).toContainText("Guide me step by step");
    await expect(doors.nth(1).locator(".gen-badge")).toHaveText("No AI");
    await expect(doors.nth(2)).toContainText("I know my commander");
    // Precon is free: the published list, straight from the endpoint.
    await expect(doors.nth(3)).toContainText("Start from a precon");
    await expect(doors.nth(3).locator(".gen-badge")).toHaveText("No AI");
    await expect(doors.nth(4)).toContainText("Build from my collection");
    await expect(doors.nth(4).locator(".gen-badge")).toHaveText("New");
    await expect(doors.nth(4)).toBeEnabled();
  });

  test("step counter reflects the chosen route, not a fixed total", async ({ page }) => {
    await openGenerator(page);

    await page.locator(".gen-door", { hasText: "I know my commander" }).click();
    await expect(page.locator(".gen-step")).toContainText("Step 2 of 3");

    await page.locator(".gen-head button", { hasText: "Back" }).click();
    await page.locator(".gen-door", { hasText: "Describe what you like" }).click();
    await expect(page.locator(".gen-step")).toContainText("Step 2 of 4");
  });

  test("known commander builds a legal 100-card deck that lands in the deck view", async ({ page }) => {
    await openGenerator(page);
    await page.locator(".gen-door", { hasText: "I know my commander" }).click();

    await page.locator("#gen-cmd").fill("atraxa");
    await page.locator(".gen-candidate", { hasText: "Atraxa" }).click();

    // Review step: the build is 100 cards and most picks carry a reason.
    await expect(page.locator(".gen-card-row").first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".gen-step")).toContainText("Step 3 of 3");
    await expect(page.locator(".gen-summary")).toContainText("100 cards");
    // wizard/narrate supplies the per-card sentences. Every non-basic pick
    // gets one; the basic-land panel is counts only, so it has none.
    const whys = page.locator(".gen-card-why");
    expect(await whys.count()).toBeGreaterThanOrEqual(10);
    await expect(whys.first()).toContainText("Pulls its weight");
    // ai/fills closed a category gap, trading a basic for a real card.
    await expect(page.locator(".gen-cat", { hasText: "Card draw" })).toBeVisible();

    await page.locator("button", { hasText: "Open in deck view" }).click();

    // Normal deck view, not a bespoke display surface.
    await expect(page.locator(".deck-layout")).toBeVisible();
    await expect(page.locator(".card-grid-container")).toBeVisible();
    // The commander goes to the command zone, not into the 99 as well.
    await expect(await rawDecklist(page)).not.toContain("Atraxa");
  });

  test("describing a deck names a commander and builds from it", async ({ page }) => {
    await openGenerator(page);
    await page.locator(".gen-door", { hasText: "Describe what you like" }).click();

    await page.locator("#gen-describe").fill("I want counters on everything and lots of proliferate");
    await page.locator("button", { hasText: "Find my commander" }).click();

    await expect(page.locator(".gen-candidate").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".gen-step")).toContainText("Step 3 of 4");
    await page.locator(".gen-candidate").first().click();

    await expect(page.locator(".gen-card-row").first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".gen-summary")).toContainText("100 cards");
  });

  test("precon route imports a published decklist into the deck view", async ({ page }) => {
    await openGenerator(page);
    await page.locator(".gen-door", { hasText: "Start from a precon" }).click();
    await expect(page.locator(".gen-step")).toContainText("Step 2 of 3");

    // Partial name is enough — the endpoint fuzzy-matches server side.
    await page.locator("#gen-precon").fill("necron");
    await page.locator("button", { hasText: "Find this deck" }).click();

    await expect(page.locator(".gen-summary")).toContainText("43 cards");
    await expect(page.locator(".gen-step")).toContainText("Step 3 of 3");
    await expect(page.locator(".gen-h2")).toContainText("Necron Dynasties");
    // Other matches from the same search are offered rather than hidden.
    await expect(page.locator(".gen-candidate", { hasText: "Tyranid Swarm" })).toBeVisible();

    await page.locator("button", { hasText: "Open in deck view" }).click();
    await expect(page.locator(".card-grid-container")).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.card-thumb[aria-label="1x Sol Ring"]')).toHaveCount(1);
    // The commander belongs in the command zone only. The card grid hides it
    // from the 99 either way, so check the decklist text itself — that's what
    // gets saved, shared, exported and analyzed.
    await expect(await rawDecklist(page)).not.toContain("Atraxa");
    // Imported list is not generator output, so nothing claims to explain it.
    await page.locator('.card-thumb[aria-label="1x Sol Ring"]').click();
    await expect(page.locator(".cdm-why")).toHaveCount(0);
  });

  test("an unmatched precon name reports it and stays put", async ({ page }) => {
    await openGenerator(page);
    await page.locator(".gen-door", { hasText: "Start from a precon" }).click();
    await page.locator("#gen-precon").fill("not a real deck");
    await page.locator("button", { hasText: "Find this deck" }).click();
    await expect(page.locator(".toast")).toContainText("No precon found");
    await expect(page.locator("#gen-precon")).toBeVisible();
  });

  test("guided route still hands off to the category-fill wizard", async ({ page }) => {
    await openGenerator(page);
    await page.locator(".gen-door", { hasText: "Guide me step by step" }).click();
    await expect(page.locator(".gen-step")).toContainText("Step 2 of 3");
    await expect(page.locator("h2", { hasText: "Deck wizard" })).toBeVisible();
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

  test("step counter reflects the collection route's four steps", async ({ page }) => {
    await openGenerator(page);
    await page.locator(".gen-door", { hasText: "Build from my collection" }).click();
    await expect(page.locator(".gen-step")).toContainText("Step 2 of 4");
  });

  test("a malformed row is skipped and reported, not fatal to the import", async ({ page }) => {
    await openGenerator(page);
    await page.locator(".gen-door", { hasText: "Build from my collection" }).click();
    await page.locator("#gen-collection").fill(COLLECTION_CSV);
    await expect(page.locator(".gen .panel")).toContainText("6 unique cards recognized");
    await expect(page.locator(".gen .panel")).toContainText("1 row skipped");
  });

  test("builds a deck weighted toward owned cards, buying only the gap", async ({ page }) => {
    await openGenerator(page);
    await page.locator(".gen-door", { hasText: "Build from my collection" }).click();

    // Upload a file rather than paste, to exercise the file-load path too.
    await page.locator('input[type="file"]').setInputFiles({
      name: "collection.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(COLLECTION_CSV),
    });
    await expect(page.locator(".gen .panel")).toContainText("6 unique cards recognized");
    await page.locator("button", { hasText: "Continue" }).click();

    await expect(page.locator(".gen-step")).toContainText("Step 3 of 4");
    await page.locator("#gen-cmd").fill("atraxa");
    await page.locator(".gen-candidate", { hasText: "Atraxa" }).click();

    await expect(page.locator(".gen-card-row").first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".gen-step")).toContainText("Step 4 of 4");
    await expect(page.locator(".gen-summary")).toContainText("100 cards");

    // Owned picks carry no Buy badge; a known-unowned pick does, priced.
    const solRingRow = page.locator(".gen-card-row", { hasText: "Sol Ring" });
    await expect(solRingRow.locator(".badge.warn")).toHaveCount(0);
    const counterspellRow = page.locator(".gen-card-row", { hasText: "Counterspell" }).first();
    await expect(counterspellRow.locator(".badge.warn")).toContainText("Buy");

    // The buy summary totals only the gap, priced from the same per-card lookup.
    const buySummary = page.locator(".gen-cat", { hasText: "picks already in your collection" });
    await expect(buySummary).toBeVisible();
    await expect(page.locator(".gen-lede", { hasText: "cards to buy" })).toContainText("$26.05");
  });
});

test.describe("Generated deck reasons", () => {
  test.skip(({ isMobile }) => isMobile, "desktop card grid flow");

  test("a generated card explains itself in the card detail modal", async ({ page }) => {
    await openGenerator(page);
    await page.locator(".gen-door", { hasText: "I know my commander" }).click();
    await page.locator("#gen-cmd").fill("atraxa");
    await page.locator(".gen-candidate", { hasText: "Atraxa" }).click();
    await expect(page.locator(".gen-card-row").first()).toBeVisible({ timeout: 20000 });
    await page.locator("button", { hasText: "Open in deck view" }).click();

    await page.locator('.card-thumb[aria-label="1x Sol Ring"]').first().click();
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
    await page.reload();
    await waitForAppReady(page);
    await dismissColdStart(page);

    // Generate a deck — Sol Ring picks up a note.
    await navigateToTab(page, "Analyze & Build");
    await page.locator(".empty-action", { hasText: "Guided build" }).click();
    await page.locator(".gen-door", { hasText: "I know my commander" }).click();
    await page.locator("#gen-cmd").fill("atraxa");
    await page.locator(".gen-candidate", { hasText: "Atraxa" }).click();
    await expect(page.locator(".gen-card-row").first()).toBeVisible({ timeout: 20000 });
    await page.locator("button", { hasText: "Open in deck view" }).click();
    await page.locator('.card-thumb[aria-label="1x Sol Ring"]').first().click();
    await expect(page.locator(".cdm-why")).toContainText("Pulls its weight");
    await page.locator(".cdm-close").click();

    // Switch to the hand-built deck WITHOUT a reload — same page, same module
    // state. Its Sol Ring was never explained by anything.
    await navigateToTab(page, "My Decks");
    await page.locator(".deck-card", { hasText: OTHER.name }).locator(".deck-card-art").click();
    await expect(page.locator(".card-grid-container")).toBeVisible({ timeout: 10000 });
    await page.locator('.card-thumb[aria-label="1x Sol Ring"]').first().click();
    await expect(page.locator(".cdm-name")).toHaveText("Sol Ring");
    await expect(page.locator(".cdm-why")).toHaveCount(0);
  });

  // Regression: a URL import replaces the deck wholesale, same as opening a
  // saved one. The mock import also contains Sol Ring, so a surviving note
  // would attach itself to a card this deck never explained.
  test("build notes do not survive a URL import over the generated deck", async ({ page }) => {
    await openGenerator(page);
    await page.locator(".gen-door", { hasText: "I know my commander" }).click();
    await page.locator("#gen-cmd").fill("atraxa");
    await page.locator(".gen-candidate", { hasText: "Atraxa" }).click();
    await expect(page.locator(".gen-card-row").first()).toBeVisible({ timeout: 20000 });
    await page.locator("button", { hasText: "Open in deck view" }).click();
    await page.locator('.card-thumb[aria-label="1x Sol Ring"]').first().click();
    await expect(page.locator(".cdm-why")).toContainText("Pulls its weight");
    await page.locator(".cdm-close").click();

    // Replace it with an imported deck that also runs Sol Ring.
    await page.locator(".dh-actions button", { hasText: "Import cards" }).click();
    await page.locator('.icm-tabs [role="tab"]', { hasText: "From URL" }).click();
    await page.locator(".icm-panel input").fill("https://archidekt.com/decks/12345");
    await page.locator(".icm-foot button", { hasText: "Import" }).click();
    await page.locator(".icm-confirm button", { hasText: "Replace deck" }).click();
    await expect(page.locator(".deck-title")).toContainText("Mock Import");

    await page.locator('.card-thumb[aria-label="1x Sol Ring"]').first().click();
    await expect(page.locator(".cdm-name")).toHaveText("Sol Ring");
    await expect(page.locator(".cdm-why")).toHaveCount(0);
  });

  // Regression: emptying the deck by hand and pasting a list is a wholesale
  // replacement too, and it goes through mergeImportedText's wasEmpty branch
  // rather than any of App's deck-switch callbacks.
  test("build notes do not survive a paste into an emptied deck", async ({ page }) => {
    await openGenerator(page);
    await page.locator(".gen-door", { hasText: "I know my commander" }).click();
    await page.locator("#gen-cmd").fill("atraxa");
    await page.locator(".gen-candidate", { hasText: "Atraxa" }).click();
    await expect(page.locator(".gen-card-row").first()).toBeVisible({ timeout: 20000 });
    await page.locator("button", { hasText: "Open in deck view" }).click();
    await page.locator('.card-thumb[aria-label="1x Sol Ring"]').first().click();
    await expect(page.locator(".cdm-why")).toContainText("Pulls its weight");
    await page.locator(".cdm-close").click();

    // Strip the deck back to nothing: clear the 99, then the commander.
    await page.locator(".dh-actions .more-menu-btn").click();
    await page.locator(".more-menu-item", { hasText: "Edit as text" }).click();
    await page.locator(".deck-text-editor").fill("");
    await page.locator('.card-thumb[aria-label*="Atraxa"]').first().click();
    await page.locator(".cdm-actions button", { hasText: "Change commander" }).click();
    await expect(page.locator(".empty-deck")).toBeVisible();

    // Paste a fresh list that also runs Sol Ring.
    await page.locator(".empty-action", { hasText: "Paste a decklist" }).click();
    await page.locator(".icm-panel textarea").fill("1 Sol Ring\n1 Counterspell");
    await page.locator(".icm-foot button", { hasText: "Import" }).click();

    await page.locator('.card-thumb[aria-label="1x Sol Ring"]').first().click();
    await expect(page.locator(".cdm-name")).toHaveText("Sol Ring");
    await expect(page.locator(".cdm-why")).toHaveCount(0);
  });
});
