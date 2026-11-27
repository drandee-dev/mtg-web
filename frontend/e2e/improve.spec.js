// Improve's rail on layout A (audit job 6.2): what the deck is built around,
// then Health, with every role on its own line. The answers here are Sliver
// Swarm's real ones (composition and the mana check, 2026-11-26), so the rail
// is seen with a tribe, a land shortfall and both kinds of role line.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, openDeckSection, runAiReview } from "./fixtures/helpers.js";
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

// The suggestions column (audit job 6.3): one switch for its three lists, rows
// that carry the deck's theme, and an AI review that explains an empty answer.
const stubRecs = (page) => page.route("**/api/deck/recommend", (route) => route.fulfill({
  json: {
    commanders: [TEST_COMMANDER],
    categories: {
      high_synergy: [
        { name: "Lightning Bolt", synergy: 0.9, num_decks: 570, potential_decks: 1000, in_deck: false, theme_tag: "Sliver" },
        { name: "Rhystic Study", synergy: 0.8, num_decks: 380, potential_decks: 1000, in_deck: false, theme_tag: null },
      ],
    },
  },
}));

test("a suggestion on the deck's theme carries its tag, and its buttons name the card", async ({ page }) => {
  await stubRecs(page);
  await stub(page);
  await openImprove(page);
  const rows = page.locator('.opt-card[data-source="rec"]');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator(".chg-theme")).toHaveText("Sliver");
  await expect(rows.nth(1).locator(".chg-theme")).toHaveCount(0);
  // "Skip" and "Apply" on every row told a screen reader nothing.
  await expect(rows.nth(0).getByRole("button", { name: "Add Lightning Bolt", exact: true })).toBeVisible();
  await expect(rows.nth(0).getByRole("button", { name: "Skip Lightning Bolt", exact: true })).toBeVisible();
  // One list at a time, with its count on the switch.
  await expect(page.locator(".insp-sources button").first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".insp-sources button").first()).toContainText("2");
});

test("when every AI change was held back, the list says why and what to do next", async ({ page }) => {
  const note = "4 changes held back: they would cut your Slivers.";
  await page.route("**/api/deck/optimize", (route) => route.fulfill({
    json: { error: false, assessment: "Tribal aggro, and the list is tight.", changes: [], held_back_note: note, model: "mock" },
  }));
  await stubRecs(page);
  await stub(page);
  await openImprove(page);
  await runAiReview(page);
  const pane = page.locator(".insp-body");
  await expect(pane.locator(".insp-held")).toHaveText(note);
  await expect(pane.locator(".insp-empty")).toContainText("change your Goals, then press Look again");
  await expect(pane.locator(".opt-card")).toHaveCount(0);
  // The suggestions are a tap away, not mixed into an empty list.
  await expect(page.locator(".insp-sources button").first()).toContainText("For this commander");
  await expect(page.locator(".insp-deep")).toHaveCount(0);
});

// Holiday on 6.3: a short role's button starts the AI review and opens its list,
// where the run button was still on offer. Pressing it bought a second call.
test("the AI review's button is not offered while a review is already running", async ({ page }) => {
  let calls = 0;
  let release;
  const held = new Promise((r) => { release = r; });
  await page.route("**/api/deck/optimize", async (route) => { calls += 1; await held; await route.fallback(); });
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  await openDeckSection(page, "Improve");
  await page.locator(".asmt-chip", { hasText: "Card draw" }).click();
  await expect.poll(() => calls).toBe(1);
  // Its list is showing, with the loader and no second way to start it.
  await expect(page.locator(".insp-sources button").nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Building changes")).toBeVisible();
  await expect(page.locator(".insp-deep")).toHaveCount(0);
  release();
  await expect(page.locator('.opt-card[data-source="optimize"]')).toHaveCount(2, { timeout: 10000 });
  expect(calls).toBe(1);
});

test("an AI review that fails says so, and how to run it again", async ({ page }) => {
  await page.route("**/api/deck/optimize", (route) => route.fulfill({
    json: { error: true, message: "The AI is busy right now. Try again in a minute." },
  }));
  await stubRecs(page);
  await stub(page);
  await openImprove(page);
  await runAiReview(page);
  await expect(page.locator(".opt-error")).toContainText("The AI is busy right now");
  const empty = page.locator(".insp-body .insp-empty");
  await expect(empty).toContainText("The AI review did not finish. Press Look again");
  await expect(empty).not.toContainText("found nothing to change");
  // Look again will spend a call here, and says so on the button itself.
  await expect(page.getByRole("button", { name: /Look again/ })).toContainText("Uses AI");
});

// The header's buttons with both badges ("Deck changed", "Uses AI") were wider than a
// phone: the page scrolled sideways and the heading was squeezed into a strip.
test("the list's header fits the screen with both of its badges showing", async ({ page }) => {
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  await openDeckSection(page, "Improve");
  await runAiReview(page);
  await page.locator('.opt-card[data-source="optimize"]').first().locator(".chg-apply").click();
  const head = page.locator(".improve-head");
  await expect(head.locator(".insp-stale-badge")).toBeVisible();
  await expect(head.getByRole("button", { name: /Look again/ })).toContainText("Uses AI");
  const { doc, view } = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, view: window.innerWidth }));
  expect(doc, "the page is no wider than the screen").toBeLessThanOrEqual(view);
  // And the heading is not crushed to make room: "Suggested changes" stays on one line.
  const heading = await head.locator(".improve-h").boundingBox();
  expect(heading.width, "the heading keeps its width").toBeGreaterThanOrEqual(150);
});

test("visual: the lists' switch and a suggestion row", async ({ page }) => {
  await stubRecs(page);
  await stub(page);
  await openImprove(page);
  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 10000 });
  await expect(page.locator(".insp-sources")).toHaveScreenshot("improve-switch.png");
  await expect(page.locator('.opt-card[data-source="rec"]').first()).toHaveScreenshot("improve-row.png");
});

test("visual: Improve's rail", async ({ page }) => {
  await stub(page);
  await openImprove(page);
  // The "Saved as" toast sits over the rail on a phone until it times out.
  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 10000 });
  // Theme and Health only: short enough to sit clear of the phone's bars.
  await expect(page.locator(".asmt-wrap")).toHaveScreenshot("improve-rail.png");
});
