// One changeset out of the "what should I change" sources.
//
// Suggestions (deck/recommend) and budget swaps (deck/budget-swaps) still own
// their own EDHREC/algorithmic sources. Cuts (deck/ai/cuts) and power
// upgrades (deck/ai/upgrades) used to be two more paid completions against
// the same deck payload; they're now one AI-sourced list read off the same
// `optimize` result (deck/optimize) the AI pass already
// produces, instead of buying two more completions. They produce one list
// here, in the shape the Suggested changes cards already render, so there is a
// single apply/skip interaction and a single session log.
//
// `source` rides along on every change so a skip lands in the set that source
// owns: skipped suggestions and declined budget swaps are separate persisted
// verdicts. Optimize-sourced changes have no source-owned verdict set of
// their own (see DeckView's insightDecided comment) — a skip on one is just
// an `insightDecided` write.

import { fmtUsd } from "./format.js";
import { pickCategories } from "./categories.js";

export const REC_CATEGORIES = pickCategories(
  "high_synergy", "top_cards", "creatures", "instants", "sorceries", "artifacts",
  "mana_artifacts", "enchantments", "planeswalkers", "battles", "lands",
);

/** The suggestion list to show: the one picked if it has cards, else the first that
 *  does. A commander's page can lack a list (Atraxa has no high-lift list), and the
 *  Improve tab used to open on that empty list as "Nothing left here". */
export function recCategoryOrFirst(recs, picked) {
  const has = (k) => recs?.categories?.[k]?.length;
  return has(picked) ? picked : (REC_CATEGORIES.find(([k]) => has(k))?.[0] ?? picked);
}

const REC_LABEL = Object.fromEntries(REC_CATEGORIES);

// The share of this commander's EDHREC decks that play the card. This used to print
// EDHREC's synergy score as "Played in N%", which it is not (a synergy can even be
// negative); budget swaps' "Played in N%" is the real share, so the two now agree.
// Under 100 decks there is no share, the same floor as budget swaps
// (_MIN_COMMANDER_DECKS): 6 of 12 is no "50%".
const MIN_COMMANDER_DECKS = 100;
function deckShare(c) {
  return c?.potential_decks >= MIN_COMMANDER_DECKS
    ? Math.round((100 * (c.num_decks || 0)) / c.potential_decks)
    : null;
}

function recReason(share) {
  return share != null
    ? `Played in ${share}% of this commander's decks.`
    : "Commonly played alongside this commander.";
}

/** Which change `source` each list of the Suggested changes switch shows (audit job
 *  6.3). The switch's value is still called `upgradeMode` where it is stored. */
export const SOURCE_OF_MODE = { recs: "rec", budget: "upgrade", power: "optimize" };

/** Every proposal from every loaded source. The pane shows one source at a time
 *  (`SOURCE_OF_MODE`); the Improve tab's count is all of them. */
export function buildChanges({
  recs, recCat, optimize, budgetSwaps,
  skipped, declinedUpgrades, pinned, decided,
}) {
  const out = [];
  const rowOf = (name) => {
    for (const list of Object.values(recs?.categories || {})) {
      const row = list.find((c) => c.name === name);
      if (row) return row;
    }
    return null;
  };

  // Pinned suggestions stay at the top and survive refreshes and deck edits.
  for (const name of pinned || []) {
    const row = rowOf(name);
    out.push({
      id: `rec:${name}`, source: "rec", isPinned: true, action: "add", add: name,
      category: "Pinned", impact: "high", reason: recReason(deckShare(row)),
      themeTag: row?.theme_tag || null,
    });
  }
  for (const c of recs?.categories?.[recCat] || []) {
    if (c.in_deck || skipped?.has(c.name) || pinned?.has(c.name)) continue;
    out.push({
      id: `rec:${c.name}`, source: "rec", action: "add", add: c.name,
      category: REC_LABEL[recCat] || recCat,
      impact: (c.synergy ?? 0) >= 0.7 ? "high" : "medium",
      reason: recReason(deckShare(c)),
      themeTag: c.theme_tag || null, // the server's theme reading (audit job 6.1)
    });
  }
  // AI-sourced changeset — cuts, adds and swaps in one pass, goal-aware.
  for (const ch of optimize?.changes || []) {
    out.push({ ...ch, source: "optimize" });
  }
  if (budgetSwaps) {
    for (const sw of budgetSwaps.swaps || []) {
      if (!sw?.alternative?.name || declinedUpgrades?.has(sw.card)) continue;
      const from = Number(sw.price);
      const to = Number(sw.alternative.price);
      const priced = Number.isFinite(to) && Number.isFinite(from);
      // Set by the server only when this commander's EDHREC page has enough decks.
      const pct = sw.alternative.commander_pct;
      const played = pct ? ` Played in ${pct}% of this commander's decks.` : "";
      out.push({
        id: `up:${sw.card}`, source: "upgrade", action: "swap",
        cut: sw.card, add: sw.alternative.name, category: "Budget", impact: "low",
        price_delta: priced ? to - from : null,
        reason: (priced
          ? `Same job for ${fmtUsd(to)} instead of ${fmtUsd(from)}.`
          : "Cheaper card doing the same job.") + played,
      });
    }
  }
  // A proposal already applied or skipped never renders again. Without this,
  // applying an add leaves the card on screen and a second click appends a
  // second copy of it to the decklist.
  return out.filter((ch) => !decided?.[ch.id]);
}
