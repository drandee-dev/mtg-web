// Placeholders (visual pass job 5): a surface that waits shows a frame the size
// of what is coming, says it is busy, and hands over without moving the page.
// Each case holds one call, looks, releases it, and looks again.
import { test, expect } from "./fixtures/test-base.js";
import { waitForAppReady } from "./fixtures/helpers.js";

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
    await expect(page.locator('.panel[aria-busy="true"] .ph-hero .ph-card')).toBeVisible();
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
