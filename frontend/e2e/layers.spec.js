// Layers (visual pass job 10). Every z-index of 10 or more is one of the tiers in
// 01-tokens-themes-base.css, a dialog is above the phone's Ask sheet, and a toast
// never sits over a dialog's own buttons.
import { readdirSync, readFileSync } from "node:fs";
import { test, expect } from "./fixtures/test-base.js";
import { waitForAppReady, dismissColdStart, pasteNewDeck, loadSharedDeck, deckMenuAction } from "./fixtures/helpers.js";
import { TEST_COMMANDER, TEST_DECK_TEXT } from "./fixtures/test-data.js";

test.describe("Layers", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "desktop browser, viewport set per case");
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("no raw z-index of 10 or more outside the tiers", async () => {
    const dir = new URL("../src/styles/", import.meta.url);
    const raw = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".css"))) {
      readFileSync(new URL(file, dir), "utf8").split("\n").forEach((line, i) => {
        // A declaration, not a token line or a comment that talks about z-index.
        const m = /z-index:\s*(\d+)\b/.exec(line.replace(/\/\*.*?\*\//g, ""));
        if (m && Number(m[1]) >= 10) raw.push(`${file}:${i + 1} z-index: ${m[1]}`);
      });
    }
    expect(raw, "raw z-index values of 10 or more").toEqual([]);
  });

  test("the layering tiers are in order", async ({ page }) => {
    await page.goto("/");
    const z = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const n = (name) => Number(cs.getPropertyValue(name));
      return ["sticky", "nav", "popover", "fab", "sheet", "modal", "preview", "toast"].map((t) => n(`--z-${t}`));
    });
    expect(z).toEqual([...z].sort((a, b) => a - b));
    expect(new Set(z).size, "each tier is its own value").toBe(8);
  });

  test("with the guide open on a phone, the toast leaves its Skip and Continue pressable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await waitForAppReady(page);
    await dismissColdStart(page);
    await pasteNewDeck(page, `Commander\n1 ${TEST_COMMANDER}\n\nDeck\n${TEST_DECK_TEXT}`);
    const guide = page.locator(".upr-panel");
    await expect(guide).toBeVisible();
    const toast = page.locator(".toast").first();
    await expect(toast).toBeVisible();
    const t = await toast.boundingBox();
    const bar = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")));
    expect(t.y, "the toast moved to the top, under the bar").toBeLessThan(bar + 40);
    const buttons = guide.locator(".icm-foot button");
    const n = await buttons.count();
    expect(n, "the guide has footer buttons").toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const b = buttons.nth(i);
      await b.scrollIntoViewIfNeeded();
      const covered = await b.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return !(hit && (hit === el || el.contains(hit)));
      });
      expect(covered, `footer button ${i} is covered`).toBe(false);
    }
  });

  test("with Ask open on a phone, Import cards opens on top of it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await page.getByRole("button", { name: "Ask", exact: true }).first().click();
    await expect(page.locator(".ask-panel")).toBeVisible();
    await deckMenuAction(page, "Import cards");
    const panel = page.locator(".icm-panel");
    await expect(panel).toBeVisible();
    const top = await panel.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + 30);
      return Boolean(hit && el.contains(hit));
    });
    expect(top, "the dialog is under the Ask sheet").toBe(true);
  });
});
