// Run with: node --test src/lib/changeset.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChanges } from "./changeset.js";

const swapsOf = (alternative) => buildChanges({
  upgradeMode: "budget",
  budgetSwaps: { v: 2, swaps: [{ card: "Charismatic Conqueror", price: 23.79, alternative }] },
});

test("a budget swap says how often this commander's decks play the pick", () => {
  const [ch] = swapsOf({ name: "Cruel Celebrant", price: 0.85, commander_pct: 34 });
  assert.equal(ch.add, "Cruel Celebrant");
  assert.match(ch.reason, /instead of \$23\.79\. Played in 34% of this commander's decks\.$/);
});

test("a suggestion's percentage is the share of this commander's decks, not EDHREC's synergy", () => {
  const out = buildChanges({
    recCat: "creatures",
    recs: { categories: { creatures: [
      { name: "Pitiless Plunderer", synergy: 0.36, num_decks: 520, potential_decks: 1000 },
      // A negative synergy (kept by EDHREC filtering when inclusion is high) must not print.
      { name: "Sol Ring", synergy: -0.05, num_decks: 910, potential_decks: 1000 },
      { name: "No Data", synergy: 0.4 },
    ] } },
  });
  const reason = (n) => out.find((c) => c.add === n).reason;
  assert.equal(reason("Pitiless Plunderer"), "Played in 52% of this commander's decks.");
  assert.equal(reason("Sol Ring"), "Played in 91% of this commander's decks.");
  assert.equal(reason("No Data"), "Commonly played alongside this commander.");
});

test("without commander data the reason has no percentage", () => {
  for (const pct of [null, undefined, 0]) {
    const [ch] = swapsOf({ name: "Blood Artist", price: 2.68, commander_pct: pct });
    assert.doesNotMatch(ch.reason, /commander/);
  }
});
