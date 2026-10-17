// Text contrast gate (visual pass job 3). Walks the main screens in both
// themes at a desktop and a phone width and checks every visible text element
// against WCAG AA: 4.5:1, or 3:1 for large text (24px, or 18.66px and bold).
//
// Colours are the computed ones, composited through the ancestor chain onto the
// first opaque background. An element sitting on a gradient or an image has no
// single background to measure, so it is counted as skipped instead of passed;
// disabled controls are exempt (WCAG), placeholders and hover states are not
// reached. CONTRAST_REPORT=<prefix> writes every failing pair to
// <prefix>.<theme>-<width>.json.
import fs from "node:fs";
import { test, expect } from "./fixtures/test-base.js";
import { loadSharedDeck, openAddress, openDeckSection, setCardView, newDeckDoor } from "./fixtures/helpers.js";

const DECK = "1 Sol Ring\n1 Arcane Signet\n1 Command Tower\n1 Swords to Plowshares\n1 Counterspell";
const CMDR = "Atraxa, Praetors' Voice";
const SIZES = [[1440, 900], [390, 844]];
const THEMES = ["dark", "light"];

// In the page: the failing and skipped text elements of what is on screen now.
function auditPage() {
  const parse = (s) => {
    const m = /^rgba?\(([^)]+)\)$/.exec(s.trim());
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, under) => {
    const a = top.a + under.a * (1 - top.a);
    const mix = (c) => (top[c] * top.a + under[c] * under.a * (1 - top.a)) / (a || 1);
    return { r: mix("r"), g: mix("g"), b: mix("b"), a };
  };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  // The background an element's text sits on, or null when it cannot be measured.
  const backdrop = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== "none") return null;
      const c = parse(cs.backgroundColor);
      if (!c) return null;
      if (c.a > 0) layers.push(c);
      if (c.a === 1) break;
    }
    let acc = layers.length && layers[layers.length - 1].a === 1 ? layers.pop() : { r: 255, g: 255, b: 255, a: 1 };
    while (layers.length) acc = over(layers.pop(), acc);
    return acc;
  };

  const failures = [];
  const skippedSel = new Set();
  let checked = 0, skipped = 0;
  for (const el of document.body.querySelectorAll("*")) {
    if (["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "PATH"].includes(el.tagName.toUpperCase())) continue;
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
    if (!text) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width <= 2 || r.height <= 2 || cs.visibility === "hidden" || cs.display === "none") continue;
    if (el.closest(":disabled, [aria-disabled='true'], [hidden], .visually-hidden")) continue;
    if (cs.webkitTextFillColor && cs.backgroundClip === "text") continue;
    const bg = backdrop(el);
    const fgRaw = parse(cs.color);
    if (!bg || !fgRaw) {
      skipped++;
      skippedSel.add(el.tagName.toLowerCase() + [...el.classList].map((c) => "." + c).join(""));
      continue;
    }
    let opacity = 1;
    for (let n = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
    if (opacity < 0.05) continue; // shown on hover or focus only (the rename pencil)
    const fg = over({ ...fgRaw, a: fgRaw.a * opacity }, bg);
    const l1 = lum(fg), l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const px = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    const need = px >= 24 || (px >= 18.66 && bold) ? 3 : 4.5;
    checked++;
    if (ratio < need) {
      failures.push({
        sel: el.tagName.toLowerCase() + [...el.classList].map((c) => "." + c).join(""),
        text: text.slice(0, 32), fg: hex(fg), bg: hex(bg), ratio: Math.round(ratio * 100) / 100, need, px,
      });
    }
  }
  return { failures, checked, skipped, skippedSel: [...skippedSel] };
}

for (const theme of THEMES) {
  for (const [w, h] of SIZES) {
    test.describe(`${theme} ${w}px`, () => {
      test.use({ viewport: { width: w, height: h } });

      test("text meets WCAG AA contrast on the main screens", async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== "desktop-chrome", "sizes its own viewport");
        await page.addInitScript((t) => localStorage.setItem("mtgweb:theme", t), theme);

        const seen = new Map();
        const skippedAll = [];
        let measured = 0;
        // `ready`: something that only exists once the screen has its content, so a
        // screen is never measured while it still says "loading". The pause after
        // it is longer than the 150ms button transitions, so no colour is caught
        // half way.
        const audit = async (screen, ready) => {
          if (ready) await ready.first().waitFor({ state: "visible", timeout: 15000 });
          await page.waitForTimeout(350);
          const { failures, checked, skippedSel } = await page.evaluate(auditPage);
          measured += checked;
          skippedAll.push(...skippedSel.map((s) => `${s} (${screen})`));
          expect(checked, `${screen}: nothing was measured`).toBeGreaterThan(0);
          for (const f of failures) {
            const key = `${f.sel}|${f.fg}|${f.bg}`;
            if (!seen.has(key)) seen.set(key, { ...f, screens: [screen] });
            else if (!seen.get(key).screens.includes(screen)) seen.get(key).screens.push(screen);
          }
        };

        await openAddress(page, "/");
        await audit("decks home, empty");
        await openAddress(page, "/new");
        await audit("new deck");
        await newDeckDoor(page, "Paste or import").click();
        await audit("new deck, paste door");

        await loadSharedDeck(page, DECK, CMDR);
        await audit("deck, stacks");
        await setCardView(page, { mode: "Grid" });
        await audit("deck, grid");
        await setCardView(page, { mode: "List" });
        await audit("deck, list");
        for (const tab of ["How to play", "Improve", "Stats"]) {
          await openDeckSection(page, tab);
          // Stats says "Add cards" for about 2.5s before its tiles and roles arrive.
          await audit(`deck, ${tab}`, tab === "Stats" ? page.getByRole("heading", { name: /Deck DNA/ }) : undefined);
        }

        await page.getByRole("button", { name: "Ask", exact: true }).click();
        await audit("deck, Ask drawer open", page.locator(".ask-panel"));

        await openAddress(page, "/commanders");
        await audit("commanders");
        await openAddress(page, "/cards");
        await audit("cards");
        await openAddress(page, "/rules");
        await audit("rules");
        await openAddress(page, "/");
        await page.getByRole("button", { name: "Account menu" }).click();
        await audit("account menu");
        await openAddress(page, "/nowhere-at-all");
        await audit("unknown address");

        // Three things that only show in rare states, with the app's own classes
        // (App.jsx, ServerStatusBanner.jsx, StackCard): the sign-in return banner is
        // a bright green fill, the offline banner is always dark red, and the
        // synergy badge is a near-black chip over card art, in either theme.
        await page.evaluate(() => {
          document.body.insertAdjacentHTML("beforeend",
            `<div class="pwa-return-banner" role="alert"><span>Signed in! You can return to the MTG Workshop app now.</span><button aria-label="Dismiss">✕</button></div>
             <div class="server-banner offline" role="alert"><span class="server-banner-dot"></span><span>Server unreachable — deck tools may not work.</span><button class="server-banner-retry">Retry</button></div>
             <span class="stack-card-synergy" style="position:fixed;top:120px;left:40px">★ 3 synergies</span>`);
        });
        await audit("the return and offline banners, a synergy badge", page.locator(".pwa-return-banner"));

        const rows = [...seen.values()].sort((a, b) => a.ratio - b.ratio);
        if (process.env.CONTRAST_REPORT) {
          fs.writeFileSync(`${process.env.CONTRAST_REPORT}.${theme}-${w}.json`, JSON.stringify([{ theme, width: w, measured, failing: rows, skipped: skippedAll }], null, 1));
        }
        expect(rows.map((r) => `${r.sel} "${r.text}" ${r.fg} on ${r.bg} = ${r.ratio} (needs ${r.need}) in ${r.screens.join(", ")}`)).toEqual([]);
      });
    });
  }
}
