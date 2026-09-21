// One changeset out of the three "what should I change" sources.
//
// Suggestions (deck/recommend), cuts (deck/ai/cuts) and upgrades
// (deck/budget-swaps or deck/ai/upgrades) used to each own a tab, and all
// three resolved to "cut this, add that". They produce one list here, in the
// shape the Optimize queue's cards already render, so there is a single
// apply/skip interaction and a single session log.
//
// `source` rides along on every change so a skip lands in the set that source
// owns: skipped suggestions and kept cuts are separate persisted verdicts.

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
  recs, recCat, cuts, budgetSwaps, upgrades, upgradeMode,
  skipped, dismissedCuts, declinedUpgrades, pinned, decided,
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
  for (const c of cuts?.cuts || []) {
    if (dismissedCuts?.has(c.name)) continue;
    out.push({
      id: `cut:${c.name}`, source: "cut", action: "cut", cut: c.name,
      category: "Cut", impact: "medium", reason: c.reason || null,
    });
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
  } else {
    for (const u of upgrades?.upgrades || []) {
      if (!u?.replacement || declinedUpgrades?.has(u.replaces)) continue;
      out.push({
        id: `up:${u.replaces}`, source: "upgrade", action: "swap",
        cut: u.replaces, add: u.replacement, category: "Power", impact: "high",
        price_delta: null, reason: u.reason || null,
      });
    }
  }
  // A proposal already applied or skipped never renders again. Without this,
  // applying an add leaves the card on screen and a second click appends a
  // second copy of it to the decklist.
  return out.filter((ch) => !decided?.[ch.id]);
}
