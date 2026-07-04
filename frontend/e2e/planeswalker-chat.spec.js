// Planeswalker chat — Phase 4 upgrades: topic dividers per quick action,
// pinned session log (synced with the Optimize queue via the optlog
// broadcast), expand + text-size toggles. Runs against the hermetic mock
// (mock /api/planeswalker/chat/stream replies with a [[Lightning Bolt]] chip).

import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

async function openChat(page) {
  await page.locator(".planeswalker-btn").click();
  await expect(page.locator(".planeswalker-panel")).toBeVisible();
}

test.describe("Planeswalker chat", () => {
  test("quick action drops a topic divider and streams a reply", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openChat(page);

    await page.locator(".pw-chip", { hasText: "Suggest cuts" }).click();
    await expect(page.locator(".pw-divider")).toContainText("Suggest cuts");
    await expect(page.locator(".pw-cardchip-name", { hasText: "Lightning Bolt" })).toBeVisible();
  });

  test("divider survives a reload (persisted history)", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openChat(page);
    await page.locator(".pw-chip", { hasText: "Find combos" }).click();
    await expect(page.locator(".pw-divider")).toContainText("Find combos");
    // Wait for the exchange to complete so history persists
    await expect(page.locator(".pw-cardchip-name").first()).toBeVisible();

    await page.reload();
    await openChat(page);
    await expect(page.locator(".pw-divider")).toContainText("Find combos");
  });

  test("chat card-chip add lands in the pinned session log", async ({ page, isMobile }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openChat(page);
    await page.locator(".pw-chip", { hasText: "Fill gaps" }).click();

    const addBtn = page.locator('.pw-cardchip-btn[aria-label="Add Lightning Bolt to deck"]');
    await addBtn.click();

    const log = page.locator(".pw-sessionlog");
    await expect(log.locator("summary")).toContainText("Session changes (1)");
    await log.locator("summary").click();
    await expect(log.locator(".pw-sessionlog-row")).toContainText("Added Lightning Bolt");
    await expect(log.locator(".pw-sessionlog-src")).toHaveText("chat");

    if (!isMobile) {
      // Broadcast sync: the sidebar queue's log picked up the chat add too
      await expect(page.locator(".opt-queue .opt-log-summary")).toContainText("Session log (1)");
    }
  });

  test("expand and text-size toggles persist across reload", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openChat(page);
    const panel = page.locator(".planeswalker-panel");

    await page.locator('button[aria-label="Expand panel"]').click();
    await expect(panel).toHaveClass(/pw-expanded/);
    await page.locator('button[aria-label="Larger chat text"]').click();
    await expect(panel).toHaveClass(/pw-textlg/);

    await page.reload();
    await openChat(page);
    await expect(page.locator(".planeswalker-panel")).toHaveClass(/pw-expanded/);
    await expect(page.locator(".planeswalker-panel")).toHaveClass(/pw-textlg/);
  });
});
