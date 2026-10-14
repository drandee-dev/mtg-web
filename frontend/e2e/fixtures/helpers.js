// Shared page helpers for E2E tests.
// Centralizes common actions so individual tests stay focused on assertions.

export async function waitForAppReady(page) {
  await page.waitForSelector(".app", { timeout: 15000 });
  // The app renders immediately now (no blocking overlay) — just wait for a tab panel
  await page.waitForSelector("main#main-content", { timeout: 15000 });
}

// Kept for spec compatibility: the blocking cold-start overlay was replaced by a
// non-blocking .server-banner, so there is nothing to dismiss — but if the banner
// is up (mock health not answered yet), wait briefly for it to clear.
export async function dismissColdStart(page) {
  const banner = page.locator(".server-banner");
  if (await banner.isVisible().catch(() => false)) {
    await banner.waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
  }
}

// The four places are links in the top bar (desktop) and the bottom bar
// (phone), under the same labels. The older names specs use still resolve.
const PLACE_LABELS = {
  "My Decks": "Decks",
  "Decks": "Decks",
  "Commanders": "Commanders",
  "Card Search": "Cards",
  "Cards": "Cards",
  "Rules": "Rules",
};

export async function navigateToTab(page, tabName) {
  const label = PLACE_LABELS[tabName];
  // The deck editor is not a place: reach it with openNewDeck, backToDeck, a
  // deck's tile or its address.
  if (!label) throw new Error(`No place called "${tabName}"`);
  await page.locator('nav[aria-label="Main"]:visible').getByRole("link", { name: label, exact: true }).click();
}

// "New deck" in whichever bar is showing: the New deck screen at /new.
export async function openNewDeck(page) {
  await page.locator(".gt-new:visible, .bn-new:visible").first().click();
}

// A door of the New deck screen, by its label.
export const newDeckDoor = (page, name) => page.locator(".nd-door", { hasText: name });

// A new deck from a pasted list: the "Paste or import" door. The deck opens
// saved, at its own address, with the upgrade guide over it.
export async function pasteNewDeck(page, text) {
  await openNewDeck(page);
  await newDeckDoor(page, "Paste or import").click();
  await page.locator("#nd-paste").fill(text);
  await page.getByRole("button", { name: "Create the deck →" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/decks/"));
}

// The same door's other half: a Moxfield or Archidekt link.
export async function importNewDeck(page, url = "https://archidekt.com/decks/12345") {
  await openNewDeck(page);
  await newDeckDoor(page, "Paste or import").click();
  await page.locator("#nd-url").fill(url);
  await page.getByRole("button", { name: "Import the deck →" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/decks/"));
}

// The commander door as far as its choice: "Build the 99" or "Start from scratch".
export async function pickNewDeckCommander(page, query = "atraxa", name = "Atraxa") {
  await openNewDeck(page);
  await page.locator("#gen-cmd").fill(query);
  await page.locator(".gen-candidate", { hasText: name }).click();
}

// From Cards, the link back to the deck the Add button adds to.
export async function backToDeck(page) {
  await page.locator(".cards-deck-back").click();
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

// A cold load of an address, as a bookmark or a second browser tab would make.
export async function openAddress(page, path) {
  await page.goto(path);
  await waitForAppReady(page);
  await dismissColdStart(page);
}

// Open the deck view's ⋯ menu (the visible one for this viewport) and click an item.
export async function deckMenuAction(page, itemText) {
  await page.locator(".more-menu-btn:visible").first().click();
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

export async function captureScreenshot(page) {
  await page.waitForTimeout(500); // let animations settle
  return page.screenshot({ fullPage: true, path: undefined });
}
