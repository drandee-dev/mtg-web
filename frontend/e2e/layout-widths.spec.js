// Width gate (visual pass job 1). The older gate walked 1440, 390 and 360, so
// a bar that overflows between 700 and ~880px went through. These cases fail
// when a bar control is off screen, clipped, covered, or the page scrolls
// sideways at the in-between widths, and (with touch) when an input would make
// iOS zoom on focus.
//
// The bar and 16px cases that today's CSS cannot pass carry test.fail() naming
// the job that fixes them: Playwright reports an unexpected pass, so the mark
// must be deleted when the job lands. No fullPage screenshots here: they clear
// touch emulation and every number after one is wrong.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, openAddress, newDeckDoor, addCardField } from "./fixtures/helpers.js";

const WIDTHS = [360, 390, 700, 744, 768, 820, 899, 900, 1024, 1440, 1920];
const TOUCH_WIDTHS = [744, 768, 820];
const HEIGHT = 900;
// Today's bar overflows from 700 up to about 883px. Job 2 fixes it.
const BAR_BROKEN = [700, 744, 768, 820];

const SCREENS = ["/", "/new", "/commanders", "/cards", "/rules"];
const DECK = "1 Sol Ring\n1 Arcane Signet\n1 Command Tower";

const desktopOnly = (testInfo) => test.skip(testInfo.project.name !== "desktop-chrome", "sizes its own viewport");

// The bar showing at this width: the top bar from 700, the bottom bar below.
const BAR_CONTROLS = (w) => (w >= 700 ? ".global-toolbar a, .global-toolbar button" : ".bottom-nav a, .bottom-nav button");

async function barProblems(page, selector) {
  return page.evaluate((sel) => {
    const problems = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue; // not rendered at this width
      const name = (el.getAttribute("aria-label") || el.textContent || el.className).trim().slice(0, 24);
      if (r.left < -0.5 || r.right > window.innerWidth + 0.5) problems.push(`${name}: off screen (${Math.round(r.left)}-${Math.round(r.right)} of ${window.innerWidth})`);
      if (el.scrollWidth > el.clientWidth + 1) problems.push(`${name}: clipped (${el.clientWidth} of ${el.scrollWidth})`);
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !(el === hit || el.contains(hit))) problems.push(`${name}: covered or unreachable`);
    }
    return problems;
  }, selector);
}

async function openScreen(page, path) {
  await openAddress(page, path);
  await expect(page.locator("main#main-content")).toBeVisible();
}

for (const w of WIDTHS) {
  test.describe(`${w}px`, () => {
    test.use({ viewport: { width: w, height: HEIGHT } });

    test("the page does not scroll sideways", async ({ page }, testInfo) => {
      desktopOnly(testInfo);
      for (const path of SCREENS) {
        await openScreen(page, path);
        const [scrollW, innerW] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
        expect(scrollW, `${path} scrolls sideways`).toBeLessThanOrEqual(innerW);
      }
      await loadSharedDeck(page, DECK, "Atraxa, Praetors' Voice");
      const [scrollW, innerW] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(scrollW, "a deck scrolls sideways").toBeLessThanOrEqual(innerW);
    });

    test("every control in the bar is on screen, whole and reachable", async ({ page }, testInfo) => {
      desktopOnly(testInfo);
      test.fail(BAR_BROKEN.includes(w), "visual pass job 2: the 700-899 bar overflows");
      for (const path of SCREENS) {
        await openScreen(page, path);
        expect(await barProblems(page, BAR_CONTROLS(w)), path).toEqual([]);
      }
      await loadSharedDeck(page, DECK, "Atraxa, Praetors' Voice");
      expect(await barProblems(page, BAR_CONTROLS(w)), "a deck").toEqual([]);
    });
  });
}

// With touch, a tablet width must not make iOS zoom the page on focus: every
// visible input, textarea and select computes to 16px or more.
for (const w of TOUCH_WIDTHS) {
  test.describe(`${w}px, touch`, () => {
    test.use({ viewport: { width: w, height: HEIGHT }, hasTouch: true, isMobile: true });

    test("inputs are 16px or larger", async ({ page }, testInfo) => {
      desktopOnly(testInfo);
      test.fail(true, "visual pass job 8: the 16px rule stops at 699px");
      const small = async (where) => {
        const found = await page.evaluate(() => [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea, select")]
          .filter((el) => el.getBoundingClientRect().width > 0)
          .map((el) => [el.id || el.name || el.placeholder || el.tagName, parseFloat(getComputedStyle(el).fontSize)])
          .filter(([, px]) => px < 16));
        expect(found, where).toEqual([]);
      };

      for (const path of ["/commanders", "/cards", "/rules"]) {
        await openScreen(page, path);
        await small(path);
      }
      await openScreen(page, "/new");
      await newDeckDoor(page, "Paste or import").click();
      await small("/new, paste door");
      await loadSharedDeck(page, DECK, "Atraxa, Praetors' Voice");
      await expect(addCardField(page)).toBeVisible();
      await small("a deck");
    });
  });
}
