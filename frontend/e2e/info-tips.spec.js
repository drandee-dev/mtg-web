// Help that opens on tap, click and keyboard (suggestions job 3, 2026-10-25). The
// title= texts it replaced showed only on mouse hover, never on a phone or to the
// keyboard. Andres chose a bubble on desktop and the same text in place on a phone,
// so on a phone it never covers a control.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, openDeckSection } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

async function openImprove(page) {
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  await openDeckSection(page, "Improve");
  await page.locator(".dg-head").click(); // the Goals editor
}

const tip = (page, label) => page.getByRole("button", { name: `About ${label}`, exact: true });
const panelOf = async (page, label) =>
  page.locator(`[id="${await tip(page, label).getAttribute("aria-controls")}"]`);

test("every tip opens with its text, and the score's breakdown is no longer hover-only", async ({ page }) => {
  await openImprove(page);
  const deep = page.locator(".insp-deep");
  if (await deep.count()) await deep.click(); // the mode toggle needs the AI pass loaded
  await expect(page.locator(".insp-mode-toggle")).toBeVisible({ timeout: 10000 });
  const want = {
    bracket: "from 1 (casual) to 5 (competitive)",
    budget: "The most the whole deck may cost",
    pilot: "Simple avoids long chains",
    "the score": "Complete ",
    gaps: "the number after \"of\" is the target",
    "budget swaps and power upgrades": "Budget swaps: cheaper cards",
    suggestions: "\"Played in N%\" is the share",
  };
  for (const [label, text] of Object.entries(want)) {
    const p = await panelOf(page, label);
    await expect(p).toBeHidden();
    await tip(page, label).click();
    await expect(p).toBeVisible();
    await expect(p).toContainText(text);
    await expect(tip(page, label)).toHaveAttribute("aria-expanded", "true");
    await tip(page, label).click(); // the same button closes it
    await expect(p).toBeHidden();
  }
  // The live breakdown is in the tip now, not a title only a mouse could see.
  await expect(page.locator(".asmt-score-row")).not.toHaveAttribute("title", /.*/);
});

test("keyboard: Enter opens, Escape closes and returns focus", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard");
  await openImprove(page);
  const btn = tip(page, "budget");
  const p = await panelOf(page, "budget");
  await btn.focus();
  await page.keyboard.press("Enter");
  await expect(p).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(p).toBeHidden();
  await expect(btn).toBeFocused();
});

test("a tap or click elsewhere closes it", async ({ page }) => {
  await openImprove(page);
  const p = await panelOf(page, "budget");
  await tip(page, "budget").click();
  await expect(p).toBeVisible();
  await page.locator(".improve-h", { hasText: "Verdict" }).click();
  await expect(p).toBeHidden();
});

test("desktop: a bubble over the page", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop layout");
  await openImprove(page);
  await tip(page, "budget").click();
  const p = await panelOf(page, "budget");
  expect(await p.evaluate((el) => getComputedStyle(el).position)).toBe("absolute");
});

test("phone: the text opens in place and covers no control; the button is a 44px target", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout");
  await openImprove(page);
  const btn = tip(page, "budget");
  await btn.click();
  const p = await panelOf(page, "budget");
  expect(await p.evaluate((el) => getComputedStyle(el).position)).toBe("static");
  // Every Budget chip is still the thing under its own centre.
  const chips = page.locator('[aria-label="Budget ceiling"] .dg-chip');
  for (let i = 0; i < await chips.count(); i++) {
    const hit = await chips.nth(i).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    });
    expect(hit, `chip ${i} covered`).toBe(true);
  }
  // The visible button stays small (the touch rule's 44px min-height would stretch it
  // into an oval); a tap 10px outside its edge still lands on it.
  const box = await btn.boundingBox();
  expect(box.height).toBeLessThan(24);
  const reach = await btn.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.right + 10, r.y + r.height / 2));
  });
  expect(reach).toBe(true);
});
