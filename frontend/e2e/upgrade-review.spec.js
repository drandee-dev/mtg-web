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

// Strip a populated deck back to nothing by hand: clear the 99 via the text
// editor, then drop the commander from its card-detail modal. Same sequence
// deck-generator.spec.js's regression test uses.
async function emptyDeckByHand(page) {
  await page.locator(".dh-actions .more-menu-btn").click();
  await page.locator(".more-menu-item", { hasText: "Edit as text" }).click();
  await page.locator(".deck-text-editor").fill("");
  await page.locator(`.card-thumb[aria-label*="${TEST_COMMANDER.split(",")[0]}"]`).first().click();
  await page.locator(".cdm-actions button", { hasText: "Change commander" }).click();
  await expect(page.locator(".empty-deck")).toBeVisible();
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

  test("re-pasting into the same emptied deck re-buys cuts/upgrades instead of reusing a stale cache", async ({ page }) => {
    const cutCalls = countRequests(page, "/api/deck/ai/cuts");
    const swapCalls = countRequests(page, "/api/deck/budget-swaps");
    await pasteIntoEmptyDeck(page); // list A
    const modal = page.locator(".upr-panel");
    await modal.locator(".icm-foot button", { hasText: "Continue" }).click();
    await modal.locator(".icm-foot button", { hasText: "See suggested swaps" }).click();
    await expect(page.locator('.insp-body .opt-card:has(.opt-cat:text-is("Cut"))')).toHaveCount(1, { timeout: 10000 });
    expect(cutCalls.n).toBe(1);
    expect(swapCalls.n).toBe(1);

    // Empty the same deck and paste an unrelated list B into it — cuts/
    // upgrades cached for list A are now stale, not merely absent.
    await emptyDeckByHand(page);
    await page.locator(".empty-action", { hasText: "Paste a decklist" }).click();
    await page.locator(".icm-panel textarea").fill(
      `Commander\n1 ${TEST_COMMANDER}\n\nDeck\n1 Lightning Bolt\n1 Rhystic Study`,
    );
    await page.locator(".icm-foot button", { hasText: "Import" }).click();

    const modal2 = page.locator(".upr-panel");
    await expect(modal2).toBeVisible();
    await modal2.locator(".icm-foot button", { hasText: "Continue" }).click();
    await modal2.locator(".icm-foot button", { hasText: "See suggested swaps" }).click();
    await expect(page.locator('.insp-body .opt-card:has(.opt-cat:text-is("Cut"))')).toHaveCount(1, { timeout: 10000 });
    // Re-bought for the new decklist, not served stale from list A.
    expect(cutCalls.n).toBe(2);
    expect(swapCalls.n).toBe(2);
  });

  test("URL import into an empty deck opens the guide too", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
    await navigateToTab(page, "Analyze & Build");
    await page.locator(".empty-action", { hasText: "Import from URL" }).click();
    await page.locator(".icm-panel input").fill("https://archidekt.com/decks/12345");
    await page.locator(".icm-foot button", { hasText: "Import" }).click();
    await expect(page.locator(".upr-panel")).toBeVisible();
  });

  test("URL import replacing a populated deck (confirmed) does not open the guide", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await page.locator(".dh-actions button", { hasText: "Import cards" }).click();
    await page.locator('.icm-tabs [role="tab"]', { hasText: "From URL" }).click();
    await page.locator(".icm-panel input").fill("https://archidekt.com/decks/12345");
    await page.locator(".icm-foot button", { hasText: "Import" }).click();
    await page.locator(".icm-confirm button", { hasText: "Replace deck" }).click();
    await expect(page.locator(".upr-panel")).toHaveCount(0);
  });

  test("ratings survive closing the guide and a tab switch; reopening on the same list serves the cache", async ({ page }) => {
    const explainCalls = countRequests(page, "/api/deck/ai/explain");
    await pasteIntoEmptyDeck(page);
    const modal = page.locator(".upr-panel");
    await modal.locator(".icm-foot button", { hasText: "Continue" }).click();
    await modal.locator(".insp-deep").click();
    await expect(modal.locator(".gen-card-row")).toHaveCount(10, { timeout: 10000 });
    expect(explainCalls.n).toBe(1);

    // Close without going to swaps — the spent AI call must not be thrown away.
    await modal.locator(".icm-close").click();
    await expect(modal).toHaveCount(0);

    // Tab switch unmounts DeckView entirely; only the persisted cache survives it.
    await navigateToTab(page, "Rules");
    await navigateToTab(page, "Analyze & Build");

    // Empty the deck and paste the exact same list back in — the guide
    // reopens with the same signature, so cached ratings should reappear
    // without spending a second AI call.
    await emptyDeckByHand(page);
    await page.locator(".empty-action", { hasText: "Paste a decklist" }).click();
    await page.locator(".icm-panel textarea").fill(PASTE_TEXT);
    await page.locator(".icm-foot button", { hasText: "Import" }).click();

    const modal2 = page.locator(".upr-panel");
    await modal2.locator(".icm-foot button", { hasText: "Continue" }).click();
    await expect(modal2.locator(".gen-card-row")).toHaveCount(10);
    expect(explainCalls.n).toBe(1); // served from the persisted cache, not re-bought
  });
});
