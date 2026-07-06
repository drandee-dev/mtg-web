// Per-deck persistence for the right-sidebar insight results (analysis,
// suggestions, cuts, combos, upgrades, strategy) plus which tool was open.
// DeckView unmounts on every tab switch, so without this each paid AI panel
// would be lost and re-bought on return. Keyed like goals/optlog:
// `mtgweb:insights:{deckId||"current"}`.
//
// Each panel is stored with the deck *signature* it was generated against.
// The signature hashes card presence only — adding/removing a card (or
// changing commander/format) changes it; quantity tweaks and art/printing
// pins do not. A cached panel whose sig no longer matches is shown as
// "deck changed" (stale) and refreshes only on explicit user action.

import { parseDeckText, commanderNamesClean } from "./deckParser";

const key = (deckId) => `mtgweb:insights:${deckId || "current"}`;

// Panel state keys DeckView persists (result/comp are free recomputes but
// hydrating them makes the sidebar render instantly; the rest are lazy or AI).
export const PANEL_KEYS = ["result", "comp", "recs", "cuts", "combos", "budgetSwaps", "upgrades", "strategy"];

/** Card-presence signature: sorted unique card names + commanders + format.
 * Quantities and printing suffixes deliberately excluded. */
export function deckSignature(decklist, commander, format) {
  const names = parseDeckText(decklist).cards.map((c) => c.name.toLowerCase());
  const cmdr = commanderNamesClean(commander).map((n) => n.toLowerCase());
  return `${format}|${cmdr.sort().join(",")}|${[...new Set(names)].sort().join(",")}`;
}

/** → { panels: {key: {data, sig}}, activePanel, upgradeMode,
 *      pinned: [names], dismissed: [names], dismissedCuts: [names] } or null. */
export function loadInsights(deckId) {
  try {
    const raw = localStorage.getItem(key(deckId));
    const obj = raw ? JSON.parse(raw) : null;
    return obj && typeof obj === "object" && obj.panels ? obj : null;
  } catch {
    return null;
  }
}

export function saveInsights(deckId, { panels, activePanel, upgradeMode, pinned, dismissed, dismissedCuts }) {
  try {
    const kept = {};
    for (const k of PANEL_KEYS) {
      if (panels[k]?.data != null) kept[k] = panels[k];
    }
    const hasPrefs = pinned?.length || dismissed?.length || dismissedCuts?.length;
    if (Object.keys(kept).length === 0 && !activePanel && !hasPrefs) {
      localStorage.removeItem(key(deckId));
      return;
    }
    localStorage.setItem(key(deckId), JSON.stringify({
      v: 1, panels: kept, activePanel: activePanel || null, upgradeMode,
      // User verdicts on individual suggestions — deliberately NOT tied to the
      // deck signature: pins and dismissals survive deck edits and refreshes.
      pinned: pinned || [], dismissed: dismissed || [], dismissedCuts: dismissedCuts || [],
      savedAt: Date.now(),
    }));
  } catch {
    /* storage full or blocked — the cache is best-effort */
  }
}

export function clearInsights(deckId) {
  try { localStorage.removeItem(key(deckId)); } catch { /* best-effort */ }
}
