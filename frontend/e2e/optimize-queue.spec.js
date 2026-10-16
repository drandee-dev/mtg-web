// Suggested changes — goal-driven changeset with Apply/Skip + session log/undo.
// Runs against the hermetic mock backend (mock /api/deck/optimize returns a
// swap and a cut against the shared Atraxa test deck).

import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, openDeckSection, deckMenuAction } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

// The AI changes are in the deck's Improve section, on desktop and phone alike,
// in the one Suggested changes list beside the EDHREC suggestions.
const aiCards = (page) => page.locator('.opt-card[data-source="optimize"]');
const findCutsAndUpgrades = (page) => page.locator(".insp-deep").click();

test.describe("Suggested changes: the AI pass", () => {
  test("the AI button shows the change cards with a price delta", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openDeckSection(page, "Improve");
    await expect(page.getByRole("heading", { name: "Suggested changes" })).toBeVisible();
    await expect(aiCards(page)).toHaveCount(0); // nothing is bought on open

    await findCutsAndUpgrades(page);
    await expect(aiCards(page)).toHaveCount(2);
    // First card is the swap: Cultivate -> Lightning Bolt with a price delta
    const first = aiCards(page).first();
    await expect(first).toHaveAttribute("data-action", "swap");
    await expect(first).toContainText("Cut Cultivate, add Lightning Bolt");
    await expect(first.locator(".opt-delta")).toContainText("$2.00");
  });

  test("apply mutates the deck and logs; undo reverts", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    // Cards render as images; names live in aria-labels ("1x Cultivate")
    const gridCard = (name) => page.locator(`.card-grid-container [aria-label*="${name}"]`);
    await expect(gridCard("Cultivate").first()).toBeVisible();

    await openDeckSection(page, "Improve");
    await findCutsAndUpgrades(page);
    await aiCards(page).first().locator("button", { hasText: "Apply" }).click();

    // Applied change left the list and landed in the session log
    await expect(aiCards(page)).toHaveCount(1);
    const log = page.locator(".opt-log");
    await expect(log.locator(".opt-log-summary")).toContainText("Session log (1)");

    // Deck mutated: swap removed Cultivate, added Lightning Bolt
    await openDeckSection(page, "Cards");
    await expect(gridCard("Cultivate")).toHaveCount(0);
    await expect(gridCard("Lightning Bolt").first()).toBeVisible();

    await openDeckSection(page, "Improve");
    await log.locator(".opt-log-summary").click();
    await expect(log.locator(".opt-log-row")).toContainText("Cultivate");

    // Undo restores the deck and empties the log
    await log.locator(".opt-undo").click();
    await expect(page.locator(".opt-log")).toHaveCount(0);
    await openDeckSection(page, "Cards");
    await expect(gridCard("Cultivate").first()).toBeVisible();
    await expect(gridCard("Lightning Bolt")).toHaveCount(0);
  });

  test("skip clears the AI cards without touching the deck", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openDeckSection(page, "Improve");
    await findCutsAndUpgrades(page);
    await expect(aiCards(page)).toHaveCount(2);

    await aiCards(page).first().locator("button", { hasText: "Skip" }).click();
    await aiCards(page).first().locator("button", { hasText: "Skip" }).click();
    await expect(aiCards(page)).toHaveCount(0);
    // Deck untouched
    await openDeckSection(page, "Cards");
    await expect(page.locator('.card-grid-container [aria-label*="Cultivate"]').first()).toBeVisible();
  });

  // The log hides skips, but they are the AI's memory of what was declined.
  test("skipping an AI card writes a skip entry to the deck's log", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openDeckSection(page, "Improve");
    await findCutsAndUpgrades(page);
    await aiCards(page).first().locator("button", { hasText: "Skip" }).click();
    const skips = await page.evaluate(() => Object.keys(localStorage)
      .filter((k) => k.startsWith("mtgweb:optlog:"))
      .flatMap((k) => JSON.parse(localStorage.getItem(k)))
      .filter((e) => e.action === "skip"));
    expect(skips).toHaveLength(1);
  });

  test("session log persists across reload", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openDeckSection(page, "Improve");
    await findCutsAndUpgrades(page);
    await aiCards(page).first().locator("button", { hasText: "Apply" }).click();
    await expect(page.locator(".opt-log-summary")).toContainText("Session log (1)");

    await page.reload();
    await openDeckSection(page, "Improve");
    await expect(page.locator(".opt-log-summary")).toContainText("Session log (1)");
  });

  test("the Improve tab carries the count and keeps its name", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openDeckSection(page, "Improve");
    const tab = page.getByRole("tab", { name: "Improve", exact: true });
    await expect(tab.locator(".deck-section-count")).toHaveText(/^\d+$/);
    await expect(tab).toHaveAccessibleDescription(/suggested change/);
  });
});

// The sections themselves (job 3.1): one tab strip, Cards on open, and the
// tools out of the old Planeswalker panel on phones.
test.describe("Deck sections", () => {
  test("Cards on open; Improve and Stats each hold their own tools", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const tab = (name) => page.getByRole("tab", { name, exact: true });
    await expect(tab("Cards")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".card-grid-container")).toBeVisible();
    await expect(page.locator(".improve")).toBeHidden();
    await expect(page.locator(".stat-grid")).toBeHidden();

    await openDeckSection(page, "Improve");
    await expect(tab("Improve")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".improve")).toBeVisible();
    await expect(page.locator(".deck-goals")).toBeVisible();
    await expect(page.locator(".card-grid-container")).toBeHidden();
    // Changes has no tab strip of its own in Improve
    await expect(page.getByRole("tabpanel", { name: "Improve", exact: true }).locator(".insp-tabs")).toHaveCount(0);

    await openDeckSection(page, "Stats");
    await expect(page.locator(".stat-grid")).toBeVisible();
    await expect(page.locator(".improve")).toBeHidden();
    // Changes is not a Stats tool
    await expect(page.locator(".insp-tab", { hasText: "Changes" })).toHaveCount(0);
  });

  test("on a phone, Ask opens as a sheet from the deck bar and has no tabs", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the deck bar's Ask is phone-only");
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await page.locator(".mobile-deck-nav").getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Your question" })).toBeVisible();
    await expect(page.locator(".ask-panel [role='tab']")).toHaveCount(0);
  });

  // Every way into a section other than its tab. loadChanges' callers (the
  // over-budget chip, Upgrade review's hand-off) are in activation-flows and
  // upgrade-review.
  test("View in the combo-unlocked toast opens Stats on Combos", async ({ page }) => {
    // The mock has no near-miss; this deck is one card from one.
    await page.route("**/api/deck/combos", (route) => route.fulfill({ json: {
      combos: [],
      near_misses: [{ cards: ["Sol Ring", "Lightning Bolt"], missing_card: "Lightning Bolt", result: ["Infinite mana"] }],
    } }));
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openDeckSection(page, "Stats");
    await page.locator(".insp-tab", { hasText: "Combos" }).click();
    await page.locator(".combo-add").click();
    const view = page.locator(".toast-action", { hasText: "View" });
    await expect(view).toBeVisible();

    // Leave Combos and Stats, so View has both to undo.
    await page.locator(".insp-tab", { hasText: "Analytics" }).click();
    await openDeckSection(page, "Cards");
    await view.click();
    await expect(page.getByRole("tab", { name: "Stats", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".insp-tab", { hasText: "Combos" })).toHaveClass(/active/);
  });

  // Clone swaps the deck under a page that stays open, so the section has to
  // be reset by the deck change itself, not by a fresh mount.
  test("a clone opens on Cards", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const before = page.url();
    await openDeckSection(page, "Improve");
    page.once("dialog", (d) => d.accept("Clone of the test deck"));
    await deckMenuAction(page, "Clone deck");
    await expect(page).not.toHaveURL(before);
    await expect(page.getByRole("tab", { name: "Cards", exact: true })).toHaveAttribute("aria-selected", "true");
  });

  test("Edit as text from another section opens Cards with the editor", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openDeckSection(page, "Stats");
    await deckMenuAction(page, "Edit as text");
    await expect(page.getByRole("tab", { name: "Cards", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("textbox", { name: "Edit decklist as text" })).toBeVisible();
  });
});

test.describe("Assessment", () => {
  test("gap chips appear after analysis and run a focused optimize", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openDeckSection(page, "Improve");
    // Composition auto-loads with the (debounced) analysis — the thin
    // card-draw category from the mock becomes a tappable gap chip.
    const chip = page.locator(".asmt-chip", { hasText: "Card draw" });
    await expect(chip).toBeVisible({ timeout: 10000 });
    await expect(chip).toContainText("4 of 10");
    await expect(chip).not.toContainText("light");
    // A category with light-tier cards says so next to its count.
    await expect(page.locator(".asmt-chip", { hasText: "Board wipes" })).toContainText(
      "1 of 3 (1 light)");

    const focused = page.waitForRequest((r) =>
      r.url().includes("/api/deck/optimize") && r.postDataJSON()?.focus === "card-draw");
    await chip.click();
    await focused;
    await expect(aiCards(page)).toHaveCount(2);
  });

  test("insights toolbox rests on Analytics and swaps panes in place", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openDeckSection(page, "Stats");
    const insp = page.getByRole("tabpanel", { name: "Stats", exact: true }).locator(".insp");
    await expect(insp).toBeVisible();
    // Analytics is the default pane — no click needed to see stats
    await expect(insp.locator(".stat-grid")).toBeVisible();
    // Picking a tool replaces the pane at the top (no accordion below)
    await insp.locator(".insp-tab", { hasText: "Odds" }).click();
    await expect(insp.locator(".draw-odds-grid")).toBeVisible();
    await expect(insp.locator(".stat-grid")).toHaveCount(0);
    // Back to Analytics
    await insp.locator(".insp-tab", { hasText: "Analytics" }).click();
    await expect(insp.locator(".stat-grid")).toBeVisible();
  });
});
