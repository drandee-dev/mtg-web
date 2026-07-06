// Mass art change: pick a set, preview which cards have a printing there,
// apply → every match gets a "(SET) cn" pin in the decklist (commander
// included, via its suffix-encoded string).

import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, deckMenuAction } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

const SETS = {
  sets: [
    { code: "FIN", name: "Final Fantasy", released: "2025-06-13", card_count: 588, set_type: "expansion" },
    { code: "FIC", name: "Final Fantasy Commander", released: "2025-06-13", card_count: 456, set_type: "commander" },
  ],
};

const MATCHES = {
  matches: [
    { name: TEST_COMMANDER, set: "FIN", set_name: "Final Fantasy", cn: "550", rarity: "mythic", thumb: "", price_usd: 30 },
    { name: "Sol Ring", set: "FIN", set_name: "Final Fantasy", cn: "553", rarity: "uncommon", thumb: "", price_usd: 3 },
    { name: "Counterspell", set: "FIN", set_name: "Final Fantasy", cn: "223", rarity: "common", thumb: "", price_usd: 1 },
  ],
  unmatched: ["Command Tower"],
};

test.describe("Mass art change", () => {
  test.skip(({ isMobile }) => isMobile, "desktop menu flow");

  test("set search → preview → apply pins printings across the deck", async ({ page }) => {
    await page.route("**/api/sets**", (r) =>
      r.fulfill({ contentType: "application/json", body: JSON.stringify(SETS) }));
    await page.route("**/api/cards/mass-printing", (r) =>
      r.fulfill({ contentType: "application/json", body: JSON.stringify(MATCHES) }));

    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await deckMenuAction(page, "Mass change art");

    const modal = page.locator(".mam-panel");
    await expect(modal).toBeVisible();

    // Search sets and pick Final Fantasy → chip appears
    await modal.locator("#mam-set-input").fill("final");
    await modal.locator('.ac-item:has-text("Final Fantasy")').first().click();
    await expect(modal.locator(".mam-chip")).toHaveCount(1);

    // Preview: 3 matches, 1 unmatched
    await modal.locator('button:has-text("Preview")').click();
    await expect(modal.locator(".mam-preview-head")).toContainText("3");
    await expect(modal.locator(".mam-match")).toHaveCount(3);
    await expect(modal.locator(".mam-unmatched summary")).toContainText("1");

    // Apply → toast + modal closes
    await modal.locator('button:has-text("Apply to 3 cards")').click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator(".toast")).toContainText("3 cards", { timeout: 4000 });

    // Deck lines carry the pins now — visible in the text editor
    await deckMenuAction(page, "Edit as text");
    const textarea = page.locator(".deck-text-editor");
    await expect(textarea).toHaveValue(/1 Sol Ring \(FIN\) 553/);
    await expect(textarea).toHaveValue(/1 Counterspell \(FIN\) 223/);
    // Command Tower was unmatched — stays clean
    await expect(textarea).not.toHaveValue(/Command Tower \(/);
    // Commander pinned too, but its display name stays clean
    await expect(page.locator(".deck-title")).not.toContainText("FIN");
  });

  test("reset clears every pinned printing", async ({ page }) => {
    await loadSharedDeck(page, "1 Sol Ring (FIN) 553\n1 Command Tower", TEST_COMMANDER);
    await deckMenuAction(page, "Mass change art");

    const modal = page.locator(".mam-panel");
    await modal.locator('button:has-text("Reset all art (1)")').click();
    await expect(modal).toHaveCount(0);

    await deckMenuAction(page, "Edit as text");
    await expect(page.locator(".deck-text-editor")).toHaveValue(/1 Sol Ring\n/);
  });
});
