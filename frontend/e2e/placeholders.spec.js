// Placeholders (visual pass job 5): a surface that waits shows a frame the size
// of what is coming, says it is busy, and hands over without moving the page.
// Each case holds one call, looks, releases it, and looks again.
import { test, expect } from "./fixtures/test-base.js";
import { waitForAppReady } from "./fixtures/helpers.js";
import { fakeCloud, cloudOrigin } from "./fixtures/fake-cloud.js";
import { TEST_DECK_STORAGE } from "./fixtures/test-data.js";

const SYNERGIES = {
  cards: ["Sol Ring", "Arcane Signet", "Smothering Tithe", "Doubling Season", "Contagion Engine"]
    .map((name, i) => ({ name, pct: 60 - i * 5, synergy: 0.4 - i * 0.05 })),
};

// A call that waits for release() before it is answered.
async function held(page, pattern, body) {
  let release;
  const gate = new Promise((r) => { release = r; });
  await page.route(pattern, async (route) => {
    await gate;
    return body === undefined
      ? route.fallback()
      : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return release;
}

const busy = (page) => page.locator('[aria-busy="true"]');

test.describe("Placeholders", () => {
  test("the commander page holds its layout while signature cards load", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    const release = await held(page, "**/api/commanders/synergies**", SYNERGIES);
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto("/commanders/atraxa-praetors-voice");
    await waitForAppReady(page);
    const sig = page.locator('.panel:has(.band-eyebrow:text("Signature cards"))');
    await expect(sig).toHaveAttribute("aria-busy", "true");
    await expect(sig.locator(".ph-sig-row")).toHaveCount(5);
    await page.waitForTimeout(4000); // the call is held for four seconds
    const before = await page.evaluate(() => window.__cls);
    const heightBefore = (await sig.boundingBox()).height;

    release();
    await expect(sig.locator(".cmdr-sig-row")).toHaveCount(5);
    await expect(sig).not.toHaveAttribute("aria-busy", "true");
    const heightAfter = (await sig.boundingBox()).height;
    expect(Math.abs(heightAfter - heightBefore), "panel height change at the swap").toBeLessThanOrEqual(2);
    const after = await page.evaluate(() => window.__cls);
    expect(after - before, "layout shift from the swap").toBeLessThan(0.02);
  });

  test("the directory shows card frames, not alt text, until it loads", async ({ page }) => {
    const release = await held(page, "**/api/commanders/directory");
    await page.goto("/commanders");
    await waitForAppReady(page);
    const grid = page.locator('.panel[aria-busy="true"] .card-grid');
    await expect(grid.locator(".ph-card")).toHaveCount(12);
    await expect(page.getByRole("status").filter({ hasText: "Loading commanders…" })).toHaveCount(1);
    release();
    await expect(page.getByRole("listitem", { name: "Atraxa, Praetors' Voice" })).toBeVisible();
    await expect(busy(page)).toHaveCount(0);
  });

  test("a commander's page opened cold shows its hero shape, busy until the directory arrives", async ({ page }) => {
    const release = await held(page, "**/api/commanders/directory");
    await page.goto("/commanders/atraxa-praetors-voice");
    await waitForAppReady(page);
    await expect(page.locator('.panel[aria-busy="true"] .commander-detail-hero .commander-detail-art')).toBeVisible();
    release();
    await expect(page.getByRole("heading", { name: "Atraxa, Praetors' Voice" })).toBeVisible();
    await expect(busy(page)).toHaveCount(0);
  });

  test("a card tile keeps its name in a frame while the picture loads", async ({ page }) => {
    const release = await held(page, /\/api\/cards\/image/);
    await page.goto("/commanders");
    await waitForAppReady(page);
    const tile = page.getByRole("listitem", { name: "Atraxa, Praetors' Voice" });
    await expect(tile.locator(".ph-card")).toContainText("Atraxa, Praetors' Voice");
    await expect(tile.locator("img")).toHaveCount(0);
    release();
    await expect(tile.locator("img")).toBeVisible();
    await expect(tile.locator(".ph-card")).toHaveCount(0);
  });

  test("reduced motion stops the placeholder pulse", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await held(page, "**/api/commanders/directory");
    await page.goto("/commanders");
    await waitForAppReady(page);
    await expect(page.locator(".ph-card").first()).toBeVisible();
    await page.waitForTimeout(300);
    const running = await page.evaluate(() =>
      document.getAnimations().filter((a) => a.animationName === "phPulse" && a.playState === "running").length);
    expect(running).toBe(0);
  });

  for (const width of [768, 390]) {
    test(`a commander's page opened cold does not shift when the directory and cards arrive (${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1024 });
      const releaseDir = await held(page, "**/api/commanders/directory");
      const releaseSyn = await held(page, "**/api/commanders/synergies**", SYNERGIES);
      await page.addInitScript(() => {
        window.__cls = 0;
        window.__shifts = [];
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (e.hadRecentInput) continue;
            window.__cls += e.value;
            window.__shifts.push(`${e.value.toFixed(3)} ${(e.sources || []).map((s) => `${s.node?.nodeName}.${s.node?.className} ${Math.round(s.previousRect.y)}+${Math.round(s.previousRect.height)}>${Math.round(s.currentRect.y)}+${Math.round(s.currentRect.height)}`).join(" | ")}`);
          }
        }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto("/commanders/atraxa-praetors-voice");
      await waitForAppReady(page);
      await expect(page.locator(".ph-oracle")).toBeVisible();
      await page.waitForTimeout(1500);
      releaseDir();
      await expect(page.getByRole("heading", { name: "Atraxa, Praetors' Voice" })).toBeVisible();
      await page.waitForTimeout(1500);
      releaseSyn();
      await expect(page.locator(".cmdr-sig-row")).toHaveCount(5);
      await page.waitForTimeout(500);
      const shifts = await page.evaluate(() => window.__shifts);
      expect(await page.evaluate(() => window.__cls), `layout shift at ${width}: ${shifts.join(" ;; ")}`).toBeLessThan(0.02);
    });
  }

  test("the card preview's frame is the same size as its picture", async ({ page }) => {
    for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      await page.goto("/");
      await waitForAppReady(page);
      const w = await page.evaluate(() => {
        const modal = document.createElement("div");
        modal.className = "card-modal";
        // One at a time: side by side, the two would shrink each other in the flex row.
        const widthOf = (html) => {
          const modal = document.createElement("div");
          modal.className = "card-modal";
          modal.innerHTML = html;
          document.body.appendChild(modal);
          const width = modal.firstElementChild.getBoundingClientRect().width;
          modal.remove();
          return width;
        };
        return [
          widthOf('<img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==">'),
          widthOf('<div class="ph-card card-modal-ph"></div>'),
        ];
      });
      expect(Math.abs(w[0] - w[1]), `frame ${w[1]} vs picture ${w[0]} at ${size.width}`).toBeLessThanOrEqual(1);
    }
  });

  // A deck address while the account's deck list loads: header, strip and one
  // column laid out where the real page's are, so the swap does not move the board.
  test.describe("signed in", () => {
    test.skip(!cloudOrigin, "no frontend/.env, so this build has no cloud mode");
    for (const width of [1280, 768, 390]) {
      test(`the deck address holds the deck page's layout (${width})`, async ({ page }, testInfo) => {
        // Sized by viewport width on a desktop browser; the touch project lays the deck page out differently.
        test.skip(testInfo.project.name.includes("mobile"), "desktop browser only");
        await page.setViewportSize({ width, height: 900 });
        const deck = {
          id: "33333333-3333-4333-8333-333333333333", name: "Cloud deck", format: "commander",
          decklist_text: TEST_DECK_STORAGE.decklist_text, updated_at: "2026-01-02T00:00:00.000Z",
        };
        await fakeCloud(page, [deck]);
        const release = await held(page, `${cloudOrigin}/rest/v1/decks**`);
        await page.goto(`/decks/${deck.id}`);
        await waitForAppReady(page);
        const waiting = page.locator('[aria-busy="true"]:has(.ph-deck-head)');
        await expect(waiting).toHaveCount(1);
        await expect(page.getByRole("status").filter({ hasText: "Loading deck…" })).toHaveCount(1);
        const colTop = async (sel) => (await page.locator(sel).first().boundingBox()).y;
        const holding = { head: (await page.locator(".ph-deck-head").boundingBox()).height, col: await colTop(".ph-deck-col .ph-card") };

        release();
        await expect(page.locator(".stack-card-wrap").first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
        const real = { head: (await page.locator(".deck-head").boundingBox()).height, col: await colTop(".stack-card-wrap") };
        expect(Math.abs(holding.head - real.head), `header ${holding.head} vs ${real.head}`).toBeLessThanOrEqual(2);
        expect(Math.abs(holding.col - real.col), `first card top ${holding.col} vs ${real.col}`).toBeLessThanOrEqual(8);
      });
    }
  });

  test("with motion allowed the pulse is running (so the check above can fail)", async ({ page }) => {
    await held(page, "**/api/commanders/directory");
    await page.goto("/commanders");
    await waitForAppReady(page);
    await expect(page.locator(".ph-card").first()).toBeVisible();
    const running = await page.evaluate(() =>
      document.getAnimations().filter((a) => a.animationName === "phPulse" && a.playState === "running").length);
    expect(running).toBeGreaterThan(0);
  });
});
