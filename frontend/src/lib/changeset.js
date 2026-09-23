// One changeset out of the "what should I change" sources.
//
// Suggestions (deck/recommend) and budget swaps (deck/budget-swaps) still own
// their own EDHREC/algorithmic sources. Cuts (deck/ai/cuts) and power
// upgrades (deck/ai/upgrades) used to be two more paid completions against
// the same deck payload; they're now one AI-sourced list read off the same
// `optimize` result (deck/optimize) the sidebar Optimize widget already
// produces, instead of buying two more completions. They produce one list
// here, in the shape the Optimize queue's cards already render, so there is a
// single apply/skip interaction and a single session log.
//
// `source` rides along on every change so a skip lands in the set that source
// owns: skipped suggestions and declined budget swaps are separate persisted
// verdicts. Optimize-sourced changes have no source-owned verdict set of
// their own (see DeckView's insightDecided comment) — a skip on one is just
// an `insightDecided` write.

import { fmtUsd } from "./format";

export const REC_CATEGORIES = [
  ["high_synergy", "High synergy"],
  ["top_cards", "Top cards"],
  ["creatures", "Creatures"],
  ["instants", "Instants"],
  ["sorceries", "Sorceries"],
  ["artifacts", "Artifacts"],
  ["enchantments", "Enchantments"],
  ["planeswalkers", "Planeswalkers"],
  ["lands", "Lands"],
];

const REC_LABEL = Object.fromEntries(REC_CATEGORIES);

function recReason(synergy) {
  return synergy != null
    ? `Played in ${Math.round(synergy * 100)}% of decks like this one.`
    : "Commonly played alongside this commander.";
}

export function buildChanges({
  recs, recCat, optimize, budgetSwaps, upgradeMode,
  skipped, declinedUpgrades, pinned, decided,
}) {
  const out = [];
  const synergyOf = (name) => {
    for (const list of Object.values(recs?.categories || {})) {
      const hit = list.find((c) => c.name === name);
      if (hit?.synergy != null) return hit.synergy;
    }
    return null;
  };

  // Pinned suggestions stay at the top and survive refreshes and deck edits.
  for (const name of pinned || []) {
    out.push({
      id: `rec:${name}`, source: "rec", isPinned: true, action: "add", add: name,
      category: "Pinned", impact: "high", reason: recReason(synergyOf(name)),
    });
  }
  for (const c of recs?.categories?.[recCat] || []) {
    if (c.in_deck || skipped?.has(c.name) || pinned?.has(c.name)) continue;
    out.push({
      id: `rec:${c.name}`, source: "rec", action: "add", add: c.name,
      category: REC_LABEL[recCat] || recCat,
      impact: (c.synergy ?? 0) >= 0.7 ? "high" : "medium",
      reason: recReason(c.synergy),
    });
  }
  // AI-sourced changeset — cuts, adds and swaps in one pass, goal-aware.
  // Unconditional (not upgradeMode-gated): it stands in for both the old
  // cuts and power-upgrades sources, and budget mode adds budgetSwaps on
  // top of it rather than replacing it.
  for (const ch of optimize?.changes || []) {
    out.push({ ...ch, source: "optimize" });
  }
  if (upgradeMode === "budget") {
    for (const sw of budgetSwaps?.swaps || []) {
      if (!sw?.alternative?.name || declinedUpgrades?.has(sw.card)) continue;
      const from = Number(sw.price);
      const to = Number(sw.alternative.price);
      const priced = Number.isFinite(to) && Number.isFinite(from);
      out.push({
        id: `up:${sw.card}`, source: "upgrade", action: "swap",
        cut: sw.card, add: sw.alternative.name, category: "Budget", impact: "low",
        price_delta: priced ? to - from : null,
        reason: priced
          ? `Same job for ${fmtUsd(to)} instead of ${fmtUsd(from)}.`
          : "Cheaper card doing the same job.",
      });
    }
  }
  // A proposal already applied or skipped never renders again. Without this,
  // applying an add leaves the card on screen and a second click appends a
  // second copy of it to the decklist.
  return out.filter((ch) => !decided?.[ch.id]);
}
