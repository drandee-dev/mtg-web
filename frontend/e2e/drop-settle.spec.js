// Visual pass I6: a reordered column slides to its new place instead of jumping, and a
// column being dragged shows where it will land. Before, a column that moved was gone from
// one spot and there in another with nothing between, and the only sign of the target was a
// dashed outline around the whole column.
//
// The slide is measured the way it is seen: every animation frame, where each column is.
// The reorder is made with the keyboard menu (I5), which is deterministic; a drag is not.
// FLIP means transform only, so the layout count must not rise with the frames.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, setCardView } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "a pointer and a desktop width");
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  await setCardView(page, { mode: "Stacks", group: "role" });
});

// The deck's analysis lands a couple of seconds after load and grows the header, which moves
// the whole board (a known layout shift, not this job's). Wait until the columns hold still.
async function waitUntilStill(page) {
  const where = () => page.evaluate(() => [...document.querySelectorAll("[data-column]")].map((n) => { const r = n.getBoundingClientRect(); return `${n.dataset.column}:${Math.round(r.top + scrollY)}`; }).join());
  let last = await where();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(400);
    const now = await where();
    if (now === last) return;
    last = now;
  }
}

// Where each column is, every animation frame, for `ms` after `start()` runs.
async function trackColumns(page, start, ms = 900) {
  await waitUntilStill(page);
  await page.evaluate(() => {
    window.__track = { frames: [], on: true };
    const tick = (t) => {
      if (!window.__track.on) return;
      const at = {};
      // Document coordinates: focus returning to the moved column's button can scroll the page,
      // which moves every column on screen without any of them moving.
      document.querySelectorAll("[data-column]").forEach((n) => { const r = n.getBoundingClientRect(); at[n.dataset.column] = [r.left + scrollX, r.top + scrollY]; });
      window.__track.frames.push({ t, at });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const layouts = async () => (await cdp.send("Performance.getMetrics")).metrics.find((m) => m.name === "LayoutCount").value;
  await page.waitForTimeout(100);
  const before = await layouts();
  await start();
  // The move's own render and the focus returning to the moved column's menu lay out a few
  // times. By 250ms that is over, and what is left is the slide itself.
  await page.waitForTimeout(250);
  const settling = await layouts();
  await page.waitForTimeout(ms - 250);
  const after = await layouts();
  const frames = await page.evaluate(() => { window.__track.on = false; return window.__track.frames; });
  return { frames, layouts: after - before, slideLayouts: after - settling };
}

// For each column: how many frames it was somewhere new, and its largest jump between frames.
function motionOf(frames) {
  const out = {};
  const labels = Object.keys(frames[frames.length - 1].at);
  for (const label of labels) {
    let moving = 0, maxStep = 0, last = null;
    for (const f of frames) {
      const p = f.at[label];
      if (!p) continue;
      if (last) {
        const step = Math.hypot(p[0] - last[0], p[1] - last[1]);
        if (step > 0.5) moving++;
        maxStep = Math.max(maxStep, step);
      }
      last = p;
    }
    out[label] = { moving, maxStep: Math.round(maxStep) };
  }
  return out;
}

// Open a column's Reorder menu from the keyboard and take its first item.
async function nudge(page, label) {
  const btn = page.locator(`.more-menu-btn[aria-label="Reorder ${label} column"]`);
  await page.keyboard.press("Shift");
  await btn.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
}

const firstReorderLabel = async (page) =>
  (await page.locator('.more-menu-btn[aria-label^="Reorder "]').first().getAttribute("aria-label")).slice("Reorder ".length, -" column".length);

test("a reordered column slides: several frames, small steps, no layout per frame", async ({ page }) => {
  const label = await firstReorderLabel(page);
  const { frames, layouts, slideLayouts } = await trackColumns(page, () => nudge(page, label));
  const motion = motionOf(frames);
  const moved = Object.entries(motion).filter(([, m]) => m.moving > 0);
  expect(moved.length, "at least the moved column and the one it swapped with").toBeGreaterThanOrEqual(1);
  for (const [name, m] of moved) {
    expect(m.moving, `${name}: frames in motion`).toBeGreaterThanOrEqual(6);
    expect(m.maxStep, `${name}: largest jump between frames, px`).toBeLessThanOrEqual(60);
  }
  // The reorder itself lays out a few times; a transform slide adds none per frame, so the
  // layout count over the slide does not grow with its frames. A layout every frame would be
  // 30 or more here; the odd one or two is the focus settling on the moved column's menu.
  expect(slideLayouts, "layouts during the slide, after the move itself").toBeLessThanOrEqual(3);
  expect(layouts, "layouts in all").toBeLessThan(12);
});

test("with reduced motion a reordered column jumps", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const label = await firstReorderLabel(page);
  const { frames } = await trackColumns(page, () => nudge(page, label));
  const motion = motionOf(frames);
  const moved = Object.entries(motion).filter(([, m]) => m.maxStep > 1);
  expect(moved.length, "the column did move").toBeGreaterThanOrEqual(1);
  for (const [name, m] of moved) expect(m.moving, `${name}: frames in motion`).toBeLessThanOrEqual(1);
});

test("dropping a column puts it in front of the target, the ghost fades away, and nothing throws", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const labels = (await page.locator(".stack-column-label").allTextContents()).filter((l) => l !== "Commander");
  const [from, to] = [labels[0], labels[labels.length - 1]];
  const grip = page.locator(".stack-column", { has: page.locator(`.stack-column-label:text-is("${from}")`) }).locator(".stack-column-header");
  const target = page.locator(".stack-column", { has: page.locator(`.stack-column-label:text-is("${to}")`) });
  const g = await grip.boundingBox();
  const t = await target.boundingBox();
  await page.mouse.move(g.x + 40, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + 60, g.y + g.height / 2 + 10, { steps: 4 });
  await page.mouse.move(t.x + t.width / 2, t.y + 120, { steps: 12 });
  await expect(page.locator(".stack-column-insert")).toHaveCount(1);
  await page.mouse.up();
  const order = () => page.evaluate(() => JSON.parse(localStorage.getItem("mtgweb:colOrder") || "{}").role);
  await expect.poll(order).toBeTruthy();
  const saved = await order();
  expect(saved.indexOf(from), "the dragged column sits directly in front of the target").toBe(saved.indexOf(to) - 1);
  // The picked-up copy is gone once its fade ends, and the marker with it.
  await expect(page.locator(".stack-drag-overlay > *")).toHaveCount(0, { timeout: 3000 });
  await expect(page.locator(".stack-column-insert")).toHaveCount(0);
  expect(errors, "page errors during the drop").toEqual([]);
});

test("dragging a column shows a gold marker where it will land", async ({ page }) => {
  const headers = page.locator(".stack-column-header");
  const labels = (await page.locator(".stack-column-label").allTextContents()).filter((l) => l !== "Commander");
  const [from, to] = [labels[0], labels[labels.length - 1]];
  const grip = page.locator(".stack-column", { has: page.locator(`.stack-column-label:text-is("${from}")`) }).locator(".stack-column-header");
  const target = page.locator(".stack-column", { has: page.locator(`.stack-column-label:text-is("${to}")`) });
  await expect(headers.first()).toBeVisible();
  const g = await grip.boundingBox();
  const t = await target.boundingBox();
  await page.mouse.move(g.x + 40, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + 60, g.y + g.height / 2 + 10, { steps: 4 });
  await page.mouse.move(t.x + t.width / 2, t.y + 120, { steps: 12 });
  const marker = page.locator(".stack-column-insert");
  await expect(marker, "one column shows the marker").toHaveCount(1);
  await expect(marker).toHaveAttribute("data-column", to);
  const bar = await marker.evaluate((el) => {
    const s = getComputedStyle(el, "::before");
    return { content: s.content, bg: s.backgroundColor, h: parseFloat(s.height), pos: s.position };
  });
  expect(bar.content, "the marker's ::before exists").not.toBe("none");
  expect(bar.pos).toBe("absolute");
  expect(bar.h, "a 3px bar").toBeGreaterThanOrEqual(2);
  expect(bar.bg, "gold, the accent").toMatch(/rgb\(201, 138, 58\)/);
  // Off every column the marker goes.
  await page.mouse.move(5, 5, { steps: 6 });
  await expect(page.locator(".stack-column-insert")).toHaveCount(0);
  await page.mouse.up();
});
