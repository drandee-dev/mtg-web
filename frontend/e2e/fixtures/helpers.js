// Shared page helpers for E2E tests.
// Centralizes common actions so individual tests stay focused on assertions.

import { TEST_DECK_TEXT, TEST_COMMANDER } from "./test-data.js";

export async function waitForAppReady(page) {
  await page.waitForSelector(".app", { timeout: 15000 });
  // Wait for either the app to load or the cold-start overlay to appear
  await Promise.race([
    page.waitForSelector('[role="tabpanel"]', { timeout: 15000 }),
    page.waitForSelector(".cold-start-overlay", { timeout: 15000 }),
  ]);
}

export async function dismissColdStart(page) {
  const overlay = page.locator(".cold-start-overlay");
  if (await overlay.isVisible({ timeout: 2000 }).catch(() => false)) {
    // Cold start overlay is present — wait for it to disappear or skip
    // In test mode the backend may not be running, so we just wait briefly
    await overlay.waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
  }
}

// The desktop toolbar and the mobile BottomNav both render role="tab" buttons but
// with different labels (e.g. "Analyze & Build" vs "Build"). Click whichever tab is
// actually visible for the current viewport.
const TAB_ALIASES = {
  "My Decks": ["My Decks", "Decks"],
  "Analyze & Build": ["Analyze & Build", "Build"],
  "Rules": ["Rules"],
  "Card Search": ["Card Search", "Cards"],
};

export async function navigateToTab(page, tabName) {
  const names = TAB_ALIASES[tabName] || [tabName];
  for (const n of names) {
    const loc = page.locator('[role="tab"]:visible', { hasText: n });
    if (await loc.count() > 0) { await loc.first().click(); return; }
  }
  throw new Error(`Tab not found for "${tabName}"`);
}

export async function fillDeckEditor(page, deckText = TEST_DECK_TEXT, commander = "") {
  await navigateToTab(page, "Analyze & Build");

  if (commander) {
    const cmdInput = page.locator('input[placeholder*="commander" i], input[placeholder*="Commander" i]').first();
    if (await cmdInput.isVisible()) {
      await cmdInput.fill(commander);
      // Wait for commander autocomplete and select first result
      const suggestion = page.locator(".commander-suggestions li, .commander-results li, [class*=commander] li").first();
      if (await suggestion.isVisible({ timeout: 3000 }).catch(() => false)) {
        await suggestion.click();
      }
    }
  }

  const textarea = page.locator("textarea").first();
  await textarea.fill(deckText);
}

// Load a deck through the app's share-link mechanism (?deck=<base64>) so the deck
// view opens already populated — avoids the search/Edit-text UI dance. Uses the same
// UTF-8 base64 encoding the app produces for share URLs.
export async function loadSharedDeck(page, deckText, commander = "") {
  const header = commander ? `Commander\n1 ${commander}\n\nDeck\n` : "";
  const encoded = Buffer.from(`${header}${deckText}`, "utf8").toString("base64");
  const q = new URLSearchParams({ deck: encoded, fmt: "commander" });
  if (commander) q.set("cmd", commander);
  await page.goto(`/?${q.toString()}`);
  await waitForAppReady(page);
  await dismissColdStart(page);
}

// Open the deck view's ⋯ menu (the visible one for this viewport) and click an item.
// On mobile the deck-nav ⋯ sits beneath the fixed global toolbar, so a positional
// click can be intercepted by the toolbar avatar — dispatchEvent targets the button
// directly and reliably opens the menu. The menu list renders clear of the overlay.
export async function deckMenuAction(page, itemText) {
  await page.locator(".more-menu-btn:visible").first().dispatchEvent("click");
  await page.locator(`.more-menu-item:has-text("${itemText}")`).click();
}

export async function seedLocalDecks(page, decks) {
  await page.evaluate((d) => {
    localStorage.setItem("mtgweb:decks", JSON.stringify(d));
  }, decks);
}

export async function clearLocalStorage(page) {
  await page.evaluate(() => localStorage.clear());
}

export async function captureScreenshot(page, name) {
  await page.waitForTimeout(500); // let animations settle
  return page.screenshot({ fullPage: true, path: undefined });
}
