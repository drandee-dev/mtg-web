// Run with: node --test src/lib/decklistEdit.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeRegExp, findDeckLine, appendLine, removeLine, setQty } from "./decklistEdit.js";

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
