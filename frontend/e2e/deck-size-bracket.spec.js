// Bracket labels match the official WotC brackets (1-5), the stats bar counts
// the commander once, and the health score drops when legality fails.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, waitForAppReady, dismissColdStart, navigateToTab } from "./fixtures/helpers.js";
import { TEST_COMMANDER } from "./fixtures/test-data.js";

// Analyze stub with real backend semantics: total_cards counts every card in
// the posted list, commander included (backend/test_deck_size_legality.py
// pins that against the real analyze_deck).
async function stubAnalyze(page, legality = () => ({ overall_status: "PASS", violations: {} })) {
  const seen = [];
  await page.route("**/api/deck/analyze", async (route) => {
    const { decklist } = route.request().postDataJSON();
    seen.push(decklist);
    const total = [...decklist.matchAll(/^\s*(\d+)\s+\S/gm)].reduce((s, m) => s + Number(m[1]), 0);
    await route.fulfill({
      json: {
        format: "commander", total_cards: total,
        stats: { avg_cmc: 2.5 },
        mana: { overall_status: "OK", pip_demand_pct: {} },
        legality: legality(),
        bracket: { bracket: 2, name: "Core", game_changers: [], mass_land_denial: [] },
        breakdown: { price_usd: 68.93 },
      },
    });
  });
  return seen;
}

// 99 cards over five lines (auto-analyze needs at least five card lines).
const NINETY_NINE = "1 Sol Ring\n1 Command Tower\n1 Arcane Signet\n1 Cultivate\n95 Forest";

test("picking Bracket 5 — cEDH sends bracket 5", async ({ page }) => {
  await page.goto("/");
  await waitForAppReady(page);
  await dismissColdStart(page);
  await navigateToTab(page, "Analyze & Build");
  await page.locator(".empty-action", { hasText: "Guided build" }).click();
  await page.locator(".gen-door", { hasText: "I know my commander" }).click();

  const labels = await page.getByLabel("Target bracket").locator("option").allTextContents();
  expect(labels).toEqual([
    "Bracket: auto",
    "Bracket 1 — Exhibition",
    "Bracket 2 — Core",
    "Bracket 3 — Upgraded",
    "Bracket 4 — Optimized",
    "Bracket 5 — cEDH",
  ]);
  await page.getByLabel("Target bracket").selectOption({ label: "Bracket 5 — cEDH" });

  const skeleton = page.waitForRequest((r) => r.url().includes("/api/deck/wizard/skeleton"));
  await page.locator("#gen-cmd").fill("atraxa");
  await page.locator(".gen-candidate", { hasText: "Atraxa" }).click();
  expect((await skeleton).postDataJSON().bracket).toBe(5);
});

test("a 1+99 commander deck reads 100/100 in the stats bar", async ({ page }) => {
  const seen = await stubAnalyze(page);
  await loadSharedDeck(page, NINETY_NINE, TEST_COMMANDER);
  const bar = page.locator(".deck-stats-bar");
  await expect(bar).toBeVisible({ timeout: 15000 }); // waits out the 2s analyze debounce
  // What the app actually sent: the commander once, plus the 99.
  const sent = seen.at(-1);
  expect(sent.match(/Atraxa/g)).toHaveLength(1);
  expect(sent).toContain("95 Forest");
  await expect(bar.locator(".dsb-stat", { hasText: "Cards" }).locator(".dsb-val")).toHaveText("100/100");
});

test("an illegal deck scores lower than the same deck when legal", async ({ page }) => {
  let status = "PASS";
  await stubAnalyze(page, () => (status === "PASS"
    ? { overall_status: "PASS", violations: { deck_maximum: [] } }
    : { overall_status: "FAIL", violations: { deck_maximum: [{ total_cards: 101, maximum: 100, reason: "above_maximum" }] } }));

  const ring = page.locator(".hr-score").first();
  await loadSharedDeck(page, NINETY_NINE, TEST_COMMANDER);
  await expect(ring).toBeVisible({ timeout: 15000 });
  const legal = Number(await ring.textContent());

  status = "FAIL";
  await page.reload();
  await waitForAppReady(page);
  // Poll: a persisted result may paint first; the re-analyzed one must score lower.
  await expect.poll(async () => Number(await ring.textContent()), { timeout: 15000 }).toBeLessThan(legal);
});
