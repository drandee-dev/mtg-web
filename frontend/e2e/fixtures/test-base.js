// Shared test base: extends Playwright's `test` so every spec runs against the
// hermetic backend mock (see mock-backend.js). Specs import { test, expect } from
// here instead of "@playwright/test" — the route mock is installed before each
// navigation, so the health check passes and no server banner appears.
import { test as base, expect } from "@playwright/test";
import { mockBackend } from "./mock-backend.js";

export const test = base.extend({
  page: async ({ page }, use) => {
    await mockBackend(page);
    // Pre-mark one-time activation nudges as seen so they don't perturb
    // unrelated specs/visual baselines. The activation-flows spec clears
    // these keys itself to exercise the nudges.
    await page.addInitScript(() => {
      try { localStorage.setItem("mtgweb:pwseen", "1"); } catch { /* ignore */ }
    });
    await use(page);
  },
});

export { expect };
