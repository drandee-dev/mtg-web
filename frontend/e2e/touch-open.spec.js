import { test, expect } from "./fixtures/test-base.js";
import { waitForAppReady, dismissColdStart, setCardView } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

// Visual pass I1: on a phone a card opens in two taps or fewer from every view.
// Before, Stacks took four (StackView's reveal tap, then CardGrid's own expand
// step) and Grid's first tap changed nothing.

async function openDeck(page) {
  const deckStr = `Commander\n1 ${TEST_COMMANDER}\n\nDeck\n${TEST_DECK_TEXT}`;
  const encoded = Buffer.from(deckStr, "utf8").toString("base64");
  await page.goto(`/?deck=${encodeURIComponent(encoded)}&fmt=commander&cmd=${encodeURIComponent(TEST_COMMANDER)}`);
  await waitForAppReady(page);
  await dismissColdStart(page);
}

// Tap the same spot until the card modal opens; return how many taps it took.
async function tapsToOpen(page, target, position, max = 5) {
  const modal = page.locator(".cdm-panel");
  for (let taps = 1; taps <= max; taps++) {
    await target.tap({ position });
    if (await modal.isVisible()) return taps;
    await page.waitForTimeout(150);
    if (await modal.isVisible()) return taps;
  }
  return Infinity;
}

test.describe("Phone card open", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "touch only");
    await openDeck(page);
  });

  test("Stacks (image) opens in two taps or fewer", async ({ page }) => {
    await setCardView(page, { mode: "Stacks", group: "role" });
    const card = page.locator(".stack-card-wrap").first();
    await card.waitFor();
    expect(await tapsToOpen(page, card, { x: 30, y: 10 })).toBeLessThanOrEqual(2);
  });

  test("Stacks (text) opens in one tap", async ({ page }) => {
    await setCardView(page, { mode: "Stacks", group: "role", stackAs: "Text" });
    const row = page.locator(".ts-row").first();
    await row.waitFor();
    expect(await tapsToOpen(page, row, { x: 30, y: 10 })).toBe(1);
  });

  test("Grid opens in one tap", async ({ page }) => {
    await setCardView(page, { mode: "Grid" });
    const thumb = page.locator(".card-thumb").first();
    await thumb.waitFor();
    expect(await tapsToOpen(page, thumb, { x: 30, y: 30 })).toBe(1);
  });
});
