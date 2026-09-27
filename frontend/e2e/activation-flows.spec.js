// Activation flows — "suggest at the moment of relevance, one-tap adopt,
// dismissal persists": playtest-on-complete, share-after-save, Planeswalker
// first-contact badge, over-budget → Budget swaps, Considering zero-state,
// card modal → Rules prefill.

import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, seedLocalDecks, waitForAppReady, dismissColdStart } from "./fixtures/helpers.js";
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

  // Regression: the chip sets budget mode and loads in the same handler, so
  // the load must be told the mode explicitly — reading it back out of state
  // gets the PREVIOUS mode. A user sitting on power upgrades who has never
  // loaded budget swaps got a dead click: the pane flipped to budget mode and
  // nothing ever fetched the swaps to put in it.
  test("over-budget chip forces budget mode even when power upgrades were open", async ({ page }) => {
    const DECK = {
      id: "power-mode-deck",
      name: "Power mode deck",
      format: "commander",
      decklist_text: `Commander\n1 ${TEST_COMMANDER}\nDeck\n${TEST_DECK_TEXT}`,
    };
    await page.goto("/");
    await waitForAppReady(page);
    await seedLocalDecks(page, [DECK]);
    // This deck was last left on power upgrades, and budget swaps have never
    // been fetched for it.
    await page.evaluate((id) => {
      localStorage.setItem(`mtgweb:insights:${id}`, JSON.stringify({
        v: 1, panels: {}, activePanel: null, upgradeMode: "power",
        pinned: [], dismissed: [], dismissedCuts: [], declinedUpgrades: [],
      }));
    }, DECK.id);
    await page.reload();
    await waitForAppReady(page);
    await dismissColdStart(page);
    await page.locator(".deck-card .deck-card-art").first().click();
    await expect(page.locator(".card-grid-container")).toBeVisible({ timeout: 10000 });

    // Declare a ceiling the mock deck ($68.93) busts.
    await page.locator(".dg-head").click();
    await page.locator('.dg-opts[aria-label="Budget ceiling"]').getByRole("button", { name: "$50", exact: true }).click();
    await page.locator(".dg-head").click();

    const chip = page.locator(".asmt-chip-budget");
    await expect(chip).toBeVisible({ timeout: 15000 });

    // The chip must fetch budget swaps, not the power upgrades the pane was on.
    const budgetCall = page.waitForRequest((r) =>
      new URL(r.url()).pathname.endsWith("/api/deck/budget-swaps"), { timeout: 10000 });
    await chip.click();
    await budgetCall;
    await expect(page.locator('#insp-pane .opt-cat:has-text("Budget")').first()).toBeVisible({ timeout: 10000 });
  });

  test("empty Considering shows a zero-state CTA", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const zero = page.locator(".considering-zero");
    await expect(zero).toBeVisible();
    await expect(zero).toContainText("Considering");
    await expect(zero.locator("button")).toContainText("Suggest cards");
  });

  test("Suggest cards adds only validated names, in one go, and never touches the deck", async ({ page }) => {
    // Prod 2026-09-27: unvalidated chat lines went straight into Considering,
    // a stale-state forEach kept 1 of 8, and a suggested deck card was pulled
    // out of the deck. The model returns 12 lines here; the gate passes 9.
    const OK = ["Card One", "Card Two", "Card Three", "Card Four", "Card Five", "Card Six", "Card Seven"];
    const lines = [
      "1 Sol Ring — already a deck card",
      ...OK.map((n) => `1 ${n} — fits`),
      "1 Card Eight — fits",
      "1 Blasphemous Act — off-color",
      "1 Mana Crypt — banned",
      "1 Beast Whisperer's better friend — garbage",
    ];
    await page.route("**/api/planeswalker/chat", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ response: lines.join("\n") }) }));
    const verdict = { "Blasphemous Act": "off_color", "Mana Crypt": "illegal", "Beast Whisperer's better friend": "unknown" };
    await page.route("**/api/deck/validate-cards", (route) => {
      const { names } = route.request().postDataJSON();
      // Sol Ring comes back "ok" on purpose (a 60-card deck under 4 copies
      // does): the client must still never remove it from the deck.
      const results = names.map((n) => ({ input: n, name: verdict[n] === "unknown" ? null : n, status: verdict[n] || "ok", reason: "" }));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ identity: ["W", "U", "B", "G"], identity_source: "commander", results }) });
    });

    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const count = page.locator('.deck-toolbar .badge:has-text("/ 100")');
    await expect(count).toBeVisible();
    const before = await count.textContent();
    const solRingInDeck = page.locator('.card-grid-container [aria-label*="Sol Ring"]');
    await expect(solRingInDeck.first()).toBeAttached();
    await page.locator(".considering-zero button", { hasText: "Suggest cards" }).click();

    const toast = page.locator(".toast");
    await expect(toast).toContainText("Added 8 to Considering");
    await expect(toast).toContainText("3 skipped");
    await expect(toast).not.toContainText("Set your commander");
    const considering = page.locator(".considering-group, .stack-column-considering");
    for (const n of ["Sol Ring", ...OK]) {
      await expect(considering.locator(`[aria-label*="${n}"]`).first()).toBeAttached();
    }
    // First 8 ok only: the 9th never lands.
    await expect(considering.locator('[aria-label*="Card Eight"]')).toHaveCount(0);
    // The deck itself is untouched.
    await expect(count).toHaveText(before);
  });

  test("card modal Rules action lands on the Rules tab prefilled", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await page.locator('.card-grid-container [aria-label*="Sol Ring"]').first().click();
    const modal = page.locator(".cdm-panel");
    await expect(modal).toBeVisible();
    await modal.locator('button:has-text("Rules")').click();

    await expect(page).toHaveURL(/tab=rules/);
    await expect(page.locator(".rules-input-row input")).toHaveValue(/How does Sol Ring work/);
  });
});
