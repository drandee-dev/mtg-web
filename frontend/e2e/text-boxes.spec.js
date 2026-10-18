// Text boxes fit their job (visual pass job 8). A box is as tall as what is in it,
// between a floor and a ceiling counted in lines, and a pasted list is monospace
// while prose is not. Sizes are read in lines (1lh of the box's own font), so the
// checks do not depend on the font that happened to load.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, openDeckSection, deckMenuAction, openAddress, newDeckDoor } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

const list = (n) => Array.from({ length: n }, (_, i) => `1 Card Number ${i + 1}`).join("\n");

// The box's numbers: its height in lines, whether it scrolls inside, its font.
async function read(locator) {
  return locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;visibility:hidden;height:1lh;font:${cs.font};`;
    document.body.appendChild(probe);
    const lh = probe.getBoundingClientRect().height;
    probe.remove();
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    return {
      lines: (el.getBoundingClientRect().height - pad) / lh,
      scrolls: el.scrollHeight > el.clientHeight + 1,
      mono: /mono|menlo|consolas/i.test(cs.fontFamily),
      px: parseFloat(cs.fontSize),
      height: el.getBoundingClientRect().height,
    };
  });
}

test.describe("Text boxes", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "desktop browser; the 16px rule has its own case in layout-widths");
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("this browser can size a box to its content", async ({ page }) => {
    await page.goto("/");
    expect(await page.evaluate(() => CSS.supports("field-sizing", "content"))).toBe(true);
  });

  test("Describe holds 600 characters without scrolling, in the page's font", async ({ page }) => {
    await openAddress(page, "/new");
    const box = page.locator("#gen-describe");
    const empty = await read(box);
    expect(empty.lines, "an empty Describe is 3 lines").toBeGreaterThanOrEqual(2.9);
    expect(empty.lines).toBeLessThanOrEqual(3.6);
    expect(empty.mono, "prose is not monospace").toBe(false);
    await box.fill("An elf deck that floods the board and wins with one huge attack. ".repeat(10).slice(0, 600));
    const full = await read(box);
    expect(full.scrolls, "600 characters scroll inside the box").toBe(false);
    expect(full.lines).toBeLessThanOrEqual(10.6);
  });

  test("a pasted list: 8 lines empty, shown whole at 10 lines, capped at 60% of the screen at 100", async ({ page }) => {
    await openAddress(page, "/new");
    await newDeckDoor(page, "Paste or import").click();
    const box = page.locator("#nd-paste");
    const empty = await read(box);
    expect(empty.lines, "empty").toBeGreaterThanOrEqual(7.9);
    expect(empty.mono, "a decklist is monospace").toBe(true);
    await box.fill(list(10));
    expect((await read(box)).scrolls, "10 lines scroll inside the box").toBe(false);
    await box.fill(list(100));
    const long = await read(box);
    expect(long.scrolls, "100 lines should stop at the ceiling").toBe(true);
    expect(long.height, "ceiling").toBeLessThanOrEqual(0.6 * 900 + 1);
    expect(long.lines).toBeLessThanOrEqual(40.6);
  });

  test("Edit as text follows the same rule", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await deckMenuAction(page, "Edit as text");
    const editor = page.locator(".deck-text-editor");
    await expect(editor).toBeVisible();
    await editor.fill(list(100));
    const e = await read(editor);
    expect(e.scrolls).toBe(true);
    expect(e.height).toBeLessThanOrEqual(0.6 * 900 + 1);
    await editor.fill(list(10));
    expect((await read(editor)).scrolls).toBe(false);
  });

  test("the Import cards box follows the same rule", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await deckMenuAction(page, "Import cards");
    const modal = page.locator(".icm-body textarea");
    const empty = await read(modal);
    expect(empty.lines, "empty import box").toBeGreaterThanOrEqual(7.7);
    expect(empty.px, "the import box's text is the body size").toBeGreaterThanOrEqual(14.9);
    await modal.fill(list(10));
    expect((await read(modal)).scrolls, "10 lines scroll inside the import box").toBe(false);
    await modal.fill(list(100));
    const long = await read(modal);
    expect(long.scrolls).toBe(true);
    expect(long.height).toBeLessThanOrEqual(0.6 * 900 + 1);
  });

  test("the goals note is 2 lines when empty", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openDeckSection(page, "Improve");
    await page.locator(".dg-head").click();
    const note = page.locator(".dg-note");
    await expect(note).toBeVisible();
    const r = await read(note);
    expect(r.lines).toBeGreaterThanOrEqual(1.9);
    expect(r.lines, "the empty note is 2 lines or less").toBeLessThanOrEqual(2.6);
  });
});
