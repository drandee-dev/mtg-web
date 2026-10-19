// Visual pass I10: the two sheet handles, the stack card's corner menu, and keyboard focus
// beside the bottom bar. On a phone the card modal's handle and the Ask sheet's grabber
// were 4px and about 15px tall; the card's corner menu was 36 wide (44 covered its
// quantity triangle); and a Tab stop could land under the fixed bottom bar.
// Handles are proved the way a thumb uses them: a touch that starts 18px from the bar,
// found by elementFromPoint, and drags down, closes the sheet.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, setCardView } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
// Playwright insists the first argument is a destructuring pattern, even an empty one.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "sizes its own viewport");
});

// Touch the element under (x, y), drag it `dy` down and let go, as one finger would.
async function swipeDownFrom(page, x, y, dy) {
  await page.evaluate(async ([px, py, delta]) => {
    const target = document.elementFromPoint(px, py);
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const touch = (yy) => new Touch({ identifier: 1, target, clientX: px, clientY: yy });
    const fire = (type, yy, live) => target.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true, touches: live ? [touch(yy)] : [], changedTouches: [touch(yy)],
    }));
    fire("touchstart", py, true); await frame();
    for (const step of [0.25, 0.5, 0.75, 1]) { fire("touchmove", py + delta * step, true); await frame(); }
    fire("touchend", py + delta, false); await frame();
  }, [x, y, dy]);
}

// The handle must be 44 tall, and both ends of that height must belong to it.
async function expectHandle(page, selector) {
  const handle = page.locator(selector);
  await expect(handle).toBeVisible();
  // The "Saved as" toast docks over a sheet's top edge for a few seconds; it is not the handle.
  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 15000 });
  const box = await handle.boundingBox();
  expect(box.height, `${selector} height`).toBeGreaterThanOrEqual(44);
  const ends = await handle.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const own = (y) => { const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h)); };
    return { top: own(r.top + 2), bottom: own(r.bottom - 2) };
  });
  expect(ends, `${selector} top and bottom edge`).toEqual({ top: true, bottom: true });
  return box;
}

async function openCardModal(page) {
  await setCardView(page, { mode: "Stacks", group: "role" });
  const cards = page.locator(".stack-card-wrap");
  for (let t = 0; t < 4 && !(await page.locator(".cdm-panel").isVisible()); t++) {
    await cards.nth(1).tap({ position: { x: 30, y: 10 } });
    await page.waitForTimeout(250);
  }
  await expect(page.locator(".cdm-panel")).toBeVisible();
}

test.describe("sheet handles", () => {
  test("the card modal's handle is 44 tall and a drag from its edge closes the sheet", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await openCardModal(page);
    const box = await expectHandle(page, ".cdm-handle");
    await swipeDownFrom(page, box.x + box.width / 2, box.y + 4, 140);
    await expect(page.locator(".cdm-panel")).toHaveCount(0);
  });

  test("the Ask sheet's grabber is 44 tall and a drag from its edge closes the sheet", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.locator(".ask-panel")).toBeVisible();
    const box = await expectHandle(page, ".pw-grabber");
    await swipeDownFrom(page, box.x + box.width / 2, box.y + 4, 140);
    await expect(page.locator(".ask-panel")).toHaveCount(0);
  });
});

for (const theme of ["dark", "light"]) {
  test(`a stack card's corner menu: 44 wide, clear of the quantity triangle, readable (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("mtgweb:theme", t), theme);
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await setCardView(page, { mode: "Stacks", group: "role" });
    const wrap = page.locator(".stack-card-wrap").nth(1);
    await wrap.scrollIntoViewIfNeeded();
    // Stacked cards overlap, so the next one covers a collapsed card's lower half. The first
    // tap expands it (raised above its neighbours); that is when its menu is a 44px target.
    await wrap.tap({ position: { x: 30, y: 10 } });
    await expect(page.locator(".cdm-panel")).toHaveCount(0);
    await page.waitForTimeout(300);
    const m = await wrap.evaluate((card) => {
      const btn = card.querySelector(".stack-card-movemenu .more-menu-btn");
      const qty = card.querySelector(".stack-card-qty");
      const b = btn.getBoundingClientRect(), q = qty.getBoundingClientRect();
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      const own = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === btn || btn.contains(h)); };
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const glyph = getComputedStyle(btn).color.match(/\d+/g).slice(0, 3).map(Number);
      const bg = getComputedStyle(btn).backgroundColor.match(/[\d.]+/g).map(Number);
      // Worst case behind the button's translucent background: white art.
      const flat = [0, 1, 2].map((i) => bg[i] * bg[3] + 255 * (1 - bg[3]));
      const [hi, lo] = [lum(glyph), lum(flat)].sort((a, c) => c - a);
      return {
        w: b.width, h: b.height,
        sides: [own(cx - 21, cy), own(cx + 21, cy), own(cx, cy - 21), own(cx, cy + 21)],
        overlapsQty: b.right > q.left && b.left < q.right && b.bottom > q.top && b.top < q.bottom,
        ratio: (hi + 0.05) / (lo + 0.05),
      };
    });
    expect(m.w, "width").toBeGreaterThanOrEqual(44);
    expect(m.h, "height").toBeGreaterThanOrEqual(44);
    expect(m.sides, "44px around its centre belongs to it").toEqual([true, true, true, true]);
    expect(m.overlapsQty, "it covers the quantity triangle").toBe(false);
    expect(m.ratio, "glyph against its background").toBeGreaterThanOrEqual(4.5);
  });
}

// scroll-padding-bottom (13-responsive) keeps a focused control clear of the fixed bottom bar.
test("keyboard focus never lands under the bottom bar", async ({ page }) => {
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  const under = [];
  let checked = 0;
  for (let i = 0; i < 70; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(40);
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      if (el.closest(".bottom-nav, .mobile-deck-nav, .global-toolbar, .toast, .pwa-update-banner, .skip-link, [class*='skip']")) return null;
      const bar = document.querySelector(".bottom-nav");
      const barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight;
      const r = el.getBoundingClientRect();
      return { name: (el.getAttribute("aria-label") || el.textContent || el.className).trim().slice(0, 30), bottom: Math.round(r.bottom), barTop: Math.round(barTop), shown: r.width > 0 && r.height > 0 };
    });
    if (!stop || !stop.shown) continue;
    checked++;
    if (stop.bottom > stop.barTop + 1) under.push(`${stop.name} bottom ${stop.bottom} under bar at ${stop.barTop}`);
  }
  expect(checked, "no focus stops were checked").toBeGreaterThan(20);
  expect(under).toEqual([]);
});
