import { test, expect } from "./fixtures/test-base.js";
import { waitForAppReady, dismissColdStart, navigateToTab } from "./fixtures/helpers.js";

test.describe("Commanders", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
    await navigateToTab(page, "Commanders");
  });

  test("lists commanders from the directory", async ({ page }) => {
    await expect(page.getByRole("listitem")).toHaveCount(2, { timeout: 10000 });
    await expect(page.getByText(/2 commanders/)).toBeVisible();
  });

  test("search filters by name", async ({ page }) => {
    await page.locator('input[placeholder*="Search by name" i]').fill("Atraxa");
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("listitem", { name: "Lightning Bolt" })).toHaveCount(0);
  });

  test("color filter narrows to a subset of the selected identity", async ({ page }) => {
    // R-only: Lightning Bolt (R) matches, Atraxa (WUBG) does not.
    await page.getByRole("button", { name: "Filter by R" }).click();
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("listitem", { name: "Atraxa, Praetors' Voice" })).toHaveCount(0);
  });

  test("open a commander page shows art, oracle text and chips, then links to a new deck with it picked", async ({ page }) => {
    await expect(page).toHaveURL(/\/commanders$/);
    await page.getByRole("listitem", { name: "Atraxa, Praetors' Voice" }).click();

    await expect(page).toHaveURL(/\/commanders\/atraxa-praetors-voice$/);
    await expect(page.getByRole("heading", { name: "Atraxa, Praetors' Voice" })).toBeVisible();
    await expect(page.getByText(/Flying, vigilance, deathtouch/)).toBeVisible();
    await expect(page.getByText("Superfriends counters")).toBeVisible();
    await expect(page.getByText("Moderate")).toBeVisible();

    // One link, where there were two buttons. It lands on the New deck screen
    // with the commander picked: no re-typing a name already chosen here. The
    // choice between a build and a blank deck is made there, and nothing is
    // built on the way (new-deck.spec.js counts the requests).
    await page.getByRole("link", { name: "Build a deck with this commander" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/new");
    await expect(page.getByRole("heading", { name: "Atraxa, Praetors' Voice" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /^Build the 99/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Start from scratch/ })).toBeVisible();
    // Back returns to the commander's page.
    await page.goBack();
    await expect(page).toHaveURL(/\/commanders\/atraxa-praetors-voice$/);
  });

  test("a commander page has its own address: Back, cold load and an old link", async ({ page }) => {
    const heading = page.getByRole("heading", { name: "Atraxa, Praetors' Voice" });
    await page.getByRole("listitem", { name: "Atraxa, Praetors' Voice" }).click();
    await expect(heading).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/commanders$/);
    await expect(page.getByRole("listitem")).toHaveCount(2);

    await page.goto("/commanders/atraxa-praetors-voice");
    await waitForAppReady(page);
    await expect(heading).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/commanders\/atraxa-praetors-voice$/);

    await page.goto("/?tab=commanders&slug=atraxa-praetors-voice");
    await waitForAppReady(page);
    await expect(heading).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/commanders\/atraxa-praetors-voice$/);
  });

  // A set name is one unbroken line, and at phone width it used to hold its
  // column open: three columns ran past the screen and the whole page scrolled
  // sideways (501px in a 375px viewport on production, 2026-10-13).
  test("a long set name in the printings does not make the page scroll sideways", async ({ page }) => {
    const prints = ["Commander Anthology Volume II", "Commander 2016", "Phyrexia: All Will Be One Promos", "Secret Lair Drop"]
      .map((set_name, i) => ({ set: `S${i}`, set_name, cn: String(i), released: "2020-01-01", image: "", thumb: "", price_usd: 5 + i }));
    await page.route("**/api/cards/prints**", (r) =>
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ name: "Atraxa, Praetors' Voice", prints }) }));

    await page.getByRole("listitem", { name: "Atraxa, Praetors' Voice" }).click();
    await expect(page.locator(".cmdr-print")).toHaveCount(4);

    const { scrollWidth, clientWidth } = await page.evaluate(() => {
      const de = document.documentElement;
      return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth };
    });
    expect(clientWidth).toBeGreaterThan(0);
    expect(scrollWidth).toBe(clientWidth);
    // Every printing is still on the page, inside the screen.
    for (const tile of await page.locator(".cmdr-print").all()) {
      const box = await tile.boundingBox();
      expect(box.x + box.width).toBeLessThanOrEqual(clientWidth + 1);
    }
  });

  // F2: a partner-capable commander must stop at the partner step before its
  // choice (a Background can't lead alone). The shared mock's search never
  // returns a partner_kind, so this one answers it for the linked commander.
  test("the link from a partner-capable commander's page opens the partner step", async ({ page }) => {
    await page.route("**/api/commanders/search*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [{ name: "Atraxa, Praetors' Voice", partner_kind: "partner" }] }),
    }));
    let built = false;
    await page.route("**/api/deck/wizard/skeleton*", (route) => { built = true; return route.fallback(); });

    await page.getByRole("listitem", { name: "Atraxa, Praetors' Voice" }).click();
    await page.getByRole("link", { name: "Build a deck with this commander" }).click();

    await expect(page.locator("#gen-partner")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Go solo →" })).toBeVisible();
    expect(built).toBe(false);
  });
});
