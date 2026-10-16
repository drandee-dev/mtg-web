// How to play (UX overhaul job 3.4): one strategy request per deck, made when
// the tab is first opened and again only on "Write it again". Card edits never
// fire it. Runs against the hermetic mock backend.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, openDeckSection, addCardField } from "./fixtures/helpers.js";
import { TEST_COMMANDER, TEST_DECK_LINES } from "./fixtures/test-data.js";

const EXTRA = [
  "Cyclonic Rift", "Swiftfoot Boots", "Lightning Greaves", "Mystic Remora", "Eternal Witness",
  "Beast Within", "Heroic Intervention", "Birds of Paradise", "Llanowar Elves", "Nature's Lore",
  "Three Visits", "Farseek",
];
const BIG_DECK = [...TEST_DECK_LINES, ...EXTRA.map((n) => `1 ${n}`)].join("\n"); // 22 lines

const play = (page) => page.getByRole("tabpanel", { name: "How to play", exact: true });

function countRequests(page, pathSuffix) {
  const counter = { n: 0 };
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.endsWith(pathSuffix)) counter.n += 1;
  });
  return counter;
}

async function quickAdd(page, name) {
  await openDeckSection(page, "Cards");
  const input = addCardField(page);
  await input.fill(name);
  await input.press("Enter");
  await expect(page.locator(".toast", { hasText: `Added ${name}` })).toBeVisible();
}

test("one strategy request across three card adds; Write it again makes the second", async ({ page }) => {
  const calls = countRequests(page, "/api/deck/ai/strategy");
  await loadSharedDeck(page, BIG_DECK, TEST_COMMANDER);
  // Loading a 22-card deck used to fire it on its own.
  await page.waitForTimeout(500);
  expect(calls.n).toBe(0);

  await openDeckSection(page, "How to play");
  await expect(play(page)).toContainText("Ramp early, land a planeswalker");
  await expect(play(page)).toContainText("Sol Ring + Arcane Signet");
  await expect(play(page).locator("strong", { hasText: "Superfriends" })).toBeVisible();
  expect(calls.n).toBe(1);

  for (const name of ["Opt", "Brainstorm", "Ponder"]) await quickAdd(page, name);
  await openDeckSection(page, "How to play");
  await expect(play(page)).toContainText("The cards have changed since this was written.");
  expect(calls.n).toBe(1);

  await play(page).getByRole("button", { name: "Write it again" }).click();
  await expect(play(page)).not.toContainText("The cards have changed");
  expect(calls.n).toBe(2);

  // Leaving and returning does not ask again.
  await openDeckSection(page, "Stats");
  await openDeckSection(page, "How to play");
  expect(calls.n).toBe(2);
});

test("a deck under 20 cards says so and makes no request", async ({ page }) => {
  const calls = countRequests(page, "/api/deck/ai/strategy");
  await loadSharedDeck(page, TEST_DECK_LINES.join("\n"), TEST_COMMANDER);
  await openDeckSection(page, "How to play");
  await expect(play(page)).toContainText("It needs 20.");
  await expect(play(page).getByRole("button", { name: /Write/ })).toHaveCount(0);
  expect(calls.n).toBe(0);
});

test("a reply with no game plan is not asked for again on every visit", async ({ page }) => {
  const calls = countRequests(page, "/api/deck/ai/strategy");
  await page.route("**/api/deck/ai/strategy", (route) =>
    route.fulfill({ json: { error: false, strategy: "Plain text, not JSON.", archetype: "", game_plan: "", synergies: [] } }));
  await loadSharedDeck(page, BIG_DECK, TEST_COMMANDER);
  await openDeckSection(page, "How to play");
  await expect(play(page)).toContainText("Plain text, not JSON.");
  await openDeckSection(page, "Stats");
  await openDeckSection(page, "How to play");
  await page.waitForTimeout(500); // a wrongly issued second request needs a moment to show
  expect(calls.n).toBe(1);
});

test("a failed request shows a message and the tab retries on the next open", async ({ page }) => {
  let fail = true;
  await page.route("**/api/deck/ai/strategy", (route) =>
    fail ? route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"nope"}' }) : route.fallback());
  await loadSharedDeck(page, BIG_DECK, TEST_COMMANDER);
  await openDeckSection(page, "How to play");
  await expect(play(page).getByRole("alert")).toBeVisible();
  fail = false;
  await openDeckSection(page, "Cards");
  await openDeckSection(page, "How to play");
  await expect(play(page)).toContainText("Ramp early, land a planeswalker");
});
