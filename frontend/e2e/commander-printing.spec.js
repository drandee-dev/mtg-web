// The commander gets a printing switcher too. Its pin lives in the commander
// string (suffix-encoded) so it round-trips through save/share — but every
// display shows the clean name.

import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

const PRINTS = [
  { set: "C21", set_name: "Commander 2021", cn: "100", released: "2021-01-01", image: "", thumb: "", price_usd: 12 },
  { set: "SLD", set_name: "Secret Lair", cn: "222", released: "2022-01-01", image: "", thumb: "", price_usd: 40 },
];

test.describe("Commander printing switcher", () => {
  test.skip(({ isMobile }) => isMobile, "desktop sidebar flow");

  test("commander modal offers printings and pins one to the commander string", async ({ page }) => {
    await page.route("**/api/cards/prints**", (r) =>
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ name: TEST_COMMANDER, prints: PRINTS }) }));
    await page.route("**/api/cards/printing**", (r) =>
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ found: true, ...PRINTS[1], name: TEST_COMMANDER }) }));

    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);

    // Open the commander card's detail modal (grid view commander group)
    await page.locator('.card-group [aria-label*="Atraxa"]').first().click();
    const modal = page.locator(".cdm-panel");
    await expect(modal).toBeVisible();
    await expect(modal.locator(".cdm-cmdr-tag")).toContainText("Commander");

    // Printing switcher is present for the commander now
    await modal.locator(".cdm-print-toggle").click();
    await expect(modal.locator(".cdm-print")).toHaveCount(2);

    // Pin the SLD printing → toast + suffix written into the commander string
    await modal.locator(".cdm-print").nth(1).click();
    await expect(page.locator(".toast")).toContainText("SLD", { timeout: 4000 });

    // Close, reopen: the switcher reflects the pinned printing
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await page.locator('.card-group [aria-label*="Atraxa"]').first().click();
    await expect(page.locator(".cdm-print-toggle")).toContainText("SLD #222");

    // Deck title / commander name stays clean (no "(SLD) 222" leaking through)
    await expect(page.locator(".deck-title")).not.toContainText("SLD");
  });
});
