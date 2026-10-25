// Brawl was removed from the web app (Andres, 2026-10-24) and the API refuses the
// Brawl formats. A deck that still says "brawl" (saved before, or on a share link)
// must open as Commander, so its panels ask the API for Commander, not Brawl.
import { test, expect } from "./fixtures/test-base.js";
import {
  waitForAppReady, dismissColdStart, seedLocalDecks, importNewDeck, loadSharedDeck, deckMenuAction,
  navigateToTab, backToDeck,
} from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

// The format the next deck request sends (analyze, composition, recommend: whichever
// the page asks first), which is what the API would refuse if it said brawl.
const analyzeFormat = (page) =>
  page.waitForRequest((r) => {
    if (r.method() !== "POST" || !new URL(r.url()).pathname.startsWith("/api/deck/")) return false;
    try { return typeof r.postDataJSON()?.format === "string"; } catch { return false; }
  }, { timeout: 15000 }).then((r) => r.postDataJSON().format);

for (const retired of ["brawl", "historic_brawl"]) {
  test(`a saved ${retired} deck opens as Commander`, async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await seedLocalDecks(page, [{
      id: `old-${retired}`, name: "Old Brawl deck", format: retired,
      decklist_text: `Commander\n1 ${TEST_COMMANDER}\nDeck\n${TEST_DECK_TEXT}`,
    }]);
    await page.reload();
    await waitForAppReady(page);
    await dismissColdStart(page);
    const sent = analyzeFormat(page);
    await page.locator(".deck-card .deck-card-art").first().click();
    expect(await sent).toBe("commander");
  });
}

const OLD_BRAWL = {
  id: "old-brawl-deck", name: "Old Brawl deck", format: "brawl",
  decklist_text: `Commander\n1 ${TEST_COMMANDER}\nDeck\n${TEST_DECK_TEXT}`,
};

async function seedOld(page) {
  await page.goto("/");
  await waitForAppReady(page);
  await seedLocalDecks(page, [OLD_BRAWL]);
  await page.reload();
  await waitForAppReady(page);
  await dismissColdStart(page);
}

test("My Decks labels a saved brawl deck Commander", async ({ page }) => {
  await seedOld(page);
  const facts = page.locator(".deck-card", { hasText: OLD_BRAWL.name }).locator(".deck-card-facts");
  await expect(facts).toContainText("Commander, ");
  await expect(facts).not.toContainText("brawl");
});

test("Discard changes on a saved brawl deck keeps Commander", async ({ page }) => {
  await seedOld(page);
  await page.locator(".deck-card", { hasText: OLD_BRAWL.name }).locator(".deck-card-art").click();
  await expect(page.locator(".card-grid-container")).toBeVisible({ timeout: 10000 });
  // An edit, as drafts.spec makes it: add a card from Card Search.
  await navigateToTab(page, "Card Search");
  const name = page.locator('input[placeholder="bolt"]');
  await name.fill("bolt");
  await name.press("Enter");
  await page.locator(".results-table tbody tr", { hasText: "Lightning Bolt" })
    .getByRole("button", { name: /^Add to / }).click();
  await backToDeck(page);
  await expect(page.locator(".deck-unsaved:visible")).toHaveText("Unsaved");
  const sent = analyzeFormat(page);
  await deckMenuAction(page, "Discard changes");
  expect(await sent).toBe("commander");
});

// The import source's own format comes back as-is (Moxfield's, unmapped). Same body
// as the mock backend's import, but saying brawl.
async function importsAsBrawl(page) {
  await page.route("**/api/deck/import-url", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      name: "Mock Import",
      decklist: "Commander\n1 Atraxa, Praetors' Voice\nDeck\n1 Sol Ring\n1 Counterspell",
      sideboard: "1 Lightning Bolt",
      format: "brawl",
      source: "moxfield",
    }),
  }));
}

test.describe("a URL import that says brawl", () => {
  test.skip(({ isMobile }) => isMobile, "desktop flows, as import-considering");

  // An imported deck opens for review and asks the API nothing yet, so what counts is
  // the format the app keeps for it: that is what every later request sends.
  const storedFormats = (page) => page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k === "mtgweb:decks" || k.startsWith("mtgweb:draft:"))
      .map((k) => localStorage.getItem(k))
      .join("\n"));

  test("a new deck from it is kept as Commander", async ({ page }) => {
    await importsAsBrawl(page);
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
    await importNewDeck(page);
    await expect.poll(() => storedFormats(page)).toContain('"name":"Mock Import","format":"commander"');
    expect(await storedFormats(page)).not.toContain('"format":"brawl"');
  });

  test("importing it over an open deck keeps Commander", async ({ page }) => {
    await importsAsBrawl(page);
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await deckMenuAction(page, "Import cards");
    await page.locator('.icm-tabs [role="tab"]', { hasText: "From URL" }).click();
    await page.locator(".icm-panel input").fill("https://moxfield.com/decks/abc");
    await page.locator(".icm-foot button", { hasText: "Import" }).click();
    await page.locator(".icm-confirm button", { hasText: "Replace deck" }).click();
    await expect(page.locator(".deck-title")).toContainText("Mock Import");
    // The imported list is kept (as the deck or its unsaved draft) with Commander.
    const imported = () => page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k === "mtgweb:decks" || k.startsWith("mtgweb:draft:"))
        .flatMap((k) => { const v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v : [v]; })
        .filter((d) => (d?.decklist_text || "").includes("Counterspell"))
        .map((d) => d.format));
    await expect.poll(imported).not.toEqual([]);
    expect(await imported()).toEqual(expect.arrayContaining(["commander"]));
    expect(await imported()).not.toContain("brawl");
  });
});

test("a share link that says fmt=brawl opens as Commander", async ({ page }) => {
  const deckStr = `Commander\n1 ${TEST_COMMANDER}\n\nDeck\n${TEST_DECK_TEXT}`;
  const encoded = Buffer.from(deckStr, "utf8").toString("base64");
  const sent = analyzeFormat(page);
  await page.goto(`/?deck=${encodeURIComponent(encoded)}&fmt=brawl&cmd=${encodeURIComponent(TEST_COMMANDER)}`);
  expect(await sent).toBe("commander");
});
