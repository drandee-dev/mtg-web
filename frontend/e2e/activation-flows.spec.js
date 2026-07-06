// Activation flows — "suggest at the moment of relevance, one-tap adopt,
// dismissal persists": playtest-on-complete, share-after-save, Planeswalker
// first-contact badge, over-budget → Budget swaps, Considering zero-state,
// card modal → Rules prefill.

import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

test.describe("Activation flows", () => {
  test.skip(({ isMobile }) => isMobile, "desktop flows");

  test("deck completing to 100 fires a one-time Playtest toast", async ({ page }) => {
    // loadSharedDeck embeds the commander as a deck line too, so 97 Sol Ring
    // arrives as 97 + 1 (commander line) + 1 (commander) = 99 → one short.
    await loadSharedDeck(page, "97 Sol Ring", TEST_COMMANDER);
    // Let the arrival auto-save settle first (its toast + deckId change)
    await expect(page.locator(".toast")).toContainText("Saved", { timeout: 10000 });

    // Cross the line: append the 100th card via the text editor
    await page.locator(".more-menu-btn:visible").first().click();
    await page.locator('.more-menu-item:has-text("Edit as text")').click();
    const editor = page.locator(".deck-text-editor");
    const current = await editor.inputValue();
    await editor.fill(`${current}\n1 Counterspell`);

    const toast = page.locator(".toast");
    await expect(toast).toContainText("Deck complete", { timeout: 5000 });
    await toast.locator(".toast-action").click();
    await expect(page.locator("h2")).toContainText("Playtest");
  });

  test("save toast carries a one-tap Share link action", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const toast = page.locator(".toast");
    await expect(toast).toContainText("Saved as", { timeout: 10000 });
    await expect(toast.locator(".toast-action")).toContainText("Share link");
    await toast.locator(".toast-action").click();
    // Clipboard may be blocked in the test browser — either outcome toasts.
    await expect(page.locator(".toast")).toContainText(/copied|browser permissions/, { timeout: 4000 });
  });

  test("Planeswalker FAB pulses with an Ask-why tag until first opened", async ({ page }) => {
    // The base fixture marks pwseen; clear it to simulate a first-timer.
    await page.addInitScript(() => localStorage.removeItem("mtgweb:pwseen"));
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);

    const fab = page.locator(".planeswalker-btn");
    await expect(fab).toHaveClass(/pw-first-contact/);
    await expect(page.locator(".pw-fc-tag")).toBeVisible();

    await fab.click();
    await expect(page.locator(".planeswalker-panel")).toBeVisible();
    await expect(page.locator(".pw-fc-tag")).toHaveCount(0);
    await expect(fab).not.toHaveClass(/pw-first-contact/);
  });

  test("over-budget goal surfaces a chip that routes to Budget swaps", async ({ page }) => {
    await page.route("**/api/deck/budget-swaps", (r) =>
      r.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          swaps: [{ card: "Rhystic Study", price: 25, alternative: { name: "Mystic Remora", price: 4 } }],
          total_savings: 21,
        }),
      }));

    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    // Set a $50 ceiling (mock analyze prices the deck at $68.93)
    await page.locator(".dg-head").click();
    await page.locator('.dg-opts[aria-label="Budget ceiling"]').getByRole("button", { name: "$50", exact: true }).click();
    await page.locator(".dg-head").click(); // Done

    const chip = page.locator(".asmt-chip-budget");
    await expect(chip).toBeVisible({ timeout: 15000 }); // waits out analyze debounce
    await expect(chip).toContainText("$19 over your $50 budget");

    await chip.click();
    await expect(page.locator("#insp-pane")).toContainText("Rhystic Study", { timeout: 10000 });
  });

  test("empty Considering shows a zero-state CTA", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const zero = page.locator(".considering-zero");
    await expect(zero).toBeVisible();
    await expect(zero).toContainText("Considering");
    await expect(zero.locator("button")).toContainText("Suggest cards");
  });

  test("card modal Rules action lands on the Rules tab prefilled", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await page.locator('.card-group [aria-label*="Sol Ring"]').first().click();
    const modal = page.locator(".cdm-panel");
    await expect(modal).toBeVisible();
    await modal.locator('button:has-text("Rules")').click();

    await expect(page).toHaveURL(/tab=rules/);
    await expect(page.locator(".rules-input-row input")).toHaveValue(/How does Sol Ring work/);
  });
});
