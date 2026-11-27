// Improve's rail on layout A (audit job 6.2): what the deck is built around,
// then Health, with every role on its own line. The answers here are Sliver
// Swarm's real ones (composition and the mana check, 2026-11-26), so the rail
// is seen with a tribe, a land shortfall and both kinds of role line.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, openDeckSection } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

const SLIVER = {
  format: "commander", is_commander: true,
  categories: [
    { key: "lands", label: "Lands", count: 37, light: 0, target: 41, status: "thin" },
    { key: "ramp", label: "Ramp", count: 10, light: 0, target: 10, status: "ok" },
    { key: "card-draw", label: "Card draw", count: 5, light: 1, target: 10, status: "thin" },
    { key: "removal", label: "Spot removal", count: 7, light: 0, target: 8, status: "ok" },
    { key: "board-wipe", label: "Board wipes", count: 3, light: 0, target: 3, status: "ok" },
  ],
  theme: [
    { label: "Slivers", count: 56, creatures: 42 },
    { label: "Token producer", count: 20, creatures: null },
  ],
};

async function stub(page, composition = SLIVER) {
  await page.route("**/api/deck/composition", (route) => route.fulfill({ json: composition }));
  await page.route("**/api/deck/analyze", (route) => route.fulfill({
    json: {
      format: "commander", total_cards: 100, stats: { avg_cmc: 3.1 },
      mana: {
        overall_status: "WARN", pip_demand_pct: {}, color_balance_status: "PASS",
        viability: {
          status: "WARN", land_status: "WARN", land_count: 37, land_floor: 41,
          sources_status: "PASS", mana_sources: 47, recommended_sources: 46, ramp_count: 10, avg_mv: 3.1,
        },
      },
      legality: { overall_status: "PASS", violations: {} },
      bracket: { bracket: 2, name: "Core", game_changers: [], mass_land_denial: [] },
      breakdown: { price_usd: 68.93 },
    },
  }));
}

async function openImprove(page) {
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  await openDeckSection(page, "Improve");
  await expect(page.getByRole("heading", { name: "Health", exact: true })).toBeVisible({ timeout: 15000 });
}

test("the rail says what the deck is built around, with the split behind the count", async ({ page }) => {
  await stub(page);
  await openImprove(page);
  const rail = page.locator(".deck-goals-assessment");
  await expect(rail.getByRole("heading", { name: "This deck is", exact: true })).toBeVisible();
  const chips = rail.locator(".asmt-theme-chip");
  await expect(chips).toHaveText(["Slivers56 cards", "Token producer20 cards"]);
  // 56 alone would read as padded: the note says how many are Slivers.
  await expect(rail.locator(".asmt-note")).toContainText("42 Slivers and 14 cards that make or support them.");
  // Chips are statements, never controls.
  await expect(rail.locator(".asmt-theme button")).toHaveCount(0);
});

test("Health lists every role once, and only the short ones are buttons", async ({ page }) => {
  await stub(page);
  await openImprove(page);
  const rail = page.locator(".deck-goals-assessment");
  // The land shortfall and the thin-role count are the rows below, so they are not said twice.
  await expect(rail.locator(".asmt-status li")).toHaveText(["Legal"]);
  await expect(rail.locator(".asmt-status")).not.toContainText("·");
  const lines = rail.locator(".asmt-gaps > *");
  await expect(lines).toHaveText([
    /^Lands37 of 41/, /^Ramp10 of 10$/, /^Card draw5 of 10 \(1 light\)/, /^Spot removal7 of 8$/, /^Board wipes3 of 3$/,
  ]);
  await expect(rail.locator(".asmt-gaps button")).toHaveCount(2);
  await expect(rail.getByRole("button", { name: /Card draw.*under target/ })).toBeEnabled();
  await expect(rail.getByRole("button", { name: /Ramp/ })).toHaveCount(0);
});

test("a deck with no theme reading shows Health alone", async ({ page }) => {
  await stub(page, { ...SLIVER, theme: [] });
  await openImprove(page);
  await expect(page.getByRole("heading", { name: "This deck is", exact: true })).toHaveCount(0);
  await expect(page.locator(".asmt-gaps > *")).toHaveCount(5);
});

test("visual: Improve's rail", async ({ page }) => {
  await stub(page);
  await openImprove(page);
  // The "Saved as" toast sits over the rail on a phone until it times out.
  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 10000 });
  // Theme and Health only: short enough to sit clear of the phone's bars.
  await expect(page.locator(".asmt-wrap")).toHaveScreenshot("improve-rail.png");
});
