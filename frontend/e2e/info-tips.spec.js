// Help that opens on tap, click and keyboard (suggestions job 3, 2026-10-25). The
// title= texts it replaced showed only on mouse hover, never on a phone or to the
// keyboard. Andres chose a bubble on desktop and the same text in place on a phone,
// so on a phone it never covers a control.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, openDeckSection } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

async function openImprove(page, { deep = false } = {}) {
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  await openDeckSection(page, "Improve");
  await page.locator(".dg-head").click(); // the Goals editor
  if (deep) {
    const btn = page.locator(".insp-deep");
    if (await btn.count()) await btn.click(); // the mode toggle needs the AI pass loaded
    await expect(page.locator(".insp-mode-toggle")).toBeVisible({ timeout: 10000 });
  }
}

const tip = (page, label) => page.getByRole("button", { name: `About ${label}`, exact: true });
const panelOf = async (page, label) =>
  page.locator(`[id="${await tip(page, label).getAttribute("aria-controls")}"]`);

test("every tip opens with its text, and the score's breakdown is no longer hover-only", async ({ page }) => {
  await openImprove(page, { deep: true });
  const want = {
    bracket: "AI suggestions are told to steer toward it",
    budget: "AI suggestions are told to stay under it",
    pilot: "Simple avoids long chains",
    "the score": "Complete ",
    gaps: "the number after \"of\" is the target",
    "budget swaps and power upgrades": "Both show the AI's changes",
    suggestions: "\"Played in N%\" is the share",
  };
  for (const [label, text] of Object.entries(want)) {
    const p = await panelOf(page, label);
    await expect(p).toBeEmpty();
    await tip(page, label).click();
    await expect(p).toBeVisible();
    await expect(p).toContainText(text);
    await expect(tip(page, label)).toHaveAttribute("aria-expanded", "true");
    await tip(page, label).click(); // the same button closes it
    await expect(p).toBeEmpty();
  }
  // The live breakdown is in the tip now, not a title only a mouse could see.
  await expect(page.locator(".asmt-score-row")).not.toHaveAttribute("title", /.*/);
  // The suggestion reasons say the real share of this commander's decks.
  await expect(page.locator(".opt-reason", { hasText: "Played in 64% of this commander's decks." })).toBeVisible();
});

test("the text arrives in a status region, and the headings keep their own names", async ({ page }) => {
  await openImprove(page);
  const p = await panelOf(page, "budget");
  await expect(p).toHaveAttribute("role", "status"); // announced when its text appears
  await tip(page, "budget").click();
  await expect(p).toHaveText(/The most the whole deck may cost/);
  for (const h of ["Verdict", "Gaps"]) {
    await expect(page.getByRole("heading", { name: h, exact: true })).toBeVisible();
  }
});

test("keyboard: Enter opens, Escape closes; one tip at a time", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard");
  await openImprove(page);
  const btn = tip(page, "budget");
  const p = await panelOf(page, "budget");
  await btn.focus();
  await page.keyboard.press("Enter");
  await expect(p).not.toBeEmpty();
  // Opening another by keyboard (no pointerdown) closes the first.
  await tip(page, "pilot").focus();
  await page.keyboard.press("Enter");
  await expect(await panelOf(page, "pilot")).not.toBeEmpty();
  await expect(p).toBeEmpty();
  await page.keyboard.press("Escape");
  await expect(await panelOf(page, "pilot")).toBeEmpty();
});

test("Escape never pulls focus back from somewhere else", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard");
  await openImprove(page);
  await tip(page, "budget").focus();
  await page.keyboard.press("Enter");
  const elsewhere = page.getByRole("button", { name: "$50", exact: true });
  await elsewhere.focus(); // focus moved on without a pointer
  await page.keyboard.press("Escape");
  await expect(await panelOf(page, "budget")).toBeEmpty();
  await expect(elsewhere).toBeFocused();
});

test("a tap or click elsewhere closes it", async ({ page }) => {
  await openImprove(page);
  const p = await panelOf(page, "budget");
  await tip(page, "budget").click();
  await expect(p).not.toBeEmpty();
  await page.locator(".improve-h", { hasText: "Verdict" }).click();
  await expect(p).toBeEmpty();
});

// A closed tip is an empty live region: no box to draw or tap, and no room in its row
// (on phones its own flex line used to add the row gap under every label; Holiday, 2026-11-06).
test("a closed tip draws nothing and takes no room", async ({ page }) => {
  await openImprove(page, { deep: true });
  for (const label of ["bracket", "budget", "pilot", "the score", "gaps", "budget swaps and power upgrades", "suggestions"]) {
    const p = await panelOf(page, label);
    await expect(p).toBeEmpty();
    const { area, grew } = await p.evaluate((el) => {
      const host = el.closest(".info-tip-host");
      const r = el.getBoundingClientRect();
      const before = host.getBoundingClientRect().height;
      el.style.display = "none";
      const without = host.getBoundingClientRect().height;
      el.style.display = "";
      return { area: r.width * r.height, grew: before - without };
    });
    expect(area, `${label}: closed panel box`).toBe(0);
    expect(grew, `${label}: height the closed panel adds`).toBe(0);
  }
});

test("desktop: a bubble over the page", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop layout");
  await openImprove(page);
  await tip(page, "budget").click();
  const p = await panelOf(page, "budget");
  expect(await p.evaluate((el) => getComputedStyle(el).position)).toBe("absolute");
});

test("phone: the text opens in place and covers no control", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout");
  await openImprove(page);
  await tip(page, "budget").click();
  const p = await panelOf(page, "budget");
  expect(await p.evaluate((el) => getComputedStyle(el).position)).toBe("static");
  const chips = page.locator('[aria-label="Budget ceiling"] .dg-chip');
  for (let i = 0; i < await chips.count(); i++) {
    const hit = await chips.nth(i).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    });
    expect(hit, `chip ${i} covered`).toBe(true);
  }
});

// The button's tap area reaches past its circle, but never into a neighbour's edge:
// a 44px box reached 13px and took taps from the select, the toggle and first chips.
test("the button is small, reaches past its edge, and leaves its neighbours their taps", async ({ page }) => {
  await openImprove(page, { deep: true });
  const btn = tip(page, "budget");
  const box = await btn.boundingBox();
  expect(box.height, "the touch rule must not stretch it").toBeLessThan(24);
  const reach = await btn.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.right + 5, r.y + r.height / 2));
  });
  expect(reach, "a tap just past the circle").toBe(true);
  // Each neighbour still owns the 2px strip at its edge nearest the button.
  // (elementFromPoint only sees the viewport, so each one is scrolled into view first.)
  const owns = async (loc, side) => {
    await loc.scrollIntoViewIfNeeded();
    return loc.evaluate((el, s) => {
      const r = el.getBoundingClientRect();
      const x = s === "right" ? r.right - 2 : r.left + 2;
      return el.contains(document.elementFromPoint(x, r.y + r.height / 2));
    }, side);
  };
  expect(await owns(page.locator(".insp-select"), "right"), "select").toBe(true);
  expect(await owns(page.locator(".insp-mode-toggle"), "right"), "mode toggle").toBe(true);
  for (const group of ["Target bracket", "Budget ceiling", "Pilot complexity"]) {
    expect(await owns(page.locator(`[aria-label="${group}"] .dg-chip`).first(), "left"), group).toBe(true);
  }
  // The first Gaps chip sits under the Gaps heading's button: its top strip is its own.
  const firstGap = page.locator(".asmt-gaps .asmt-chip").first();
  await firstGap.scrollIntoViewIfNeeded();
  const topOwn = await firstGap.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [0.1, 0.5, 0.9].every((f) => el.contains(document.elementFromPoint(r.x + r.width * f, r.top + 2)));
  });
  expect(topOwn, "first gap chip's top edge").toBe(true);
});
