// Insight-panel persistence: results loaded in the right sidebar survive
// leaving the deck tab (DeckView unmounts), the open tool is remembered, and
// editing the deck's card list marks cached results stale — refreshed only by
// the user's explicit Refresh click (never automatically).
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, navigateToTab } from "./fixtures/helpers.js";

const DECK = ["1 Sol Ring", "1 Cultivate", "1 Counterspell", "10 Forest", "10 Plains"].join("\n");

test.describe("Insights persistence", () => {
  test.skip(({ isMobile }) => isMobile, "desktop sidebar flow");

  async function openCombos(page) {
    await page.locator('.insp-tab:has-text("Combos")').click();
    await expect(page.locator(".insp-body")).toContainText("No combos or near-misses found");
  }

  function countRequests(page, pathSuffix) {
    const counter = { n: 0 };
    page.on("request", (req) => {
      if (new URL(req.url()).pathname.endsWith(pathSuffix)) counter.n += 1;
    });
    return counter;
  }

  test("results and open tool survive leaving the deck tab", async ({ page }) => {
    const combosCalls = countRequests(page, "/api/deck/combos");
    await loadSharedDeck(page, DECK, "Atraxa, Praetors' Voice");
    await openCombos(page);
    expect(combosCalls.n).toBe(1);

    await navigateToTab(page, "Rules");
    await navigateToTab(page, "Analyze & Build");

    // Cached result renders, same tool still open, and no re-fetch happened.
    await expect(page.locator('.insp-tab:has-text("Combos")')).toHaveClass(/active/);
    await expect(page.locator(".insp-body")).toContainText("No combos or near-misses found");
    expect(combosCalls.n).toBe(1);
  });

  test("card add marks results stale; explicit Refresh clears it", async ({ page }) => {
    const combosCalls = countRequests(page, "/api/deck/combos");
    await loadSharedDeck(page, DECK, "Atraxa, Praetors' Voice");
    await openCombos(page);

    // Add a new card via quick-add (raw-name Enter before the typeahead opens).
    const quickAdd = page.locator('input[placeholder="Card name…"]');
    await quickAdd.fill("Zealous Conscripts");
    await quickAdd.press("Enter");

    // Stale affordances appear; the cached result is still shown, not cleared.
    await expect(page.locator(".insp-stale-badge")).toBeVisible();
    await expect(page.locator('.insp-tab:has-text("Combos") .insp-tab-stale')).toBeVisible();
    await expect(page.locator(".insp-body")).toContainText("No combos or near-misses found");
    expect(combosCalls.n).toBe(1); // nothing re-ran on its own

    // User-driven refresh re-fetches and clears the stale mark.
    await page.locator(".insp-refresh").click();
    await expect(page.locator(".insp-stale-badge")).toBeHidden();
    await expect(page.locator('.insp-tab:has-text("Combos") .insp-tab-stale')).toBeHidden();
    expect(combosCalls.n).toBe(2);
  });

  test("pins and skips persist across screens and survive a refresh", async ({ page }) => {
    await loadSharedDeck(page, DECK, "Atraxa, Praetors' Voice");

    // Open Suggest (mocked: Lightning Bolt / Rhystic Study / Smothering Tithe).
    await page.locator('.insp-tab:has-text("Suggest")').click();
    const pane = page.locator(".insp-body");
    await expect(pane).toContainText("Lightning Bolt");

    // Pin one, skip another.
    await page.locator('.insp-row:has-text("Lightning Bolt") .insp-pin').click();
    await page.locator('.insp-row:has-text("Rhystic Study") button:has-text("Skip")').click();

    // Pinned row moved to the pinned strip; skipped row hidden with a counter.
    await expect(page.locator(".insp-row-pinned")).toContainText("Lightning Bolt");
    await expect(pane.locator('.insp-row:not(.insp-row-pinned):has-text("Rhystic Study")')).toHaveCount(0);
    await expect(page.locator(".insp-hidden-note")).toContainText("1 skipped");

    // Leave the deck tab and come back — verdicts survive the unmount.
    await navigateToTab(page, "Rules");
    await navigateToTab(page, "Analyze & Build");
    await expect(page.locator(".insp-row-pinned")).toContainText("Lightning Bolt");
    await expect(pane.locator('.insp-row:not(.insp-row-pinned):has-text("Rhystic Study")')).toHaveCount(0);

    // Refresh re-fetches the list; pins and skips are verdicts, not results —
    // they survive the new data.
    await page.locator(".insp-refresh").click();
    await expect(page.locator(".insp-row-pinned")).toContainText("Lightning Bolt");
    await expect(pane.locator('.insp-row:not(.insp-row-pinned):has-text("Rhystic Study")')).toHaveCount(0);

    // "Show again" restores skipped suggestions.
    await page.locator('.insp-hidden-note button:has-text("Show again")').click();
    await expect(pane.locator('.insp-row:has-text("Rhystic Study")')).toHaveCount(1);

    // Adding a pinned card consumes the pin.
    await page.locator('.insp-row-pinned button:has-text("+ Add")').click();
    await expect(page.locator(".insp-row-pinned")).toHaveCount(0);
  });

  test("quantity change does NOT mark results stale", async ({ page }) => {
    await loadSharedDeck(page, DECK, "Atraxa, Praetors' Voice");
    await openCombos(page);

    // Bump an existing card's quantity — same card presence, same signature.
    const quickAdd = page.locator('input[placeholder="Card name…"]');
    await quickAdd.fill("Sol Ring");
    await quickAdd.press("Enter");

    await expect(page.locator(".insp-body")).toContainText("No combos or near-misses found");
    await expect(page.locator(".insp-stale-badge")).toBeHidden();
  });
});
