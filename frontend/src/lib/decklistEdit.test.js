// Run with: node --test src/lib/decklistEdit.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeRegExp, findDeckLine, appendLine, removeLine, setQty } from "./decklistEdit.js";
import { parseDeckText } from "./deckParser.js";

// Holiday, 2026-11-06: a card added to a list ending in a Companion (or Maybeboard)
// section was filed in that section and vanished from the deck.
test("a card added to a list ending in a Companion or Maybeboard section stays in the deck", () => {
  for (const tail of ["Companion\n1 Lurrus of the Dream-Den", "\nMaybeboard\n1 Ponder", "Sideboard\n1 Pyroblast"]) {
    const deck = `97 Plains\n1 Sol Ring\n${tail}`;
    const added = appendLine(deck, "1 Rhystic Study");
    assert.ok(added.endsWith(tail), added);
    const parsed = parseDeckText(added);
    assert.equal(parsed.totalCards, 99, added);
    assert.ok(parsed.cards.some((c) => c.name === "Rhystic Study"), added);
    assert.equal(parseDeckText(setQty(deck, "Forest", 2)).totalCards, 100);
  }
  assert.equal(appendLine("1 A", "1 B"), "1 A\n1 B");
  // A whole Arena list typed into "Edit as text": the card goes after Deck, not
  // before the earlier Companion section, where it would join the commanders.
  const arena = "Commander\n1 Atraxa, Praetors' Voice\n\nCompanion\n1 Lurrus of the Dream-Den\n\nDeck\n98 Plains";
  assert.equal(appendLine(arena, "1 Ponder"), `${arena}\n1 Ponder`);
  // Commander is the last header: a Deck header comes first, before a Companion section.
  assert.equal(appendLine("Commander\n1 Atraxa, Praetors' Voice\nCompanion\n1 Lurrus of the Dream-Den", "1 Ponder"),
    "Commander\n1 Atraxa, Praetors' Voice\nDeck\n1 Ponder\nCompanion\n1 Lurrus of the Dream-Den");
  assert.equal(appendLine("Commander\n1 Atraxa, Praetors' Voice", "1 Ponder"),
    "Commander\n1 Atraxa, Praetors' Voice\nDeck\n1 Ponder");
});

const DECK = ["1 Sol Ring (C21) 263", "4 Lightning Bolt", "1 Fire // Ice", "1 B.F.M. (Big Furry Monster)", "", "1 Cultivate"].join("\n");

test("escapeRegExp makes a name safe to build a pattern from", () => {
  assert.equal(new RegExp(escapeRegExp("Fire // Ice")).test("Fire // Ice"), true);
  assert.equal(new RegExp(`^${escapeRegExp("B.F.M. (Big Furry Monster)")}$`).test("BxFxMx (Big Furry Monster)"), false);
});

test("findDeckLine returns the whole line, printing and quantity included", () => {
  assert.equal(findDeckLine(DECK, "Sol Ring"), "1 Sol Ring (C21) 263");
  assert.equal(findDeckLine(DECK, "lightning bolt"), "4 Lightning Bolt");
  assert.equal(findDeckLine(DECK, "Fire // Ice"), "1 Fire // Ice");
  assert.equal(findDeckLine(DECK, "B.F.M. (Big Furry Monster)"), "1 B.F.M. (Big Furry Monster)");
});

test("findDeckLine does not match a longer name or a different card", () => {
  assert.equal(findDeckLine("1 Lightning Bolt Extra", "Lightning Bolt"), null);
  assert.equal(findDeckLine("1 Cultivate", "Cultivat"), null);
  assert.equal(findDeckLine(DECK, "Rampant Growth"), null);
});

test("appendLine adds after the last line whatever the text ends with", () => {
  assert.equal(appendLine("1 A", "1 B"), "1 A\n1 B");
  assert.equal(appendLine("1 A\n\n  ", "1 B"), "1 A\n1 B");
  assert.equal(appendLine("", "1 B"), "\n1 B");
});

test("removeLine removes only the first matching line", () => {
  assert.equal(removeLine("1 A\n1 B\n1 B\n1 C", "B"), "1 A\n1 B\n1 C");
  assert.equal(removeLine("1 Sol Ring (C21) 263\n1 B", "Sol Ring"), "1 B");
});

test("removeLine leaves the text alone when the card is not there", () => {
  assert.equal(removeLine("1 A\n1 B", "Z"), "1 A\n1 B");
});

test("setQty rewrites one line, keeps the printing, and collapses duplicates", () => {
  assert.equal(setQty("1 Sol Ring (C21) 263\n1 B", "Sol Ring", 3), "3 Sol Ring (C21) 263\n1 B");
  assert.equal(setQty("1 Forest\n1 B\n2 Forest", "Forest", 5), "5 Forest\n1 B");
});

test("setQty adds a missing card at the end, and removes at zero or less", () => {
  assert.equal(setQty("1 A", "B", 2), "1 A\n2 B");
  assert.equal(setQty("1 A\n1 B", "B", 0), "1 A");
  assert.equal(setQty("1 A\n1 B", "B", -1), "1 A");
  assert.equal(setQty("1 A", "B", 0), "1 A");
});
