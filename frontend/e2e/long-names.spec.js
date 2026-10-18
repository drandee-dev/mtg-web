// Long names and phone card sizes (visual pass job 9). Page titles wrap; a tile's
// name wraps to two lines and keeps its full text in a title; meta text is one line
// with a title; chip rows scroll sideways with an edge fade; the commander
// directory is two across on a phone.
import { test, expect } from "./fixtures/test-base.js";
import { waitForAppReady, dismissColdStart, seedLocalDecks, openAddress } from "./fixtures/helpers.js";
import { TEST_DECK_STORAGE } from "./fixtures/test-data.js";

const LONG = "The Very Long Name Of A Deck That Goes On And On About Elves, Their Tribal Synergies, And Why Everybody Should Fear The Forest Tonight";

test.describe("Long names", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "desktop browser, viewport set per case");
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("a deck tile's long name wraps to two lines and keeps its full name in a title", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    await waitForAppReady(page);
    await seedLocalDecks(page, [{ ...TEST_DECK_STORAGE, name: LONG }]);
    await page.reload();
    await waitForAppReady(page);
    await dismissColdStart(page);
    const name = page.locator(".deck-card-name").first();
    await expect(name).toHaveAttribute("title", LONG);
    const m = await name.evaluate((el) => {
      const cs = getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      return { lines: el.getBoundingClientRect().height / lh, cut: el.scrollHeight > el.clientHeight + 1, over: el.scrollWidth > el.clientWidth + 1 };
    });
    expect(m.lines, "two lines, not one and not three").toBeGreaterThan(1.8);
    expect(m.lines).toBeLessThan(2.3);
    expect(m.cut, "a 130-character name is cut by the clamp").toBe(true);
    expect(m.over, "the name runs sideways").toBe(false);
  });

  test("Browse all stays on one line at 360", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
    const more = page.locator(".dh-more").first();
    await expect(more).toBeVisible();
    expect((await more.boundingBox()).height).toBeLessThanOrEqual(48);
    // It does not wrap in the mock at this width, so the rule itself is checked too.
    expect(await more.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("nowrap");
  });

  test("the commander directory is two across on a phone, and the art variants stay three", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAddress(page, "/commanders");
    const tile = page.getByRole("listitem", { name: "Atraxa, Praetors' Voice" });
    await expect(tile).toBeVisible();
    expect((await tile.boundingBox()).width, "a directory tile is wider than 98px").toBeGreaterThan(150);
    const cols = await page.locator(".card-grid-2up").first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(cols).toBe(2);
    // The deck's Grid view shares .card-grid and is untouched.
    const other = await page.evaluate(() => {
      const el = document.createElement("div");
      el.className = "card-grid";
      document.body.appendChild(el);
      const n = getComputedStyle(el).gridTemplateColumns.split(" ").length;
      el.remove();
      return n;
    });
    expect(other).toBe(3);
  });

  test("the Ask chips scroll sideways with an edge fade at 390", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
    await page.getByRole("button", { name: "Ask", exact: true }).first().click();
    const chips = page.locator(".pw-chips");
    await expect(chips).toBeVisible();
    // Whether they overflow depends on how many chips the screen offers; what matters is
    // that when they do, they scroll and fade instead of being cut.
    const m = await chips.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { x: cs.overflowX, mask: cs.maskImage || cs.webkitMaskImage, wrap: cs.flexWrap };
    });
    expect(m.x, "chips scroll sideways").toBe("auto");
    expect(m.wrap, "one row").toBe("nowrap");
    expect(m.mask, "an edge fade").not.toBe("none");
  });

  test("the colour identity placeholder fits at 375", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openAddress(page, "/cards");
    const input = page.getByPlaceholder("WUG, or C");
    await expect(input).toBeVisible();
    const fits = await input.evaluate((el) => {
      const cs = getComputedStyle(el);
      const probe = document.createElement("span");
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font};`;
      probe.textContent = el.placeholder;
      document.body.appendChild(probe);
      const text = probe.getBoundingClientRect().width;
      probe.remove();
      return { text, room: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) };
    });
    expect(fits.text, "the placeholder is wider than the box").toBeLessThanOrEqual(fits.room);
  });
});
