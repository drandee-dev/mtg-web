// A lazy chunk that will not load (audit job 5.10's review): an open tab asking for a
// file a newer deploy replaced, or a dropped connection. The app reloads once (main.jsx,
// vite:preloadError) and, if the chunk still fails, shows a Reload panel in place of
// that page instead of unmounting to a blank screen.
import { test, expect } from "./fixtures/test-base.js";
import { waitForAppReady } from "./fixtures/helpers.js";

test("a page whose chunk fails to load shows a Reload panel, not a blank app", async ({ page }) => {
  await page.route("**/assets/Commanders-*.js", (route) => route.abort());
  await page.goto("/commanders");
  await waitForAppReady(page);
  const panel = page.getByRole("alert").filter({ hasText: "didn't load" });
  await expect(panel).toBeVisible({ timeout: 15000 });
  await expect(panel.getByRole("button", { name: "Reload" })).toBeVisible();
  // The rest of the app is still there: the bars and another place still work.
  await page.unroute("**/assets/Commanders-*.js");
  await page.locator('nav[aria-label="Main"]:visible').getByRole("link", { name: "Cards", exact: true }).click();
  await expect(page).toHaveURL(/\/cards$/);
  await expect(page.locator('input[placeholder="bolt"]')).toBeVisible();
});
