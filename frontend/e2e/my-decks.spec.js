import { test, expect } from "./fixtures/test-base.js";
import {
  waitForAppReady,
  dismissColdStart,
  seedLocalDecks,
  clearLocalStorage,
  deckMenuAction,
  navigateToTab,
} from "./fixtures/helpers.js";
import { TEST_DECK_STORAGE } from "./fixtures/test-data.js";

test.describe("My Decks", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
  });

  test("empty state shows a get-started call to action", async ({ page }) => {
    await clearLocalStorage(page);
    await page.reload();
    await waitForAppReady(page);
    await dismissColdStart(page);

    // One way in on the page itself, to the New deck screen; the old landing's
    // doors (AI, import URL, paste, guided) all live there now.
    const main = page.locator("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText("Build and tune Magic decks");
    await expect(main.getByRole("link", { name: "New deck" })).toHaveAttribute("href", "/new");
    await expect(main.getByRole("button", { name: /Start with AI|Guided|Import/ })).toHaveCount(0);
    await main.getByRole("link", { name: "New deck" }).click();
    await expect(page).toHaveURL(/\/new$/);
  });

  test("the last edited deck gets the resume band, from two decks up", async ({ page }) => {
    const older = { ...TEST_DECK_STORAGE, id: "older", name: "Older deck", updated_at: "2026-01-01T00:00:00.000Z" };
    const newer = { ...TEST_DECK_STORAGE, id: "newer", name: "Newer deck", updated_at: "2026-02-01T00:00:00.000Z" };
    const main = page.locator("main");

    await seedLocalDecks(page, [older]);
    await page.reload();
    await waitForAppReady(page);
    await expect(main.getByRole("link", { name: "Open deck" })).toHaveCount(0);
    await expect(main.getByRole("heading", { level: 1 })).toHaveText("Your decks");

    await seedLocalDecks(page, [older, newer]);
    await page.reload();
    await waitForAppReady(page);
    await expect(main.getByRole("heading", { level: 1 })).toHaveText("Newer deck");
    await main.getByRole("link", { name: "Open deck" }).click();
    await expect(page).toHaveURL(/\/decks\/newer$/);
  });

  test("search, format and sort show only from nine decks, and nothing offers a copy signed out", async ({ page }) => {
    const deck = (i) => ({ ...TEST_DECK_STORAGE, id: `d${i}`, name: `Deck ${i}` });
    await seedLocalDecks(page, Array.from({ length: 8 }, (_, i) => deck(i)));
    await page.reload();
    await waitForAppReady(page);
    await expect(page.locator(".deck-card")).toHaveCount(8);
    await expect(page.getByLabel("Search")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copy to my account" })).toHaveCount(0);

    await seedLocalDecks(page, Array.from({ length: 9 }, (_, i) => deck(i)));
    await page.reload();
    await waitForAppReady(page);
    await page.getByLabel("Search").fill("Deck 3");
    await expect(page.locator(".deck-card")).toHaveCount(1);
  });

  test("seeded decks appear in the list", async ({ page }) => {
    await seedLocalDecks(page, [TEST_DECK_STORAGE]);
    await page.reload();
    await waitForAppReady(page);
    await dismissColdStart(page);

    await expect(page.locator(`text=${TEST_DECK_STORAGE.name}`)).toBeVisible({ timeout: 5000 });
  });

  test("opening a deck shows it in the editor", async ({ page }) => {
    await seedLocalDecks(page, [TEST_DECK_STORAGE]);
    await page.reload();
    await waitForAppReady(page);
    await dismissColdStart(page);

    // Clicking the deck card's art opens it in the editor (the old hover
    // overlay with Edit/Playtest/Export buttons was removed).
    await page.locator(".deck-card .deck-card-art").first().click();

    await expect(page).toHaveURL(new RegExp(`/decks/${TEST_DECK_STORAGE.id}$`));
    await expect(page.locator(".card-grid-container")).toBeVisible({ timeout: 10000 });
  });

  test("a browser deck already copied to an account stays marked through a rename and a delete undone", async ({ page }) => {
    const mark = async () => (await page.evaluate(() => JSON.parse(localStorage.getItem("mtgweb:decks"))))
      .find((d) => d.id === TEST_DECK_STORAGE.id)?.copiedTo;
    await seedLocalDecks(page, [{ ...TEST_DECK_STORAGE, copiedTo: ["acct-1"] }]);

    // The deck page's own saves rebuild the deck from its fields.
    await page.goto(`/decks/${TEST_DECK_STORAGE.id}`);
    await waitForAppReady(page);
    await expect(page.locator(".card-grid-container")).toBeVisible({ timeout: 10000 });
    page.once("dialog", (d) => d.accept("Renamed deck"));
    await deckMenuAction(page, "Rename deck");
    await expect(page.locator(".toast", { hasText: 'Renamed to "Renamed deck"' })).toBeVisible();
    expect(await mark()).toEqual(["acct-1"]);

    // Delete takes the record away; Undo puts it back from the list's copy.
    await navigateToTab(page, "My Decks");
    await page.getByRole("button", { name: /^Actions for / }).click();
    await page.locator(".deck-card-menu-item", { hasText: "Delete" }).click();
    expect(await mark()).toBeUndefined();
    await page.locator(".toast .toast-action", { hasText: "Undo" }).click();
    await expect(page.locator(".deck-card")).toHaveCount(1);
    expect(await mark()).toEqual(["acct-1"]);
  });

  test("a tile's ⋯ menu closes on Escape and gives focus back to its button", async ({ page }) => {
    await seedLocalDecks(page, [TEST_DECK_STORAGE]);
    await page.reload();
    await waitForAppReady(page);
    const btn = page.getByRole("button", { name: `Actions for ${TEST_DECK_STORAGE.name}` });
    await btn.click();
    await expect(page.locator(".deck-card-menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".deck-card-menu")).toHaveCount(0);
    await expect(btn).toBeFocused();
  });

  test("visual: my decks with saved deck", async ({ page }) => {
    // Two, so the resume band is in the picture. No dates: "Edited …" is
    // relative and would drift the picture as the calendar moves.
    await seedLocalDecks(page, [
      TEST_DECK_STORAGE,
      { ...TEST_DECK_STORAGE, id: "test-deck-2", name: "Second deck" },
    ]);
    await page.reload();
    await waitForAppReady(page);
    await dismissColdStart(page);
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("my-decks-with-deck.png", { fullPage: true });
  });
});
