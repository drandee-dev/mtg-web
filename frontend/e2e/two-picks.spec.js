// Two picks per AI change (suggestions job 4, 2026-11-06). The AI names the strongest
// card for a slot and a cheaper one doing the same job; Andres chose layout C: the card
// stays as it was with the strongest pick, and a line under the reason offers the
// cheaper one with its own Apply. Either pick says when it would leave the deck over
// the Goals budget. The shared mock has no cheaper picks, so this spec answers the AI
// pass itself.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, openDeckSection } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

const SWAP = {
  action: "swap", cut: "Cultivate", add: "Lightning Bolt", reason: "Cheap interaction over redundant ramp.",
  category: "Removal", impact: "high", price_usd: 2.5, cut_price_usd: 0.5, price_delta: 2.0, over_budget: true,
  cheaper: { name: "Malakir Rebirth", price_usd: 1.1, price_delta: 0.6, reason: "Same answer, half the price.", over_budget: false },
};
const CUT = {
  action: "cut", cut: "Kodama's Reach", add: null, reason: "Over the card count.", category: "Ramp",
  impact: "medium", price_usd: null, cut_price_usd: 0.75, price_delta: -0.75, over_budget: false, cheaper: null,
};

async function openWith(page, changes) {
  await page.route("**/api/deck/optimize", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ error: false, assessment: "x", changes, model: "mock" }),
  }));
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  await openDeckSection(page, "Improve");
  await page.locator(".insp-deep").click();
  const cards = page.locator('.opt-card[data-source="optimize"]');
  await expect(cards).toHaveCount(changes.length);
  return cards;
}

const gridCard = (page, name) => page.locator(`.card-grid-container [aria-label*="${name}"]`);

test("a swap shows its cheaper card under the reason; a cut has none", async ({ page }) => {
  const cards = await openWith(page, [SWAP, CUT]);
  const swap = cards.filter({ hasText: "add Lightning Bolt" });
  const alt = swap.locator(".chg-alt");
  await expect(alt).toContainText("Cheaper: Malakir Rebirth");
  await expect(alt.locator(".opt-delta")).toHaveText("+$0.60");
  await expect(alt).toContainText("Same answer, half the price.");
  // The strongest pick breaks the budget; the cheaper one fits.
  await expect(swap.locator(".chg-meta .opt-over")).toHaveText("Over your budget");
  await expect(alt.locator(".opt-over")).toHaveCount(0);
  await expect(cards.filter({ hasText: "Cut Kodama's Reach" }).locator(".chg-alt")).toHaveCount(0);
});

test("the cheaper card is marked when it too leaves the deck over budget", async ({ page }) => {
  const cards = await openWith(page, [{ ...SWAP, cheaper: { ...SWAP.cheaper, over_budget: true } }]);
  await expect(cards.first().locator(".chg-alt .opt-over")).toHaveText("Over your budget");
});

// A deck that starts over its cap marks every pick, money-saving ones included; those
// say the deck is still over, not that the card breaks the budget (La Dispute run).
test("a pick that saves money on an over-budget deck says \"Still over budget\"", async ({ page }) => {
  const saving = {
    ...SWAP, price_delta: -1.5, over_budget: true,
    cheaper: { ...SWAP.cheaper, price_delta: -2.0, over_budget: true },
  };
  const cards = await openWith(page, [saving]);
  await expect(cards.first().locator(".chg-meta .opt-over")).toHaveText("Still over budget");
  await expect(cards.first().locator(".chg-alt .opt-over")).toHaveText("Still over budget");
});

const skipsIn = (page) => page.evaluate(() => Object.keys(localStorage)
  .filter((k) => k.startsWith("mtgweb:optlog:"))
  .flatMap((k) => JSON.parse(localStorage.getItem(k)))
  .filter((e) => e.action === "skip")
  .map((e) => `${e.cut} > ${e.add}`));

test("Apply cheaper swaps in the cheaper card, logs it, and declines the strongest", async ({ page }) => {
  const cards = await openWith(page, [SWAP, CUT]);
  await cards.first().getByRole("button", { name: "Apply cheaper: Malakir Rebirth", exact: true }).click();
  await expect(cards).toHaveCount(1); // the change is done, whichever pick was taken
  // The strongest pick is remembered as declined, so the next pass won't offer it again.
  expect(await skipsIn(page)).toEqual(["Cultivate > Lightning Bolt"]);
  const log = page.locator(".opt-log");
  await log.locator(".opt-log-summary").click();
  await expect(log.locator(".opt-log-row")).toContainText("Cultivate → Malakir Rebirth");
  await openDeckSection(page, "Cards");
  await expect(gridCard(page, "Malakir Rebirth").first()).toBeVisible();
  await expect(gridCard(page, "Cultivate")).toHaveCount(0);
  await expect(gridCard(page, "Lightning Bolt")).toHaveCount(0);
});

test("a skip records both picks for the AI's session memory", async ({ page }) => {
  const cards = await openWith(page, [SWAP, CUT]);
  await cards.first().getByRole("button", { name: "Skip", exact: true }).click();
  await expect(cards).toHaveCount(1);
  expect((await skipsIn(page)).sort()).toEqual(["Cultivate > Lightning Bolt", "Cultivate > Malakir Rebirth"]);
});

test("the cheaper line has its own help tip, and fits a phone", async ({ page }) => {
  const cards = await openWith(page, [SWAP, CUT]);
  const tipBtn = page.getByRole("button", { name: "About the cheaper Malakir Rebirth", exact: true });
  const panel = page.locator(`[id="${await tipBtn.getAttribute("aria-controls")}"]`);
  await expect(panel).toBeEmpty();
  await tipBtn.click();
  await expect(panel).toContainText("whatever it costs");
  await expect(panel).toContainText("Over your budget");
  await expect(panel).toContainText("Still over budget");
  const alt = cards.first().locator(".chg-alt");
  const apply = alt.getByRole("button", { name: "Apply cheaper: Malakir Rebirth", exact: true });
  expect((await apply.boundingBox()).height).toBeGreaterThanOrEqual(44);
  const { right, vw } = await alt.evaluate((el) => ({
    right: el.getBoundingClientRect().right, vw: document.documentElement.clientWidth,
  }));
  expect(right, "cheaper line inside the viewport").toBeLessThanOrEqual(vw);
});
