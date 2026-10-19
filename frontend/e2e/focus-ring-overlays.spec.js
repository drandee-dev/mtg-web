// Visual pass I8b: the card modal's flip button. I8 gave the deck header and the tile menu
// a two-tone ring because the plain gold ring measured under 3:1 over gold and white art.
// The flip button sits on the card's art the same way (and its glyph read var(--text) on a
// dark pill, which is dark on dark in the light theme). The other four controls the audit
// named (the modal's close button, a stack card's rail buttons, the Ask card chips and the
// colour filter pips) were measured at 3:1 or more with the plain ring, so they have no case
// here: one would pass without a rule and guard nothing. How a ring is measured is in
// fixtures/focus-ring.js.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, setCardView } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";
import { ART, paintArt, ringPeak } from "./fixtures/focus-ring.js";

async function openMdfcModal(page) {
  await loadSharedDeck(page, `${TEST_DECK_TEXT}\n1 Malakir Rebirth`, TEST_COMMANDER);
  // Stacked cards overlap; the top strip is the part of a card that is always in view.
  await page.locator('.stack-card-wrap[aria-label*="Malakir Rebirth"]').first().click({ position: { x: 30, y: 8 } });
  await expect(page.locator(".cdm-panel")).toBeVisible();
  await expect(page.locator(".cdm-flip")).toBeVisible();
}

for (const theme of ["dark", "light"]) {
  test.describe(`overlay controls, ${theme} theme`, () => {
    test.beforeEach(async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop-chrome", "sizes its own viewport");
      await page.addInitScript((t) => localStorage.setItem("mtgweb:theme", t), theme);
      await page.setViewportSize({ width: 1440, height: 900 });
    });

    for (const [name, colour] of Object.entries(ART)) {
      test(`its focus ring over ${name} art`, async ({ page }) => {
        await openMdfcModal(page);
        await paintArt(page, ".cdm-art img", colour);
        const { peak, changed } = await ringPeak(page, page.locator(".cdm-flip"));
        expect(changed, "the flip button showed no focus change at all").toBeGreaterThan(0);
        expect(peak, `flip over ${name} art, ${theme}`).toBeGreaterThanOrEqual(3);
      });
    }

    // A stack card's rail (its +, - and action buttons) is only on screen while the card or
    // one of its buttons has focus, so each button is measured with a neighbour holding focus.
    for (const [name, colour] of Object.entries(ART)) {
      test(`a stack card's rail buttons over ${name} art`, async ({ page }) => {
        await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
        await setCardView(page, { mode: "Stacks", group: "role" });
        await paintArt(page, ".stack-card-wrap img", colour);
        // Not the commander (the first card): it has one rail button, a normal card has four.
        const buttons = page.locator(".stack-card-wrap").nth(1).locator(".card-rail-btn");
        const count = await buttons.count();
        expect(count, "the rail has buttons").toBeGreaterThan(2);
        const weak = [];
        for (let i = 0; i < count; i++) {
          const keep = buttons.nth(i === 0 ? 1 : 0);
          const { peak, changed } = await ringPeak(page, buttons.nth(i), { keep });
          expect(changed, `rail button ${i} showed no focus change at all`).toBeGreaterThan(0);
          if (peak < 3) weak.push(`button ${i}: ${peak}`);
        }
        expect(weak, `rail buttons under 3:1 over ${name} art, ${theme}`).toEqual([]);
      });
    }

    test("its glyph reads on its dark pill", async ({ page }) => {
      await openMdfcModal(page);
      const ratio = await page.locator(".cdm-flip").evaluate((btn) => {
        const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
        const glyph = getComputedStyle(btn).color.match(/\d+/g).slice(0, 3).map(Number);
        const bg = getComputedStyle(btn).backgroundColor.match(/[\d.]+/g).map(Number);
        const flat = [0, 1, 2].map((i) => bg[i] * bg[3] + 255 * (1 - bg[3])); // worst case: white art
        const [hi, lo] = [lum(glyph), lum(flat)].sort((a, c) => c - a);
        return (hi + 0.05) / (lo + 0.05);
      });
      expect(ratio, `flip glyph, ${theme}`).toBeGreaterThanOrEqual(4.5);
    });
  });
}
