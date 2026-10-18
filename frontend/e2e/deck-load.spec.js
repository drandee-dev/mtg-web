// Deck page loading (visual pass job 6). A deck's cards used to be drawn in one
// "All Cards" column until their data arrived and then moved into their real
// columns: most of the page's layout shift on opening a deck. Now the empty
// columns stand in, the cards go in once, and Improve and Stats hold their shape
// while they load. Each case holds one call, looks, releases it, and looks again.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, openDeckSection, setCardView } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

// A call that is answered only after release() (or after `ms`, when given).
async function held(page, pattern, ms) {
  let release = () => {};
  const gate = ms ? new Promise((r) => setTimeout(r, ms)) : new Promise((r) => { release = r; });
  await page.route(pattern, async (route) => { await gate; return route.fallback(); });
  return release;
}

async function watchShifts(page) {
  await page.addInitScript(() => {
    window.__cls = 0;
    window.__shifts = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__cls += e.value;
        window.__shifts.push(`${Math.round(e.startTime)}ms ${e.value.toFixed(3)} ${(e.sources || []).slice(0, 3).map((s) => `${s.node?.nodeName}.${String(s.node?.className).slice(0, 28)} ${Math.round(s.previousRect.y)}+${Math.round(s.previousRect.height)}>${Math.round(s.currentRect.y)}+${Math.round(s.currentRect.height)}`).join(" | ")}`);
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

const stats = (page) => page.getByRole("tabpanel", { name: "Stats", exact: true });
const improve = (page) => page.getByRole("tabpanel", { name: "Improve", exact: true });

test.describe("Deck page loading", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Desktop browser, viewport set per case: the touch project lays the page out differently.
    test.skip(testInfo.project.name.includes("mobile"), "desktop browser only");
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  for (const width of [1440, 768, 390]) {
    test(`a deck opened cold does not shift as its cards and analysis arrive (${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await held(page, /\/api\/cards\/image/, 1500);
      await held(page, "**/api/deck/analyze", 4000);
      await watchShifts(page);
      await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
      await page.waitForTimeout(6500);
      await expect(page.locator(".deck-skeleton")).toHaveCount(0);
      await expect(page.locator(".stack-card-wrap").first()).toBeVisible();
      const shifts = await page.evaluate(() => window.__shifts);
      expect(await page.evaluate(() => window.__cls), `layout shift at ${width}: ${shifts.join(" ;; ")}`).toBeLessThan(0.05);
    });
  }

  test("the cards wait as empty columns, then appear once in their columns", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const release = await held(page, /\/api\/cards\/image/);
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const wait = page.locator('.deck-skeleton[aria-busy="true"]');
    await expect(wait).toBeVisible();
    await expect(wait.locator(".stack-column")).not.toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Loading cards…" })).toHaveCount(1);
    await expect(page.getByText("All Cards")).toHaveCount(0);
    await expect(page.locator(".stack-card-wrap img")).toHaveCount(0);

    release();
    await expect.poll(() => page.locator(".stack-column-label").count()).toBeGreaterThan(2);
    await expect(page.getByText("All Cards")).toHaveCount(0);
    await expect(page.locator(".deck-skeleton")).toHaveCount(0);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  });

  test("Grid and List wait as empty groups too", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const release = await held(page, /\/api\/cards\/image/);
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    for (const mode of ["Grid", "List"]) {
      await setCardView(page, { mode });
      await expect(page.locator('.deck-skeleton[aria-busy="true"] .card-group')).not.toHaveCount(0);
    }
    release();
    await expect(page.locator(".deck-skeleton")).toHaveCount(0);
    await expect(page.locator(".card-list-row").first()).toBeVisible();
  });

  test("Stats holds the shape of its tiles while the analysis runs", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const release = await held(page, "**/api/deck/analyze");
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openDeckSection(page, "Stats");
    const body = stats(page).locator(".insp-body");
    await expect(body).toHaveAttribute("aria-busy", "true");
    await expect(body.locator(".stat-grid .stat .ph")).not.toHaveCount(0);
    // Not the empty-deck message: the deck has cards, its analysis just has not come back.
    await expect(body.getByText("Add cards")).toHaveCount(0);
    release();
    await expect(body.locator(".stat .k", { hasText: "Cards" })).toBeVisible();
    await expect(body).not.toHaveAttribute("aria-busy", "true");
    await expect(body.locator(".stat-grid .ph")).toHaveCount(0);
  });

  test("Stats stops holding a place once the analysis has failed", async ({ page }) => {
    await page.route("**/api/deck/analyze", (route) => route.abort());
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await expect(page.locator(".toast").filter({ hasText: "Analyze failed" })).toBeVisible({ timeout: 10000 });
    await openDeckSection(page, "Stats");
    const body = stats(page).locator(".insp-body");
    await expect(body.locator(".ph")).toHaveCount(0);
    await expect(body).not.toHaveAttribute("aria-busy", "true");
  });

  test("Improve holds its rows while the suggestions load, keeping the Loading label", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const release = await held(page, "**/api/deck/recommend");
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openDeckSection(page, "Improve");
    const body = improve(page).locator(".insp-body");
    await expect(body).toHaveAttribute("aria-busy", "true");
    await expect(body.getByText("Loading")).toBeVisible();
    await expect(body.locator(".opt-card .chg-thumb.ph")).toHaveCount(6); // three rows, two pictures each
    release();
    await expect(body).not.toHaveAttribute("aria-busy", "true");
    await expect(body.locator(".opt-card .chg-thumb.ph")).toHaveCount(0);
  });
});
