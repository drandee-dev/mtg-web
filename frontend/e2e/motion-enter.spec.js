import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, waitForAppReady, seedLocalDecks } from "./fixtures/helpers.js";
import { TEST_DECK_TEXT, TEST_COMMANDER } from "./fixtures/test-data.js";

// Visual pass I11: enter fades for the desktop modal, toast and Ask drawer (opacity and
// transform only), pressed state for links and tiles, reduced motion honoured.

const animOf = (loc) => loc.evaluate((el) => getComputedStyle(el).animationName);

test.describe("enter motion (desktop)", () => {
  test.beforeEach(({ isMobile }) => test.skip(isMobile, "desktop enters; the phone's sheets already slide"));

  test("toast, card modal backdrop and Ask drawer have an enter animation", async ({ page }) => {
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await expect(page.locator(".toast")).toContainText("Saved", { timeout: 10000 });
    expect(await animOf(page.locator(".toast"))).toBe("toastIn");

    await page.locator('.card-grid-container [aria-label*="Sol Ring"]').first().click();
    await expect(page.locator(".cdm-panel")).toBeVisible();
    expect(await animOf(page.locator(".cdm-overlay"))).toBe("fadeIn");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.locator(".ask-panel")).toBeVisible();
    expect(await animOf(page.locator(".ask-panel"))).toBe("fadeIn");
  });

  test("the enter keyframes only touch opacity and transform", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    const props = await page.evaluate(() => {
      const found = {};
      for (const sheet of document.styleSheets) {
        for (const r of sheet.cssRules) {
          if (r.type === CSSRule.KEYFRAMES_RULE && ["toastIn", "fadeIn"].includes(r.name)) {
            found[r.name] = [...new Set([...r.cssRules].flatMap((k) => [...k.style]))].sort();
          }
        }
      }
      return found;
    });
    expect(props.fadeIn).toEqual(["opacity"]);
    expect(props.toastIn).toEqual(["opacity", "transform"]);
  });

  test("reduced motion collapses the enter animations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await loadSharedDeck(page, TEST_DECK_TEXT, TEST_COMMANDER);
    await expect(page.locator(".toast")).toContainText("Saved", { timeout: 10000 });
    // Declared, and collapsed to ~0 by the global reduced-motion rule.
    const s = await page.locator(".toast").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { name: cs.animationName, dur: parseFloat(cs.animationDuration) };
    });
    expect(s.name).toBe("toastIn");
    expect(s.dur).toBeLessThan(0.001);
  });
});

test.describe("pressed state", () => {
  test("a text link dims while pressed", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);
    await page.evaluate(() => {
      const a = document.createElement("a");
      a.id = "probe-link"; a.href = "#probe"; a.textContent = "Probe";
      a.style.cssText = "position:fixed;top:80px;left:20px;z-index:9999";
      document.body.appendChild(a);
    });
    const a = page.locator("#probe-link");
    const box = await a.boundingBox();
    await page.mouse.move(box.x + 4, box.y + 4);
    await page.mouse.down();
    expect(await a.evaluate((el) => getComputedStyle(el).opacity)).toBe("0.7");
    await page.mouse.up();
  });

  test("a deck tile scales while its link is pressed, not its menu", async ({ page, isMobile }) => {
    test.skip(isMobile, "pressed tiles are pointer feedback");
    await page.goto("/");
    await waitForAppReady(page);
    await seedLocalDecks(page, [{
      id: "tile-deck", name: "Tile deck", format: "commander",
      decklist_text: `Commander\n1 ${TEST_COMMANDER}\nDeck\n${TEST_DECK_TEXT}`,
    }]);
    await page.goto("/?tab=decks");
    const link = page.locator(".deck-card-link").first();
    await link.waitFor();
    const tile = page.locator(".deck-card").first();
    const box = await link.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const t = await tile.evaluate((el) => getComputedStyle(el).transform);
    await page.mouse.up();
    expect(t).not.toBe("none");
  });
});
