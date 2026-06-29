import { test, expect } from "./fixtures/test-base.js";
import { waitForAppReady, dismissColdStart } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

// Load a deck via the app's share-link mechanism (?deck=<base64>) so the deck view
// opens populated, then switch to Stacks + Group by Role so the Ramp/Draw/etc.
// category columns appear. Same UTF-8 base64 encoding the app uses for shares.
async function openStacksRoleMode(page) {
  const deckStr = `Commander\n1 ${TEST_COMMANDER}\n\nDeck\n${TEST_DECK_TEXT}`;
  const encoded = Buffer.from(deckStr, "utf8").toString("base64");
  await page.goto(`/?deck=${encodeURIComponent(encoded)}&fmt=commander&cmd=${encodeURIComponent(TEST_COMMANDER)}`);
  await waitForAppReady(page);
  await dismissColdStart(page);
  await page.locator('[aria-label="Stacked view"]').click();
  await page.locator('select[aria-label="Group cards by"]').selectOption("role");
  await page.locator('.stack-column-label:has-text("Ramp")').waitFor({ timeout: 10000 });
}

function textToggle(page) {
  return page.locator('.cg-toolbar .ai-panel-toggle button', { hasText: "Text" });
}

test.describe("Stack View", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
  });

  test("role grouping produces category columns", async ({ page }) => {
    await openStacksRoleMode(page);
    await expect(page.locator('.stack-column-label:has-text("Ramp")')).toBeVisible();
    await expect(page.locator('.stack-column-label:has-text("Draw")')).toBeVisible();
  });

  test("image/text sub-toggle switches stack rendering", async ({ page }) => {
    await openStacksRoleMode(page);
    await expect(page.locator(".stack-card-wrap").first()).toBeVisible();
    await textToggle(page).click();
    await expect(page.locator(".ts-row").first()).toBeVisible();
    await expect(page.locator(".ts-mana .ts-pip").first()).toBeVisible(); // mana pips render
  });

  test("column price totals appear in headers", async ({ page }) => {
    await openStacksRoleMode(page);
    await expect(page.locator(".stack-column-price").first()).toBeVisible();
  });

  test("touch shows move menu + hides drag hint; desktop shows drag grip", async ({ page }, testInfo) => {
    await openStacksRoleMode(page);
    const isMobile = testInfo.project.name.includes("mobile");
    if (isMobile) {
      await expect(page.locator(".stack-column-grip")).toHaveCount(0);
      await expect(page.locator(".stack-drag-hint")).toBeHidden();
      await textToggle(page).click();
      await expect(page.locator(".ts-row .more-menu-btn").first()).toBeVisible();
    } else {
      await expect(page.locator(".stack-column-grip").first()).toBeVisible();
      await expect(page.locator(".stack-drag-hint")).toBeVisible();
    }
  });

  test("visual: image stack grouped by role", async ({ page }) => {
    await openStacksRoleMode(page);
    await page.waitForTimeout(600);
    await expect(page).toHaveScreenshot("stack-image-role.png", { fullPage: true });
  });

  test("visual: text stack grouped by role", async ({ page }) => {
    await openStacksRoleMode(page);
    await textToggle(page).click();
    await page.waitForTimeout(600);
    await expect(page).toHaveScreenshot("stack-text-role.png", { fullPage: true });
  });
});
