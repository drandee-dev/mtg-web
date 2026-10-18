// Visual pass I7: hover styles apply only where something can hover. The build
// (vite.config.js, hover-only) moves every :hover rule into a
// (hover: hover) and (pointer: fine) block. These cases read the stylesheet the
// browser actually loaded, so a rule the plugin missed shows up here, and they tap
// on a phone to see that a tapped control is not left looking hovered.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, openDeckSection, addCardField } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

const desktopOnly = (testInfo) => test.skip(testInfo.project.name !== "desktop-chrome", "sizes its own viewport");

// Every style rule that names :hover, split by whether a hover media block holds it.
function countHoverRules(page) {
  return page.evaluate(() => {
    const out = { guarded: 0, bare: [] };
    const walk = (rules, guarded) => {
      for (const r of rules) {
        if (r.cssRules && r.media) walk(r.cssRules, guarded || /\(hover:\s*hover\)/.test(r.media.mediaText));
        else if (r.cssRules && !r.selectorText) walk(r.cssRules, guarded); // @supports, @layer
        else if (r.selectorText && r.selectorText.includes(":hover")) {
          if (guarded) out.guarded++;
          else out.bare.push(r.selectorText);
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try { walk(sheet.cssRules, false); } catch { /* a cross-origin sheet (fonts) */ }
    }
    return out;
  });
}

test.describe("hover only where hover exists", () => {
  test("every :hover rule in the built CSS sits in a hover block", async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const { guarded, bare } = await countHoverRules(page);
    expect(bare, "unguarded :hover rules").toEqual([]);
    // The source has about 90 :hover lines; a plugin that matched nothing would also have 0 bare.
    expect(guarded).toBeGreaterThan(80);
  });

  test("a mouse still hovers: the top bar's Rules link changes colour", async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    const link = page.locator(".gt-link", { hasText: "Rules" });
    const colour = () => link.evaluate((el) => getComputedStyle(el).color);
    await page.mouse.move(5, 500);
    const before = await colour();
    await link.hover();
    await expect.poll(colour).not.toBe(before);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true });

    test("a tapped button is not left hovered", async ({ page }, testInfo) => {
      desktopOnly(testInfo);
      await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
      await openDeckSection(page, "Improve");
      const head = page.locator(".dg-head");
      const bg = () => head.evaluate((el) => getComputedStyle(el).backgroundColor);
      const before = await bg();
      await head.tap();
      await page.waitForTimeout(300); // past the 0.15s background transition
      expect(await bg()).toBe(before);
    });

    test("what a hover used to reveal is showing without one", async ({ page }, testInfo) => {
      desktopOnly(testInfo);
      await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
      const rename = page.locator(".dh-rename");
      expect(await rename.count(), "no rename pencil on the page").toBeGreaterThan(0);
      expect(await rename.first().evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
      const field = addCardField(page);
      await field.fill("sol");
      const add = page.locator(".deck-input-result-add").first();
      await expect(add).toBeAttached({ timeout: 10000 });
      expect(await add.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
      // Showing it means the longest row has to fit it: "+ Add" used to be cut off, unseen.
      const cut = await page.locator(".deck-input-result-add").evaluateAll((els) =>
        els.filter((el) => el.getBoundingClientRect().right > el.closest(".deck-input-results").getBoundingClientRect().right).length);
      expect(cut, "rows whose + Add runs past the results list").toBe(0);
    });
  });
});
