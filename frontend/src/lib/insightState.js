// How a deck's cached insight bundle (lib/insightsCache.js) maps to and from
// the state DeckView keeps. Pure, so `node --test` can run it: the hook in
// useInsightCache.js only wires these to React state and effects.

import { PANEL_KEYS } from "./insightsCache.js";

// Suggest / Cuts / Upgrades collapsed into one "Changes" tab — a cache written
// before that still names the old tabs, so map it forward on hydrate.
const OLD_CHANGE_PANELS = new Set(["Recommendations", "Cuts", "Upgrades"]);
export const migratePanel = (p) => (OLD_CHANGE_PANELS.has(p) ? "Changes" : p);

// The budget-swaps rules the server answers with (its `v`); keep in step with
// BUDGET_SWAPS_VERSION in backend/app/mtg.py. Cached swaps from older rules are
// dropped on hydrate, so the page fetches them again (free: no AI) instead of
// showing swaps the server no longer makes, as happened after 2026-10-23's fix.
export const BUDGET_SWAPS_VERSION = 2;
const currentSwaps = (d) => (d && d.v === BUDGET_SWAPS_VERSION ? d : null);

/** A cache from `loadInsights` (or null for a deck with none) → the values the
 * state starts from, or is reset to on a deck switch. `upgradeMode` is null
 * when the cache has none: a first load then defaults to "budget", and a deck
 * switch leaves the mode where it is. */
export function stateFromCache(c) {
  const data = (k) => c?.panels?.[k]?.data ?? null;
  const panelSigs = {};
  for (const k of PANEL_KEYS) {
    const sig = c?.panels?.[k]?.sig;
    if (sig) panelSigs[k] = sig;
  }
  return {
    result: data("result"),
    comp: data("comp"),
    recs: data("recs"),
    combos: data("combos"),
    budgetSwaps: currentSwaps(data("budgetSwaps")),
    strategy: data("strategy"),
    ratings: data("ratings"),
    panelSigs,
    activePanel: migratePanel(c?.activePanel ?? null),
    upgradeMode: c?.upgradeMode || null,
    skipped: new Set(c?.dismissed || []),
    pinned: new Set(c?.pinned || []),
    dismissedCuts: new Set(c?.dismissedCuts || []),
    declinedUpgrades: new Set(c?.declinedUpgrades || []),
    insightDecided: c?.insightDecided || {},
  };
}

/** The state → what `saveInsights` takes. A panel with no data is left out. */
export function cacheFromState(s) {
  const data = {
    result: s.result, comp: s.comp, recs: s.recs, combos: s.combos,
    budgetSwaps: s.budgetSwaps, strategy: s.strategy, ratings: s.ratings,
  };
  const panels = {};
  for (const k of PANEL_KEYS) {
    if (data[k] != null) panels[k] = { data: data[k], sig: s.panelSigs[k] || null };
  }
  return {
    panels,
    activePanel: s.activePanel,
    upgradeMode: s.upgradeMode,
    pinned: [...s.pinned],
    dismissed: [...s.skipped],
    dismissedCuts: [...s.dismissedCuts],
    declinedUpgrades: [...s.declinedUpgrades],
    insightDecided: s.insightDecided,
  };
}
