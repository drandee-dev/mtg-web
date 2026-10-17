// Failure is not loading (visual pass job 4). When the server cannot be reached
// a surface must say so within a few seconds and offer another try, not sit on
// "Loading…" for the 24 seconds the old four-tries-eight-seconds-apart client
// took. Each case breaks one call, checks what the person sees, counts the
// requests (a read is tried once more, an AI call never), then restores the call
// and presses Try again.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, openDeckSection, waitForAppReady } from "./fixtures/helpers.js";
import { fakeCloud, cloudOrigin } from "./fixtures/fake-cloud.js";
import { TEST_DECK_TEXT, TEST_COMMANDER, TEST_DECK_STORAGE } from "./fixtures/test-data.js";

// One try, then one retry after a second, then the error: about 1s. 4s is the
// margin for a slow machine, and well under the old 24.
const WITHIN = 4000;

// A route that refuses while `.down` is true and otherwise hands the call on to
// the mock backend (or the fake cloud) registered before it. `only` limits it to
// some requests.
async function breakable(page, pattern, only = () => true) {
  const state = { down: true, hits: 0 };
  await page.route(pattern, (route) => {
    if (!only(route.request())) return route.fallback();
    state.hits++;
    return state.down ? route.abort() : route.fallback();
  });
  return state;
}

const panelAlert = (page, text) => page.locator(".panel").getByRole("alert").filter({ hasText: text });

test.describe("Failure is not loading", () => {
  test("a directory that will not load says so, tries once more, and can be asked again", async ({ page }) => {
    const dir = await breakable(page, "**/api/commanders/directory");
    await page.goto("/commanders");
    await waitForAppReady(page);

    await expect(panelAlert(page, "Couldn't load commanders")).toBeVisible({ timeout: WITHIN });
    expect(dir.hits, "one try and one retry").toBe(2);
    await expect(page.getByText("Loading commanders…")).toHaveCount(0);
    await page.waitForTimeout(2500);
    expect(dir.hits, "no third try").toBe(2);

    dir.down = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("listitem", { name: "Atraxa, Praetors' Voice" })).toBeVisible();
    await expect(panelAlert(page, "Couldn't load commanders")).toHaveCount(0);
  });

  test("a commander's page opened cold says so instead of 'Loading…', and recovers", async ({ page }) => {
    const dir = await breakable(page, "**/api/commanders/directory");
    await page.goto("/commanders/atraxa-praetors-voice");
    await waitForAppReady(page);

    await expect(panelAlert(page, "Couldn't load commanders")).toBeVisible({ timeout: WITHIN });
    await expect(page.getByRole("status").filter({ hasText: "Loading…" })).toHaveCount(0);

    dir.down = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Atraxa, Praetors' Voice" })).toBeVisible();
  });

  test("a failed analysis ends its spinner and says so", async ({ page }) => {
    await breakable(page, "**/api/deck/analyze");
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openDeckSection(page, "Stats");
    await expect(page.locator(".toast").filter({ hasText: "Analyze failed" })).toBeVisible({ timeout: WITHIN });
    await expect(page.getByText("Analyzing deck")).toHaveCount(0);
  });

  test("Ask falls back from a broken stream, and with both down reports it at once, sending nothing twice", async ({ page }) => {
    // Ask streams its answer and, when the stream cannot be reached, asks the
    // plain endpoint instead. With only the stream down that works.
    const stream = await breakable(page, /\/api\/planeswalker\/chat\/stream$/);
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await page.locator(".ask-starter").first().click();
    // The mock's plain endpoint answers with the commander's name. ("Thinking…" is
    // not an answer, so a weaker check lets the next step race the request.)
    await expect(page.locator(".ask-panel .pw-assistant .pw-text").last()).toHaveText("Atraxa, Praetors' Voice", { timeout: WITHIN });
    await expect(page.locator(".pw-retry")).toHaveCount(0);

    // With both down: one try at the stream, one at the plain endpoint, each sent
    // once (the old client sent the plain one four times, 24s apart).
    const chat = await breakable(page, /\/api\/planeswalker\/chat$/);
    await page.getByRole("button", { name: "Clear" }).click();
    await page.locator(".ask-starter").first().click();
    await expect(page.locator(".pw-retry")).toBeVisible({ timeout: WITHIN });
    await page.waitForTimeout(1500);
    expect(chat.hits, "the plain endpoint is tried once").toBe(1);

    stream.down = false;
    chat.down = false;
    await page.locator(".pw-retry").click();
    await expect(page.locator(".ask-panel")).toContainText("Consider adding");
  });

  test("a server that stays down is called unreachable after three checks", async ({ page }) => {
    await breakable(page, "**/api/health");
    await page.goto("/");
    await expect(page.locator(".server-banner")).toContainText("Connecting to server");
    // Checks at 0s, 5s and 10s: the banner changes at the third.
    await expect(page.locator(".server-banner.offline")).toContainText("Server unreachable", { timeout: 14000 });
  });

  test.describe("signed in", () => {
    test.skip(!cloudOrigin, "no frontend/.env, so this build has no cloud mode");

    test("a deck address whose list will not load says so, and opens the deck on Try again", async ({ page }) => {
      const deck = {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Cloud deck",
        format: "commander",
        decklist_text: TEST_DECK_STORAGE.decklist_text,
        updated_at: "2026-01-02T00:00:00.000Z",
      };
      await fakeCloud(page, [deck]);
      const list = await breakable(page, `${cloudOrigin}/rest/v1/decks**`, (req) => req.method() === "GET");
      await page.goto(`/decks/${deck.id}`);
      await waitForAppReady(page);

      // The Supabase client retries a failed read itself (three times, backing
      // off 1s, 2s and 4s) before it throws, so this one takes about 7s.
      await expect(page.getByRole("heading", { name: "Couldn't load your decks" })).toBeVisible({ timeout: 15000 });
      await expect(page.getByText("Loading deck…")).toHaveCount(0);

      list.down = false;
      await page.getByRole("button", { name: "Try again" }).click();
      await expect(page.locator(".deck-title")).toContainText("Cloud deck", { timeout: 15000 });
    });
  });
});
