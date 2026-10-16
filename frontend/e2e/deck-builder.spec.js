import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, deckMenuAction, openDeckSection, addCardField, setCardView, openAddress, seedLocalDecks } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

test.describe("Deck Builder", () => {
  test("shared deck link loads cards into the grid", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await expect(page.locator(".card-grid-container")).toBeVisible();
    // The header's count, commander included, once cards are parsed. Shown on
    // both sizes since job 3.2.
    await expect(page.locator(".deck-head-count")).toHaveText("11 / 100 cards", { timeout: 10000 });
  });

  test("card groups render for the loaded deck", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    // Default stack view groups by type — at least one group header should appear.
    await expect(page.locator(".card-group, .stack-view").first()).toBeVisible({ timeout: 10000 });
  });

  test("share link action copies a URL to the clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await deckMenuAction(page, "Share link");
    await expect(page.locator(".toast")).toContainText(/copied|share/i, { timeout: 4000 });
  });

  test("visual: deck view with cards (grid)", async ({ page }) => {
    // This snapshot is specifically about the grid layout (see title) — force
    // it rather than ride whatever the default happens to be.
    await page.addInitScript(() => {
      try { localStorage.setItem("mtgweb:viewMode", "grid"); } catch { /* ignore */ }
    });
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await page.locator(".deck-head-count").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot("deck-view-cards.png", { fullPage: true });
  });
});

// The toolbar on the tab strip (UX overhaul job 3.3, decision 7).
test.describe("Card toolbar on the strip", () => {
  test("the add field is on the strip in Cards on every size, and only there", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const strip = page.locator(".deck-strip");
    await expect(strip.getByPlaceholder("Add a card by name")).toBeVisible();
    await addCardField(page).fill("Opt");
    await addCardField(page).press("Enter");
    await expect(page.locator(".toast")).toContainText("Added Opt");

    await openDeckSection(page, "Improve");
    await expect(addCardField(page)).toHaveCount(0);
    await openDeckSection(page, "Cards");
    await expect(addCardField(page)).toBeVisible();

    // A locked deck takes no cards; the view controls stay.
    await deckMenuAction(page, "Lock deck (view only)");
    await expect(addCardField(page)).toHaveCount(0);
    await expect(page.locator(".ct-view-btn")).toBeVisible();
  });

  test("an empty deck: Search for cards puts the cursor in the field, and there is no View", async ({ page }) => {
    await openAddress(page, "/");
    await seedLocalDecks(page, [{ id: "empty-deck", name: "Empty", format: "modern", decklist_text: "" }]);
    await openAddress(page, "/decks/empty-deck");
    await expect(page.locator(".empty-deck")).toBeVisible();
    await expect(page.locator(".ct-view-btn")).toHaveCount(0);
    await page.locator(".empty-action", { hasText: "Search for cards" }).click();
    await expect(addCardField(page)).toBeFocused();
  });

  test("with room, Filter and Stacks/Grid/List sit on the strip; without, they fold into View", async ({ page, isMobile }) => {
    test.skip(isMobile, "sets desktop widths itself; the phone run is always folded");
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await expect(page.getByLabel("Filter cards in deck")).toBeVisible();
    await expect(page.getByRole("button", { name: "Grid", exact: true })).toBeVisible();

    await page.setViewportSize({ width: 900, height: 900 });
    await expect(page.getByLabel("Filter cards in deck")).toBeHidden();
    await expect(page.getByRole("button", { name: "Grid", exact: true })).toHaveCount(0);
    await expect(page.locator(".ct-view-summary")).toContainText(/^Stacks, by type$/);

    // Folded, they still work: Grid from inside View.
    await setCardView(page, { mode: "Grid" });
    await expect(page.locator(".card-grid").first()).toBeVisible();
    await expect(page.locator(".ct-view-summary")).toContainText(/^Grid, by type$/);
  });
});
