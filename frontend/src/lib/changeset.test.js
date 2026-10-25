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

test("without commander data the reason has no percentage", () => {
  for (const pct of [null, undefined, 0]) {
    const [ch] = swapsOf({ name: "Blood Artist", price: 2.68, commander_pct: pct });
    assert.doesNotMatch(ch.reason, /commander/);
  }
});
