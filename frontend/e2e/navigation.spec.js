import { test, expect } from "./fixtures/test-base.js";
import { waitForAppReady, dismissColdStart, navigateToTab, openNewDeck, backToDeck, seedLocalDecks } from "./fixtures/helpers.js";
import { TEST_DECK_STORAGE } from "./fixtures/test-data.js";

const atHome = (url) => url.pathname === "/" && url.search === "";

test.describe("Navigation & Layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
  });

  test("app loads and shows My Decks tab by default", async ({ page }) => {
    await expect(page.locator("main#main-content")).toBeVisible();
    // My Decks is the default tab
    await expect(page).toHaveURL(atHome);
  });

  test("all four places are navigable and render content", async ({ page }) => {
    const tabs = ["Commanders", "Rules", "Card Search", "My Decks"];
    for (const tabName of tabs) {
      await navigateToTab(page, tabName);
      await expect(page.locator("main#main-content")).toBeVisible();
      await expect(page.locator("main")).not.toBeEmpty();
    }
  });

  test("each place has its own address", async ({ page }) => {
    await navigateToTab(page, "Rules");
    await expect(page).toHaveURL(/\/rules$/);

    await navigateToTab(page, "Card Search");
    await expect(page).toHaveURL(/\/cards$/);

    await navigateToTab(page, "Commanders");
    await expect(page).toHaveURL(/\/commanders$/);

    await navigateToTab(page, "My Decks");
    await expect(page).toHaveURL(atHome);
  });

  test("a cold load of /rules opens Rules, and reload stays there", async ({ page }) => {
    await page.goto("/rules");
    await waitForAppReady(page);
    await expect(page.locator(".rules-input-row input")).toBeVisible();
    await expect(page).toHaveURL(/\/rules$/);

    await page.reload();
    await waitForAppReady(page);
    await expect(page.locator(".rules-input-row input")).toBeVisible();
    await expect(page).toHaveURL(/\/rules$/);
  });

  test("an old ?tab= link is replaced by its path", async ({ page }) => {
    // The hash rides along: a sign-in link returns with its token in one.
    await page.goto("/?tab=rules#x=1");
    await waitForAppReady(page);
    await expect(page.locator(".rules-input-row input")).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === "/rules" && url.search === "" && url.hash === "#x=1");

    // Replaced, not stacked: Back leaves for the page before the old link.
    await page.goBack();
    await expect(page).toHaveURL(atHome);
  });

  // The bars (UX overhaul job 2.1): four places as real links, New deck and
  // the account menu beside them as actions.
  const mainNav = (page) => page.locator('nav[aria-label="Main"]:visible');

  test("the bar's places are real links, and the current one is marked", async ({ page }) => {
    const links = await mainNav(page).getByRole("link")
      .evaluateAll((as) => as.map((a) => [a.textContent.trim(), a.getAttribute("href")]));
    // The phone's bar carries New deck as a fifth item; the places are the same four.
    expect(links.filter(([label]) => label !== "New deck"))
      .toEqual([["Decks", "/"], ["Commanders", "/commanders"], ["Cards", "/cards"], ["Rules", "/rules"]]);
    await expect(mainNav(page).locator('[aria-current="page"]')).toHaveText("Decks");

    await navigateToTab(page, "Rules");
    await expect(mainNav(page).locator('[aria-current="page"]')).toHaveText("Rules");
    await expect(page.getByText("Analyze & Build")).toHaveCount(0);
  });

  test("a place opened in a new browser tab lands there, and this one stays put", async ({ page, context, isMobile }) => {
    test.skip(isMobile, "a modifier click is a desktop gesture");
    const [opened] = await Promise.all([
      context.waitForEvent("page"),
      mainNav(page).getByRole("link", { name: "Rules", exact: true }).click({ modifiers: ["ControlOrMeta"] }),
    ]);
    await opened.waitForSelector("main#main-content");
    await expect(opened).toHaveURL(/\/rules$/);
    await expect(opened.locator(".rules-input-row input")).toBeVisible();
    await expect(page).toHaveURL(atHome);
  });

  test("New deck opens the empty editor from any place, and a deck lights Decks", async ({ page, isMobile }) => {
    await seedLocalDecks(page, [TEST_DECK_STORAGE]);
    await page.reload();
    await waitForAppReady(page);

    await navigateToTab(page, "Rules");
    await openNewDeck(page);
    await expect(page).toHaveURL((url) => url.pathname === "/new");
    await expect(page.locator(".empty-deck")).toBeVisible();
    // /new is not one of the places. The phone's bar marks its New deck item.
    await expect(mainNav(page).locator('[aria-current="page"]')).toHaveText(isMobile ? ["New deck"] : []);

    await navigateToTab(page, "My Decks");
    await page.locator(".deck-card .deck-card-art").first().click();
    await expect(page).toHaveURL(new RegExp(`/decks/${TEST_DECK_STORAGE.id}$`));
    await expect(mainNav(page).locator('[aria-current="page"]')).toHaveText("Decks");
  });

  test("the account menu is sign in and feedback, with nothing about decks", async ({ page }) => {
    await page.getByRole("button", { name: "Account menu" }).click();
    const menu = page.getByRole("group", { name: "Account" });
    await expect(page.getByRole("button", { name: "Account menu" })).toHaveAttribute("aria-expanded", "true");
    await expect(menu.getByRole("button").first()).toHaveText("Sign in or settings");
    await expect(menu).not.toContainText(/New Deck|Import|Paste|Recent|Search/i);

    // Escape from a row inside it closes it and hands focus back to its button.
    await menu.getByRole("button").first().focus();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Account menu" })).toBeFocused();
  });

  test("the bars keep readable labels in the Light theme", async ({ page }) => {
    await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
    const color = (locator) => locator.evaluate((el) => getComputedStyle(el).color);
    // The theme did switch: the page's own text is dark now.
    expect(await color(page.locator("main#main-content"))).toBe("rgb(26, 26, 30)");
    // The bars stay dark, so their labels stay light.
    expect(await color(mainNav(page).getByRole("link", { name: "Rules", exact: true }))).toBe("rgb(176, 180, 190)");
    expect(await color(page.locator(".gt-brand"))).toBe("rgb(237, 237, 240)");
  });

  test("New deck over a deck that is not saved yet asks first, and Cancel keeps it", async ({ page }) => {
    const asked = [];
    page.on("dialog", (d) => { asked.push(d.type()); d.dismiss().catch(() => {}); });
    await openNewDeck(page);
    // No commander, so nothing saves it: the card lives only in the editor.
    await navigateToTab(page, "Card Search");
    const name = page.locator('input[placeholder="bolt"]');
    await name.fill("bolt");
    await name.press("Enter");
    await page.locator(".results-table tbody tr", { hasText: "Lightning Bolt" })
      .getByRole("button", { name: "+ Add" }).click();
    await backToDeck(page);
    const bolt = page.locator('.card-grid-container [aria-label*="Lightning Bolt"]');
    await expect(bolt.first()).toBeAttached();
    await page.evaluate(() => { window.__samePage = true; });

    await openNewDeck(page);
    expect(asked).toEqual(["confirm"]);
    await expect(page).toHaveURL((url) => url.pathname === "/new");
    await expect(bolt.first()).toBeAttached();
    // The link's own address was not followed: this is still the same page load.
    expect(await page.evaluate(() => window.__samePage)).toBe(true);
  });

  test("Cards names the deck it adds to and links back to it, only when one is open", async ({ page }) => {
    await navigateToTab(page, "Card Search");
    await expect(page.locator(".cards-deck")).toHaveCount(0);

    await seedLocalDecks(page, [TEST_DECK_STORAGE]);
    await page.goto("/");
    await waitForAppReady(page);
    await page.locator(".deck-card .deck-card-art").first().click();
    await expect(page.locator(".card-grid-container")).toBeVisible();
    await navigateToTab(page, "Card Search");
    await expect(page.locator(".cards-deck")).toContainText(`Adding to ${TEST_DECK_STORAGE.name}`);
    await expect(page.locator(".cards-deck-back")).toHaveAttribute("href", `/decks/${TEST_DECK_STORAGE.id}`);
    await backToDeck(page);
    await expect(page).toHaveURL(new RegExp(`/decks/${TEST_DECK_STORAGE.id}$`));
    await expect(page.locator(".card-grid-container")).toBeVisible();
  });

  test("visual: landing page layout", async ({ page }) => {
    await expect(page).toHaveScreenshot("landing.png", { fullPage: true });
  });
});
