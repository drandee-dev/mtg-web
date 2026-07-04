// Optimize queue — goal-driven changeset with Apply/Skip + session log/undo.
// Runs against the hermetic mock backend (mock /api/deck/optimize returns a
// swap and a cut against the shared Atraxa test deck).

import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

test.describe("Optimize queue", () => {
  // Desktop: queue lives in the always-visible deck sidebar. Mobile gets its
  // own hub test below.
  test.skip(({ isMobile }) => isMobile, "desktop sidebar flow");

  test("run shows assessment and change cards", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
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

    await queue.locator(".opt-run").click();
    await queue.locator(".opt-card").first().locator("button", { hasText: "Apply" }).click();

    // Deck mutated: swap removed Cultivate, added Lightning Bolt
    await expect(gridCard("Cultivate")).toHaveCount(0);
    await expect(gridCard("Lightning Bolt").first()).toBeVisible();

    // Applied change left the queue and landed in the session log
    await expect(queue.locator(".opt-card")).toHaveCount(1);
    const log = queue.locator(".opt-log");
    await expect(log.locator(".opt-log-summary")).toContainText("Session log (1)");
    await log.locator(".opt-log-summary").click();
    await expect(log.locator(".opt-log-row")).toContainText("Cultivate");

    // Undo restores the deck and empties the log
    await log.locator(".opt-undo").click();
    await expect(gridCard("Cultivate").first()).toBeVisible();
    await expect(gridCard("Lightning Bolt")).toHaveCount(0);
    await expect(queue.locator(".opt-log")).toHaveCount(0);
  });

  test("skip clears the queue without touching the deck", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const queue = page.locator(".opt-queue");
    await queue.locator(".opt-run").click();
    await expect(queue.locator(".opt-card")).toHaveCount(2);

    await queue.locator(".opt-card").first().locator("button", { hasText: "Skip" }).click();
    await queue.locator(".opt-card").first().locator("button", { hasText: "Skip" }).click();
    await expect(queue.locator(".opt-card")).toHaveCount(0);
    await expect(queue.locator(".opt-hint")).toContainText("Queue clear");
    // Deck untouched
    await expect(page.locator('.card-grid-container [aria-label*="Cultivate"]').first()).toBeVisible();
  });

  test("session log persists across reload", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const queue = page.locator(".opt-queue");
    await queue.locator(".opt-run").click();
    await queue.locator(".opt-card").first().locator("button", { hasText: "Apply" }).click();
    await expect(queue.locator(".opt-log-summary")).toContainText("Session log (1)");

    await page.reload();
    await expect(page.locator(".opt-queue .opt-log-summary")).toContainText("Session log (1)");
  });
});

test.describe("Optimize queue — mobile hub", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile-only flow");

  test("queue renders and runs inside the hub Optimize tab", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await page.locator(".planeswalker-btn").click();
    await page.locator('.pw-tabs [role="tab"]', { hasText: "Optimize" }).click();

    const queue = page.locator(".pw-insights-body .opt-queue");
    await expect(queue).toBeVisible();
    await queue.locator(".opt-run").click();
    await expect(queue.locator(".opt-card")).toHaveCount(2);
    await queue.locator(".opt-card").first().locator("button", { hasText: "Apply" }).click();
    await expect(queue.locator(".opt-log-summary")).toContainText("Session log (1)");
  });

  test("Stats tab shows analytics; Optimize tab does not", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await page.locator(".planeswalker-btn").click();

    await page.locator('.pw-tabs [role="tab"]', { hasText: "Stats" }).click();
    const stats = page.locator(".pw-insights-body .analytics-group");
    await expect(stats).toBeVisible();
    await expect(stats).toHaveAttribute("open", "");
    await expect(stats.locator(".stat-grid")).toBeVisible();
    await expect(page.locator(".pw-insights-body .opt-queue")).toHaveCount(0);

    await page.locator('.pw-tabs [role="tab"]', { hasText: "Optimize" }).click();
    await expect(page.locator(".pw-insights-body .opt-queue")).toBeVisible();
    await expect(page.locator(".pw-insights-body .analytics-group")).toHaveCount(0);
  });
});

test.describe("Assessment", () => {
  test.skip(({ isMobile }) => isMobile, "desktop sidebar flow");

  test("gap chips appear after analysis and run a focused optimize", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    // Composition auto-loads with the (debounced) analysis — the thin
    // card-draw category from the mock becomes a tappable gap chip.
    const chip = page.locator(".asmt-chip", { hasText: "Card draw" });
    await expect(chip).toBeVisible({ timeout: 10000 });
    await expect(chip).toContainText("4/10");

    const focused = page.waitForRequest((r) =>
      r.url().includes("/api/deck/optimize") && r.postDataJSON()?.focus === "card-draw");
    await chip.click();
    await focused;
    await expect(page.locator(".opt-queue .opt-card")).toHaveCount(2);
  });

  test("desktop analytics group is collapsed by default and expands", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const group = page.locator(".deck-sidebar .analytics-group");
    await expect(group).toBeVisible();
    await expect(group).not.toHaveAttribute("open", "");
    await expect(group.locator(".stat-grid")).not.toBeVisible();
    await group.locator("summary").click();
    await expect(group.locator(".stat-grid")).toBeVisible();
  });
});
