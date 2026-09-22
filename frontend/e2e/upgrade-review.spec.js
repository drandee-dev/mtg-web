// Job 3 — guided upgrade flow: paste a decklist → state a game plan (reuses
// Deck Goals) → bracket review + card ratings (aiExplain) → the existing
// Changes queue for swaps. Runs against the hermetic mock backend.

import { test, expect } from "./fixtures/test-base.js";
import { waitForAppReady, dismissColdStart, navigateToTab, loadSharedDeck } from "./fixtures/helpers.js";
import { TEST_COMMANDER, TEST_DECK_TEXT } from "./fixtures/test-data.js";

const PASTE_TEXT = `Commander\n1 ${TEST_COMMANDER}\n\nDeck\n${TEST_DECK_TEXT}`;

function countRequests(page, pathSuffix) {
  const counter = { n: 0 };
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.endsWith(pathSuffix)) counter.n += 1;
  });
  return counter;
}

async function pasteIntoEmptyDeck(page) {
  await page.goto("/");
  await waitForAppReady(page);
  await dismissColdStart(page);
  await navigateToTab(page, "Analyze & Build");
  await page.locator(".empty-action", { hasText: "Paste a decklist" }).click();
  await page.locator(".icm-panel textarea").fill(PASTE_TEXT);
  await page.locator(".icm-foot button", { hasText: "Import" }).click();
}

test.describe("Upgrade review — guided flow", () => {
  test.skip(({ isMobile }) => isMobile, "desktop sidebar flow");

  test("paste into an empty deck opens the guide; goals step reuses Deck Goals", async ({ page }) => {
    await pasteIntoEmptyDeck(page);
    const modal = page.locator(".upr-panel");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Step 1 of 2");
    // The plan step is the real Deck Goals editor, forced open — not a second
    // free-text box.
    await expect(modal.locator(".deck-goals .dg-body")).toBeVisible();
    await expect(modal.locator(".dg-note")).toBeVisible();
  });

  test("pasting more cards into a deck already in progress skips the guide", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await page.locator(".dh-actions button", { hasText: "Import cards" }).click();
    await page.locator(".icm-panel textarea").fill("1 Lightning Bolt");
    await page.locator(".icm-foot button", { hasText: "Import" }).click();
    await expect(page.locator(".upr-panel")).toHaveCount(0);
  });

  test("ratings are gated behind the explicit AI action, not the step change", async ({ page }) => {
    const explainCalls = countRequests(page, "/api/deck/ai/explain");
    await pasteIntoEmptyDeck(page);
    const modal = page.locator(".upr-panel");
    await modal.locator(".icm-foot button", { hasText: "Continue" }).click();
    await expect(modal).toContainText("Step 2 of 2");
    // Bracket renders for free — no explain call yet. Waits out the 2s
    // analyze debounce that fills `result.bracket` after the paste.
    await expect(modal.locator(".upr-bracket .badge")).toContainText("Bracket 2", { timeout: 15000 });
    expect(explainCalls.n).toBe(0);

    const rateBtn = modal.locator(".insp-deep");
    await expect(rateBtn).toContainText("Uses AI");
    await rateBtn.click();
    await expect(modal.locator(".gen-card-row")).toHaveCount(10, { timeout: 10000 });
    expect(explainCalls.n).toBe(1);
    // The button that spends the call is gone once ratings are in.
    await expect(modal.locator(".insp-deep")).toHaveCount(0);
  });

  test("full path: ratings then a swap applied through the Changes queue, with undo", async ({ page }) => {
    await pasteIntoEmptyDeck(page);
    const modal = page.locator(".upr-panel");
    await modal.locator(".icm-foot button", { hasText: "Continue" }).click();
    await modal.locator(".insp-deep").click();
    await expect(modal.locator(".gen-card-row")).toHaveCount(10, { timeout: 10000 });

    await modal.locator(".icm-foot button", { hasText: "See suggested swaps" }).click();
    await expect(modal).toHaveCount(0); // guide closes on hand-off

    // Lands on the Changes tab with the deep pass already running — same
    // apply/skip/undo queue Job 1 built, reached through the new entry point.
    await expect(page.locator('.insp-tab:has-text("Changes")')).toHaveClass(/active/);
    const pane = page.locator(".insp-body");
    const cutCard = pane.locator('.opt-card:has(.opt-cat:text-is("Cut"))');
    await expect(cutCard).toHaveCount(1, { timeout: 10000 });

    const gridCard = (name) => page.locator(`.card-grid-container [aria-label*="${name}"]`);
    await expect(gridCard("Cultivate").first()).toBeVisible();
    await cutCard.locator('button:has-text("Apply")').click();
    await expect(gridCard("Cultivate")).toHaveCount(0);

    const undo = page.locator(".toast .toast-action");
    await expect(undo).toHaveText("Undo");
    await undo.click();
    await expect(gridCard("Cultivate").first()).toBeVisible();
  });

  test("a longer decklist caps ratings at 15 cards and says so", async ({ page }) => {
    const names = Array.from({ length: 18 }, (_, i) => `1 Test Card ${i + 1}`).join("\n");
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
    await navigateToTab(page, "Analyze & Build");
    await page.locator(".empty-action", { hasText: "Paste a decklist" }).click();
    await page.locator(".icm-panel textarea").fill(`Commander\n1 ${TEST_COMMANDER}\n\nDeck\n${names}`);
    await page.locator(".icm-foot button", { hasText: "Import" }).click();

    const modal = page.locator(".upr-panel");
    await modal.locator(".icm-foot button", { hasText: "Continue" }).click();
    await expect(modal.locator(".insp-deep")).toContainText("Rate my 15 cards");
    await expect(modal).toContainText("Rates the first 15 cards");

    await modal.locator(".insp-deep").click();
    await expect(modal.locator(".gen-card-row")).toHaveCount(15, { timeout: 10000 });
  });
});
