// Visual pass I9: a 100-card deck, with the main thread slowed 4x (CDP, the way a mid phone
// feels), must not hitch when a card is picked up or dropped. The numbers come from the
// browser itself: the longest long animation frame in a window, and the main thread's script
// time over it (CDP ScriptDuration). Long frames only register above 50 ms, so script time is
// what shows a smaller win. Mock card art is flat SVG, so real decks are somewhat slower.
//
// Measured on this machine, same conditions, before and after (4x, medians of three runs):
//   pickup script   52 to 58 ms  ->  37 to 45 ms   (long frames of 50 to 70 ms in most runs -> none)
//   drop script     43 to 63 ms  ->  31 to 33 ms
// Timing on a shared machine is noisy, so each figure is the median of three runs and the
// limits sit between the two columns, not at the audit's targets (40 and 60 ms) alone.
// Not asserted, because a case would pass without the change: the card modal opens in 80 to
// 88 ms (the target is 100), and the text stack's pickup is unchanged by memoising its rows.
// Not met: switching to Grid takes 112 to 128 ms (the target is under 120). It is a mount cost,
// not a re-render; content-visibility on the grid cuts it to about 90 ms but leaves off-screen
// thumbnails blank in a full-page capture, so it was not taken (see the scope note).
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, setCardView } from "./fixtures/helpers.js";
import { TEST_COMMANDER } from "./fixtures/test-data.js";

const DECK = Array.from({ length: 99 }, (_, i) => `1 Bulk ${i + 1}`).join("\n");
const cdpFor = new WeakMap();

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "one desktop run; the throttle is the phone");
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadSharedDeck(page, DECK, TEST_COMMANDER);
  // The deck analysis lands a couple of seconds after load and re-renders the page; measure after.
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    window.__perf = { loaf: [] };
    new PerformanceObserver((l) => window.__perf.loaf.push(...l.getEntries().map((e) => ({ start: e.startTime, dur: e.duration })))).observe({ type: "long-animation-frame", buffered: false });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  cdpFor.set(page, cdp);
});

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const now = (page) => page.evaluate(() => performance.now());
// The longest long frame that began after `t` (0 when there was none).
const worstFrameAfter = (page, t) => page.evaluate((from) => Math.max(0, ...window.__perf.loaf.filter((f) => f.start >= from).map((f) => f.dur)), t);
// Main-thread script time (ms) so far.
const script = async (page) => (await cdpFor.get(page).send("Performance.getMetrics")).metrics.find((m) => m.name === "ScriptDuration").value * 1000;

// Pick a card up in role grouping, hold it over another column, drop it.
async function dragCardOnce(page, fromName, toLabel) {
  const card = page.locator(`.stack-column [data-card-name="${fromName}"]`);
  const target = page.locator(".stack-column", { has: page.locator(`.stack-column-label:text-is("${toLabel}")`) });
  await card.scrollIntoViewIfNeeded();
  const c = await card.boundingBox();
  const t = await target.boundingBox();
  await page.mouse.move(c.x + 30, c.y + 12);
  await page.mouse.down();
  const tPick = await now(page);
  const s0 = await script(page);
  await page.mouse.move(c.x + 50, c.y + 40, { steps: 4 }); // past the 6px threshold: the pickup
  await page.waitForTimeout(500);
  const pickup = await worstFrameAfter(page, tPick);
  const pickScript = (await script(page)) - s0;
  await page.mouse.move(t.x + t.width / 2, t.y + 80, { steps: 8 });
  await page.waitForTimeout(200);
  const tDrop = await now(page);
  const s1 = await script(page);
  await page.mouse.up();
  await page.waitForTimeout(700);
  return { pickup, drop: await worstFrameAfter(page, tDrop), pickScript, dropScript: (await script(page)) - s1 };
}

test("picking a card up and dropping it is light with 100 cards at 4x", async ({ page }) => {
  await setCardView(page, { mode: "Stacks", group: "role" });
  await page.waitForTimeout(800);
  const labels = (await page.locator(".stack-column-label").allTextContents()).filter((l) => l !== "Commander");
  const r = { pickup: [], drop: [], pickScript: [], dropScript: [] };
  for (let i = 0; i < 3; i++) {
    // A different card each time, sent to a column it is not in, so a drop is never a no-op.
    const name = `Bulk ${10 + i * 5}`;
    const here = await page.locator(".stack-column", { has: page.locator(`[data-card-name="${name}"]`) }).locator(".stack-column-label").first().textContent();
    expect(here, `${name} is in a column`).toBeTruthy();
    const one = await dragCardOnce(page, name, labels.find((l) => l !== here));
    for (const k of Object.keys(r)) r[k].push(one[k]);
  }
  const rounded = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.map(Math.round)]));
  console.log(`PERF card ${JSON.stringify(rounded)}`);
  expect(median(r.pickup), "pickup: longest frame, ms").toBeLessThanOrEqual(40);
  expect(median(r.drop), "drop: longest frame, ms").toBeLessThanOrEqual(60);
  expect(median(r.pickScript), "pickup: main-thread script time, ms").toBeLessThanOrEqual(48);
  expect(median(r.dropScript), "drop: main-thread script time, ms").toBeLessThanOrEqual(40);
});
