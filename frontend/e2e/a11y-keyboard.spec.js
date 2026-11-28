// Keyboard, targets and edges (audit job 6.4, part B). The rest of the audit's
// accessibility table: tab strips take arrow keys, the Ask field keeps focus
// while it waits, loading is announced, small controls have a 24px hit area on a
// mouse, and a field's edge can be seen (3 to 1) in both themes.
import { test, expect } from "./fixtures/test-base.js";
import {
  waitForAppReady, dismissColdStart, loadSharedDeck, openDeckSection, setCardView, openNewDeck, addCardField,
  seedLocalDecks, deckMenuAction,
} from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER, TEST_DECK_STORAGE } from "./fixtures/test-data.js";

const deckTab = (page, name) => page.locator("#deck-sections").getByRole("tab", { name, exact: true });

test("arrow keys move along the deck's tabs without opening them, and Enter opens", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard");
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);

  // One Tab stop for the strip: the open tab.
  await expect(page.locator('#deck-sections [role="tab"][tabindex="0"]')).toHaveText("Cards");
  await deckTab(page, "Cards").focus();
  await page.keyboard.press("ArrowRight");
  await expect(deckTab(page, "How to play")).toBeFocused();
  // Focus moved and nothing opened: Cards is still the open tab. This is the guard
  // against opening on arrow, which on "How to play" could start a paid write-up. (A
  // request count would prove nothing here: this deck is under the 20 cards that
  // write-up needs, so even a click asks for none.)
  await expect(deckTab(page, "Cards")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#deck-panel-play")).toBeHidden();
  await page.keyboard.press("End");
  await expect(deckTab(page, "Stats")).toBeFocused();
  await page.keyboard.press("ArrowRight"); // wraps
  await expect(deckTab(page, "Cards")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(deckTab(page, "Stats")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(deckTab(page, "Cards")).toBeFocused();
  await expect(deckTab(page, "Cards")).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(deckTab(page, "Stats")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('#deck-sections [role="tab"][tabindex="0"]')).toHaveText("Stats");

  // The Stats tools are a strip too.
  const tool = (name) => page.locator(".insp-tabs").getByRole("tab", { name: new RegExp(`^${name}`) });
  await tool("Analytics").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tool("Combos")).toBeFocused();
  await expect(tool("Analytics")).toHaveAttribute("aria-selected", "true");
});

// The deck's h1 is its name alone (the rename pencil sat inside it: "Atraxa…✎"), and
// on a long name the pencil still follows the title's last line (audit job 6.5).
test("the deck title is the deck's name, and its pencil follows a long name", async ({ page, isMobile }) => {
  test.skip(isMobile, "the pencil is hidden on phones; rename is in the bar's menu");
  await page.setViewportSize({ width: 760, height: 900 }); // still the desktop header, narrow enough to wrap
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toHaveAccessibleName(TEST_COMMANDER);
  await page.locator(".deck-head-title").hover();
  await page.getByRole("button", { name: "Rename deck" }).click();
  const field = page.locator(".dh-title-input");
  await field.fill("A very long deck name that has to wrap onto a second line in the header");
  await field.press("Enter");
  await expect(title).toHaveAccessibleName(/^A very long deck name/);
  await page.locator(".deck-head-title").hover();
  const { lines, pencilTop, lastLineTop, lastLineBottom } = await page.evaluate(() => {
    const rects = [...document.querySelector(".deck-title").getClientRects()];
    const last = rects[rects.length - 1];
    const p = document.querySelector(".dh-rename").getBoundingClientRect();
    return { lines: rects.length, pencilTop: p.top, lastLineTop: last.top, lastLineBottom: last.bottom };
  });
  expect(lines, "the long name wraps").toBeGreaterThan(1);
  expect(pencilTop, "the pencil sits on the title's last line").toBeGreaterThanOrEqual(lastLineTop - 4);
  expect(pencilTop, "the pencil sits on the title's last line").toBeLessThan(lastLineBottom);
});

test("the Ask field keeps focus while an answer is on its way", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard");
  let release;
  const held = new Promise((r) => { release = r; });
  await page.route("**/api/planeswalker/chat/stream", async (route) => { await held; await route.fallback(); });
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  await page.getByRole("button", { name: "Ask", exact: true }).filter({ visible: true }).click();
  const field = page.getByRole("textbox", { name: "Your question" });
  await field.fill("What does this deck want to do?");
  await page.keyboard.press("Enter");
  await expect(page.locator(".pw-msg.pw-user")).toContainText("What does this deck want to do?");
  // Waiting: it cannot be typed in, and it still has the keyboard.
  await expect(field).toHaveAttribute("readonly", "");
  await expect(field).toBeFocused();
  release();
  await expect(page.locator(".pw-cardchip-name", { hasText: "Lightning Bolt" })).toBeVisible({ timeout: 15000 });
  await expect(field).not.toHaveAttribute("readonly", "");
  await expect(field).toBeFocused();
});

test("loading is announced once, without the seconds counter", async ({ page }) => {
  let release;
  const held = new Promise((r) => { release = r; });
  await page.route("**/api/deck/recommend", async (route) => { await held; await route.fallback(); });
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  await openDeckSection(page, "Improve");
  const said = page.locator(".loading-indicator [role=status]");
  await expect(said).toHaveText("Loading…");
  await page.waitForTimeout(1600); // the counter is showing by now
  await expect(page.locator(".loading-indicator")).toContainText(/\ds/);
  await expect(said).toHaveText("Loading…");
  release();
  await expect(said).toHaveCount(0, { timeout: 10000 });
});

// A 24px hit area that a neighbour does not take: the control (or its invisible ::after
// extender) is at least 24 by 24, and the points 11px from its centre, each way, hit it.
// 11, not 11.5: the browser rounds a half pixel up onto the 12px boundary, which two
// extenders that meet there share, and the later one in the page owns. Returns what is
// wrong, so [] is a pass.
const hitMisses = (locator) => locator.evaluate((el) => {
  const r = el.getBoundingClientRect();
  const after = getComputedStyle(el, "::after");
  const w = Math.max(r.width, after.position === "absolute" ? parseFloat(after.width) || 0 : 0);
  const h = Math.max(r.height, after.position === "absolute" ? parseFloat(after.height) || 0 : 0);
  const wrong = w < 24 || h < 24 ? [`the hit area is ${w}x${h}`] : [];
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  for (const [dx, dy] of [[-11, 0], [11, 0], [0, -11], [0, 11]]) {
    const at = document.elementFromPoint(cx + dx, cy + dy);
    if (at !== el && !el.contains(at)) wrong.push(`${dx},${dy} hits ${at ? `${at.tagName.toLowerCase()}.${at.className}` : "nothing"}`);
  }
  return wrong;
});

test("small controls have a 24px hit area on a mouse", async ({ page, isMobile }) => {
  test.skip(isMobile, "touch has its own 44px rules (touch-widths.spec.js)");
  await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
  const help = page.locator(".cg-tb-help").first();
  await help.scrollIntoViewIfNeeded();
  expect(await hitMisses(help), "the toolbar's help button").toEqual([]);

  await setCardView(page, { mode: "Stacks", stackAs: "Text" });
  const row = page.locator(".ts-row:has(.ts-row-btn)").first(); // not the commander's row, which has none
  await row.hover();
  const rowBtn = row.locator(".ts-row-btn").first();
  await expect(rowBtn).toBeVisible();
  expect(await hitMisses(rowBtn), "a text row's button").toEqual([]);
});

// Every visible field on a screen: the colour of its edge against the fill inside it
// and against what is around it. A field with no border of its own is judged by the
// nearest box around it that has one.
const fieldEdges = (page) => page.evaluate(() => {
  const parse = (s) => {
    const m = s && s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a), a: 1,
  });
  // The solid colour painted at an element: its own background over its ancestors'.
  const fillOf = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    return layers.reverse().reduce((under, top) => over(top, under), { r: 255, g: 255, b: 255, a: 1 });
  };
  const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

  const fields = [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), textarea, select")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== "hidden" && el !== document.activeElement;
    });
  return fields.map((el) => {
    let box = el;
    for (let i = 0; i < 3 && box && parseFloat(getComputedStyle(box).borderTopWidth) === 0; i++) box = box.parentElement;
    const name = el.getAttribute("aria-label") || el.id || el.name || el.placeholder || el.tagName;
    if (!box || parseFloat(getComputedStyle(box).borderTopWidth) === 0) return { name, worst: 0, why: "no edge at all" };
    const inside = fillOf(box);
    const outside = box.parentElement ? fillOf(box.parentElement) : inside;
    const edge = over(parse(getComputedStyle(box).borderTopColor), inside);
    return { name, worst: Math.min(ratio(edge, inside), ratio(edge, outside)), why: "" };
  });
});

for (const theme of ["dark", "light"]) {
  test(`a field's edge is at least 3 to 1 against what is inside and around it (${theme})`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chrome", "colours do not change with the viewport");
    await page.addInitScript((t) => localStorage.setItem("mtgweb:theme", t), theme);
    const faint = [];
    const measure = async (where) => {
      await expect(page.locator("input:visible, textarea:visible, select:visible").first()).toBeVisible();
      const edges = await fieldEdges(page);
      expect(edges.length, `${where}: no fields were measured`).toBeGreaterThan(0);
      faint.push(...edges
        // The deck's format is drawn as text with a chevron beside it, in the header's
        // line of facts: it has no box on purpose, and the chevron is what marks it.
        .filter((e) => e.name !== "Deck format")
        .filter((e) => e.worst < 3).map((e) => `${where}: ${e.name} ${e.why || e.worst.toFixed(2)}`));
    };
    for (const path of ["/commanders", "/cards"]) {
      await page.goto(path);
      await waitForAppReady(page);
      await dismissColdStart(page);
      await measure(path);
    }
    // Decks home shows its search, format and sort fields from nine decks.
    await seedLocalDecks(page, Array.from({ length: 9 }, (_, i) => ({ ...TEST_DECK_STORAGE, id: `edge${i}`, name: `Edge deck ${i}` })));
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
    await measure("Decks home, nine decks");
    await openNewDeck(page);
    await measure("/new");
    await page.locator(".nd-door", { hasText: "Paste or import" }).click();
    await measure("/new, paste door");
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await expect(addCardField(page)).toBeVisible();
    await measure("a deck, Cards");
    // A dialog and the drawer focus their field on opening, and a focused field shows
    // the accent ring, not its resting edge: blur it before measuring.
    const blur = () => page.evaluate(() => document.activeElement?.blur());
    await deckMenuAction(page, "Import cards");
    await expect(page.locator(".icm-panel")).toBeVisible();
    await blur();
    await measure("the import dialog");
    await page.keyboard.press("Escape");
    await expect(page.locator(".icm-panel")).toHaveCount(0);
    // The Ask drawer keeps its dark colours in both themes, so its edge has to as well.
    await page.getByRole("button", { name: "Ask", exact: true }).filter({ visible: true }).click();
    await expect(page.locator(".ask-panel")).toBeVisible();
    await blur();
    await measure("a deck with the Ask drawer open");
    await page.locator(".ask-panel").getByRole("button", { name: /close/i }).first().click();
    await expect(page.locator(".ask-panel")).toHaveCount(0);
    await openDeckSection(page, "Improve");
    await page.locator(".dg-head").click();
    await expect(page.getByLabel("Custom budget ceiling in dollars")).toBeVisible();
    await measure("a deck, Improve with Goals open");
    // The sign-in fields, when this build has a sign-in form.
    await page.locator('[aria-label="Account menu"]:visible').first().click();
    await page.locator(".avp-row", { hasText: /Sign in or settings|Account settings/ }).click();
    await expect(page.locator(".account-panel")).toBeVisible();
    if (await page.locator(".account-panel form").count()) await measure("the account panel");
    expect(faint).toEqual([]);
  });
}
