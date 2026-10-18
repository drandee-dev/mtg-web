// Visual pass job 12: on a touch screen every control the audit listed (B11) owns a
// 44x44 hit area, and the edge of it belongs to that control, not its neighbour.
// The probe is elementFromPoint 21px out from the centre on all four sides: it
// fails for a control that is narrower than 44, and for one whose extender is
// covered by the next control along. A selector that matches nothing fails too.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, openDeckSection, setCardView, deckMenuAction, openAddress } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

async function misses(page, sel) {
  return page.evaluate((s) => {
    const els = [...document.querySelectorAll(s)].filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.height; });
    const bad = [];
    for (const el of els.slice(0, 6)) {
      el.scrollIntoView({ block: "center", inline: "center" }); // elementFromPoint is null off screen
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const sides = { left: [cx - 21, cy], right: [cx + 21, cy], top: [cx, cy - 21], bottom: [cx, cy + 21] };
      for (const [side, [x, y]] of Object.entries(sides)) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !(hit === el || el.contains(hit))) bad.push(`${s} (${Math.round(r.width)}x${Math.round(r.height)}) ${side}`);
      }
    }
    return { count: els.length, bad };
  }, sel);
}

async function expectHitAreas(page, sels) {
  for (const sel of sels) {
    const { count, bad } = await misses(page, sel);
    expect(count, `${sel} matched nothing`).toBeGreaterThan(0);
    expect(bad, sel).toEqual([]);
  }
}

for (const w of [390, 768]) {
  test.describe(`touch hit areas at ${w}`, () => {
    test.use({ viewport: { width: w, height: 900 }, hasTouch: true, isMobile: true });
    test.beforeEach(async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop-chrome", "sizes its own viewport");
      await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    });

    test("filter help, list Remove and the move menus", async ({ page }) => {
      // The filter is on the strip when it has room and in the View panel when not.
      if (!(await page.locator(".cg-tb-help").first().isVisible())) {
        await page.locator(".ct-view-btn").click();
      }
      await expectHitAreas(page, [".cg-tb-help"]);
      await page.keyboard.press("Escape");
      await setCardView(page, { mode: "List" });
      await expectHitAreas(page, [".card-list-remove"]);
      await setCardView(page, { mode: "Stacks" });
      // The ⋯ on a card's corner is left at 36 wide: 44 would cover its quantity badge.
      await expectHitAreas(page, [".more-menu-btn:not(.stack-card-movemenu .more-menu-btn)"]);
      // The column header's two: "Commander options" and "Reorder <column> column".
      await expectHitAreas(page, ['.more-menu-btn[aria-label$=" options"]', '.more-menu-btn[aria-label^="Reorder "]']);
    });

    // Commander has no quantity row; walk down the stack until a modal has a stepper.
    async function openModalWithStepper(page) {
      await setCardView(page, { mode: "Stacks", group: "role" });
      const cards = page.locator(".stack-card-wrap");
      for (let i = 1; i < 6 && !(await page.locator(".cdm-stepper").count()); i++) {
        if (await page.locator(".cdm-panel").isVisible()) { await page.keyboard.press("Escape"); }
        for (let t = 0; t < 3 && !(await page.locator(".cdm-panel").isVisible()); t++) {
          await cards.nth(i).tap({ position: { x: 30, y: 10 } });
          await page.waitForTimeout(250);
        }
      }
    }

    test("the card modal: close, stepper", async ({ page }) => {
      await openModalWithStepper(page);
      await expectHitAreas(page, [".cdm-close", ".cdm-stepper button"]);
    });

    test("the phone card modal's actions are a two-column grid, Remove alone in red", async ({ page }) => {
      test.skip(w >= 700, "the grid is the phone layout");
      await openModalWithStepper(page);
      const row = await page.evaluate(() => {
        const box = document.querySelector(".cdm-actions");
        const bad = (() => { const s = document.createElement("span"); s.style.color = "var(--bad)"; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c; })();
        return {
          columns: getComputedStyle(box).gridTemplateColumns.split(" ").length,
          red: [...box.children].filter((el) => getComputedStyle(el).color === bad).map((el) => el.textContent.trim()),
          count: box.children.length,
        };
      });
      expect(row.columns).toBe(2);
      expect(row.count).toBeGreaterThan(2);
      expect(row.red).toEqual(["Remove"]);
    });

    test("the account panel's close", async ({ page }) => {
      // Only built with a cloud (frontend/.env); without it there is no account panel to open.
      await openAddress(page, "/rules"); // the phone's deck bar has no account button
      await page.locator('[aria-label="Account menu"]').click();
      await page.locator(".avp-row", { hasText: /settings/i }).click();
      await expectHitAreas(page, [".account-close"]);
    });

    test("goals chips and Edit, import close, Playtest life", async ({ page }) => {
      await openDeckSection(page, "Improve");
      await expect(page.locator(".dg-suggest-bar")).toBeVisible({ timeout: 15000 });
      await expectHitAreas(page, [".dg-suggest-edit"]);
      await page.locator(".dg-head").click();
      await expectHitAreas(page, [".dg-chip"]);
      await deckMenuAction(page, "Import cards");
      await expectHitAreas(page, [".icm-close"]);
      await page.locator(".icm-close").click();
      // A tablet-wide header has a direct Playtest button; a phone keeps it in the menu.
      const direct = page.locator('.dh-actions button:has-text("Playtest")');
      if (await direct.isVisible()) await direct.click();
      else await deckMenuAction(page, "Playtest");
      await page.locator('h2:has-text("Playtest")').waitFor();
      await expectHitAreas(page, [".pt-life"]);
    });
  });
}
