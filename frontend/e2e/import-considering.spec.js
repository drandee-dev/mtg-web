// URL import semantics + Considering column + rename + MDFC grouping.
// Mock import-url returns "Mock Import": Atraxa commander, 2 main cards, and a
// 1-card sideboard that must land in Considering — never the maindeck.

import { test, expect } from "./fixtures/test-base.js";
import { waitForAppReady, dismissColdStart, navigateToTab, loadSharedDeck } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

test.describe("URL import + Considering + rename", () => {
  test.skip(({ isMobile }) => isMobile, "desktop flows");

  test("empty deck: URL import adopts name and parks sideboard in Considering", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
    await navigateToTab(page, "Analyze & Build");

    // Empty-state action card opens the modal on the URL tab
    await page.locator(".empty-action", { hasText: "Import from URL" }).click();
    await page.locator(".icm-panel input").fill("https://archidekt.com/decks/12345");
    await page.locator(".icm-foot button", { hasText: "Import" }).click();

    await expect(page.locator(".deck-title")).toContainText("Mock Import");
    // Sideboard card is in Considering, NOT the maindeck
    const considering = page.locator(".considering-group");
    await expect(considering).toBeVisible();
    await expect(considering).toContainText("Considering");
    await expect(considering.locator('[aria-label*="Lightning Bolt"]').first()).toBeVisible();
    // Maindeck count excludes the sideboard card: commander + 2 = 3/100
    await expect(page.locator('.deck-toolbar .badge:has-text("/ 100")')).toContainText("3 / 100");
  });

  test("populated deck: URL import asks before replacing, then replaces wholesale", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await page.locator(".dh-actions button", { hasText: "Import cards" }).click();
    await page.locator('.icm-tabs [role="tab"]', { hasText: "From URL" }).click();
    await page.locator(".icm-panel input").fill("https://archidekt.com/decks/12345");
    await page.locator(".icm-foot button", { hasText: "Import" }).click();

    // Confirmation gate — cancel keeps the deck
    const confirm = page.locator(".icm-confirm");
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("Replace this deck?");
    await confirm.locator("button", { hasText: "Cancel" }).click();
    await expect(page.locator(".deck-title")).not.toContainText("Mock Import");

    // Again, but confirm — deck, name, and Considering all replaced
    await page.locator(".dh-actions button", { hasText: "Import cards" }).click();
    await page.locator('.icm-tabs [role="tab"]', { hasText: "From URL" }).click();
    await page.locator(".icm-panel input").fill("https://archidekt.com/decks/12345");
    await page.locator(".icm-foot button", { hasText: "Import" }).click();
    await page.locator(".icm-confirm button", { hasText: "Replace deck" }).click();
    await expect(page.locator(".deck-title")).toContainText("Mock Import");
    await expect(page.locator(".considering-group")).toBeVisible();
  });

  test("inline rename updates the deck title", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await page.locator(".deck-title").hover();
    await page.locator(".dh-rename").click();
    const input = page.locator(".dh-title-input");
    await input.fill("Atraxa Superfriends");
    await input.press("Enter");
    await expect(page.locator(".deck-title")).toContainText("Atraxa Superfriends");
  });

  test("MDFC files under its front face and land header shows the hint", async ({ page }) => {
    await loadSharedDeck(page, `${TEST_DECK_TEXT}\n1 Malakir Rebirth`, TEST_COMMANDER);
    // Front face is an Instant — never grouped as a Land
    const hint = page.locator(".mdfc-hint").first();
    await expect(hint).toBeVisible({ timeout: 10000 });
    await expect(hint).toContainText("+1 w/MDFC");
  });
});
