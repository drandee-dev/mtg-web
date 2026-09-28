// Adding an off-color card by hand warns with Undo and never blocks (Job E3).
// Each add path gets its own test: they share a helper, not a call site.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, waitForAppReady, dismissColdStart, navigateToTab, seedLocalDecks } from "./fixtures/helpers.js";
import { TEST_COMMANDER, TEST_DECK_TEXT, TEST_DECK_STORAGE } from "./fixtures/test-data.js";

const REASON = "Outside the deck's color identity (WUBG)";

// Real validate_adds shape; Lightning Bolt is off-color for Atraxa.
async function stubGate(page) {
  const seen = [];
  await page.route("**/api/deck/validate-cards", (route) => {
    const body = route.request().postDataJSON();
    seen.push(body);
    const results = body.names.map((n) => (n === "Lightning Bolt"
      ? { input: n, name: n, status: "off_color", reason: REASON }
      : { input: n, name: n, status: "ok", reason: "" }));
    return route.fulfill({ json: { identity: ["W", "U", "B", "G"], identity_source: "commander", results } });
  });
  return seen;
}

const warning = (page) => page.locator(".toast", { hasText: `Lightning Bolt: ${REASON}` });
const deckHasBolt = (page) => page.locator('.card-grid-container [aria-label*="Lightning Bolt"]');

test("deck quick-add of an off-color card warns, and Undo removes it", async ({ page, isMobile }) => {
  test.skip(isMobile, "the quick-add field is in the desktop toolbar");
  const seen = await stubGate(page);
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  const quickAdd = page.locator('input[placeholder="Card name…"]');
  await quickAdd.fill("Lightning Bolt");
  await quickAdd.press("Enter");

  await expect(warning(page)).toBeVisible();
  // Not blocked: the card is in the deck until the user says otherwise.
  await expect(deckHasBolt(page).first()).toBeVisible();
  // The gate was asked about the list as it was before the add.
  expect(seen.at(-1).decklist).not.toContain("Lightning Bolt");
  expect(seen.at(-1).decklist).toContain(TEST_COMMANDER);

  await warning(page).getByRole("button", { name: "Undo" }).click();
  await expect(deckHasBolt(page)).toHaveCount(0);
});

test("an on-color add gets no warning", async ({ page, isMobile }) => {
  test.skip(isMobile, "the quick-add field is in the desktop toolbar");
  await stubGate(page);
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  const quickAdd = page.locator('input[placeholder="Card name…"]');
  await quickAdd.fill("Opt");
  const verdict = page.waitForResponse("**/api/deck/validate-cards");
  await quickAdd.press("Enter");
  await verdict;
  // Two frames: long enough for a wrongly issued warning to have rendered.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(page.locator(".toast", { hasText: "Opt:" })).toHaveCount(0);
  await expect(page.locator(".toast")).toContainText("Added Opt");
});

test("Search tab add of an off-color card warns, and Undo removes it", async ({ page }) => {
  const seen = await stubGate(page);
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  await navigateToTab(page, "Card Search");
  const input = page.locator('input[type="text"], input[type="search"], input[placeholder*="search" i], input[placeholder*="card" i]').first();
  await input.fill("Lightning Bolt");
  await input.press("Enter");
  await page.locator("tr", { hasText: "Lightning Bolt" }).getByRole("button", { name: "+ Add" }).first().click();

  await expect(warning(page)).toBeVisible();
  expect(seen.at(-1).decklist).not.toContain("Lightning Bolt");
  const sentAfterAdd = seen.length;

  await warning(page).getByRole("button", { name: "Undo" }).click();
  await navigateToTab(page, "Analyze & Build");
  await expect(page.locator(".card-grid-container").first()).toBeVisible();
  await expect(deckHasBolt(page)).toHaveCount(0);
  expect(seen.length).toBe(sentAfterAdd); // Undo itself asks nothing
});

test("moving an off-color card out of Considering warns, and Undo puts it back", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop card-modal flow (same moveFromConsidering on both)");
  await stubGate(page);
  await page.goto("/");
  await waitForAppReady(page);
  await seedLocalDecks(page, [{
    ...TEST_DECK_STORAGE,
    decklist_text: `${TEST_DECK_STORAGE.decklist_text}\nMaybeboard\n1 Lightning Bolt`,
  }]);
  await page.reload();
  await waitForAppReady(page);
  await dismissColdStart(page);
  await page.locator(".deck-card .deck-card-art").first().click();
  const considering = page.locator(".considering-group, .stack-column-considering");
  await expect(considering).toBeVisible({ timeout: 10000 });

  await considering.locator('[aria-label*="Lightning Bolt"]').first().click();
  await page.getByRole("button", { name: "+ Add to deck" }).click();
  await expect(warning(page)).toBeVisible();
  await expect(considering.locator('[aria-label*="Lightning Bolt"]')).toHaveCount(0);

  await warning(page).getByRole("button", { name: "Undo" }).click();
  await expect(considering.locator('[aria-label*="Lightning Bolt"]').first()).toBeVisible();
});
