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

  // Opening the tab buys only the free EDHREC suggestions. Cuts and upgrades
  // are metered, so a test that needs them asks for them the way a user does.
  async function openChanges(page, { deep = false } = {}) {
    await page.locator('.insp-tab:has-text("Changes")').click();
    if (deep) await page.locator(".insp-deep").click();
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

  // Opening a tab must not silently spend metered model calls. Suggestions are
  // free EDHREC data and load on open; cuts and upgrades wait to be asked for.
  test("opening Changes buys only the free suggestions until asked for more", async ({ page }) => {
    const recCalls = countRequests(page, "/api/deck/recommend");
    const cutCalls = countRequests(page, "/api/deck/ai/cuts");
    const swapCalls = countRequests(page, "/api/deck/budget-swaps");
    await loadSharedDeck(page, DECK, "Atraxa, Praetors' Voice");

    await page.locator('.insp-tab:has-text("Changes")').click();
    await expect(page.locator(".insp-body")).toContainText("Lightning Bolt");
    expect(recCalls.n).toBe(1);
    expect(cutCalls.n).toBe(0);
    expect(swapCalls.n).toBe(0);
    // Nothing to toggle between yet, so the upgrade-mode switch stays hidden.
    await expect(page.locator(".insp-mode-toggle")).toHaveCount(0);

    // The labelled button is the only thing that spends a call.
    const deep = page.locator(".insp-deep");
    await expect(deep).toContainText("Uses AI");
    await deep.click();
    await expect(page.locator('.insp-body .opt-card:has(.opt-cat:text-is("Cut"))')).toHaveCount(1, { timeout: 10000 });
    expect(cutCalls.n).toBe(1);
    expect(swapCalls.n).toBe(1);
    expect(recCalls.n).toBe(1); // the free source was not re-bought
    await expect(page.locator(".insp-mode-toggle")).toHaveCount(1);
    await expect(deep).toHaveCount(0);
  });

  test("pins and skips persist across screens and survive a refresh", async ({ page }) => {
    await loadSharedDeck(page, DECK, "Atraxa, Praetors' Voice");

    // Suggest / Cuts / Upgrades are one Changes queue now — the mocked
    // recommend list (Lightning Bolt / Rhystic Study / Smothering Tithe)
    // arrives as "Add" proposals in the same cards the Optimize queue uses.
    // Suggestions are free, so the plain tab open is enough.
    await openChanges(page);
    const pane = page.locator(".insp-body");
    await expect(pane).toContainText("Lightning Bolt");

    // Pin one, skip another.
    await pane.locator('.opt-card:has-text("Lightning Bolt") .insp-pin').click();
    await pane.locator('.opt-card:has-text("Rhystic Study") button:has-text("Skip")').click();

    // Pinned proposal carries the Pinned category; skipped one is hidden.
    await expect(pane.locator(".opt-card:has-text('Lightning Bolt') .opt-cat")).toContainText("Pinned");
    await expect(pane.locator('.opt-card:has-text("Rhystic Study")')).toHaveCount(0);
    await expect(page.locator(".insp-hidden-note")).toContainText("1 skipped");

    // Leave the deck tab and come back — verdicts survive the unmount.
    await navigateToTab(page, "Rules");
    await navigateToTab(page, "Analyze & Build");
    await expect(pane.locator(".opt-card:has-text('Lightning Bolt') .opt-cat")).toContainText("Pinned");
    await expect(pane.locator('.opt-card:has-text("Rhystic Study")')).toHaveCount(0);

    // Refresh re-fetches the list; pins and skips are verdicts, not results —
    // they survive the new data.
    await page.locator(".insp-refresh").click();
    await expect(pane.locator(".opt-card:has-text('Lightning Bolt') .opt-cat")).toContainText("Pinned");
    await expect(pane.locator('.opt-card:has-text("Rhystic Study")')).toHaveCount(0);

    // "Show again" restores skipped suggestions.
    await page.locator('.insp-hidden-note button:has-text("Show again")').first().click();
    await expect(pane.locator('.opt-card:has-text("Rhystic Study")')).toHaveCount(1);

    // Applying a pinned proposal consumes the pin and logs the change.
    await pane.locator('.opt-card:has-text("Lightning Bolt") button:has-text("Apply")').click();
    await expect(pane.locator('.opt-card .opt-cat:has-text("Pinned")')).toHaveCount(0);
    await expect(page.locator(".opt-queue .opt-log-summary")).toContainText("Session log (1)");
  });

  // Regression: declining an upgrade and skipping a suggestion are different
  // verdicts on different cards. Sharing one persisted Set made the
  // suggestions' "Show again" silently revive every declined upgrade.
  test("declining an upgrade is separate from skipping a suggestion", async ({ page }) => {
    await loadSharedDeck(page, DECK, "Atraxa, Praetors' Voice");
    await openChanges(page, { deep: true });
    const pane = page.locator(".insp-body");

    const budgetCard = pane.locator('.opt-card:has(.opt-cat:text-is("Budget"))');
    await expect(budgetCard).toHaveCount(1, { timeout: 10000 });

    // Decline the upgrade — it gets its own counter, not the skipped one.
    await budgetCard.locator('button:has-text("Skip")').click();
    await expect(budgetCard).toHaveCount(0);
    await expect(pane.locator(".insp-note-upgrades")).toContainText("1 upgrades declined");
    await expect(pane.locator(".insp-note-skipped")).toHaveCount(0);

    // Skip an ordinary suggestion — different counter again.
    await pane.locator('.opt-card:has(.opt-cat:text-is("High synergy")):has-text("Rhystic Study") button:has-text("Skip")').click();
    await expect(pane.locator(".insp-note-skipped")).toContainText("1 skipped");

    // Restoring skipped suggestions must NOT restore the declined upgrade.
    await pane.locator('.insp-note-skipped button:has-text("Show again")').click();
    await expect(pane.locator('.opt-card:has-text("Rhystic Study")')).toHaveCount(1);
    await expect(budgetCard).toHaveCount(0);
    await expect(pane.locator(".insp-note-upgrades")).toContainText("1 upgrades declined");

    // The upgrade's own "Show again" is what brings it back.
    await pane.locator('.insp-note-upgrades button:has-text("Show again")').click();
    await expect(budgetCard).toHaveCount(1);
  });

  // Regression: master's swapCard called skip() on the cut card so it couldn't
  // reappear as a suggested add the moment you swapped it out. Folding swaps
  // into the shared apply handler dropped that.
  test("applying an upgrade stops the cut card being re-suggested", async ({ page }) => {
    await loadSharedDeck(page, DECK, "Atraxa, Praetors' Voice");
    await openChanges(page, { deep: true });
    const pane = page.locator(".insp-body");

    // Smothering Tithe is both a budget-swap target and a standing suggestion.
    const suggestion = pane.locator('.opt-card:has(.opt-cat:text-is("High synergy")):has-text("Smothering Tithe")');
    const budgetCard = pane.locator('.opt-card:has(.opt-cat:text-is("Budget"))');
    await expect(budgetCard).toHaveCount(1, { timeout: 10000 });
    await expect(suggestion).toHaveCount(1);

    await budgetCard.locator('button:has-text("Apply")').click();

    // Swapped out, so it must not come straight back as "add this".
    await expect(suggestion).toHaveCount(0);
    await expect(pane.locator(".insp-note-skipped")).toContainText("1 skipped");
    // It's a skip, not an upgrade decline — the user accepted this upgrade.
    await expect(pane.locator(".insp-note-upgrades")).toHaveCount(0);
  });

  // Regression: applied proposals used to stay on screen, and Apply had no
  // dedup — a second click appended a second "1 <name>" line, i.e. a real
  // duplicate card, plus a second session-log entry.
  test("an applied proposal leaves the queue and cannot be applied twice", async ({ page }) => {
    await loadSharedDeck(page, DECK, "Atraxa, Praetors' Voice");
    await openChanges(page); // a suggestion is enough to exercise this
    const pane = page.locator(".insp-body");

    const bolt = pane.locator('.opt-card:has(.opt-cat:text-is("High synergy")):has-text("Lightning Bolt")');
    // A second copy parses as qty 2, so the thumbnail's own label is the tell.
    const oneCopy = page.locator('.card-thumb[aria-label="1x Lightning Bolt"]');
    const twoCopies = page.locator('.card-thumb[aria-label="2x Lightning Bolt"]');

    await expect(bolt).toHaveCount(1, { timeout: 10000 });
    await bolt.locator('button:has-text("Apply")').click();

    // Gone from the queue, one copy in the deck, one log entry.
    await expect(bolt).toHaveCount(0);
    await expect(oneCopy).toHaveCount(1);
    await expect(twoCopies).toHaveCount(0);
    await expect(page.locator(".opt-queue .opt-log-summary")).toContainText("Session log (1)");

    // Leaving the deck tab and returning must not resurrect it — that would
    // put the second Apply click back within reach.
    await navigateToTab(page, "Rules");
    await navigateToTab(page, "Analyze & Build");
    await expect(pane.locator('.opt-card:has(.opt-cat:text-is("High synergy")):has-text("Lightning Bolt")')).toHaveCount(0);
    await expect(oneCopy).toHaveCount(1);
    await expect(twoCopies).toHaveCount(0);
    await expect(page.locator(".opt-queue .opt-log-summary")).toContainText("Session log (1)");
  });

  // Regression: an applied change used to notify with no action, leaving the
  // collapsed session log as the only way back.
  test("applying a change offers a one-click Undo on the toast", async ({ page }) => {
    await loadSharedDeck(page, DECK, "Atraxa, Praetors' Voice");
    await openChanges(page, { deep: true });
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
    await expect(page.locator(".opt-queue .opt-log")).toHaveCount(0);
  });

  // Regression: undo rebuilt the cut card as a bare "1 <name>", so undoing the
  // removal of a 4-of silently dropped three copies. The one-click toast Undo
  // made that the primary path rather than a buried accordion action.
  test("undo restores the cut card's original line, not a bare single copy", async ({ page }) => {
    // 4 copies so a lossy restore is visible. Legality is server-side and
    // mocked out here; what's under test is decklist line restoration.
    const FOUR = ["4 Cultivate", "1 Sol Ring", "1 Counterspell", "10 Forest", "10 Plains"].join("\n");
    await loadSharedDeck(page, FOUR, "Atraxa, Praetors' Voice");
    const cultivate = (qty) => page.locator(`.card-grid-container [aria-label="${qty}x Cultivate"]`);
    await expect(cultivate(4).first()).toBeVisible();

    await openChanges(page, { deep: true });
    const cutCard = page.locator('.insp-body .opt-card:has(.opt-cat:text-is("Cut"))');
    await expect(cutCard).toHaveCount(1, { timeout: 10000 });
    await cutCard.locator('button:has-text("Apply")').click();
    await expect(page.locator('.card-grid-container [aria-label*="Cultivate"]')).toHaveCount(0);

    await page.locator(".toast .toast-action").click();
    await expect(cultivate(4).first()).toBeVisible();
    await expect(cultivate(1)).toHaveCount(0);
  });

  // Regression: a swap whose add target is already in the deck correctly
  // skipped the append but still logged `add`, so Undo deleted a card this
  // apply never added.
  test("a swap onto a card already in the deck does not log a phantom add", async ({ page }) => {
    // Mock budget swap is Smothering Tithe → Arcane Signet; this deck has both.
    const BOTH = ["1 Sol Ring", "1 Arcane Signet", "1 Smothering Tithe", "10 Forest", "10 Plains"].join("\n");
    await loadSharedDeck(page, BOTH, "Atraxa, Praetors' Voice");
    const thumb = (label) => page.locator(`.card-thumb[aria-label="${label}"]`);
    await expect(thumb("1x Arcane Signet")).toHaveCount(1);

    await openChanges(page, { deep: true });
    const budgetCard = page.locator('.insp-body .opt-card:has(.opt-cat:text-is("Budget"))');
    await expect(budgetCard).toHaveCount(1, { timeout: 10000 });
    await budgetCard.locator('button:has-text("Apply")').click();

    // The cut happened; the add did not, because the card was already there.
    await expect(thumb("1x Smothering Tithe")).toHaveCount(0);
    await expect(thumb("1x Arcane Signet")).toHaveCount(1);
    await expect(thumb("2x Arcane Signet")).toHaveCount(0);

    // Undo must restore only what was removed, and must not delete the
    // Arcane Signet that was already in the deck.
    await page.locator(".toast .toast-action").click();
    await expect(thumb("1x Smothering Tithe")).toHaveCount(1);
    await expect(thumb("1x Arcane Signet")).toHaveCount(1);
  });

  // Regression: a cut proposal whose target has since left the deck removed
  // nothing but still logged `cut`, so Undo added a card back that this apply
  // never took away.
  test("a stale cut proposal logs nothing and offers no undo", async ({ page }) => {
    // Mock cuts always propose Cultivate; this deck does not run it.
    const NO_CULTIVATE = ["1 Sol Ring", "1 Counterspell", "10 Forest", "10 Plains"].join("\n");
    await loadSharedDeck(page, NO_CULTIVATE, "Atraxa, Praetors' Voice");
    await openChanges(page, { deep: true });
    const cutCard = page.locator('.insp-body .opt-card:has(.opt-cat:text-is("Cut"))');
    await expect(cutCard).toHaveCount(1, { timeout: 10000 });
    await cutCard.locator('button:has-text("Apply")').click();

    // Says so plainly, writes no log entry, and offers no undo to misfire.
    await expect(page.locator(".toast")).toContainText("no longer in the deck");
    await expect(page.locator(".toast .toast-action")).toHaveCount(0);
    await expect(page.locator(".opt-queue .opt-log")).toHaveCount(0);
    await expect(page.locator('.card-thumb[aria-label*="Cultivate"]')).toHaveCount(0);
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
