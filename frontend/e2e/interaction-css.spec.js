import { test, expect } from "./fixtures/test-base.js";
import { waitForAppReady, dismissColdStart, setCardView } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

// Visual pass I2, I3, I4 and the small items, read from computed style.

async function openStacks(page) {
  const deckStr = `Commander\n1 ${TEST_COMMANDER}\n\nDeck\n${TEST_DECK_TEXT}`;
  const encoded = Buffer.from(deckStr, "utf8").toString("base64");
  await page.goto(`/?deck=${encodeURIComponent(encoded)}&fmt=commander&cmd=${encodeURIComponent(TEST_COMMANDER)}`);
  await waitForAppReady(page);
  await dismissColdStart(page);
  await setCardView(page, { mode: "Stacks", group: "role" });
  await page.locator(".stack-card-wrap").first().waitFor();
}

test.describe("Stack hover and focus", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "hover and keyboard focus are desktop");
    await openStacks(page);
  });

  test("the hover reveal does not animate layout (I3)", async ({ page }) => {
    const props = await page.locator(".stack-card-wrap").first().evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(props).not.toContain("margin");
  });

  test("keyboard focus on a stack card's control reveals the card (I4)", async ({ page }) => {
    const card = page.locator(".stack-card-wrap:not(:last-child)").first();
    const before = await card.evaluate((el) => getComputedStyle(el).marginBottom);
    await card.focus();
    await page.keyboard.press("Tab"); // onto the first rail control inside the card
    const inside = await card.evaluate((el) => el.contains(document.activeElement) && el !== document.activeElement);
    expect(inside).toBe(true);
    const after = await card.evaluate((el) => getComputedStyle(el).marginBottom);
    expect(after).not.toBe(before);
  });

  test("the rail has no backdrop blur (I2)", async ({ page }) => {
    const filter = await page.locator(".card-rail-btn").first().evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(filter).toBe("none");
  });
});

test("the bottom bar is allowed for in focus scrolling on a phone", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "phone only");
  await page.goto("/");
  await waitForAppReady(page);
  const pad = await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom);
  expect(parseFloat(pad)).toBeGreaterThanOrEqual(64);
});

// button:hover's tint outranks a one-class background, so a gold button with dark
// ink went dark-on-tint on hover. Each must keep its gold fill and ink when hovered.
test("gold buttons keep their fill and ink on hover", async ({ page }) => {
  await page.goto("/");
  await waitForAppReady(page);
  for (const cls of ["dg-suggest-use", "account-magic-link-btn", "toast-action"]) {
    await page.evaluate((c) => {
      const b = document.createElement("button");
      b.className = c; b.id = `probe-${c}`; b.textContent = "Probe";
      b.style.cssText = "position:fixed;top:80px;left:20px;z-index:9999";
      document.body.appendChild(b);
    }, cls);
    const btn = page.locator(`#probe-${cls}`);
    const read = () => btn.evaluate((el) => { const s = getComputedStyle(el); return [s.backgroundColor, s.color]; });
    await page.mouse.move(0, 0);
    const rest = await read();
    await btn.hover();
    await page.waitForTimeout(400); // buttons transition colour; read after it settles
    expect(await read(), cls).toEqual(rest);
  }
});

test("reduced motion keeps spinners turning, slower", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await waitForAppReady(page);
  const s = await page.evaluate(() => {
    const el = document.createElement("i");
    el.className = "insp-spinner";
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    return { count: cs.animationIterationCount, dur: cs.animationDuration };
  });
  expect(s.count).toBe("infinite");
  expect(s.dur).toBe("1.6s");
});
