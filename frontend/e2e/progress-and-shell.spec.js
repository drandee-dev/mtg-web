// The top progress line and the page shell (visual pass job 7).
//
// Shell: on a slow load the browser paints the app's bar and a moving line from
// the HTML alone, before the app script has run, and the app's first render puts
// its own bar in the same place. Progress line: shown once a request has been
// out for 300ms and gone when it settles; never for a quick request, and never
// for the per-card picture lookups that run while a deck loads.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, openAddress, waitForAppReady } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

// Hold a request for `ms`, then hand it on to whatever would have answered it.
async function slow(page, pattern, ms) {
  await page.route(pattern, async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.fallback();
  });
}

const bar = (page) => page.locator(".top-progress");

// Remember whether the app's line was ever on a page (it is a quick thing to miss).
// An init script, so it survives the page navigating; the line inside .app is the
// app's, the one in the page shell is not.
const watchForBar = (page) => page.addInitScript(() => {
  window.__sawBar = false;
  document.addEventListener("DOMContentLoaded", () => {
    new MutationObserver(() => { if (document.querySelector(".app .top-progress")) window.__sawBar = true; })
      .observe(document.body, { childList: true, subtree: true });
  });
});
const sawBar = (page) => page.evaluate(() => window.__sawBar);

const searchCards = async (page) => {
  const name = page.locator('input[placeholder="bolt"]');
  await name.fill("bolt");
  await name.press("Enter");
};

test.describe("Page shell", () => {
  test("a slow load shows the app's bar and a moving line before the app script arrives", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chrome", "sizes its own viewport");
    await page.setViewportSize({ width: 1440, height: 900 });
    await slow(page, "**/assets/index-*.js", 2500);
    await page.goto("/", { waitUntil: "commit" });

    const toolbar = page.locator(".global-toolbar");
    await expect(toolbar).toBeVisible({ timeout: 1500 });
    await expect(toolbar).toContainText("MTG Workshop");
    await expect(bar(page)).toBeVisible();
    await expect(page.locator(".app")).toHaveCount(0);
    const shell = await toolbar.boundingBox();

    // The app arrives and replaces the shell without the bar moving.
    await waitForAppReady(page);
    await expect(toolbar).toHaveCount(1);
    expect(await toolbar.boundingBox()).toEqual(shell);
    await expect(bar(page)).toHaveCount(0);
  });

  test("a slow load has the right theme from the first paint", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chrome", "sizes its own viewport");
    await page.addInitScript(() => localStorage.setItem("mtgweb:theme", "light"));
    await slow(page, "**/assets/index-*.js", 2500);
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.locator(".global-toolbar")).toBeVisible({ timeout: 1500 });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(244, 244, 247)");
  });
});

test.describe("Top progress line", () => {
  test("a slow request lights the line after 300ms and it goes out when the answer arrives", async ({ page }) => {
    await slow(page, "**/api/cards/search*", 2000);
    await openAddress(page, "/cards");
    await searchCards(page);

    await page.waitForTimeout(100);
    await expect(bar(page), "not at once").toHaveCount(0);
    await expect(bar(page)).toBeVisible({ timeout: 1500 });
    await expect(page.locator(".results-table tbody tr").first()).toBeVisible({ timeout: 5000 });
    await expect(bar(page)).toHaveCount(0);
  });

  test("a quick request never lights it", async ({ page }) => {
    await slow(page, "**/api/cards/search*", 100);
    await watchForBar(page);
    await openAddress(page, "/cards");
    await searchCards(page);
    await expect(page.locator(".results-table tbody tr").first()).toBeVisible();
    await page.waitForTimeout(600);
    expect(await sawBar(page)).toBe(false);
  });

  test("picture lookups for a deck's cards do not light it", async ({ page }) => {
    await slow(page, /\/api\/cards\/image/, 2000);
    await watchForBar(page);
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await page.waitForTimeout(1800); // the lookups are still out
    expect(await sawBar(page)).toBe(false);
  });
});
