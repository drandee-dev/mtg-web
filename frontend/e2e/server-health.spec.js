// The backend's health, checked by App through useServerHealth: a failing
// check shows "Connecting to server…", the reply's ai_available decides whether
// Ask offers a question box, and a healthy server shows no banner. Runs against
// the hermetic mock backend with its health route replaced per test.

import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, waitForAppReady } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

const askButton = (page) => page.getByRole("button", { name: "Ask", exact: true });

test.describe("Server health", () => {
  test("a healthy server shows no banner", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await expect(page.locator(".server-banner")).toHaveCount(0);
  });

  test("a failing health check shows the connecting banner", async ({ page }) => {
    await page.route("**/api/health", (route) => route.fulfill({ status: 500, json: { detail: "down" } }));
    await page.goto("/");
    await expect(page.locator(".server-banner")).toContainText("Connecting to server");
  });

  test("with AI off, Ask explains instead of offering a question box", async ({ page }) => {
    await page.route("**/api/health", (route) => route.fulfill({ json: { ok: true, ai_available: false, warmed: true } }));
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await askButton(page).click();
    await expect(page.locator(".ask-panel")).toContainText("AI chat isn't set up on this server");
    await expect(page.getByRole("textbox", { name: "Your question" })).toHaveCount(0);
  });
});
