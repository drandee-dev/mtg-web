// Visual pass I5: a column and a card can be moved without a pointer. Dragging was
// pointer-only on a desktop; the ⋯ menus that stand in for it on touch are now there for
// the keyboard too (revealed when the column header or card has focus), the move is
// announced, and focus lands back on the thing that moved. Everything here is keys:
// Tab, Enter, the arrows and Escape.
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, setCardView } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "keyboard on a desktop; touch has its own menus");
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
});

const labels = (page) => page.locator(".stack-column-label").allTextContents();
const status = (page) => page.locator(".stack-announce");
// The focused control's name: its aria-label, or its text without a decorative icon glyph.
const focusedName = (page) => page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return "";
  const own = el.getAttribute("aria-label");
  if (own) return own;
  const clone = el.cloneNode(true);
  clone.querySelectorAll("[aria-hidden=true]").forEach((n) => n.remove());
  return clone.textContent.trim();
});

// Tab from `from` until the focused element's accessible name matches, or give up.
async function tabTo(page, from, match, max = 80) {
  await from.focus();
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (match.test((await focusedName(page)) || "")) return true;
  }
  return false;
}

// With the menu open, move down with the arrow keys to the item with this text, then Enter.
async function chooseItem(page, text) {
  for (let i = 0; i < 12; i++) {
    if ((await focusedName(page)) === text) { await page.keyboard.press("Enter"); return; }
    await page.keyboard.press("ArrowDown");
  }
  throw new Error(`no menu item "${text}" reached with the arrow keys`);
}

for (const mode of ["image", "text"]) {
  test.describe(`${mode} stacks`, () => {
    test.beforeEach(async ({ page }) => {
      await setCardView(page, mode === "text" ? { mode: "Stacks", group: "role", stackAs: "Text" } : { mode: "Stacks", group: "role" });
    });

    test("a column moves with the keyboard, is announced, keeps focus, and moves back", async ({ page }) => {
      // The masonry splits columns across containers, so the page's DOM order is not the
      // columns' order. The order the app saves is.
      const order = () => page.evaluate(() => JSON.parse(localStorage.getItem("mtgweb:colOrder") || "{}").role);
      const L0 = (await page.locator('.more-menu-btn[aria-label^="Reorder "]').first().getAttribute("aria-label")).slice("Reorder ".length, -" column".length);
      // Reachable by Tab from the add-a-card field, not just by a script's focus().
      expect(await tabTo(page, page.getByPlaceholder("Add a card by name"), new RegExp(`^Reorder ${L0} column$`)), "Tab reaches the column's Reorder menu").toBe(true);
      await page.keyboard.press("Enter");
      await expect(page.locator(".more-menu-list")).toBeVisible();
      expect(await focusedName(page), "the first item has focus").toMatch(/^Move column/);
      // A column at an end has only one direction; take the first item it offers.
      const first = (await focusedName(page)).includes("left") ? "Move column left" : "Move column right";
      const dir = first.includes("left") ? -1 : 1;
      await chooseItem(page, first);
      const moved = await order();
      const at = moved.indexOf(L0);
      await expect(status(page)).toContainText(`Moved ${L0} ${dir < 0 ? "left" : "right"}, now column ${at + 1} of ${moved.length}`);
      await expect.poll(() => focusedName(page), { message: "focus is back on the moved column's menu" }).toBe(`Reorder ${L0} column`);
      // And back, the other way: the order returns to what it was, every other column untouched.
      await page.keyboard.press("Enter");
      await expect(page.locator(".more-menu-list")).toBeVisible();
      await chooseItem(page, dir < 0 ? "Move column right" : "Move column left");
      const back = await order();
      expect(back.indexOf(L0), "the column is back where it started").toBe(at - dir);
      expect(back.filter((l) => l !== L0), "no other column moved").toEqual(moved.filter((l) => l !== L0));
    });

    test("Escape closes the menu, moves nothing and keeps focus on the button", async ({ page }) => {
      const before = await labels(page);
      const L0 = before.filter((l) => l !== "Commander")[0];
      expect(await tabTo(page, page.getByPlaceholder("Add a card by name"), new RegExp(`^Reorder ${L0} column$`))).toBe(true);
      await page.keyboard.press("Enter");
      await expect(page.locator(".more-menu-list")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator(".more-menu-list")).toHaveCount(0);
      expect(await labels(page)).toEqual(before);
      expect(await focusedName(page)).toBe(`Reorder ${L0} column`);
    });

    test("a card moves to another category with the keyboard", async ({ page }) => {
      const card = page.locator(mode === "text" ? '.ts-row[aria-label="1x Sol Ring"]' : '.stack-card-wrap[aria-label="1x Sol Ring"]');
      const columnOf = async (name) => page.locator(".stack-column", { has: page.locator(`[aria-label="1x ${name}"]`) }).locator(".stack-column-label").first().textContent();
      const from = await columnOf("Sol Ring");
      const target = (await labels(page)).find((l) => l !== "Commander" && l !== from);
      expect(await tabTo(page, card, /^Move Sol Ring to another category$/), "Tab reaches the card's move menu").toBe(true);
      await page.keyboard.press("Enter");
      await expect(page.locator(".more-menu-list")).toBeVisible();
      await chooseItem(page, `Move to ${target}`);
      expect(await columnOf("Sol Ring")).toBe(target);
      await expect(status(page)).toContainText("Sol Ring");
      await expect(status(page)).toContainText(target);
      await expect.poll(() => focusedName(page), { message: "focus is back on the moved card's menu" }).toBe("Move Sol Ring to another category");
    });
  });
}
