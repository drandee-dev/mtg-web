// Run with: node --test src/lib/fillMerge.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleSkeleton, mergeFills } from "./fillMerge.js";

const spell = (name, { roles = [], inclusion = null, category = "Creatures", is_land } = {}) =>
  ({ name, qty: 1, category, reason: null, roles, inclusion, ...(is_land != null && { is_land }) });
// No is_land here: the category fallback old responses and mocks rely on.
const land = (name) => ({ name, qty: 1, category: "Lands", reason: null, roles: ["Land"] });
const fill = (name, category = "Card draw", extra = {}) => ({ name, category, reason: `${name} closes a gap.`, ...extra });
const sum = (m) => [...m.values()].reduce((n, q) => n + q, 0);
const total = (r) => r.cards.length + r.added.length + sum(r.basics);
const isLand = (c) => c.is_land ?? c.category === "Lands";
const lands = (r) => sum(r.basics) + [...r.cards, ...r.added].filter(isLand).length;
const spells = (n, opts) => Array.from({ length: n }, (_, i) => spell(`Spell ${i}`, opts));

// The live Ezuri build: 63 spells, 4 utility lands, 32 Forest = 99, 36 lands.
function ezuri() {
  return {
    cards: [...spells(63), land("Command Tower"), land("Yavimaya Hollow"), land("Castle Garenbrig"), land("Bala Ged Recovery")],
    basics: new Map([["Forest", 32]]),
  };
}

test("assembleSkeleton keeps is_land and EDHREC inclusion on each entry", () => {
  const { cards } = assembleSkeleton({
    staples: [{ name: "Sol Ring", reason: "format staple", is_land: false }],
    instants: [{ name: "Malakir Rebirth", num_decks: 50, potential_decks: 1000, is_land: true, roles: ["Recursion"] }],
    lands: [{ name: "Command Tower", is_land: true }],
    _colors: ["B"],
  }, ["Tergrid, God of Fright"]);
  const by = Object.fromEntries(cards.map((c) => [c.name, c]));
  assert.equal(by["Malakir Rebirth"].is_land, true);
  assert.equal(by["Malakir Rebirth"].inclusion, 0.05);
  assert.deepEqual(by["Malakir Rebirth"].roles, ["Recursion"]);
  assert.equal(by["Sol Ring"].inclusion, null);
  assert.equal(by["Command Tower"].is_land, true);
});

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

test("an MDFC listed under a spell category counts as a land", () => {
  // 63 spells, two of them spell-front MDFCs, 4 utility lands, 32 Forest:
  // 38 lands by is_land, so two fills take basics before anything is cut.
  const { cards, basics } = ezuri();
  cards[5] = spell("Malakir Rebirth", { category: "Instants", is_land: true, inclusion: 0 });
  cards[6] = spell("Bala Ged Recovery", { category: "Sorceries", is_land: true, inclusion: 0 });
  cards[66] = land("Wirewood Lodge");
  const r = mergeFills({ cards, basics, proposed: [fill("A"), fill("B"), fill("C")], thinLabels: ["Card draw"] });
  assert.equal(r.basics.get("Forest"), 30, "two spare basics taken");
  assert.equal(r.cut.length, 1);
  assert.ok(!r.cut.some((c) => c.is_land), "a land is never cut");
  assert.equal(lands(r), 36);
});

test("at the floor the least-played card is cut, never a staple, a thin-role card, a land or a fill", () => {
  const cards = [
    spell("Staple", { category: "Format staples" }),
    spell("Popular", { inclusion: 0.9 }),
    spell("Rare", { inclusion: 0.05 }),
    spell("No Data"),
    spell("Draw Engine", { roles: ["Draw"], inclusion: 0.01 }),
    spell("Malakir Rebirth", { category: "Instants", is_land: true, inclusion: 0 }),
    spell("Popular Tail", { inclusion: 0.9 }),
    land("Command Tower"),
  ];
  const r = mergeFills({
    cards, basics: new Map([["Forest", 34]]),
    proposed: [fill("F1"), fill("F2"), fill("F3"), fill("F4"), fill("F5")],
    thinLabels: ["Card draw"], landFloor: 36,
  });
  assert.deepEqual(r.cut.map((c) => c.name), ["No Data", "Rare", "Popular Tail", "Popular"]);
  assert.deepEqual(r.added.map((c) => [c.name, c.displaced]),
    [["F1", "No Data"], ["F2", "Rare"], ["F3", "Popular Tail"], ["F4", "Popular"]]);
  assert.deepEqual(r.cards.map((c) => c.name), ["Staple", "Draw Engine", "Malakir Rebirth", "Command Tower"]);
  assert.equal(lands(r), 36);
});

test("a land fill swaps for a basic even at the floor, whatever its category", () => {
  const { cards, basics } = ezuri();
  const r = mergeFills({
    cards, basics, thinLabels: ["Lands", "Spot removal"],
    proposed: [
      fill("Temple of the False God", "Lands"), // category fallback
      fill("Fell the Profane // Fell Mire", "Spot removal", { is_land: true }),
    ],
  });
  assert.equal(r.cut.length, 0);
  assert.equal(r.basics.get("Forest"), 30);
  assert.equal(lands(r), 36);
  assert.equal(total(r), 99);
});

test("with nothing cuttable the fill is skipped", () => {
  const cards = [...spells(63, { roles: ["Draw"] }), land("Command Tower")];
  const r = mergeFills({ cards, basics: new Map([["Forest", 35]]), proposed: [fill("A"), fill("B")], thinLabels: ["Card draw"] });
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.cut, []);
  assert.equal(total(r), 99);
});

test("the total is always 99 non-commander cards and no card is added twice", () => {
  const cases = [
    { ...ezuri(), proposed: Array.from({ length: 70 }, (_, i) => fill(`F${i}`)) },
    { cards: spells(10), basics: new Map([["Wastes", 89]]), proposed: Array.from({ length: 70 }, (_, i) => fill(`F${i}`)) },
    { ...ezuri(), proposed: [fill("Spell 3"), fill("Ezuri, Renegade Leader"), fill(""), fill("X"), fill("x"), fill("L", "Lands")], commanders: ["Ezuri, Renegade Leader"] },
  ];
  for (const c of cases) {
    const r = mergeFills({ thinLabels: ["Card draw"], ...c });
    assert.equal(total(r), 99);
    assert.ok(lands(r) >= 36, `lands ${lands(r)} below floor`);
    const names = [...r.cards, ...r.added].map((x) => x.name.toLowerCase());
    assert.equal(new Set(names).size, names.length, `duplicate card: ${names.filter((n, i) => names.indexOf(n) !== i)}`);
  }
});

test("the Ezuri shape: 36 lands plus 8 fills still ends at 36 lands", () => {
  const { cards, basics } = ezuri();
  cards.slice(0, 63).forEach((c, i) => { c.inclusion = (100 - i) / 100; });
  cards[10].inclusion = 0.001; // least played sits mid-list, not at the tail
  cards[62].roles = ["Ramp"]; // and the true tail counts toward a thin category
  const proposed = [
    ...["Harmonize", "Rishkar's Expertise", "Return of the Wildspeaker", "Beast Whisperer"].map((n) => fill(n)),
    ...["Nature's Lore", "Three Visits", "Farseek", "Skyshroud Claim"].map((n) => fill(n, "Ramp")),
  ];
  const r = mergeFills({ cards, basics, proposed, thinLabels: ["Card draw", "Ramp"] });
  assert.equal(r.added.length, 8);
  assert.equal(r.basics.get("Forest"), 32);
  assert.equal(lands(r), 36);
  assert.equal(total(r), 99);
  assert.deepEqual(r.cut.map((c) => c.name),
    ["Spell 10", "Spell 61", "Spell 60", "Spell 59", "Spell 58", "Spell 57", "Spell 56", "Spell 55"]);
});
