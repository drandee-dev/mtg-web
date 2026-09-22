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

  test("open a commander page shows art, oracle text and chips, then builds with strategy", async ({ page }) => {
    await page.getByRole("listitem", { name: "Atraxa, Praetors' Voice" }).click();

    await expect(page.getByRole("heading", { name: "Atraxa, Praetors' Voice" })).toBeVisible();
    await expect(page.getByText(/Flying, vigilance, deathtouch/)).toBeVisible();
    await expect(page.getByText("Superfriends counters")).toBeVisible();
    await expect(page.getByText("Moderate")).toBeVisible();

    await page.getByRole("button", { name: "Build with strategy" }).click();

    // Lands in the generator, pre-seeded with the commander — no second click,
    // no re-typing a name the user already chose on the commander page. It
    // skips straight to building (the "known commander" door's own flow) and
    // ends on the Review screen for that commander.
    await expect(page.getByRole("heading", { name: "Atraxa, Praetors' Voice" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Open in deck view →" })).toBeVisible();
  });
});
