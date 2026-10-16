// Optimize queue — goal-driven changeset with Apply/Skip + session log/undo.
// Runs against the hermetic mock backend (mock /api/deck/optimize returns a
// swap and a cut against the shared Atraxa test deck).

import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, openDeckSection, deckMenuAction } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

// The queue is in the deck's Improve section, on desktop and phone alike.
test.describe("Optimize queue", () => {
  test("run shows assessment and change cards", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openDeckSection(page, "Improve");
    const queue = page.locator(".opt-queue");
    await expect(queue).toBeVisible();
    await expect(queue.locator(".opt-hint")).toContainText("deck goals");

    await queue.locator(".opt-run").click();
    await expect(queue.locator(".opt-assess")).toContainText("bracket");
    await expect(queue.locator(".opt-card")).toHaveCount(2);
    // First card is the swap: Cultivate → Lightning Bolt with a price delta
    const first = queue.locator(".opt-card").first();
    await expect(first.locator(".opt-badge")).toHaveText("Swap");
    await expect(first).toContainText("Cultivate");
    await expect(first).toContainText("Lightning Bolt");
    await expect(first.locator(".opt-delta")).toContainText("$2.00");
  });

  test("apply mutates the deck and logs; undo reverts", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const queue = page.locator(".opt-queue");
    // Cards render as images; names live in aria-labels ("1x Cultivate")
    const gridCard = (name) => page.locator(`.card-grid-container [aria-label*="${name}"]`);
    await expect(gridCard("Cultivate").first()).toBeVisible();

    await openDeckSection(page, "Improve");
    await queue.locator(".opt-run").click();
    await queue.locator(".opt-card").first().locator("button", { hasText: "Apply" }).click();

    // Applied change left the queue and landed in the session log
    await expect(queue.locator(".opt-card")).toHaveCount(1);
    const log = queue.locator(".opt-log");
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
    await expect(queue.locator(".opt-log")).toHaveCount(0);
    await openDeckSection(page, "Cards");
    await expect(gridCard("Cultivate").first()).toBeVisible();
    await expect(gridCard("Lightning Bolt")).toHaveCount(0);
  });

  test("skip clears the queue without touching the deck", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openDeckSection(page, "Improve");
    const queue = page.locator(".opt-queue");
    await queue.locator(".opt-run").click();
    await expect(queue.locator(".opt-card")).toHaveCount(2);

    await queue.locator(".opt-card").first().locator("button", { hasText: "Skip" }).click();
    await queue.locator(".opt-card").first().locator("button", { hasText: "Skip" }).click();
    await expect(queue.locator(".opt-card")).toHaveCount(0);
    await expect(queue.locator(".opt-hint")).toContainText("Queue clear");
    // Deck untouched
    await openDeckSection(page, "Cards");
    await expect(page.locator('.card-grid-container [aria-label*="Cultivate"]').first()).toBeVisible();
  });

  test("session log persists across reload", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openDeckSection(page, "Improve");
    const queue = page.locator(".opt-queue");
    await queue.locator(".opt-run").click();
    await queue.locator(".opt-card").first().locator("button", { hasText: "Apply" }).click();
    await expect(queue.locator(".opt-log-summary")).toContainText("Session log (1)");

    await page.reload();
    await openDeckSection(page, "Improve");
    await expect(page.locator(".opt-queue .opt-log-summary")).toContainText("Session log (1)");
  });
});

// The sections themselves (job 3.1): one tab strip, Cards on open, and the
// tools out of the Planeswalker on phones.
test.describe("Deck sections", () => {
  test("Cards on open; Improve and Stats each hold their own tools", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const tab = (name) => page.getByRole("tab", { name, exact: true });
    await expect(tab("Cards")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".card-grid-container")).toBeVisible();
    await expect(page.locator(".opt-queue")).toBeHidden();
    await expect(page.locator(".stat-grid")).toBeHidden();

    await openDeckSection(page, "Improve");
    await expect(tab("Improve")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".opt-queue")).toBeVisible();
    await expect(page.locator(".deck-goals")).toBeVisible();
    await expect(page.locator(".card-grid-container")).toBeHidden();
    // Changes has no tab strip of its own in Improve
    await expect(page.getByRole("tabpanel", { name: "Improve", exact: true }).locator(".insp-tabs")).toHaveCount(0);

    await openDeckSection(page, "Stats");
    await expect(page.locator(".stat-grid")).toBeVisible();
    await expect(page.locator(".opt-queue")).toBeHidden();
    // Changes is not a Stats tool
    await expect(page.locator(".insp-tab", { hasText: "Changes" })).toHaveCount(0);
  });

  test("the Planeswalker on a phone is the chat only", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the hub's Optimize and Stats tabs were phone-only");
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await page.locator(".planeswalker-btn").click();
    await expect(page.getByRole("textbox", { name: "Message Planeswalker" })).toBeVisible();
    await expect(page.locator(".planeswalker-panel [role='tab']")).toHaveCount(0);
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
    await expect(chip).toContainText("4/10");
    await expect(chip).not.toContainText("light");
    // A category with light-tier cards says so next to its count.
    await expect(page.locator(".asmt-chip", { hasText: "Board wipes" })).toContainText(
      "1/3 (1 light)");

    const focused = page.waitForRequest((r) =>
      r.url().includes("/api/deck/optimize") && r.postDataJSON()?.focus === "card-draw");
    await chip.click();
    await focused;
    await expect(page.locator(".opt-queue .opt-card")).toHaveCount(2);
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
