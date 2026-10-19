// Visual pass I8: the keyboard focus ring reads on gold and on art. The global ring is
// one gold line (2px, offset 2px); on the deck header's gold end and over a tile's art
// it measured 1.07 to 2.85:1. WCAG 2.4.11 asks for 3. How it is measured is in
// fixtures/focus-ring.js.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, seedLocalDecks, waitForAppReady, dismissColdStart } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";
import { ART, paintArt, ringPeak } from "./fixtures/focus-ring.js";

const DECK = {
  id: "ring-deck",
  name: "Ring deck",
  format: "commander",
  decklist_text: `Commander\n1 ${TEST_COMMANDER}\n\nDeck\n${TEST_DECK_TEXT}`,
};

for (const theme of ["dark", "light"]) {
  test.describe(`focus ring, ${theme} theme`, () => {
    test.beforeEach(async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop-chrome", "sizes its own viewport");
      await page.addInitScript((t) => localStorage.setItem("mtgweb:theme", t), theme);
    });

    for (const [name, colour] of Object.entries(ART)) {
      test(`deck header Save, Playtest and More over ${name} art`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
        await paintArt(page, ".deck-head-art", colour);
        const controls = {
          Save: page.locator(".deck-head .primary", { hasText: "Save" }),
          Playtest: page.locator(".deck-head button", { hasText: "Playtest" }),
          More: page.locator(".deck-head .more-menu-btn"),
        };
        for (const [label, control] of Object.entries(controls)) {
          await expect(control, `${label} not found`).toBeVisible();
          const { peak, changed } = await ringPeak(page, control);
          expect(changed, `${label} showed no focus change at all`).toBeGreaterThan(0);
          expect(peak, `${label} over ${name} art, ${theme}`).toBeGreaterThanOrEqual(3);
        }
      });

      test(`a deck tile's menu button over ${name} art`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto("/");
        await waitForAppReady(page);
        await seedLocalDecks(page, [DECK]);
        await page.reload();
        await waitForAppReady(page);
        await dismissColdStart(page);
        await paintArt(page, ".deck-card-art img", colour);
        const control = page.locator(".deck-card-menu-btn").first();
        await expect(control).toBeVisible();
        const { peak, changed } = await ringPeak(page, control);
        expect(changed, "the tile menu showed no focus change at all").toBeGreaterThan(0);
        expect(peak, `tile menu over ${name} art, ${theme}`).toBeGreaterThanOrEqual(3);
      });
    }
  });
}
