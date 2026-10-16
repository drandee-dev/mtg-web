// Run with: node --test src/lib/insightState.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateFromCache, cacheFromState, migratePanel } from "./insightState.js";

const CACHE = {
  v: 1,
  panels: {
    result: { data: { total_cards: 99 }, sig: "sig-r" },
    recs: { data: { categories: {} }, sig: "sig-recs" },
    strategy: { data: { strategy: "S", game_plan: "G" }, sig: null },
  },
  activePanel: "Changes",
  upgradeMode: "power",
  pinned: ["Sol Ring"],
  dismissed: ["Opt"],
  dismissedCuts: ["Forest"],
  declinedUpgrades: ["Cultivate"],
  insightDecided: { "rec:Opt": "skipped" },
};

test("a deck with no cache starts empty", () => {
  const s = stateFromCache(null);
  for (const k of ["result", "comp", "recs", "combos", "budgetSwaps", "strategy", "ratings"]) assert.equal(s[k], null);
  assert.deepEqual(s.panelSigs, {});
  assert.equal(s.activePanel, null);
  assert.equal(s.upgradeMode, null);
  assert.equal(s.skipped.size + s.pinned.size + s.dismissedCuts.size + s.declinedUpgrades.size, 0);
  assert.deepEqual(s.insightDecided, {});
});

test("a cache fills each panel, its signature and the five verdicts", () => {
  const s = stateFromCache(CACHE);
  assert.deepEqual(s.result, { total_cards: 99 });
  assert.equal(s.comp, null);
  assert.deepEqual(s.panelSigs, { result: "sig-r", recs: "sig-recs" }); // no sig, none recorded
  assert.equal(s.activePanel, "Changes");
  assert.equal(s.upgradeMode, "power");
  assert.deepEqual([...s.pinned], ["Sol Ring"]);
  assert.deepEqual([...s.skipped], ["Opt"]);
  assert.deepEqual([...s.dismissedCuts], ["Forest"]);
  assert.deepEqual([...s.declinedUpgrades], ["Cultivate"]);
  assert.deepEqual(s.insightDecided, { "rec:Opt": "skipped" });
});

test("the old tab names map to Changes; others are left alone", () => {
  for (const old of ["Recommendations", "Cuts", "Upgrades"]) assert.equal(migratePanel(old), "Changes");
  assert.equal(migratePanel("Combos"), "Combos");
  assert.equal(migratePanel(null), null);
  assert.equal(stateFromCache({ panels: {}, activePanel: "Cuts" }).activePanel, "Changes");
});

test("saving leaves out a panel with no data and turns the sets into lists", () => {
  const out = cacheFromState(stateFromCache(CACHE));
  assert.deepEqual(Object.keys(out.panels).sort(), ["recs", "result", "strategy"]);
  assert.equal(out.panels.strategy.sig, null);
  assert.equal(out.panels.result.sig, "sig-r");
  assert.deepEqual(out.pinned, ["Sol Ring"]);
  assert.deepEqual(out.dismissed, ["Opt"]);
  assert.deepEqual(out.dismissedCuts, ["Forest"]);
  assert.deepEqual(out.declinedUpgrades, ["Cultivate"]);
});

test("what is saved loads back to the same state", () => {
  const first = stateFromCache(CACHE);
  const again = stateFromCache(cacheFromState(first));
  assert.deepEqual(again, first);
});
