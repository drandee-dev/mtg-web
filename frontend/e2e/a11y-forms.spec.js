// Forms and dialogs (audit job 6.4, part A). The audit's accessibility table,
// the lines about filling a form in: a problem stays beside the form, the
// account panels are dialogs, a toast waits while it is being read, the custom
// budget saves without an Enter key, fields have names, and "Load file" takes
// keyboard focus.
import { test, expect } from "./fixtures/test-base.js";
import { waitForAppReady, dismissColdStart, openNewDeck, loadSharedDeck, openDeckSection, navigateToTab } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

const menuButton = (page) => page.locator('[aria-label="Account menu"]:visible').first();

// The sign-in form needs a Supabase project in the build (frontend/.env); a
// build without one shows "Local mode" and has nothing to test here.
async function openSignIn(page) {
  await page.goto("/");
  await waitForAppReady(page);
  await dismissColdStart(page);
  await menuButton(page).click();
  await page.locator(".avp-row", { hasText: /Sign in or settings|Account settings/ }).click();
  const panel = page.locator(".account-panel");
  await expect(panel).toBeVisible();
  test.skip(!(await panel.locator("form").count()), "no Supabase project in this build");
  return panel;
}

test("the account panel is a dialog: focus moves in and stays in, Escape closes it, focus goes back to the menu", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard");
  const panel = await openSignIn(page);
  await expect(page.getByRole("dialog", { name: "Sign in" })).toBeVisible();
  await expect(panel).toHaveAttribute("aria-modal", "true");
  const inside = () => panel.evaluate((el) => el.contains(document.activeElement));
  expect(await inside(), "focus moved into the panel").toBe(true);
  // Backwards from the first control wraps to the last, forwards from there to the first.
  await page.keyboard.press("Shift+Tab");
  expect(await inside(), "Shift+Tab stays inside").toBe(true);
  await page.keyboard.press("Tab");
  expect(await inside(), "Tab stays inside").toBe(true);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(menuButton(page)).toBeFocused();
});

test("a sign-in problem stays beside the form, tied to its field, until it is fixed", async ({ page }) => {
  const panel = await openSignIn(page);
  const email = panel.getByRole("textbox", { name: "Email" });
  const password = panel.getByLabel("Password", { exact: true });
  await panel.locator('button[type="submit"]').click();
  const problem = panel.getByRole("alert");
  await expect(problem).toHaveText("Enter your email.");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAttribute("aria-describedby", "account-error");
  await expect(password).not.toHaveAttribute("aria-invalid", "true");
  // It used to be a toast that left after 3.5 s.
  await expect(page.locator(".toast")).toHaveCount(0);
  await page.waitForTimeout(4500);
  await expect(problem).toBeVisible();
  // Typing clears it; the next problem is the password's.
  await email.fill("someone@example.com");
  await expect(problem).toHaveCount(0);
  await panel.locator('button[type="submit"]').click();
  await expect(panel.getByRole("alert")).toHaveText("Enter your password.");
  await expect(password).toHaveAttribute("aria-invalid", "true");
  await expect(email).not.toHaveAttribute("aria-invalid", "true");
  // Switching to another way of signing in does not carry the problem over.
  await panel.getByRole("button", { name: "Use magic link instead" }).click();
  await expect(panel.getByRole("alert")).toHaveCount(0);
});

test("a toast waits while the pointer is on it, then leaves", async ({ page, isMobile }) => {
  test.skip(isMobile, "hover");
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  await openDeckSection(page, "Improve");
  await page.locator('.opt-card[data-source="rec"] .chg-apply').first().click();
  const toast = page.locator(".toast");
  await expect(toast.locator(".toast-action")).toHaveText("Undo"); // its clock is 6.5 s
  await toast.hover();
  await page.waitForTimeout(8000);
  await expect(toast, "still there while hovered, past its 6.5 s").toBeVisible();
  await page.mouse.move(5, 5);
  await expect(toast).toHaveCount(0, { timeout: 9000 });
});

test("a custom budget saves when the field is left, with no Enter key", async ({ page }) => {
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  await openDeckSection(page, "Improve");
  await page.locator(".dg-head").click();
  await page.getByLabel("Custom budget ceiling in dollars").fill("75");
  await page.locator(".dg-head").click(); // Done: the field loses focus
  await expect(page.locator(".dg-line", { hasText: "Budget" })).toContainText("Up to $75");
});

test("the Cards and Commanders search fields have names", async ({ page }) => {
  await page.goto("/");
  await waitForAppReady(page);
  await dismissColdStart(page);
  await navigateToTab(page, "Cards");
  for (const name of ["Name", "Type", "Oracle text (regex)", "Color identity", "Max CMC"]) {
    await expect(page.getByLabel(name, { exact: true }), name).toBeEditable();
  }
  await navigateToTab(page, "Commanders");
  await expect(page.getByRole("textbox", { name: "Search commanders by name" })).toBeVisible();
});

test("Load file takes keyboard focus", async ({ page }) => {
  await page.goto("/");
  await waitForAppReady(page);
  await dismissColdStart(page);
  await openNewDeck(page);
  await page.locator(".nd-door", { hasText: "Build from my collection" }).click();
  const file = page.getByLabel("Load a collection file");
  await file.focus();
  await expect(file).toBeFocused(); // a display:none input cannot be
});
