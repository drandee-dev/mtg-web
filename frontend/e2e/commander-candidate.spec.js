// A pasted list with no commander: analyze names the first line as a candidate
// and the deck view offers it with one click. Nothing moves until that click.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, waitForAppReady, dismissColdStart, navigateToTab } from "./fixtures/helpers.js";

// Six lines: after Krenko moves out, the 99 still has the five auto-analyze needs.
const PASTED = "1 Krenko, Mob Boss\n1 Goblin Guide\n1 Sol Ring\n1 Lightning Bolt\n1 Shock\n29 Mountain";

// Real analyze_deck semantics (backend/test_validate_adds.py pins them): the
// candidate is the first card line as written, numbered or not, and only while
// no commander is set.
async function stubAnalyze(page) {
  const seen = [];
  await page.route("**/api/deck/analyze", async (route) => {
    const { decklist } = route.request().postDataJSON();
    seen.push(decklist);
    const hasCmdr = /^\s*Commander\s*$/im.test(decklist);
    const first = decklist.split("\n").map((l) => l.trim()).find(Boolean)?.replace(/^\d+\s+/, "");
    await route.fulfill({
      json: {
        format: "commander", total_cards: 34,
        commanders: [],
        commander_candidate: hasCmdr ? null : first,
        stats: { avg_cmc: 2 },
        mana: { overall_status: "OK", pip_demand_pct: {} },
        legality: { overall_status: "PASS", violations: {} },
        bracket: { bracket: 2, name: "Core", game_changers: [], mass_land_denial: [] },
        breakdown: { price_usd: 10 },
      },
    });
  });
  return seen;
}

const offerFor = (page, name) => page.getByRole("button", { name: `Make ${name} your commander` });

// The re-analyze after the click sends Krenko once, in the command zone.
async function expectKrenkoMoved(seen) {
  await expect.poll(() => /^\s*Commander\s*$/im.test(seen.at(-1) || ""), { timeout: 15000 }).toBe(true);
  expect(seen.at(-1).match(/Krenko/g)).toHaveLength(1);
}

test("offers the first line as commander and moves it on one click", async ({ page }) => {
  const seen = await stubAnalyze(page);
  await loadSharedDeck(page, PASTED);

  const offer = offerFor(page, "Krenko, Mob Boss");
  await expect(offer).toBeVisible({ timeout: 15000 }); // waits out the 2s analyze debounce
  // Offered, not applied: the list still has Krenko as a plain card line.
  expect(seen.at(-1)).not.toMatch(/^\s*Commander\s*$/im);

  await offer.click();
  await expect(offer).toBeHidden();
  await expectKrenkoMoved(seen);
});

test("no offer for an unnumbered first line the click couldn't move", async ({ page }) => {
  const seen = await stubAnalyze(page);
  await loadSharedDeck(page, PASTED.replace("1 Krenko", "Krenko"));
  // The server did name a candidate; the page must still decline to offer it.
  // The stats bar proves the analyze result has rendered before we check absence.
  await expect(page.locator(".deck-stats-bar")).toBeVisible({ timeout: 15000 });
  expect(seen[0]).toMatch(/^Krenko, Mob Boss/);
  await expect(page.locator(".cmdr-input-row")).toBeVisible();
  await expect(offerFor(page, "Krenko, Mob Boss")).toHaveCount(0);
});

test("a paste into an empty deck offers the commander inside the upgrade guide", async ({ page }) => {
  const seen = await stubAnalyze(page);
  await page.goto("/");
  await waitForAppReady(page);
  await dismissColdStart(page);
  await navigateToTab(page, "Analyze & Build");
  await page.locator(".empty-action", { hasText: "Paste a decklist" }).click();
  await page.locator(".icm-panel textarea").fill(PASTED);
  await page.locator(".icm-foot button", { hasText: "Import" }).click();

  const offer = page.locator(".upr-panel").getByRole("button", { name: "Make Krenko, Mob Boss your commander" });
  await expect(offer).toBeVisible({ timeout: 15000 });
  await offer.click();
  await expect(offer).toBeHidden();
  await expectKrenkoMoved(seen);
});
