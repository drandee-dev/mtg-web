// 400% zoom and forced colours (audit job 6.7). At 400% a 1280px window is 320 CSS
// pixels wide; Windows high contrast drops backgrounds and box-shadows.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, openAddress, openDeckSection } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

const desktopOnly = (testInfo) => test.skip(testInfo.project.name !== "desktop-chrome", "sets its own viewport");

test("at 320px the top bar's account button is on screen on every main page", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of ["/", "/new", "/commanders", "/cards"]) {
    await openAddress(page, path);
    const avatar = page.locator(".gt-avatar");
    await expect(avatar, path).toBeVisible();
    const box = await avatar.boundingBox();
    expect(box.x + box.width, `${path}: the account button ends past the screen`).toBeLessThanOrEqual(320);
    // Ask is in the bottom bar here (audit job 6.6), and is the only Ask on screen.
    await expect(page.getByRole("button", { name: "Ask", exact: true })).toHaveCount(1);
    await expect(page.locator(".bottom-nav").getByRole("button", { name: "Ask", exact: true })).toBeVisible();
  }
});

test("at 320px each Suggested changes list button holds its label and count", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await page.setViewportSize({ width: 320, height: 640 });
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  await openDeckSection(page, "Improve");
  const buttons = page.locator(".insp-sources button");
  await expect(buttons).toHaveCount(3);
  await expect(buttons.first()).toContainText("For this commander");
  const overflow = await buttons.evaluateAll((els) => els
    .filter((b) => b.scrollWidth > b.clientWidth + 1)
    .map((b) => `${b.textContent.trim()}: ${b.scrollWidth} in ${b.clientWidth}`));
  expect(overflow).toEqual([]);
  // The count is not drawn over the label.
  const overlap = await buttons.first().evaluate((b) => {
    const pill = b.querySelector(".insp-source-count").getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(b.firstChild);
    return [...range.getClientRects()].some((r) => r.right > pill.left + 1 && r.left < pill.right - 1
      && r.bottom > pill.top + 1 && r.top < pill.bottom - 1);
  });
  expect(overlap, "the count sits over the label").toBe(false);
});

test("in forced colours the open tab and the chosen list have an edge", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await page.emulateMedia({ forcedColors: "active" });
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  await openDeckSection(page, "Improve");
  const width = (loc, side) => loc.evaluate((el, s) => parseFloat(getComputedStyle(el)[`border${s}Width`]), side);
  const open = page.locator('#deck-sections [role="tab"][aria-selected="true"]');
  expect(await width(open, "Bottom"), "the open tab's underline").toBeGreaterThanOrEqual(2);
  const lists = page.locator(".insp-sources button");
  await expect(lists).toHaveCount(3);
  expect(await width(lists.nth(1), "Top"), "a list button's edge").toBeGreaterThanOrEqual(1);
  expect(await width(lists.nth(0), "Top"), "the chosen list's edge").toBeGreaterThanOrEqual(2);
});
