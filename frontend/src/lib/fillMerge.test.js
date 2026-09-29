// Run with: node --test src/lib/fillMerge.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeFills } from "./fillMerge.js";

const spell = (name, roles = []) => ({ name, qty: 1, category: "Creatures", reason: null, roles });
const land = (name) => ({ name, qty: 1, category: "Lands", reason: null, roles: ["Land"] });
const fill = (name, category = "Card draw") => ({ name, category, reason: `${name} closes a gap.` });
const sum = (m) => [...m.values()].reduce((n, q) => n + q, 0);
const total = (r) => r.cards.length + r.added.length + sum(r.basics);
const lands = (r) => sum(r.basics) + [...r.cards, ...r.added].filter((c) => c.category === "Lands").length;
const spells = (n, roles) => Array.from({ length: n }, (_, i) => spell(`Spell ${i}`, roles));

// The live Ezuri build: 63 spells, 4 utility lands, 32 Forest = 99, 36 lands.
function ezuri() {
  return {
    cards: [...spells(63), land("Command Tower"), land("Yavimaya Hollow"), land("Castle Garenbrig"), land("Bala Ged Recovery")],
    basics: new Map([["Forest", 32]]),
  };
}

test("spare basics above the floor are taken first", () => {
  const cards = spells(60); // thin skeleton: 39 basics, 3 above the floor
  const r = mergeFills({
    cards, basics: new Map([["Forest", 20], ["Island", 19]]),
    proposed: [fill("A"), fill("B"), fill("C"), fill("D")], thinLabels: ["Card draw"],
  });
  assert.deepEqual(r.added.map((c) => c.name), ["A", "B", "C", "D"]);
  assert.equal(r.cut.length, 1, "three spare basics, then one cut");
  assert.equal(r.cut[0].replacedBy, "D");
  assert.equal(sum(r.basics), 36);
  assert.equal(r.basics.get("Forest"), 18, "largest pile goes first");
  assert.equal(r.basics.get("Island"), 18);
  assert.equal(cards.length, 60, "input not mutated");
});

test("at the floor a tail spell is cut, never a thin-role card, a Lands card or a fill", () => {
  const cards = [
    spell("Keep Me"), spell("Cut Me"), spell("Draw Engine", ["Draw"]), spell("Wipe", ["Board wipe"]),
    land("Command Tower"),
  ];
  const r = mergeFills({
    cards, basics: new Map([["Forest", 35]]),
    proposed: [fill("F1"), fill("F2", "Board wipes"), fill("F3")],
    thinLabels: ["Card draw", "Board wipes"], landFloor: 36,
  });
  assert.deepEqual(r.cut.map((c) => c.name), ["Cut Me", "Keep Me"]);
  assert.deepEqual(r.added.map((c) => [c.name, c.displaced]), [["F1", "Cut Me"], ["F2", "Keep Me"]]);
  assert.deepEqual(r.cards.map((c) => c.name), ["Draw Engine", "Wipe", "Command Tower"]);
  assert.equal(lands(r), 36);
});

test("a Lands fill swaps for a basic even at the floor", () => {
  const { cards, basics } = ezuri();
  const r = mergeFills({ cards, basics, proposed: [fill("Temple of the False God", "Lands")], thinLabels: ["Lands"] });
  assert.equal(r.cut.length, 0);
  assert.equal(r.basics.get("Forest"), 31);
  assert.equal(lands(r), 36);
  assert.equal(total(r), 99);
});

test("with nothing cuttable the fill is skipped", () => {
  const cards = [...spells(63, ["Draw"]), land("Command Tower")];
  const r = mergeFills({ cards, basics: new Map([["Forest", 35]]), proposed: [fill("A"), fill("B")], thinLabels: ["Card draw"] });
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.cut, []);
  assert.equal(total(r), 99);
});

test("the total is always 99 non-commander cards", () => {
  const cases = [
    { ...ezuri(), proposed: Array.from({ length: 70 }, (_, i) => fill(`F${i}`)) },
    { cards: spells(10), basics: new Map([["Wastes", 89]]), proposed: Array.from({ length: 70 }, (_, i) => fill(`F${i}`)) },
    { ...ezuri(), proposed: [fill("Spell 3"), fill("Ezuri, Renegade Leader"), fill(""), fill("X"), fill("x"), fill("L", "Lands")], commanders: ["Ezuri, Renegade Leader"] },
  ];
  for (const c of cases) {
    const r = mergeFills({ thinLabels: ["Card draw"], ...c });
    assert.equal(total(r), 99);
    assert.ok(lands(r) >= 36, `lands ${lands(r)} below floor`);
  }
});

test("the Ezuri shape: 36 lands plus 8 fills still ends at 36 lands", () => {
  const { cards, basics } = ezuri();
  cards[62].roles = ["Ramp"]; // tail spell counts toward a thin category
  const proposed = [
    ...["Harmonize", "Rishkar's Expertise", "Return of the Wildspeaker", "Beast Whisperer"].map((n) => fill(n)),
    ...["Nature's Lore", "Three Visits", "Farseek", "Skyshroud Claim"].map((n) => fill(n, "Ramp")),
  ];
  const r = mergeFills({ cards, basics, proposed, thinLabels: ["Card draw", "Ramp"] });
  assert.equal(r.added.length, 8);
  assert.equal(r.basics.get("Forest"), 32);
  assert.equal(lands(r), 36);
  assert.equal(total(r), 99);
  assert.ok(!r.cut.some((c) => c.name === "Spell 62"), "thin-role tail spell survives");
  assert.equal(r.cut[0].name, "Spell 61");
});
